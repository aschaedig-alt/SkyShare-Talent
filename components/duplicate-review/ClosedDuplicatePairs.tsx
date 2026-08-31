"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { RotateCcw, Loader } from "lucide-react";
import type { DuplicateReviewData } from "@/lib/data/duplicate-review";
import { formatMomentDate } from "@/lib/dates/display";

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

  return (
    <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Already reviewed</p>
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">
          Pairs a scan still finds ({closed.length})
        </h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          A scan counts every pair it detects, including these. They are not in the queue above because
          somebody has already merged or dismissed them. Reopen one to put it back in the queue — that
          moves the review item only, and does not merge or un-merge anybody.
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
                <span className="font-semibold">{item.primary?.displayName ?? "Unknown"}</span>
                <span className="px-2 text-brand-grey dark:text-slate-400">vs</span>
                <span className="font-semibold">{item.secondary?.displayName ?? "Unknown"}</span>
                {item.reason ? (
                  <span className="ml-2 text-xs text-brand-grey dark:text-slate-400">{item.reason}</span>
                ) : null}
              </div>

              <span className="text-xs text-brand-grey dark:text-slate-400">
                {item.resolvedAt ? formatMomentDate(item.resolvedAt) : formatMomentDate(item.createdAt)}
              </span>

              <div className="flex items-center gap-2">
                {item.primary ? (
                  <Link
                    href={`/candidates/${item.primary.id}`}
                    className="text-[11px] font-semibold text-brand-eden transition hover:text-brand-lea dark:text-brand-sweet dark:hover:text-white"
                  >
                    Open profile
                  </Link>
                ) : null}
                <button
                  onClick={() => reopen(item)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 bg-white px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-gold-glow disabled:opacity-50 dark:border-white/15 dark:bg-brand-panel dark:text-slate-100"
                >
                  {busy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  Reopen
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
