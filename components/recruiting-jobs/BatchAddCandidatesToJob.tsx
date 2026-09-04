"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, X, AlertTriangle, Check } from "lucide-react";
import { useDialogClose } from "@/lib/hooks/useDialogClose";

type PreviewRow = {
  line: string;
  matchedBy: "email" | "phone" | "name" | null;
  candidate: {
    id: string;
    displayName: string;
    currentTitle: string | null;
    primaryEmail: string | null;
    archived: boolean;
    alreadyLinked: boolean;
    hasMetrics: boolean;
    hasDocumentText: boolean;
  } | null;
  ambiguous?: { id: string; displayName: string; primaryEmail: string | null }[];
};

type ApplyResult = {
  linked: number;
  reused: number;
  reactivated: number;
  missing: number;
};

const FIELD =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

/**
 * Add a whole requisition's applicant list to a job in one pass: paste, review
 * what it matched, link the ones you confirm, then scan just those.
 *
 * The review step is not decoration. This writes to a database that dev and
 * production share, and matching free text to people is the step most likely to
 * land on the wrong one — so nothing is written until the matches are on screen.
 */
export function BatchAddCandidatesToJob({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"paste" | "review" | "done">("paste");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);

  // Scan progress. abortScan is a ref so the loop reads the live value rather
  // than the value captured when it started.
  const [scanning, setScanning] = useState(false);
  const [scanDone, setScanDone] = useState(0);
  const [scanFailed, setScanFailed] = useState<string[]>([]);
  const [scanFinished, setScanFinished] = useState(false);
  const abortScan = useRef(false);

  const matched = useMemo(() => rows.filter((r) => r.candidate), [rows]);
  const unmatched = useMemo(() => rows.filter((r) => !r.candidate), [rows]);

  /** Of the people just added, the ones a scan would actually help. */
  const scanTargets = useMemo(() => {
    const byId = new Map(matched.map((r) => [r.candidate!.id, r.candidate!]));
    return addedIds
      .map((id) => byId.get(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c) && !c!.hasMetrics && c!.hasDocumentText);
  }, [addedIds, matched]);

  const noDocuments = useMemo(() => {
    const byId = new Map(matched.map((r) => [r.candidate!.id, r.candidate!]));
    return addedIds.map((id) => byId.get(id)).filter((c) => c && !c.hasDocumentText).length;
  }, [addedIds, matched]);

  async function runPreview() {
    if (!text.trim()) {
      setError("Paste at least one name or email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/candidate-applications/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", jobId, text })
      });
      const body = (await res.json().catch(() => null)) as { rows?: PreviewRow[]; message?: string } | null;
      if (!res.ok || !body?.rows) {
        setError(body?.message ?? `Could not match the list (${res.status}).`);
        return;
      }
      setRows(body.rows);
      // Everything matched starts ticked EXCEPT those already on this job —
      // re-adding them is a no-op, and pre-ticking them hides the ones that are
      // genuinely new behind a wall of green.
      setChosen(new Set(body.rows.filter((r) => r.candidate && !r.candidate.alreadyLinked).map((r) => r.candidate!.id)));
      setStep("review");
    } catch {
      setError("Network error — nothing was matched.");
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    const ids = [...chosen];
    if (ids.length === 0) {
      setError("Tick at least one person.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/candidate-applications/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "apply", jobId, candidateIds: ids })
      });
      const body = (await res.json().catch(() => null)) as (ApplyResult & { message?: string }) | null;
      if (!res.ok || !body) {
        setError(body?.message ?? `Could not add them (${res.status}).`);
        return;
      }
      setResult(body);
      setAddedIds(ids);
      setStep("done");
      router.refresh();
    } catch {
      setError("Network error — they may not have been added. Re-run the match to check.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Scan exactly the people this batch added — which is the whole reason the
   * scan lives here rather than being a separate scoped run afterwards. One POST
   * per candidate against the same route the profile's "Scan docs" button uses.
   * Sequential: each is a model call, and firing thirty at once at a shared
   * database and a rate-limited API is how you get a partial, confusing result.
   */
  async function runScan() {
    abortScan.current = false;
    setScanning(true);
    setScanDone(0);
    setScanFailed([]);
    setScanFinished(false);
    for (const target of scanTargets) {
      if (abortScan.current) break;
      try {
        const res = await fetch(`/api/candidates/${target.id}/extract-metrics`, { method: "POST" });
        if (!res.ok) setScanFailed((f) => [...f, target.displayName]);
      } catch {
        setScanFailed((f) => [...f, target.displayName]);
      }
      setScanDone((d) => d + 1);
    }
    setScanning(false);
    setScanFinished(true);
    router.refresh();
  }

  function reset() {
    abortScan.current = true;
    setOpen(false);
    setStep("paste");
    setText("");
    setRows([]);
    setChosen(new Set());
    setResult(null);
    setAddedIds([]);
    setError(null);
    setScanning(false);
    setScanDone(0);
    setScanFailed([]);
    setScanFinished(false);
    router.refresh();
  }

  const requestClose = useDialogClose(reset, open, {
    isDirty: (step === "paste" && text.trim().length > 0) || step === "review" || scanning,
    message: scanning
      ? "A scan is running. Close and stop it? Everyone already added stays added."
      : "You have a list in progress. Close and lose it?"
  });

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      >
        <Users className="h-3.5 w-3.5" /> Add many
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-lea/40 p-4" onClick={requestClose}>
          <div
            className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col rounded bg-white p-5 shadow-xl dark:bg-brand-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">
                {step === "done" ? "Added" : "Add many candidates"}
              </h2>
              <button
                onClick={requestClose}
                data-dialog-close
                className="rounded p-1 text-brand-grey hover:text-brand-lea dark:text-slate-400"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-xs text-brand-grey dark:text-slate-400">
              Linking to <span className="font-semibold text-brand-lea dark:text-slate-100">{jobTitle}</span>
            </p>

            {/* ---- STEP 1: paste ------------------------------------------ */}
            {step === "paste" && (
              <div className="space-y-3">
                <p className="text-sm text-brand-grey dark:text-slate-400">
                  Paste the requisition&rsquo;s applicant list — one person per line. Names, emails or pasted
                  columns all work; it reads the email first, then the phone, then the name.
                </p>
                <textarea
                  className={`${FIELD} min-h-[220px] font-mono text-xs`}
                  placeholder={"Jane Doe\tjdoe@example.com\nJohn Smith, jsmith@example.com, 555-201-8890\nmpatel@example.com"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-brand-grey dark:text-slate-400">
                    {text.split(/\r?\n/).filter((l) => l.trim()).length} line(s) — nothing is saved until you review the matches
                  </span>
                  <button
                    onClick={runPreview}
                    disabled={busy}
                    className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60 dark:bg-brand-sweet dark:text-brand-lea"
                  >
                    {busy ? "Matching…" : "Match candidates"}
                  </button>
                </div>
              </div>
            )}

            {/* ---- STEP 2: review ----------------------------------------- */}
            {step === "review" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="font-semibold text-brand-lea dark:text-slate-100">
                    {matched.length} matched · {chosen.size} ticked
                  </span>
                  {unmatched.length > 0 && (
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {unmatched.length} not matched — add those by hand
                    </span>
                  )}
                </div>

                {/* A modal is the documented place a scrollbar is allowed. Both
                    axes pinned: overflow-y alone computes overflow-x to auto. */}
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
                  {rows.map((row, i) => {
                    const c = row.candidate;
                    return (
                      <div
                        key={`${row.line}-${i}`}
                        className={`rounded border p-2.5 ${
                          c
                            ? "border-brand-lea/10 bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5"
                            : "border-amber-300/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
                        }`}
                      >
                        {c ? (
                          <label className="flex cursor-pointer items-start gap-2.5">
                            <input
                              type="checkbox"
                              checked={chosen.has(c.id)}
                              onChange={() => toggle(c.id)}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-gold"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">
                                  {c.displayName}
                                </span>
                                <Tag>matched on {row.matchedBy}</Tag>
                                {c.alreadyLinked && <Tag tone="quiet">already on this job</Tag>}
                                {c.archived && <Tag tone="warn">archived — adding reactivates</Tag>}
                                {!c.hasDocumentText && <Tag tone="warn">no readable documents</Tag>}
                                {c.hasMetrics && <Tag tone="good">already scanned</Tag>}
                              </span>
                              <span className="block truncate text-xs text-brand-grey dark:text-slate-400">
                                {[c.currentTitle, c.primaryEmail].filter(Boolean).join(" · ") || "No details"}
                              </span>
                              <span className="block truncate font-mono text-[11px] text-brand-grey/70 dark:text-slate-500">
                                {row.line}
                              </span>
                            </span>
                          </label>
                        ) : (
                          <div className="flex items-start gap-2.5">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                                {row.ambiguous?.length
                                  ? `Matches ${row.ambiguous.length} people — too ambiguous to pick`
                                  : "No candidate found"}
                              </p>
                              <p className="truncate font-mono text-[11px] text-brand-grey dark:text-slate-400">{row.line}</p>
                              {row.ambiguous?.length ? (
                                <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                                  {row.ambiguous.map((a) => a.displayName + (a.primaryEmail ? ` (${a.primaryEmail})` : "")).join(", ")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-brand-lea/10 pt-3 dark:border-white/10">
                  <button
                    onClick={() => setStep("paste")}
                    className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100"
                  >
                    Back to the list
                  </button>
                  <button
                    onClick={runApply}
                    disabled={busy || chosen.size === 0}
                    className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60 dark:bg-brand-sweet dark:text-brand-lea"
                  >
                    {busy ? "Adding…" : `Add ${chosen.size} to this job`}
                  </button>
                </div>
              </div>
            )}

            {/* ---- STEP 3: done, then scan just this batch ----------------- */}
            {step === "done" && result && (
              <div className="space-y-3">
                <div className="rounded border border-brand-gold/40 bg-brand-sweet/12 p-3 text-sm text-brand-lea dark:bg-brand-gold/10 dark:text-slate-100">
                  <p className="font-semibold">
                    {result.linked} added to {jobTitle}.
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {result.reused > 0 && <li>{result.reused} were already on this job — left as they were.</li>}
                    {result.reactivated > 0 && <li>{result.reactivated} were archived and are now back in the active pipeline.</li>}
                    {result.missing > 0 && <li>{result.missing} could not be added.</li>}
                    {noDocuments > 0 && <li>{noDocuments} have no readable documents, so nothing can be scanned for them yet.</li>}
                  </ul>
                </div>

                {scanTargets.length > 0 ? (
                  <div className="rounded border border-brand-lea/15 p-3 dark:border-white/10">
                    <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                      {scanTargets.length} of them have documents but no flight metrics
                    </p>
                    <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                      The matchboard ranks on metrics, so these will not appear until they are scanned. This reads their
                      documents with {}
                      <span className="font-semibold">one model call each</span> — roughly two cents a head — and touches
                      nobody outside this batch.
                    </p>

                    {(scanning || scanFinished) && (
                      <p className="mt-2 text-xs font-semibold text-brand-lea dark:text-slate-100">
                        {scanDone} / {scanTargets.length} scanned
                        {scanFailed.length > 0 && ` · ${scanFailed.length} failed: ${scanFailed.join(", ")}`}
                      </p>
                    )}

                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={runScan}
                        disabled={scanning || (scanFinished && scanDone >= scanTargets.length)}
                        className="rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60 dark:bg-brand-sweet dark:text-brand-lea"
                      >
                        {scanning ? "Scanning…" : scanFinished ? "Scan finished" : `Scan these ${scanTargets.length}`}
                      </button>
                      {scanning && (
                        <button
                          onClick={() => {
                            abortScan.current = true;
                          }}
                          className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100"
                        >
                          Stop after this one
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-brand-grey dark:text-slate-400">
                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    Nothing here needs a scan.
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    onClick={reset}
                    className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden dark:bg-brand-sweet dark:text-brand-lea"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {error && <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function Tag({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" | "good" | "quiet" }) {
  const cls =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
      : tone === "good"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
        : tone === "quiet"
          ? "border-brand-lea/15 bg-brand-cloudDancer/60 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
          : "border-brand-gold/30 bg-brand-gold/10 text-brand-lea dark:text-slate-100";
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {children}
    </span>
  );
}
