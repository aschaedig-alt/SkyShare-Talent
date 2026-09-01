"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { RotateCcw, Loader, CheckCircle2 } from "lucide-react";
import type { DuplicateReviewData } from "@/lib/data/duplicate-review";
import { formatMomentDate } from "@/lib/dates/display";
import { CLOSED_PAIRS_ANCHOR } from "@/components/duplicate-review/CandidateDuplicateScanCard";

type ClosedItem = DuplicateReviewData["closed"][number];

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
 */
export function ClosedDuplicatePairs({ closed }: { closed: ClosedItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  const reopenable = closed.filter((item) => item.reopen.allowed).length;
  const settled = closed.length - reopenable;

  return (
    <section
      id={CLOSED_PAIRS_ANCHOR}
      className="scroll-mt-4 rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10"
    >
      <div className="border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Already reviewed</p>
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">
          Pairs a scan still finds ({closed.length})
        </h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          A scan counts every pair it detects, including these. They are not in the queue above because
          somebody has already merged or dismissed them.{" "}
          {settled > 0 ? (
            <>
              <span className="font-semibold text-brand-lea dark:text-slate-200">{settled}</span> of them are
              settled for good — one side has been merged away, so there is nothing left to action and no
              Reopen is offered.{" "}
            </>
          ) : null}
          {reopenable > 0 ? (
            <>
              The other <span className="font-semibold text-brand-lea dark:text-slate-200">{reopenable}</span>{" "}
              can be reopened, which puts the review item back in the queue above — it moves the review item
              only, and does not merge or un-merge anybody.
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
        {closed.map((item) => {
          const busy = busyId === item.id;
          // Send "Open profile" to a record that still exists. It used to go to
          // item.primary unconditionally, which on a merged pair is a 50/50 shot
          // at landing on the tombstone rather than the person.
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
                <span className={clsx("font-semibold", item.primary?.status === "MERGED" && "line-through decoration-brand-grey/60")}>
                  {item.primary?.displayName ?? "Unknown"}
                </span>
                <span className="px-2 text-brand-grey dark:text-slate-400">vs</span>
                <span className={clsx("font-semibold", item.secondary?.status === "MERGED" && "line-through decoration-brand-grey/60")}>
                  {item.secondary?.displayName ?? "Unknown"}
                </span>
                {item.reason ? (
                  <span className="ml-2 text-xs text-brand-grey dark:text-slate-400">{item.reason}</span>
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
                    onClick={() => reopen(item)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 bg-white px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-gold-glow disabled:opacity-50 dark:border-white/15 dark:bg-brand-panel dark:text-slate-100"
                  >
                    {busy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Reopen
                  </button>
                ) : (
                  // Deliberately NOT a disabled button. A greyed-out Reopen still
                  // reads as "this might work later"; this row is finished, and
                  // saying so is the informative thing.
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
    </section>
  );
}
