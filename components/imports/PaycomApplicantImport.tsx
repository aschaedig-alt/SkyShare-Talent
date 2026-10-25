"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatMomentDateTime } from "@/lib/dates/display";
import type { ApplyOutcome, Preview, PreviewRow } from "@/lib/paycom/applicant-import";

/**
 * Imports -> Paycom applicants. Drop Paycom's two zips, check what will happen,
 * import, and undo if it was wrong. The server half is lib/paycom/applicant-import.ts.
 */

export type PaycomBatchSummary = {
  id: string;
  status: string;
  files: string;
  createdAt: string;
  completedAt: string | null;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  errorCount: number;
  uploadedBy: string | null;
};

type Phase = "pick" | "uploading" | "reading" | "review" | "applying" | "hours" | "done";

const CHUNK = 10;

const panel = "rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const eyebrow = "text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold";
const th = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400";
const td = "px-3 py-2 align-top text-sm text-brand-lea dark:text-slate-100";
const select =
  "w-full rounded border border-brand-lea/15 bg-white px-2 py-1 text-sm text-brand-lea dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const tag = (tone: "ok" | "warn" | "info" | "muted") =>
  ({
    ok: "rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    warn: "rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    info: "rounded bg-brand-sweet/25 px-2 py-0.5 text-[11px] font-semibold text-brand-lea dark:text-slate-100",
    muted: "rounded bg-brand-cloudDancer px-2 py-0.5 text-[11px] font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400"
  })[tone];

async function readJson<T>(response: Response): Promise<T & { message?: string }> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return (await response.json()) as T & { message?: string };
  const text = (await response.text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return { message: text.slice(0, 300) || `Request failed (${response.status}).` } as T & { message?: string };
}

function needsChoice(row: PreviewRow) {
  return !row.alreadyImported && row.candidate.kind === "decide";
}

export function PaycomApplicantImport({ batches }: { batches: PaycomBatchSummary[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [personChoice, setPersonChoice] = useState<Record<string, string>>({});
  const [jobChoice, setJobChoice] = useState<Record<string, string>>({});
  const [keepClosed, setKeepClosed] = useState<Set<string>>(new Set());
  const [readHours, setReadHours] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<ApplyOutcome[]>([]);
  const [undoTarget, setUndoTarget] = useState<PaycomBatchSummary | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  async function uploadAndPreview(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const files = Array.from(inputRef.current?.files ?? []);
    if (!files.length) return setError("Choose Paycom's two zip files first.");
    try {
      setPhase("uploading");
      const presign = await readJson<{ batchId: string; uploads: Array<{ name: string; uploadUrl: string; contentType: string }> }>(
        await fetch("/api/imports/paycom-applicants/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: files.map((f) => ({ name: f.name, size: f.size, type: f.type || "application/octet-stream" })) })
        })
      );
      if (!presign.batchId) throw new Error(presign.message ?? "Could not start the upload.");
      for (const [i, upload] of presign.uploads.entries()) {
        const put = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": upload.contentType }, body: files[i] });
        if (!put.ok) throw new Error(`${upload.name} did not upload (${put.status}).`);
      }
      setBatchId(presign.batchId);
      setPhase("reading");
      const result = await readJson<{ preview: Preview }>(await fetch(`/api/imports/paycom-applicants/${presign.batchId}/preview`, { method: "POST" }));
      if (!result.preview) throw new Error(result.message ?? "Could not read the upload.");
      const p = result.preview;
      setPreview(p);
      setInclude(new Set(p.rows.filter((r) => !r.alreadyImported).map((r) => r.applicationId)));
      // A same-name match with ONE candidate starts on that person — the preview is
      // the check — and stays flagged so it is easy to change. Several, or an email
      // shared by two records, must be picked.
      const choices: Record<string, string> = {};
      for (const r of p.rows) {
        if (needsChoice(r) && r.candidate.kind === "decide" && r.candidate.by === "name" && r.candidate.options.length === 1) {
          choices[r.applicationId] = r.candidate.options[0].id;
        }
      }
      setPersonChoice(choices);
      setJobChoice({});
      setKeepClosed(new Set());
      setOutcomes([]);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
      setPhase("pick");
    }
  }

  const ready = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter((r) => include.has(r.applicationId) && !r.alreadyImported && (!needsChoice(r) || personChoice[r.applicationId]));
  }, [preview, include, personChoice]);
  const waiting = preview ? preview.rows.filter((r) => include.has(r.applicationId) && needsChoice(r) && !personChoice[r.applicationId]).length : 0;

  async function apply() {
    if (!batchId || !ready.length) return;
    setError(null);
    setPhase("applying");
    const ids = ready.map((r) => r.applicationId);
    setProgress({ done: 0, total: ids.length });
    const all: ApplyOutcome[] = [];
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const result = await readJson<{ outcomes: ApplyOutcome[] }>(
          await fetch(`/api/imports/paycom-applicants/${batchId}/apply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              applicationIds: chunk,
              choices: { candidates: personChoice, jobs: jobChoice, keepClosed: [...keepClosed] },
              last: i + CHUNK >= ids.length
            })
          })
        );
        if (!result.outcomes) throw new Error(result.message ?? "The import stopped.");
        all.push(...result.outcomes);
        setOutcomes([...all]);
        setProgress({ done: Math.min(i + CHUNK, ids.length), total: ids.length });
      }
      if (readHours) {
        const people = [...new Set(all.flatMap((o) => (o.result === "imported" ? [o.candidateId] : [])))];
        setPhase("hours");
        setProgress({ done: 0, total: people.length });
        for (const [n, id] of people.entries()) {
          // The profile's own "Scan docs" — same endpoint, same rules; a failure on one
          // person is not a reason to stop the rest.
          await fetch(`/api/candidates/${id}/extract-metrics`, { method: "POST" }).catch(() => null);
          setProgress({ done: n + 1, total: people.length });
        }
      }
      setPhase("done");
      router.refresh();
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "The import stopped."} What finished is listed below and can be undone from Recent uploads.`);
      setPhase("done");
      router.refresh();
    }
  }

  async function confirmUndo() {
    if (!undoTarget) return;
    setUndoing(true);
    try {
      const result = await readJson<{ report?: { undone: number; keptBecauseWorked: string[]; notes: string[] } }>(
        await fetch(`/api/imports/paycom-applicants/${undoTarget.id}/undo`, { method: "POST" })
      );
      if (!result.report) throw new Error(result.message ?? "Undo failed.");
      const kept = result.report.keptBecauseWorked;
      setUndoMessage(
        `Undid ${result.report.undone} application${result.report.undone === 1 ? "" : "s"}.` +
          (kept.length ? ` Kept ${kept.length} that had been worked on since: ${kept.join(", ")}.` : "") +
          (result.report.notes.length ? ` ${result.report.notes.join(" ")}` : "")
      );
      setUndoTarget(null);
      router.refresh();
    } catch (e) {
      setUndoMessage(e instanceof Error ? e.message : "Undo failed.");
    } finally {
      setUndoing(false);
    }
  }

  const fresh = preview?.rows.filter((r) => !r.alreadyImported) ?? [];
  const tiles: Array<[string, number]> = preview
    ? [
        ["Applications", preview.rows.length],
        ["Already in the app", preview.rows.length - fresh.length],
        ["Existing people", fresh.filter((r) => r.candidate.kind === "existing").length],
        ["New people", fresh.filter((r) => r.candidate.kind === "new").length],
        ["Check the match", fresh.filter((r) => r.candidate.kind === "decide").length]
      ]
    : [];

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className={`${panel} p-5`}>
        <p className={eyebrow}>Imports / Uploads</p>
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Paycom applicants</h1>
        <div className="mt-2 max-w-3xl space-y-1 text-sm text-brand-grey dark:text-slate-400">
          <p>
            In Paycom, export the application documents and resume documents for a date range, then drop both zips here. Each application is
            split out, matched to the person (or a new candidate is made), linked to its job (created if it does not exist yet), and both PDFs
            are added to their profile.
          </p>
          <p>Nothing is saved until you press Import. Applications already in the app are skipped, so overlapping date ranges are fine.</p>
        </div>
        <form onSubmit={uploadAndPreview} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={inputRef}
            type="file"
            accept=".zip,.pdf"
            multiple
            aria-label="Choose the Paycom zip files"
            disabled={phase === "uploading" || phase === "reading" || phase === "applying" || phase === "hours"}
            className="w-full max-w-xl rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:file:text-slate-300"
          />
          <Button type="submit" disabled={phase === "uploading" || phase === "reading" || phase === "applying" || phase === "hours"}>
            {phase === "uploading" ? "Uploading…" : phase === "reading" ? "Reading…" : "Upload and preview"}
          </Button>
        </form>
        {phase === "reading" ? (
          <p role="status" className="mt-2 text-xs font-semibold text-brand-eden dark:text-[#8fb3d6]">
            Reading every page and matching each applicant — about a minute for a month of applications.
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-800 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </div>
        ) : null}
      </section>

      {preview && (phase === "review" || phase === "applying" || phase === "hours" || phase === "done") ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {tiles.map(([label, value]) => (
              <div key={label} className={`${panel} p-3`}>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey dark:text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{value}</div>
              </div>
            ))}
          </section>

          {preview.problems.length || preview.resumesWithoutApplication.length ? (
            <section className={`${panel} p-4`}>
              <p className={eyebrow}>Read with problems</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-brand-lea dark:text-slate-100">
                {preview.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
                {preview.resumesWithoutApplication.map((r) => (
                  <li key={r}>Resume with no application in this upload: {r}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={panel}>
            <div className="border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
              <p className={eyebrow}>Jobs</p>
              <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Where each Paycom posting goes</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-brand-lea/10 dark:border-white/10">
                    <th className={th}>Paycom posting</th>
                    <th className={th}>Apps</th>
                    <th className={th}>Goes to</th>
                    <th className={th}>Reopen</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.jobs.map((j) => {
                    const chosen = jobChoice[j.paycomTitle] ?? "";
                    const target = chosen && chosen !== "new" ? j.suggestions.find((s) => s.jobId === chosen) : null;
                    const goingTo = chosen === "new" ? null : (target ?? (j.match ? { jobId: j.match.jobId, title: j.match.title, status: j.match.status } : null));
                    const canReopen = Boolean(goingTo && goingTo.status !== "OPEN" && !j.closedPosting);
                    return (
                      <tr key={j.paycomTitle} className="border-b border-brand-lea/5 dark:border-white/5">
                        <td className={td}>
                          {j.paycomTitle}
                          {j.closedPosting ? <span className={`ml-2 ${tag("muted")}`}>Closed in Paycom</span> : null}
                        </td>
                        <td className={td}>{j.count}</td>
                        <td className={td}>
                          <select
                            className={select}
                            value={chosen}
                            disabled={phase !== "review"}
                            aria-label={`Job for ${j.paycomTitle}`}
                            onChange={(e) => setJobChoice((c) => ({ ...c, [j.paycomTitle]: e.target.value }))}
                          >
                            {j.match ? (
                              <option value="">
                                {j.match.title} ({j.match.status.toLowerCase()}, {j.match.via})
                              </option>
                            ) : (
                              <option value="">Create new job: {j.newJobTitle}</option>
                            )}
                            {j.suggestions.map((s) => (
                              <option key={s.jobId} value={s.jobId}>
                                {s.title} ({s.status.toLowerCase()})
                              </option>
                            ))}
                            {j.match ? <option value="new">Create new job: {j.newJobTitle}</option> : null}
                          </select>
                          {!j.match && j.suggestions.length && !chosen ? (
                            <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">A similar job exists — pick it above if it is the same one.</div>
                          ) : null}
                        </td>
                        <td className={td}>
                          {canReopen && goingTo ? (
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                disabled={phase !== "review"}
                                checked={!keepClosed.has(goingTo.jobId)}
                                onChange={(e) =>
                                  setKeepClosed((s) => {
                                    const next = new Set(s);
                                    if (e.target.checked) next.delete(goingTo.jobId);
                                    else next.add(goingTo.jobId);
                                    return next;
                                  })
                                }
                              />
                              Reopen ({goingTo.status.toLowerCase()})
                            </label>
                          ) : (
                            <span className="text-xs text-brand-grey dark:text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={panel}>
            <div className="flex flex-col gap-3 border-b border-brand-lea/10 px-4 py-3 sm:flex-row sm:items-end sm:justify-between dark:border-white/10">
              <div>
                <p className={eyebrow}>Applicants</p>
                <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Who each application is</h2>
                <div className="mt-1 flex gap-3 text-xs">
                  <Button
                    variant="link"
                    size="sm"
                    disabled={phase !== "review"}
                    onClick={() => setInclude(new Set(preview.rows.filter((r) => !r.alreadyImported).map((r) => r.applicationId)))}
                  >
                    Select all
                  </Button>
                  <Button variant="link" size="sm" disabled={phase !== "review"} onClick={() => setInclude(new Set())}>
                    Select none
                  </Button>
                </div>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <label className="flex items-center gap-2 text-sm text-brand-lea dark:text-slate-100">
                  <input type="checkbox" checked={readHours} disabled={phase !== "review"} onChange={(e) => setReadHours(e.target.checked)} />
                  Also read flight hours with AI (about 5–10¢ per person)
                </label>
                <Button onClick={apply} disabled={phase !== "review" || !ready.length}>
                  Import {ready.length} application{ready.length === 1 ? "" : "s"}
                </Button>
                {phase === "done" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      // Back to the same preview for the rest — what went in is skipped
                      // by the server anyway, but untick it so the count reads true.
                      const finished = new Set(outcomes.filter((o) => o.result === "imported").map((o) => o.applicationId));
                      setInclude((s) => new Set([...s].filter((id) => !finished.has(id))));
                      setPhase("review");
                    }}
                  >
                    Import more from this upload
                  </Button>
                ) : null}
                {waiting ? <span className="text-xs text-amber-700 dark:text-amber-300">{waiting} waiting for you to pick the person</span> : null}
              </div>
            </div>
            {phase === "applying" || phase === "hours" ? (
              <div role="status" aria-live="polite" className="border-b border-brand-lea/10 px-4 py-2 text-sm font-semibold text-brand-eden dark:border-white/10 dark:text-[#8fb3d6]">
                {phase === "applying" ? "Importing" : "Reading flight hours"} — {progress.done} of {progress.total}
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-brand-lea/10 dark:border-white/10">
                    <th className={th}>Import</th>
                    <th className={th}>Applicant</th>
                    <th className={th}>Applied for</th>
                    <th className={th}>Person in the app</th>
                    <th className={th}>Resume</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => {
                    const c = r.candidate;
                    const outcome = outcomes.find((o) => o.applicationId === r.applicationId);
                    return (
                      <tr key={r.applicationId} className="border-b border-brand-lea/5 dark:border-white/5">
                        <td className={td}>
                          <input
                            type="checkbox"
                            aria-label={`Import ${r.displayName}`}
                            disabled={r.alreadyImported || phase !== "review"}
                            checked={include.has(r.applicationId)}
                            onChange={(e) =>
                              setInclude((s) => {
                                const next = new Set(s);
                                if (e.target.checked) next.add(r.applicationId);
                                else next.delete(r.applicationId);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className={td}>
                          <div className="font-semibold">{r.displayName}</div>
                          <div className="text-xs text-brand-grey dark:text-slate-400">
                            {r.email ?? "no email"} · {r.appliedOn ?? "no date"} · #{r.applicationId}
                          </div>
                        </td>
                        <td className={td}>
                          {r.jobTitle}
                          {r.referral ? <div className="text-xs text-brand-grey dark:text-slate-400">{r.referral}</div> : null}
                        </td>
                        <td className={td}>
                          {outcome ? (
                            outcome.result === "imported" ? (
                              <div>
                                <span className={tag("ok")}>Imported</span>{" "}
                                <Link href={`/candidates/${outcome.candidateId}`} className="font-semibold text-brand-lea underline-offset-2 hover:underline dark:text-slate-100">
                                  {outcome.candidateName}
                                </Link>
                                {outcome.notes.length ? <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{outcome.notes.join(" ")}</div> : null}
                              </div>
                            ) : (
                              <div>
                                <span className={tag(outcome.result === "error" ? "warn" : "muted")}>{outcome.result === "error" ? "Error" : "Skipped"}</span>
                                <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{outcome.reason}</div>
                              </div>
                            )
                          ) : r.alreadyImported ? (
                            <span className={tag("muted")}>Already in the app</span>
                          ) : c.kind === "existing" ? (
                            <div>
                              <span className={tag("info")}>Existing · {c.by}</span>{" "}
                              <Link href={`/candidates/${c.hit.id}`} className="font-semibold underline-offset-2 hover:underline">
                                {c.hit.displayName}
                              </Link>
                              {c.hit.archived ? (
                                <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                                  {c.hit.employed ? "Current employee — stays archived" : "Archived — will come back as active"}
                                </div>
                              ) : null}
                            </div>
                          ) : c.kind === "new" ? (
                            <span className={tag("ok")}>New candidate</span>
                          ) : (
                            <div className="space-y-1">
                              <span className={tag("warn")}>{c.by === "name" ? "Same name — check" : `Same ${c.by} on ${c.options.length} records`}</span>
                              <select
                                className={select}
                                disabled={phase !== "review"}
                                aria-label={`Person for ${r.displayName}`}
                                value={personChoice[r.applicationId] ?? ""}
                                onChange={(e) => setPersonChoice((p) => ({ ...p, [r.applicationId]: e.target.value }))}
                              >
                                <option value="">Pick…</option>
                                {c.options.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.displayName}
                                    {o.archived ? " (archived)" : ""}
                                  </option>
                                ))}
                                <option value="new">A different person — create new</option>
                              </select>
                              {c.options.length ? (
                                <div className="text-xs">
                                  {c.options.map((o) => (
                                    <Link key={o.id} href={`/candidates/${o.id}`} target="_blank" className="mr-2 text-brand-eden underline-offset-2 hover:underline dark:text-[#8fb3d6]">
                                      Open {o.displayName}
                                    </Link>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className={td}>
                          {r.resumeName ? <span className="text-xs">{r.resumeName}</span> : <span className={tag("warn")}>None</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <section className={panel}>
        <div className="border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
          <p className={eyebrow}>History</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Recent Paycom uploads</h2>
        </div>
        <div className="p-4">
          {undoMessage ? (
            <div role="status" className="mb-3 rounded border border-brand-sweet/50 bg-brand-sweet/20 p-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
              {undoMessage}
            </div>
          ) : null}
          {batches.length ? (
            <div className="space-y-2">
              {batches.map((b) => (
                <div key={b.id} className="flex flex-col gap-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/5">
                  <div>
                    <div className="font-semibold text-brand-lea dark:text-slate-100">{b.files}</div>
                    <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                      {formatMomentDateTime(b.createdAt)}
                      {b.uploadedBy ? ` · ${b.uploadedBy}` : ""} · {b.rowCount} applications · {b.importedCount} imported · {b.skippedCount} skipped · {b.errorCount} errors
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={tag("info")}>{b.status}</span>
                    {b.importedCount > 0 && !b.status.includes("UNDONE") ? (
                      <Button variant="secondary" size="sm" onClick={() => setUndoTarget(b)}>
                        Undo
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-brand-grey dark:text-slate-400">No Paycom uploads yet.</p>
          )}
        </div>
      </section>

      <Modal open={Boolean(undoTarget)} onClose={() => setUndoTarget(null)} busy={undoing} title="Undo this Paycom upload">
        <div className="space-y-3 p-5">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Undo this Paycom upload?</h2>
          <p className="text-sm text-brand-grey dark:text-slate-400">
            Removes the {undoTarget?.importedCount ?? 0} applications it added and the PDFs it attached, deletes candidates it created, and
            puts back any job it reopened or person it brought back from archived. Anyone whose application has been worked on since — a status
            change or an interview — is left as they are.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setUndoTarget(null)} disabled={undoing}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmUndo} disabled={undoing}>
              {undoing ? "Undoing…" : "Undo upload"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
