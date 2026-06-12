"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { MILESTONE_KEYS } from "@/lib/onboarding/tasks";
import type { GridTaskStatus, MilestoneHire } from "@/lib/data/onboarding";

function Glyph({ status }: { status: GridTaskStatus }) {
  if (status === "DONE")
    return (
      <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg width="11" height="11" viewBox="0 0 12 12">
          <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (status === "TODO") return <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-brand-grey/40" />;
  return <span className="text-brand-grey/50">–</span>;
}

export function OnboardingMilestonesTab({ hires }: { hires: MilestoneHire[] }) {
  if (hires.length === 0) {
    return <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10">No active hires.</p>;
  }
  return (
    <div className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-brand-lea/10 bg-white px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey">
                New hire
              </th>
              {MILESTONE_KEYS.map((m) => (
                <th key={m.key} className="border-b border-brand-lea/10 px-2 py-2 text-center font-medium text-brand-grey" style={{ minWidth: 64 }}>
                  {m.short}
                </th>
              ))}
              <th className="border-b border-brand-lea/10 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey" style={{ minWidth: 140 }}>
                Progress
              </th>
            </tr>
          </thead>
          <tbody>
            {hires.map((h) => {
              const pct = Math.round((h.done / MILESTONE_KEYS.length) * 100);
              return (
                <tr key={h.id} className="hover:bg-brand-cloudDancer/30">
                  <td className="sticky left-0 z-10 border-b border-r border-brand-lea/10 bg-white px-3 py-2">
                    <Link href={`/people/${h.id}`} className="font-medium text-brand-lea hover:underline">{h.name}</Link>
                    <div className="text-[10px] text-brand-grey">
                      {h.position ?? "—"}
                      {h.department ? ` · ${h.department}` : ""}
                    </div>
                  </td>
                  {h.milestones.map((s, i) => (
                    <td key={MILESTONE_KEYS[i].key} className="border-b border-brand-lea/5 text-center">
                      <Glyph status={s} />
                    </td>
                  ))}
                  <td className="border-b border-brand-lea/5 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-20 overflow-hidden rounded-full bg-brand-cloudDancer">
                        <span className={clsx("block h-full rounded-full", h.done === MILESTONE_KEYS.length ? "bg-emerald-500" : "bg-brand-gold")} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="text-[11px] text-brand-grey">{h.done}/{MILESTONE_KEYS.length}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
