"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { clsx } from "clsx";
import { ONBOARDING_GROUPS, ONBOARDING_TASKS, groupLabel } from "@/lib/onboarding/tasks";
import type { GridHire, GridTaskStatus, HireStatus } from "@/lib/data/onboarding";

const NEXT: Record<GridTaskStatus, GridTaskStatus> = { TODO: "DONE", DONE: "NA", NA: "TODO" };

const STATUS_STYLE: Record<HireStatus, string> = {
  Ready: "bg-emerald-50 text-emerald-800",
  "In process": "bg-brand-gold/15 text-brand-lea",
  Urgent: "bg-red-50 text-red-700",
  Blocked: "bg-red-50 text-red-700",
  Onboarded: "bg-sky-50 text-sky-800",
  Archived: "bg-brand-cloudDancer text-brand-grey",
  Canceled: "bg-brand-cloudDancer text-brand-grey"
};

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(iso)) : "—";
}

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

export function OnboardingGridTab({ hires: initial }: { hires: GridHire[] }) {
  const [hires, setHires] = useState(initial);

  async function cycle(hireId: string, taskId: string, current: GridTaskStatus) {
    const next = NEXT[current];
    const prev = hires;
    setHires((cur) =>
      cur.map((h) =>
        h.id === hireId ? { ...h, tasks: h.tasks.map((t) => (t.id === taskId ? { ...t, status: next } : t)) } : h
      )
    );
    try {
      const res = await fetch(`/api/onboarding-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      if (!res.ok) throw new Error();
    } catch {
      setHires(prev);
    }
  }

  if (hires.length === 0) {
    return <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10">No active hires.</p>;
  }

  return (
    <div className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
      <div className="border-b border-brand-lea/10 px-4 py-3">
        <p className="text-sm text-brand-grey">
          Click any cell to cycle <span className="font-semibold text-brand-lea">to-do → done → N/A</span>. Scroll sideways for more hires.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-brand-lea/10 bg-white px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey">
                Task
              </th>
              {hires.map((h) => {
                const pct = h.applicableCount > 0 ? Math.round((h.doneCount / h.applicableCount) * 100) : 0;
                return (
                  <th key={h.id} className="sticky top-0 z-10 border-b border-brand-lea/10 bg-white px-3 py-2 align-bottom" style={{ minWidth: 132 }}>
                    <Link href={`/people/${h.id}`} className="block text-center font-medium text-brand-lea hover:underline transition hover:shadow-glow">
                      {h.name}
                    </Link>
                    <div className="mx-auto mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-brand-cloudDancer">
                      <span className={clsx("block h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-brand-gold")} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1 text-center text-[10px] text-brand-grey">{h.doneCount}/{h.applicableCount} done</div>
                    <div className="mt-1.5 text-center">
                      <span className={clsx("rounded px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[h.status])}>{h.status}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* facts */}
            {([
              ["Position", (h: GridHire) => h.position ?? "—"],
              ["Department", (h: GridHire) => h.department ?? "—"],
              ["Start date", (h: GridHire) => fmtDate(h.startDate)],
              ["Orientation", (h: GridHire) => fmtDate(h.orientationDate)]
            ] as Array<[string, (h: GridHire) => string]>).map(([label, get]) => (
              <tr key={label}>
                <td className="sticky left-0 z-20 border-b border-r border-brand-lea/10 bg-white px-3 py-1.5 text-right text-brand-grey">{label}</td>
                {hires.map((h) => (
                  <td key={h.id} className="border-b border-brand-lea/5 px-3 py-1.5 text-center text-brand-grey">{get(h)}</td>
                ))}
              </tr>
            ))}

            {/* task groups */}
            {ONBOARDING_GROUPS.map((g) => {
              const groupTasks = ONBOARDING_TASKS.filter((t) => t.group === g.key);
              return (
                <Fragment key={g.key}>
                  <tr>
                    <td className="sticky left-0 z-20 border-b border-r border-brand-lea/10 bg-brand-cloudDancer/60 px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-brand-gold">
                      {groupLabel(g.key)}
                    </td>
                    {hires.map((h) => (
                      <td key={h.id} className="border-b border-brand-lea/5 bg-brand-cloudDancer/40" />
                    ))}
                  </tr>
                  {groupTasks.map((def) => (
                    <tr key={def.key}>
                      <td className="sticky left-0 z-20 border-b border-r border-brand-lea/10 bg-white px-3 py-1.5 text-right text-brand-black">{def.label}</td>
                      {hires.map((h) => {
                        const task = h.tasks.find((t) => t.key === def.key);
                        if (!task) return <td key={h.id} className="border-b border-brand-lea/5 text-center text-brand-grey/50">–</td>;
                        return (
                          <td key={h.id} className="border-b border-brand-lea/5 text-center">
                            <button
                              type="button"
                              onClick={() => cycle(h.id, task.id, task.status)}
                              className="inline-flex h-8 w-full items-center justify-center transition hover:bg-brand-cloudDancer/50 hover:shadow-glow"
                              title="Click to change"
                            >
                              <Glyph status={task.status} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
