"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { RotateCcw, Loader, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import type { DuplicateReviewData } from "@/lib/data/duplicate-review";
import { formatMomentDate } from "@/lib/dates/display";
import { CLOSED_PAIRS_ANCHOR } from "@/components/duplicate-review/CandidateDuplicateScanCard";

type ClosedItem = DuplicateReviewData["closed"][number];

/** One PAIR, plus how many recorded decisions collapsed into it. */
type ClosedPair = {
  item: ClosedItem;
  decisions: number;
};

function decidedAt(item: ClosedItem) {
  return new Date(item.resolvedAt ?? item.createdAt).getTime();
}

/**
 * Collapse the list to one row per PAIR OF PEOPLE.
 *
 * The same two candidates can carry more than one review item — 44 live items
 * are only 33 distinct pairs, so 11 of them rendered twice, and "Matt Smith vs
 * Matt Smith" appeared on screen twice in a row looking like a rendering fault.
 *
 * The pair identity is the two candidate ids SORTED, which is exactly how
 * lib/duplicates/candidate-scan.ts builds its pairKey — the two stored id
 * columns are not in a fixed order (two of the live Matt Smith items carry the
 * same pair with primary and secondary swapped), so sorting is what makes them
 * compare equal. When a side no longer exists there is no pair to key on, so
 * the item stands alone under its own id rather than merging with an unrelated
 * row. Newest decision wins, matching what the scan reports for the same pair.
 */
function collapseToPairs(closed: ClosedItem[]): ClosedPair[] {
  const byPair = new Map<string, ClosedPair>();

  for (const item of closed) {
    const key =
      item.primary && item.secondary ? [item.primary.id, item.secondary.id].sort().join("::") : `item:${item.id}`;
    const held = byPair.get(key);
    if (!held) {
      byPair.set(key, { item, decisions: 1 });
      continue;
    }
    byPair.set(key, {
      item: decidedAt(item) > decidedAt(held.item) ? item : held.item,
      decisions: held.decisions + 1
    });
  }

  return Array.from(byPair.values()).sort((left, right) => decidedAt(right.item) - decidedAt(left.item));
}

/**
 * The pairs the scan counted but the queue could not show.
 *
 * The scan card reports every pair it detects; the queue and all four stat tiles
 * filter to OPEN. So the page could announce "3 possible pairs" and then show
 * nobody, with no way to find out who they were and no way to act on them —
 * reported by Hannah on 2026-08-31, when all 44 review items were RESOLVED or
 * DISMISSED and there was no OPEN row anywhere.
 *
 * Reopening only moves the review item back to OPEN. It merges nothing and
 * un-merges nothing; a pair that was genuinely merged stays merged. It just makes
 * the pair reachable again, because both merge entry points require an OPEN item
 * while the merge engine itself would accept the pair.
 *
 * AND THAT LAST CLAUSE IS THE CATCH. The first pass shipped a Reopen on all 44
 * rows; on live data only 2 of them could ever reach a merge. For the other 42 a
 * side is already MERGED, so the next scan re-closes the item and the merge engine
 * would refuse it anyway — the button appeared to work and accomplished nothing.
 * item.reopen (computed in lib/data/duplicate-review.ts, where the candidate
 * status is actually known) decides which rows keep a live control; the rest state
 * the reason and point at the surviving record instead.
 *
 * COLLAPSED BY DEFAULT (2026-09-11), mirroring components/jobs/JobDismissedPairs.
 * This is history, not work: 44 rows opened on arrival is "doesn't show me who it
 * is" in a different shape — too much to read instead of too little. The pairs a
 * scan ACTUALLY finds are now named on the scan card itself, which is the short
 * list she wants; this is the archive behind it. Clicking through from that card
 * opens it, so the link never lands on a closed header.
 *
 * No height cap and no inner scrollbar when open, per the house rule — the page
 * scrolls, the panel does not.
 */
export function ClosedDuplicatePairs({ closed }: { closed: ClosedItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Open when somebody follows the "see the history" link on the scan card, on
  // first paint and on every later click of it (the hash does not change if it is
  // already set, so listen for both).
  useEffect(() => {
    const openIfTargeted = () => {
      if (window.location.hash === `#${CLOSED_PAIRS_ANCHOR}`) setOpen(true);
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, []);

  if (closed.length === 0) return null;

  async function reopen(item: ClosedItem) {
    setBusyId(item.id);
    setMessage(null);
    try {
      const res = await fetch("/api/duplicate-review/candidates/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id })
      });
      const json = (await res.json()) as { message?: string; alreadyOpen?: boolean };
      if (!res.ok) {
        setMessage({ type: "error", text: json.message ?? "Unable to reopen this pair." });
        return;
      }
      setMessage({
        type: "success",
        text: json.alreadyOpen
          ? "That pair was already open — the queue above is up to date."
          : "Reopened. It is back in the queue above, where it can be merged or dismissed."
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Unable to reopen this pair." });
    } finally {
      setBusyId(null);
    }
  }

  const pairs = collapseToPairs(closed);
  const reopenable = pairs.filter((pair) => pair.item.reopen.allowed).length;
  const settled = pairs.length - reopenable;
  // Two numbers, both true, because they answer different questions: how many
  // PAIRS have been decided, and how many decisions are on record behind them.
  // Showing only the second is what put 11 pairs on screen twice; showing only
  // the first would contradict the "Resolved" tile at the top of the page.
  const extraDecisions = closed.length - pairs.length;

  return (
    <section
      id={CLOSED_PAIRS_ANCHOR}
      className="scroll-mt-4 rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-brand-gold/10"
      >
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Already reviewed</p>
          <div className="flex items-center gap-2">
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-brand-grey dark:text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-brand-grey dark:text-slate-400" />
            )}
            {/* Deliberately NOT "pairs a scan still finds". A scan finds 2 of these
                44; the other 42 have a side that is already MERGED, and the scan
                pool excludes MERGED, so it cannot see them at all. The old heading
                put a second wrong number on the same page as the first one. */}
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">
              Merged or dismissed history ({pairs.length})
            </h2>
          </div>
        </div>
        <span className="shrink-0 text-xs text-brand-grey dark:text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>

      {!open ? null : (
        <>
          <div className="border-t border-brand-lea/10 px-4 py-3 dark:border-white/10">
            <p className="text-sm text-brand-grey dark:text-slate-400">
              Every candidate pair somebody has already merged or dismissed. A scan still counts the ones
              whose records both survive, which is why a scan can report a pair and the queue above stay
              empty.{" "}
              {settled > 0 ? (
                <>
                  <span className="font-semibold text-brand-lea dark:text-slate-200">{settled}</span> of these
                  are settled for good — one side has been merged away, so there is nothing left to action and
                  no Reopen is offered.{" "}
                </>
              ) : null}
              {reopenable > 0 ? (
                <>
                  The other <span className="font-semibold text-brand-lea dark:text-slate-200">{reopenable}</span>{" "}
                  can be reopened, which puts the review item back in the queue above — it moves the review
                  item only, and does not merge or un-merge anybody.{" "}
                </>
              ) : null}
              {extraDecisions > 0 ? (
                <>
                  These {pairs.length} pairs come from{" "}
                  <span className="font-semibold text-brand-lea dark:text-slate-200">{closed.length}</span>{" "}
                  recorded decisions — {extraDecisions} were decided more than once, and each pair is listed
                  here only once, showing the most recent decision.
                </>
              ) : null}
            </p>
          </div>

          {message ? (
            <div
              className={clsx(
                "mx-4 mt-4 rounded px-3 py-2 text-sm",
                message.type === "success"
                  ? "bg-brand-sweet/25 text-brand-lea dark:bg-brand-eden/40 dark:text-slate-100"
                  : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              )}
            >
              {message.text}
            </div>
          ) : null}

          <div className="space-y-2 p-4">
            {pairs.map(({ item, decisions }) => {
              const busy = busyId === item.id;
              // Send "Open profile" to a record that still exists. It used to go
              // to item.primary unconditionally, which on a merged pair is a
              // 50/50 shot at landing on the tombstone rather than the person.
              const profileTarget =
                (item.primary?.status !== "MERGED" ? item.primary : null) ??
                (item.secondary?.status !== "MERGED" ? item.secondary : null) ??
                item.primary ??
                item.secondary;
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-2 dark:border-white/10 dark:bg-brand-lea/30"
                >
                  <span
                    className={clsx(
                      "rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                      item.status === "RESOLVED"
                        ? "bg-brand-eden/15 text-brand-eden dark:bg-brand-eden/40 dark:text-slate-100"
                        : "bg-brand-grey/15 text-brand-grey dark:bg-white/10 dark:text-slate-300"
                    )}
                  >
                    {item.status.toLowerCase()}
                  </span>

                  <div className="min-w-0 flex-1 text-sm text-brand-lea dark:text-slate-100">
                    <span
                      className={clsx(
                        "font-semibold",
                        item.primary?.status === "MERGED" && "line-through decoration-brand-grey/60"
                      )}
                    >
                      {item.primary?.displayName ?? "Unknown"}
                    </span>
                    <span className="px-2 text-brand-grey dark:text-slate-400">vs</span>
                    <span
                      className={clsx(
                        "font-semibold",
                        item.secondary?.status === "MERGED" && "line-through decoration-brand-grey/60"
                      )}
                    >
                      {item.secondary?.displayName ?? "Unknown"}
                    </span>
                    {item.reason ? (
                      <span className="ml-2 text-xs text-brand-grey dark:text-slate-400">{item.reason}</span>
                    ) : null}
                    {decisions > 1 ? (
                      <span
                        title="This pair was recorded more than once. The latest decision is the one shown."
                        className="ml-2 text-xs text-brand-grey dark:text-slate-400"
                      >
                        · decided {decisions} times
                      </span>
                    ) : null}
                  </div>

                  <span className="text-xs text-brand-grey dark:text-slate-400">
                    {item.resolvedAt ? formatMomentDate(item.resolvedAt) : formatMomentDate(item.createdAt)}
                  </span>

                  <div className="flex items-center gap-2">
                    {profileTarget ? (
                      <Link
                        href={`/candidates/${profileTarget.id}`}
                        className="text-[11px] font-semibold text-brand-eden transition hover:text-brand-lea dark:text-brand-sweet dark:hover:text-white"
                      >
                        Open profile
                      </Link>
                    ) : null}
                    {item.reopen.allowed ? (
                      <button
                        type="button"
                        onClick={() => reopen(item)}
                        disabled={busy}
                        title="Puts the pair back in the queue above. It merges nothing on its own."
                        className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 bg-white px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-gold-glow disabled:opacity-50 dark:border-white/15 dark:bg-brand-panel dark:text-slate-100"
                      >
                        {busy ? (
                          <Loader className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Reopen
                      </button>
                    ) : (
                      // Deliberately NOT a disabled button. A greyed-out Reopen
                      // still reads as "this might work later"; this row is
                      // finished, and saying so is the informative thing.
                      <span
                        title="Reopening this pair could not lead to a merge, so no control is offered."
                        className="inline-flex items-center gap-1.5 rounded border border-brand-lea/10 bg-brand-cloudDancer px-2.5 py-1 text-xs font-semibold text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {item.reopen.label}
                        {item.reopen.keeper ? (
                          <Link
                            href={`/candidates/${item.reopen.keeper.id}`}
                            className="font-semibold text-brand-eden underline underline-offset-2 transition hover:text-brand-lea dark:text-brand-sweet dark:hover:text-white"
                          >
                            into {item.reopen.keeper.displayName}
                          </Link>
                        ) : null}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
