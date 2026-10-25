"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatMomentDateTime } from "@/lib/dates/display";
import type { ApplyOutcome, Preview, PreviewChange } from "@/lib/paycom/employee-import";

/**
 * Imports -> Paycom employees. Drop Paycom's employee export, check what would change
 * in the Employees directory, apply the ticked people, undo if it was wrong. The server
 * half is lib/paycom/employee-import.ts.
 */

export type PaycomEmployeeBatch = {
  id: string;
  status: string;
  file: string;
  asOf: string | null;
  createdAt: string;
  completedAt: string | null;
  rowCount: number;
  appliedCount: number;
  skippedCount: number;
  errorCount: number;
  uploadedBy: string | null;
  applied: string[];
};

type Phase = "pick" | "reading" | "review" | "applying" | "done";

const panel = "rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const eyebrow = "text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold";
const th = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400";
const td = "px-3 py-2 align-top text-sm text-brand-lea dark:text-slate-100";
const input =
  "w-full rounded border border-brand-lea/15 bg-white px-2 py-1 text-sm text-brand-lea dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const tag = (tone: "ok" | "warn" | "info" | "muted") =>
  ({
    ok: "rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    warn: "rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    info: "rounded bg-brand-sweet/25 px-2 py-0.5 text-[11px] font-semibold text-brand-lea dark:text-slate-100",
    muted: "rounded bg-brand-cloudDancer px-2 py-0.5 text-[11px] font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400"
  })[tone];

const ACTION: Record<string, string> = { terminate: "Terminated in Paycom", rehire: "Re-hired", correct: "Dates corrected" };

async function readJson<T>(response: Response): Promise<T & { message?: string }> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return (await response.json()) as T & { message?: string };
  const text = (await response.text()).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return { message: text.slice(0, 300) || `Request failed (${response.status}).` } as T & { message?: string };
}

/** A position change, or a re-hire who is working again, needs the app title to use. */
function needsTitle(c: PreviewChange) {
  return Boolean(c.position) || (c.dates?.action === "rehire" && !c.paycom.term);
}

export function PaycomEmployeeImport({ batches }: { batches: PaycomEmployeeBatch[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [asOf, setAsOf] = useState("");
  const [phase, setPhase] = useState<Phase>("pick");
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<ApplyOutcome[]>([]);
  const [undoTarget, setUndoTarget] = useState<PaycomEmployeeBatch | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);

  async function uploadAndPreview(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose Paycom's employee export (.xlsx) first.");
    try {
      setPhase("reading");
      const form = new FormData();
      form.append("file", file);
      if (asOf) form.append("asOf", asOf);
      const result = await readJson<{ batchId: string; preview: Preview }>(await fetch("/api/imports/paycom-employees", { method: "POST", body: form }));
      if (!result.preview) throw new Error(result.message ?? "Could not read the export.");
      setBatchId(result.batchId);
      setPreview(result.preview);
      // Everything starts ticked; a row still waiting for a title is held back by the server.
      setInclude(new Set(result.preview.changes.map((c) => c.newHireId)));
      setTitles(Object.fromEntries(result.preview.changes.filter(needsTitle).map((c) => [c.newHireId, c.suggestedTitle ?? ""])));
      setOutcomes([]);
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload failed.");
      setPhase("pick");
    }
  }

  const ticked = preview ? preview.changes.filter((c) => include.has(c.newHireId)) : [];
  const missingTitle = ticked.filter((c) => needsTitle(c) && !(titles[c.newHireId] ?? "").trim()).length;

  async function apply() {
    if (!batchId || missingTitle) return;
    setError(null);
    setPhase("applying");
    try {
      const result = await readJson<{ outcomes: ApplyOutcome[] }>(
        await fetch(`/api/imports/paycom-employees/${batchId}/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newHireIds: ticked.map((c) => c.newHireId), titles })
        })
      );
      if (!result.outcomes) throw new Error(result.message ?? "The apply stopped.");
      setOutcomes(result.outcomes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The apply stopped.");
    } finally {
      setPhase("done");
      router.refresh();
    }
  }

  async function confirmUndo() {
    if (!undoTarget) return;
    setUndoing(true);
    try {
      const result = await readJson<{ report?: { undone: number; errors: string[] } }>(
        await fetch(`/api/imports/paycom-employees/${undoTarget.id}/undo`, { method: "POST" })
      );
      if (!result.report) throw new Error(result.message ?? "Undo failed.");
      setUndoMessage(
        `Undid ${result.report.undone} ${result.report.undone === 1 ? "person" : "people"}.` +
          (result.report.errors.length ? ` Could not undo: ${result.report.errors.join("; ")}.` : "")
      );
      setUndoTarget(null);
      router.refresh();
    } catch (e) {
      setUndoMessage(e instanceof Error ? e.message : "Undo failed.");
    } finally {
      setUndoing(false);
    }
  }

  const busy = phase === "reading" || phase === "applying";
  const tiles: Array<[string, number]> = preview
    ? [
        ["Paycom rows", preview.exportRows],
        ["Matched", preview.matched],
        ["Changes", preview.changes.length],
        ["For a person", preview.forPerson.length],
        ["Not matched", preview.unmatched.length]
      ]
    : [];

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className={`${panel} p-5`}>
        <p className={eyebrow}>Imports / Uploads</p>
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Paycom employees</h1>
        <div className="mt-2 max-w-3xl space-y-1 text-sm text-brand-grey dark:text-slate-400">
          <p>
            In Paycom, run the Advanced Report Writer employee export (first and last name, department, position, hire, re-hire and termination
            dates, DOL status) and drop the .xlsx here. Each row is matched to the person in the Employees directory and compared.
          </p>
          <p>
            Nothing changes until you press Apply. Paycom only corrects a date where it clearly describes the same stretch of employment as the
            app; anything else is listed for you to look at, not changed. Somebody missing from the export is never taken to have left.
          </p>
        </div>
        <form onSubmit={uploadAndPreview} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="w-full max-w-xl text-xs font-semibold text-brand-grey dark:text-slate-400">
            Export file
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              disabled={busy}
              className="mt-1 w-full rounded border border-brand-lea/15 bg-white px-3 py-2 text-sm font-normal dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:file:text-slate-300"
            />
          </label>
          <label className="text-xs font-semibold text-brand-grey dark:text-slate-400">
            Export run on (blank = from the file name)
            <input type="date" value={asOf} disabled={busy} onChange={(e) => setAsOf(e.target.value)} className={`mt-1 ${input}`} />
          </label>
          <Button type="submit" disabled={busy}>
            {phase === "reading" ? "Reading…" : "Upload and preview"}
          </Button>
        </form>
        {error ? (
          <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-800 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
            {error}
          </div>
        ) : null}
      </section>

      {preview && phase !== "pick" && phase !== "reading" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {tiles.map(([label, value]) => (
              <div key={label} className={`${panel} p-3`}>
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey dark:text-slate-400">{label}</div>
                <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{value}</div>
              </div>
            ))}
          </section>

          <section className={`${panel} space-y-1 p-4 text-sm text-brand-lea dark:text-slate-100`}>
            <p>
              Export run on <strong>{preview.asOf}</strong> ({preview.asOfFrom}). Full / part time is read as of that day for people still working.
            </p>
            <p>
              {preview.agree} people&apos;s dates already agree with Paycom. Full / part time:{" "}
              {Object.entries(preview.dolTally)
                .map(([k, v]) => `${k} ${v}`)
                .join(" · ")}
              .
            </p>
            <p className="text-brand-grey dark:text-slate-400">
              {preview.baseline
                ? `Positions are compared with the last applied upload, ${preview.baseline.file ?? "a Paycom export"} (${formatMomentDateTime(preview.baseline.at)}).`
                : "No earlier upload has been applied, so there is nothing to compare positions with yet. Applying this one — even with nothing ticked — records today's Paycom positions as the starting point."}
            </p>
          </section>

          <section className={panel}>
            <div className="flex flex-col gap-3 border-b border-brand-lea/10 px-4 py-3 sm:flex-row sm:items-end sm:justify-between dark:border-white/10">
              <div>
                <p className={eyebrow}>Changes</p>
                <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">What applying would change</h2>
                {preview.changes.length ? (
                  <div className="mt-1 flex gap-3 text-xs">
                    <Button variant="link" size="sm" disabled={phase !== "review"} onClick={() => setInclude(new Set(preview.changes.map((c) => c.newHireId)))}>
                      Select all
                    </Button>
                    <Button variant="link" size="sm" disabled={phase !== "review"} onClick={() => setInclude(new Set())}>
                      Select none
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <Button onClick={apply} disabled={phase !== "review" || missingTitle > 0}>
                  {phase === "applying"
                    ? "Applying…"
                    : ticked.length
                      ? `Apply ${ticked.length} ${ticked.length === 1 ? "person" : "people"}`
                      : "Record this export (no changes)"}
                </Button>
                {missingTitle ? <span className="text-xs text-amber-700 dark:text-amber-300">{missingTitle} waiting for the app title to use</span> : null}
              </div>
            </div>
            {preview.changes.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-brand-lea/10 dark:border-white/10">
                      <th className={th}>Apply</th>
                      <th className={th}>Person</th>
                      <th className={th}>Paycom says</th>
                      <th className={th}>Would change</th>
                      <th className={th}>App title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.changes.map((c) => {
                      const outcome = outcomes.find((o) => o.newHireId === c.newHireId);
                      return (
                        <tr key={c.newHireId} className="border-b border-brand-lea/5 dark:border-white/5">
                          <td className={td}>
                            <input
                              type="checkbox"
                              aria-label={`Apply ${c.name}`}
                              disabled={phase !== "review"}
                              checked={include.has(c.newHireId)}
                              onChange={(e) =>
                                setInclude((s) => {
                                  const next = new Set(s);
                                  if (e.target.checked) next.add(c.newHireId);
                                  else next.delete(c.newHireId);
                                  return next;
                                })
                              }
                            />
                          </td>
                          <td className={td}>
                            <Link href={`/people/${c.newHireId}`} className="font-semibold underline-offset-2 hover:underline">
                              {c.name}
                            </Link>
                            <div className="text-xs text-brand-grey dark:text-slate-400">app: {c.appStatus.toLowerCase()}</div>
                            {outcome ? (
                              <div className="mt-1">
                                {outcome.result === "applied" ? (
                                  <span className={tag("ok")}>Applied</span>
                                ) : (
                                  <>
                                    <span className={tag(outcome.result === "error" ? "warn" : "muted")}>{outcome.result === "error" ? "Error" : "Skipped"}</span>
                                    <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{outcome.reason}</div>
                                  </>
                                )}
                              </div>
                            ) : null}
                          </td>
                          <td className={td}>
                            <div className="font-semibold">{c.paycomLabel}</div>
                            <div className="text-xs text-brand-grey dark:text-slate-400">
                              {c.paycom.position || "no position"} · hired {c.paycom.hire}
                              {c.paycom.rehire ? ` · left ${c.paycom.prevTerm}, back ${c.paycom.rehire}` : ""}
                              {c.paycom.term ? ` · left ${c.paycom.term}` : ""}
                              {c.paycom.dol ? ` · ${c.paycom.dol === "FULL_TIME" ? "full time" : "part time"}` : ""}
                            </div>
                          </td>
                          <td className={td}>
                            <div className="space-y-1">
                              {c.dates ? (
                                <div>
                                  <span className={tag(c.dates.action === "terminate" ? "warn" : "info")}>{ACTION[c.dates.action]}</span>
                                  <div className="mt-1 text-xs">{c.dates.what.join("; ")}</div>
                                  <div className="text-xs text-brand-grey dark:text-slate-400">employment: {c.dates.result}</div>
                                </div>
                              ) : null}
                              {c.dol ? (
                                <div>
                                  <span className={tag("info")}>Full / part time</span>
                                  <div className="mt-1 text-xs">{c.dol}</div>
                                </div>
                              ) : null}
                              {c.position ? (
                                <div>
                                  <span className={tag("info")}>Position</span>
                                  <div className="mt-1 text-xs">
                                    Paycom {c.position.from} → {c.position.to}
                                  </div>
                                  <div className="text-xs text-brand-grey dark:text-slate-400">app title now {c.position.appTitle ?? "none"} · updates the position, no new role step</div>
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className={td}>
                            {needsTitle(c) ? (
                              <input
                                className={input}
                                aria-label={`App title for ${c.name}`}
                                disabled={phase !== "review"}
                                value={titles[c.newHireId] ?? ""}
                                placeholder="Title in the app"
                                onChange={(e) => setTitles((t) => ({ ...t, [c.newHireId]: e.target.value }))}
                              />
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
            ) : (
              <p className="px-4 py-3 text-sm text-brand-grey dark:text-slate-400">Nothing to change — the directory already agrees with this export.</p>
            )}
          </section>

          {preview.forPerson.length || preview.unmatched.length ? (
            <section className={`${panel} p-4`}>
              <p className={eyebrow}>Left for a person</p>
              <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Not changed — look at these by hand</h2>
              {preview.forPerson.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-brand-lea dark:text-slate-100">
                  {preview.forPerson.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      <strong>{f.name}</strong> (Paycom {f.paycomLabel}) — {f.why}
                    </li>
                  ))}
                </ul>
              ) : null}
              {preview.unmatched.length ? (
                <>
                  <p className="mt-3 text-xs font-semibold text-brand-grey dark:text-slate-400">In Paycom, not matched to one person in the app</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-brand-lea dark:text-slate-100">
                    {preview.unmatched.map((u, i) => (
                      <li key={`${u.label}-${i}`}>
                        {u.label} · {u.position || "no position"} · hired {u.hire}
                        {u.term ? ` · left ${u.term}` : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}

      <section className={panel}>
        <div className="border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
          <p className={eyebrow}>History</p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Recent Paycom employee uploads</h2>
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
                <div key={b.id} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-brand-lea dark:text-slate-100">{b.file}</div>
                      <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                        {formatMomentDateTime(b.createdAt)}
                        {b.uploadedBy ? ` · ${b.uploadedBy}` : ""}
                        {b.asOf ? ` · export of ${b.asOf}` : ""} · {b.rowCount} rows · {b.appliedCount} applied · {b.skippedCount} skipped · {b.errorCount} errors
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={tag("info")}>{b.status}</span>
                      {["COMPLETED", "PARTLY UNDONE", "FAILED"].includes(b.status) ? (
                        <Button variant="secondary" size="sm" onClick={() => setUndoTarget(b)}>
                          Undo
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {b.applied.length ? (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-brand-lea dark:text-slate-100">
                      {b.applied.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-brand-grey dark:text-slate-400">No Paycom employee uploads applied yet.</p>
          )}
        </div>
      </section>

      <Modal open={Boolean(undoTarget)} onClose={() => setUndoTarget(null)} busy={undoing} title="Undo this Paycom employee upload">
        <div className="space-y-3 p-5">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Undo this Paycom employee upload?</h2>
          <p className="text-sm text-brand-grey dark:text-slate-400">
            Puts back everything it changed for the {undoTarget?.appliedCount ?? 0} people it applied to: employment dates and status, full / part
            time, and any position or role step it recorded. It also stops being the upload the next one compares positions with. Edits made to
            those same records by hand since the upload are overwritten by what was there before it.
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
