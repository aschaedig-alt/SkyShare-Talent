"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { clsx } from "clsx";
import { CircleCheck, Archive, CalendarClock, Building2, Trash2 } from "lucide-react";
import { ONBOARDING_GROUPS, ONBOARDING_TASKS, groupLabel } from "@/lib/onboarding/tasks";
import type { GridHire, GridTaskStatus, HireStatus } from "@/lib/data/onboarding";
import { BulkActionBar, bulkUpdateHires, bulkDeleteHires, type BulkAction, type BulkPatch } from "@/components/people/BulkActionBar";

const GRID_BULK_ACTIONS: BulkAction[] = [
  { kind: "patch", key: "onboard", label: "Mark onboarded", icon: CircleCheck, patch: { stage: "POST_ONBOARD" }, tone: "primary" },
  { kind: "patch", key: "archive", label: "Archive", icon: Archive, patch: { stage: "ARCHIVED" }, confirm: true, tone: "danger" },
  { kind: "date", key: "orientation", label: "Set orientation date", icon: CalendarClock },
  { kind: "text", key: "dept", label: "Set department", icon: Building2, placeholder: "Department" },
  { kind: "delete", key: "delete", label: "Delete", icon: Trash2 }
];

const NEXT: Record<GridTaskStatus, GridTaskStatus> = { TODO: "DONE", DONE: "NA", NA: "TODO" };

const STATUS_STYLE: Record<HireStatus, string> = {
  Ready: "bg-emerald-50 text-emerald-800",
  "In progress": "bg-brand-gold/15 text-brand-lea dark:text-slate-100",
  "Due soon": "bg-amber-50 text-amber-700",
  Overdue: "bg-red-50 text-red-700",
  Onboarded: "bg-sky-50 text-sky-800",
  Archived: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400",
  Canceled: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
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
  const router = useRouter();
  const [hires, setHires] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const allSelected = hires.length > 0 && selected.size === hires.length;
  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(hires.map((h) => h.id)));
  }
  async function applyBulk(patch: BulkPatch) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const res = await bulkUpdateHires(ids, patch);
    setBulkBusy(false);
    if (!res.ok) return;
    if (patch.stage) setHires((cur) => cur.filter((h) => !selected.has(h.id)));
    setSelected(new Set());
    router.refresh();
  }
  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const res = await bulkDeleteHires(ids);
    setBulkBusy(false);
    if (!res.ok) {
      window.alert(res.message ?? "Could not delete.");
      return;
    }
    setHires((cur) => cur.filter((h) => !selected.has(h.id)));
    setSelected(new Set());
    router.refresh();
  }

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
    return <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:text-slate-400 dark:ring-white/10">No active hires.</p>;
  }

  return (
    <div className="space-y-3">
      <BulkActionBar count={selected.size} actions={GRID_BULK_ACTIONS} onApply={applyBulk} onDelete={deleteSelected} onClear={() => setSelected(new Set())} busy={bulkBusy} />
      <div className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
        <p className="text-sm text-brand-grey dark:text-slate-400">
          Click any cell to cycle <span className="font-semibold text-brand-lea dark:text-slate-100">to-do → done → N/A</span>. Tick a name to select; scroll sideways for more.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-brand-lea/10 bg-white px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:border-white/10 dark:bg-[#10243a] dark:text-slate-400">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all hires" className="h-3.5 w-3.5" />
                  Task
                </label>
              </th>
              {hires.map((h) => {
                const pct = h.applicableCount > 0 ? Math.round((h.doneCount / h.applicableCount) * 100) : 0;
                return (
                  <th key={h.id} className={clsx("sticky top-0 z-10 border-b border-brand-lea/10 px-3 py-2 align-bottom dark:border-white/10", selected.has(h.id) ? "bg-brand-eden/10 dark:bg-white/10" : "bg-white dark:bg-[#10243a]")} style={{ minWidth: 132 }}>
                    <div className="flex justify-center">
                      <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleOne(h.id)} aria-label={`Select ${h.name}`} className="h-3.5 w-3.5" />
                    </div>
                    <Link href={`/people/${h.id}`} className="mt-1 block text-center font-medium text-brand-lea hover:underline transition hover:shadow-glow dark:text-slate-100">
                      {h.name}
                    </Link>
                    <div className="mx-auto mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-brand-cloudDancer dark:bg-white/5">
                      <span className={clsx("block h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-brand-gold")} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-1 text-center text-[10px] text-brand-grey dark:text-slate-400">{h.doneCount}/{h.applicableCount} done</div>
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
                <td className="sticky left-0 z-20 border-b border-r border-brand-lea/10 bg-white px-3 py-1.5 text-right text-brand-grey dark:border-white/10 dark:bg-[#10243a] dark:text-slate-400">{label}</td>
                {hires.map((h) => (
                  <td key={h.id} className="border-b border-brand-lea/5 px-3 py-1.5 text-center text-brand-grey dark:border-white/10 dark:text-slate-400">{get(h)}</td>
                ))}
              </tr>
            ))}

            {/* task groups */}
            {ONBOARDING_GROUPS.map((g) => {
              const groupTasks = ONBOARDING_TASKS.filter((t) => t.group === g.key);
              return (
                <Fragment key={g.key}>
                  <tr>
                    <td className="sticky left-0 z-20 border-b border-r border-brand-lea/10 bg-brand-cloudDancer/60 px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-brand-gold dark:border-white/10 dark:bg-white/5">
                      {groupLabel(g.key)}
                    </td>
                    {hires.map((h) => (
                      <td key={h.id} className="border-b border-brand-lea/5 bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5" />
                    ))}
                  </tr>
                  {groupTasks.map((def) => (
                    <tr key={def.key}>
                      <td className="sticky left-0 z-20 border-b border-r border-brand-lea/10 bg-white px-3 py-1.5 text-right text-brand-black dark:border-white/10 dark:bg-[#10243a] dark:text-slate-100">{def.label}</td>
                      {hires.map((h) => {
                        const task = h.tasks.find((t) => t.key === def.key);
                        if (!task) return <td key={h.id} className="border-b border-brand-lea/5 text-center text-brand-grey/50 dark:border-white/10">–</td>;
                        return (
                          <td key={h.id} className="border-b border-brand-lea/5 text-center dark:border-white/10">
                            <button
                              type="button"
                              onClick={() => cycle(h.id, task.id, task.status)}
                              className="inline-flex h-8 w-full items-center justify-center transition hover:bg-brand-cloudDancer/50 hover:shadow-glow dark:bg-white/5"
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
    </div>
  );
}
