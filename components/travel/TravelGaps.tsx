"use client";

import { clsx } from "clsx";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";
import { findTravelGaps } from "@/lib/travel/gaps";
import type { TravelTripView } from "@/lib/data/travel";

/**
 * "Do we still need to book something?" — the missing pieces on one trip.
 * Everything shown here is derived from the trip itself (see lib/travel/gaps.ts);
 * nothing is stored, so there is no dismiss. If a prompt is wrong, the fix is to
 * record the booking on the trip and it stops asking.
 */
export function TravelGaps({ trip, showAllClear = false }: { trip: TravelTripView; showAllClear?: boolean }) {
  const gaps = findTravelGaps(trip);

  if (gaps.length === 0) {
    if (!showAllClear) return null;
    return (
      <div className="flex items-center gap-2 rounded border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Nothing obviously missing on this trip.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {gaps.map((gap) => {
        const action = gap.severity === "action";
        const Icon = action ? AlertTriangle : Info;
        return (
          <div
            key={gap.id}
            className={clsx(
              "flex items-start gap-2 rounded border px-2.5 py-2",
              action
                ? "border-brand-gold/40 bg-brand-gold/10"
                : "border-brand-lea/12 bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5"
            )}
          >
            <Icon
              className={clsx(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                action ? "text-brand-gold" : "text-brand-grey dark:text-slate-400"
              )}
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-brand-lea dark:text-slate-100">{gap.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-brand-grey dark:text-slate-400">{gap.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Compact count for a trip header — silent when the trip looks complete. */
export function TravelGapBadge({ trip }: { trip: TravelTripView }) {
  const count = findTravelGaps(trip).filter((g) => g.severity === "action").length;
  if (count === 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-brand-gold/40 bg-brand-gold/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-gold"
      title={`${count} thing${count === 1 ? "" : "s"} may still need booking`}
    >
      <AlertTriangle className="h-3 w-3" />
      {count} to book
    </span>
  );
}
