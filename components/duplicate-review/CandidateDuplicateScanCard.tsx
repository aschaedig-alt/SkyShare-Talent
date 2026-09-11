"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { Loader, RotateCcw } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import type { DetectedPair } from "@/lib/duplicates/candidate-scan";
import { formatMomentDate } from "@/lib/dates/display";

type ScanResult = {
  message?: string;
  scannedCandidates?: number;
  /** Of those scanned, how many had neither an email nor a phone to match on. */
  contactlessCandidates?: number;
  candidatePairsFound?: number;
  newReviewItems?: number;
  /** Of the pairs this run detected, how many already had a review item. */
  alreadyReviewedPairs?: number;
  existingReviewItems?: number;
  /** Open pairs closed because a side had already been merged away. */
  staleResolved?: number;
  /** Every detected pair, named. Capped server-side; see detectedTruncated. */
  detected?: DetectedPair[];
  detectedTruncated?: boolean;
  durationMs?: number;
  bucketCounts?: {
    email: number;
    phone: number;
    name: number;
  };
};

/** Anchor on the "Already reviewed" panel further down the same page. */
export const CLOSED_PAIRS_ANCHOR = "already-reviewed-pairs";

/** Anchor on the open review queue, so a reopened pair can be pointed at. */
export const OPEN_QUEUE_ANCHOR = "open-review-items";

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

/** The scan's internal reason codes, in the words she uses. */
function reasonLabel(reason: string) {
  if (reason === "exact-normalized-email-match") return "Same email";
  if (reason === "exact-normalized-phone-match") return "Same phone";
  if (reason === "same-normalized-name-review") return "Same name";
  return reason;
}

/** The scan normalizes a phone to 10 bare digits; show it back readable. */
function prettyMatch(reason: string, value: string) {
  if (reason === "exact-normalized-phone-match" && /^\d{10}$/.test(value)) {
    return `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
  }
  // A name match puts the two names on the row already — repeating the lowercase
  // normalized form adds nothing.
  if (reason === "same-normalized-name-review") return null;
  return value;
}

function statusChip(pair: DetectedPair): { tone: BadgeTone; label: string; note: string } {
  const closedOn = pair.reviewClosedAt ? formatMomentDate(pair.reviewClosedAt) : null;
  switch (pair.reviewStatus) {
    case "NEW":
      return {
        tone: "success",
        label: "New",
        note: "Just added to the review queue below."
      };
    case "OPEN":
      return {
        tone: "brand",
        label: "In the queue",
        note: "Already waiting in the review queue below."
      };
    case "DISMISSED":
      return {
        tone: "neutral",
        label: closedOn ? `Dismissed ${closedOn}` : "Dismissed",
        note: "Somebody marked these two as not the same person, so the scan does not queue them again."
      };
    default:
      return {
        tone: "info",
        label: closedOn ? `Resolved ${closedOn}` : "Resolved",
        note: "This pair was already worked through and closed out, so no new review item is created."
      };
  }
}

/** JAZZ is the legacy import; PAYCOM and MANUAL are the current system. */
function originLabel(origin: string | null) {
  if (!origin) return null;
  if (origin === "JAZZ") return "Legacy Jazz record";
  if (origin === "PAYCOM") return "From Paycom";
  if (origin === "MANUAL") return "Added by hand";
  return origin;
}

function SideName({ side }: { side: DetectedPair["left"] }) {
  if (!side) {
    return <span className="font-semibold text-brand-grey dark:text-slate-400">Record no longer exists</span>;
  }
  return (
    <Link
      href={`/candidates/${side.id}`}
      className="font-semibold text-brand-lea underline-offset-2 transition hover:text-brand-eden hover:underline dark:text-slate-100 dark:hover:text-brand-sweet"
    >
      {side.displayName}
      {side.archived ? (
        <span className="ml-1 text-[11px] font-normal text-brand-grey dark:text-slate-400">(archived)</span>
      ) : null}
    </Link>
  );
}

/**
 * What each side actually holds, so she can judge the pair without opening both
 * profiles.
 *
 * Her report was "obviously a duplicate per the matching contact info" — the
 * contact info IS the evidence, and the scan already loads it. It matters most
 * on a name-only match, where the honest answer is often that one side has
 * nothing to compare: 5,033 of the 8,651 scannable candidates carry neither an
 * email nor a phone, so "no email or phone on file" is the difference between a
 * confirmed duplicate and two people who happen to share a name.
 */
function SideDetail({ side }: { side: DetectedPair["left"] }) {
  if (!side) return null;
  const bits = [side.email, side.phone].filter((value): value is string => Boolean(value));
  const origin = originLabel(side.origin);
  return (
    <p className="text-xs text-brand-grey dark:text-slate-400">
      <span className="font-semibold text-brand-lea/80 dark:text-slate-300">{side.displayName}</span>
      {" — "}
      {bits.length > 0 ? (
        bits.join(" · ")
      ) : (
        <span className="italic">no email or phone on file</span>
      )}
      {origin ? <span> · {origin}</span> : null}
    </p>
  );
}

export function CandidateDuplicateScanCard() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyPairKey, setBusyPairKey] = useState<string | null>(null);
  const [note, setNote] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function runScan() {
    setStatus("scanning");
    setError(null);
    setResult(null);
    setNote(null);

    try {
      const response = await fetch("/api/duplicate-review/candidates/scan", {
        method: "POST"
      });
      const payload = (await response.json()) as ScanResult & { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to scan candidate duplicates.");
      }

      setResult(payload);
      setStatus("success");
      router.refresh();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Unable to scan candidate duplicates.");
      setStatus("error");
    }
  }

  /**
   * Put a closed pair back in the queue.
   *
   * Her second complaint was that a dismissed pair is a dead end — "it doesn't give
   * me the option to merge them either". This is that option, one step removed on
   * purpose: reopening lands the pair in the queue below, where the merge control
   * makes her choose WHICH of the two records survives. A one-click merge here
   * would skip that choice, and skipping it is how eight live applicants were
   * folded into their own archived records on 2026-08-31.
   */
  async function reopen(pair: DetectedPair) {
    if (!pair.reviewItemId) return;
    setBusyPairKey(pair.pairKey);
    setNote(null);
    try {
      const res = await fetch("/api/duplicate-review/candidates/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: pair.reviewItemId })
      });
      const json = (await res.json()) as { message?: string; alreadyOpen?: boolean };
      if (!res.ok) {
        setNote({ type: "error", text: json.message ?? "Unable to reopen this pair." });
        return;
      }
      // Move the row's own chip, so the list she is looking at agrees with what
      // just happened without needing a re-scan (a re-scan is another live write).
      setResult((current) =>
        current
          ? {
              ...current,
              detected: (current.detected ?? []).map((entry) =>
                entry.pairKey === pair.pairKey
                  ? { ...entry, reviewStatus: "OPEN" as const, canReopen: false, reviewClosedAt: null }
                  : entry
              )
            }
          : current
      );
      setNote({
        type: "success",
        text: json.alreadyOpen
          ? "That pair was already open — it is in the review queue below."
          : "Reopened. It is in the review queue below: pick which record to keep, then merge. Nothing has been merged yet."
      });
      router.refresh();
    } catch {
      setNote({ type: "error", text: "Unable to reopen this pair." });
    } finally {
      setBusyPairKey(null);
    }
  }

  // Split "detected" from "actionable" explicitly.
  //
  // The old banner said "N possible pairs" straight from candidatePairsFound,
  // which is EVERY pair the run detected regardless of whether somebody had
  // already dealt with it. The queue and all four stat tiles filter to OPEN, so
  // the page showed three numbers that contradicted each other: banner N,
  // tiles 0, closed-pairs panel 44. Aimee read the banner and reasonably asked
  // where the three pairs were. Detected = new + already reviewed, and only the
  // "new" half lands in the queue above.
  const detected = result?.candidatePairsFound ?? 0;
  const created = result?.newReviewItems ?? 0;
  const alreadyReviewed = result?.alreadyReviewedPairs ?? Math.max(detected - created, 0);
  const pairs = result?.detected ?? [];
  const contactless = result?.contactlessCandidates ?? 0;

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">
            Candidate duplicate scan
          </p>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Find likely duplicate candidate records</h2>
          <p className="mt-1 max-w-3xl text-xs text-brand-grey dark:text-slate-400">
            Uses indexed email, phone, and normalized-name buckets so large candidate lists do not need a full
            candidate-by-candidate comparison. Every pair it finds is listed by name below, including the ones
            somebody has already dealt with.
          </p>
        </div>
        <Button
          onClick={runScan}
          disabled={status === "scanning"}
          className="shadow-sm disabled:cursor-wait"
        >
          {status === "scanning" ? "Scanning..." : "Scan candidate duplicates"}
        </Button>
      </div>

      {status === "scanning" ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded border border-brand-sweet/40 bg-brand-cloudDancer/60 px-3 py-2 text-sm text-brand-lea dark:bg-white/5 dark:text-slate-100"
        >
          Scanning candidate buckets now. The review queue will refresh when it finishes.
        </div>
      ) : null}

      {result ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-300"
        >
          <p className="font-semibold">
            {detected} {plural(detected, "pair", "pairs")} detected — {created} new,{" "}
            {alreadyReviewed} already reviewed
          </p>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300/80">
            {created > 0
              ? `The ${created} new ${plural(created, "pair is", "pairs are")} in the review queue below. `
              : "Nothing new to review — every pair found was already merged or dismissed. "}
            {detected > 0 ? "Each one is named underneath. " : null}
            {alreadyReviewed > 0 ? (
              <a
                href={`#${CLOSED_PAIRS_ANCHOR}`}
                className="font-semibold underline underline-offset-2 transition hover:text-emerald-950 dark:hover:text-emerald-200"
              >
                See the full merged and dismissed history
              </a>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/70">
            {result.scannedCandidates ?? 0} candidates scanned in {result.durationMs ?? 0}ms
            {result.staleResolved
              ? ` — ${result.staleResolved} stale ${plural(result.staleResolved, "pair", "pairs")} closed (a side was already merged)`
              : ""}
          </p>
          {/* Said on every run, not only when nothing is found. "2 pairs" reads
              as "there are 2 duplicates" unless the scan admits what it cannot
              see, and right now it cannot see the majority of the pool. */}
          {contactless > 0 ? (
            <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/70">
              {contactless.toLocaleString()} of them have no email or phone on file, so only an exact name
              match can find those. There may be duplicates in that group this scan cannot see.
            </p>
          ) : null}
        </div>
      ) : null}

      {note ? (
        <div
          role="status"
          className={clsx(
            "mt-3 rounded px-3 py-2 text-sm",
            note.type === "success"
              ? "bg-brand-sweet/25 text-brand-lea dark:bg-brand-eden/40 dark:text-slate-100"
              : "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
          )}
        >
          {note.text}
        </div>
      ) : null}

      {/* The pairs themselves.
          No height cap and no inner scrollbar: the page scrolls, this does not.
          A long list is a reason to raise DETECTED_PAIR_LIMIT's visibility, not
          to hide the rows behind a second scrollbar. */}
      {result && pairs.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey dark:text-slate-400">
            Pairs this scan found
          </p>
          {pairs.map((pair) => {
            const chip = statusChip(pair);
            const matched = prettyMatch(pair.reason, pair.matchedValue);
            const busy = busyPairKey === pair.pairKey;
            return (
              <div
                key={pair.pairKey}
                className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-2 dark:border-white/10 dark:bg-brand-lea/30"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Badge tone={chip.tone}>{chip.label}</Badge>
                  <div className="min-w-0 flex-1 text-sm text-brand-lea dark:text-slate-100">
                    <SideName side={pair.left} />
                    <span className="px-2 text-brand-grey dark:text-slate-400">vs</span>
                    <SideName side={pair.right} />
                  </div>
                  {pair.canReopen ? (
                    <button
                      type="button"
                      onClick={() => reopen(pair)}
                      disabled={busy}
                      title="Puts the pair back in the review queue below. It merges nothing on its own."
                      className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 bg-white px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-gold-glow disabled:opacity-50 dark:border-white/15 dark:bg-brand-panel dark:text-slate-100"
                    >
                      {busy ? <Loader className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Reopen to merge
                    </button>
                  ) : pair.reviewStatus === "NEW" || pair.reviewStatus === "OPEN" ? (
                    <a
                      href={`#${OPEN_QUEUE_ANCHOR}`}
                      className="text-[11px] font-semibold text-brand-eden underline underline-offset-2 transition hover:text-brand-lea dark:text-brand-sweet dark:hover:text-white"
                    >
                      Go to the queue
                    </a>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                  <span className="font-semibold text-brand-lea dark:text-slate-300">{reasonLabel(pair.reason)}</span>
                  {matched ? <span> — {matched}</span> : null} · {chip.note}
                </p>
                {/* What is on each record. A name-only match with nothing to
                    compare is not proof, and the row should say so rather than
                    leave her to infer it from two names that look alike. */}
                <div className="mt-1 space-y-0.5">
                  <SideDetail side={pair.left} />
                  <SideDetail side={pair.right} />
                </div>
              </div>
            );
          })}
          {result.detectedTruncated ? (
            <p className="text-xs text-brand-grey dark:text-slate-400">
              Showing the first {pairs.length} of {detected} detected pairs, the ones needing attention first. The
              rest are recorded in the review queue and the merged-or-dismissed history below.
            </p>
          ) : null}
        </div>
      ) : null}

      {result && pairs.length === 0 ? (
        <p className="mt-3 text-xs text-brand-grey dark:text-slate-400">
          No duplicate pairs detected in this run. Note that the email and phone rules can only see candidates who
          have an email or a phone on file.
        </p>
      ) : null}

      {error ? (
        <div role="alert" className="mt-3 rounded border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 px-3 py-2 text-sm text-red-900 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </section>
  );
}
