"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { clsx } from "clsx";
import { CircleCheck, Archive, CalendarClock, Building2, Trash2, Settings2 } from "lucide-react";
import type { GridHire, GridTaskStatus, HireStatus } from "@/lib/data/onboarding";
import type { GridChecklistGroup } from "@/lib/data/onboarding-grid-config";
import { CUSTOM_GROUP as CUSTOM_GROUP_KEY } from "@/lib/onboarding/tasks";
import { BulkActionBar, bulkUpdateHires, bulkDeleteHires, type BulkAction, type BulkPatch } from "@/components/people/BulkActionBar";
import { EmptyState } from "@/components/ui";

const GRID_BULK_ACTIONS: BulkAction[] = [
  { kind: "patch", key: "onboard", label: "Mark onboarded", icon: CircleCheck, patch: { stage: "POST_ONBOARD" }, tone: "primary" },
  { kind: "patch", key: "archive", label: "Archive", icon: Archive, patch: { stage: "ARCHIVED" }, confirm: true, tone: "danger" },
  { kind: "date", key: "orientation", label: "Set orientation date", icon: CalendarClock },
  { kind: "text", key: "dept", label: "Set department", icon: Building2, placeholder: "Department" },
  { kind: "delete", key: "delete", label: "Delete", icon: Trash2 }
];

const NEXT: Record<GridTaskStatus, GridTaskStatus> = { TODO: "DONE", DONE: "NA", NA: "TODO" };

const STATUS_STYLE: Record<HireStatus, string> = {
  Ready: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  "In progress": "bg-brand-gold/15 text-brand-lea dark:text-slate-100",
  "Due soon": "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  Overdue: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  Onboarded: "bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  Archived: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400",
  Canceled: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
};

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "—";
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

/**
 * Vertical rule between people. Every column IS one person's checklist, and
 * without a line down each side they run together — the grid reads as one wall
 * of ticks rather than a column per hire, which is exactly the complaint the
 * spreadsheet this replaced did not have.
 *
 * Applied to every cell in the column (header, facts, group bands, task rows) so
 * the line runs unbroken top to bottom. Kept faint on purpose: the point is to
 * separate columns, not to draw a cage around every tick.
 */
const COLUMN_RULE = "border-r border-brand-lea/10 dark:border-white/10";

export function OnboardingGridTab({ hires: initial, checklist }: { hires: GridHire[]; checklist: GridChecklistGroup[] }) {
  const router = useRouter();
  const [hires, setHires] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Manage-tasks mode: rename / hide built-ins, add / rename / remove customs.
  const [managing, setManaging] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Draft names for the GROUP headings, same pattern as the per-task drafts.
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({});
  const [newTask, setNewTask] = useState("");
  const [mBusy, setMBusy] = useState(false);
  const [mErr, setMErr] = useState<string | null>(null);

  useEffect(() => {
    setHires(initial);
  }, [initial]);
  useEffect(() => {
    setDrafts(Object.fromEntries(checklist.flatMap((g) => g.tasks.map((t) => [t.key, t.label]))));
    setGroupDrafts(Object.fromEntries(checklist.map((g) => [g.key, g.label])));
  }, [checklist]);

  const allSelected = hires.length > 0 && selected.size === hires.length;
  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
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

  // --- task management ---
  async function manageCall(url: string, method: string, body?: unknown) {
    setMBusy(true);
    setMErr(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(p?.message ?? "Something went wrong.");
      }
      router.refresh();
    } catch (err) {
      setMErr(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setMBusy(false);
    }
  }
  const renameTask = (t: { key: string; custom: boolean }) =>
    t.custom
      ? manageCall("/api/onboarding-milestones", "PATCH", { key: t.key, label: drafts[t.key] })
      : manageCall("/api/onboarding-grid", "PATCH", { key: t.key, label: drafts[t.key] });
  // Renames only the heading. Tasks stay filed against the same group key, so
  // nothing that looks a task up by key is affected.
  const renameGroupHeading = (groupKey: string) =>
    manageCall("/api/onboarding-grid", "PATCH", { groupKey, label: groupDrafts[groupKey] });
  const hideTask = (key: string, hidden: boolean) => manageCall("/api/onboarding-grid", "PATCH", { key, hidden });
  const removeCustom = (key: string) => manageCall(`/api/onboarding-milestones?key=${encodeURIComponent(key)}`, "DELETE");
  const addTask = async () => {
    if (!newTask.trim()) {
      setMErr("Enter a task name.");
      return;
    }
    await manageCall("/api/onboarding-milestones", "POST", { label: newTask });
    setNewTask("");
  };

  if (hires.length === 0 && !managing) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button onClick={() => setManaging(true)} className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition-shadow hover:shadow-glow dark:border-white/10 dark:text-slate-100">
            <Settings2 className="h-4 w-4" /> Manage tasks
          </button>
        </div>
        <EmptyState title="No active hires." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <BulkActionBar count={selected.size} actions={GRID_BULK_ACTIONS} onApply={applyBulk} onDelete={deleteSelected} onClear={() => setSelected(new Set())} busy={bulkBusy} />

      <div className="flex items-center justify-end">
        <button
          onClick={() => setManaging((m) => !m)}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-semibold transition hover:shadow-glow",
            managing ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-lea hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
          )}
        >
          <Settings2 className="h-4 w-4" /> {managing ? "Done managing" : "Manage tasks"}
        </button>
      </div>

      {managing && (
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Manage checklist tasks</h2>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
            Rename any task (applies to the grid and every hire&apos;s checklist), hide a built-in you don&apos;t use, or add your own. Added tasks appear in a Custom group and don&apos;t count toward the completion percentage.
          </p>
          {mErr ? <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{mErr}</p> : null}
          <div className="mt-3 space-y-4">
            {checklist.map((g) => (
              <div key={g.key}>
                {/* The group heading is editable too. Only the display name changes —
                    tasks stay filed against the same underlying group, so nothing
                    that looks a task up by key is affected by a rename. */}
                {g.key === CUSTOM_GROUP_KEY ? (
                  <p className="text-[10px] font-bold uppercase tracking-wide text-brand-gold">{g.label}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      value={groupDrafts[g.key] ?? g.label}
                      onChange={(e) => setGroupDrafts({ ...groupDrafts, [g.key]: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && (groupDrafts[g.key] ?? g.label) !== g.label && renameGroupHeading(g.key)}
                      aria-label={`Rename the ${g.label} group`}
                      className="min-w-0 flex-1 rounded border border-brand-lea/15 bg-transparent px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-gold dark:border-white/10"
                    />
                    {(groupDrafts[g.key] ?? g.label) !== g.label && (
                      <button
                        onClick={() => renameGroupHeading(g.key)}
                        disabled={mBusy}
                        className="rounded bg-brand-lea px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50 dark:bg-brand-sweet dark:text-brand-lea"
                      >
                        Save name
                      </button>
                    )}
                  </div>
                )}
                <div className="mt-1.5 space-y-1.5">
                  {g.tasks.map((t) => {
                    const dirty = (drafts[t.key] ?? t.label) !== t.label;
                    return (
                      <div key={t.key} className={clsx("flex flex-wrap items-center gap-2", t.hidden && "opacity-60")}>
                        <input
                          value={drafts[t.key] ?? t.label}
                          onChange={(e) => setDrafts({ ...drafts, [t.key]: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && dirty && renameTask(t)}
                          className="min-w-0 flex-1 rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                        />
                        {t.custom ? (
                          <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">custom</span>
                        ) : t.hidden ? (
                          <span className="rounded bg-brand-cloudDancer px-2 py-0.5 text-[10px] font-semibold text-brand-grey dark:bg-white/10 dark:text-slate-300">hidden</span>
                        ) : null}
                        <button onClick={() => renameTask(t)} disabled={mBusy || !dirty} className="rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-40">
                          Save
                        </button>
                        {t.custom ? (
                          <button onClick={() => removeCustom(t.key)} disabled={mBusy} className="rounded border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10">
                            Remove
                          </button>
                        ) : (
                          <button onClick={() => hideTask(t.key, !t.hidden)} disabled={mBusy} className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-200">
                            {t.hidden ? "Show" : "Hide"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              placeholder="New task name"
              className="flex-1 rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button onClick={addTask} disabled={mBusy} className="rounded bg-brand-lea px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
              + Add task
            </button>
          </div>
        </section>
      )}

      {hires.length === 0 ? (
        <EmptyState title="No active hires." />
      ) : (
      <div className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
        <p className="text-sm text-brand-grey dark:text-slate-400">
          Click any cell to cycle <span className="font-semibold text-brand-lea dark:text-slate-100">to-do → done → N/A</span>. Tick a name to select; scroll sideways for more.
        </p>
      </div>
      {/* A bounded box rather than letting the table run the length of the page.
          Three things follow from it, and the markup was already written for all
          three but never got the container that makes them work:

          1. The horizontal scrollbar sits at the bottom of THIS box, which is on
             screen — so scrolling sideways no longer means scrolling to the
             bottom of the page first to reach the bar.
          2. The header row's sticky top-0 finally does something: names and
             progress stay put while you scroll down the tasks.
          3. The task-name column stays pinned as you scroll across, which it
             already did.

          max-h only caps: a short list still renders at its natural height. */}
      <div className="max-h-[75vh] overflow-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              {/* The corner cell pins in BOTH directions, above the header row and
                  the task column, so it never slides out from under either. */}
              <th className="sticky left-0 top-0 z-30 border-b border-r border-brand-lea/10 bg-white px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all hires" className="h-3.5 w-3.5" />
                  Task
                </label>
              </th>
              {hires.map((h) => {
                const pct = h.applicableCount > 0 ? Math.round((h.doneCount / h.applicableCount) * 100) : 0;
                return (
                  <th key={h.id} className={clsx("sticky top-0 z-20 border-b px-3 py-2 align-bottom", COLUMN_RULE, selected.has(h.id) ? "bg-brand-eden/10 dark:bg-white/10" : "bg-white dark:bg-brand-panel")} style={{ minWidth: 132 }}>
                    <div className="flex justify-center">
                      <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleOne(h.id)} aria-label={`Select ${h.name}`} className="h-3.5 w-3.5" />
                    </div>
                    <Link href={`/people/${h.id}`} className="mt-1 block text-center font-medium text-brand-lea hover:underline dark:text-slate-100">
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
              ["Offer sent", (h: GridHire) => fmtDate(h.offerSentDate)],
              ["Offer signed", (h: GridHire) => fmtDate(h.offerSignedDate)],
              ["Start date", (h: GridHire) => fmtDate(h.startDate)],
              ["Orientation", (h: GridHire) => fmtDate(h.orientationDate)],
              ["Phone", (h: GridHire) => h.phone ?? "—"],
              ["SkyShare email", (h: GridHire) => h.ssEmail ?? "—"],
              ["Personal email", (h: GridHire) => h.personalEmail ?? "—"],
              ["Position", (h: GridHire) => h.position ?? "—"],
              ["Department", (h: GridHire) => h.department ?? "—"]
            ] as Array<[string, (h: GridHire) => string]>).map(([label, get]) => (
              <tr key={label} className="row-wash dark:hover:bg-white/5">
                <td className="row-wash-sticky sticky left-0 z-10 border-b border-r border-brand-lea/10 bg-white px-3 py-1.5 text-right text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400">{label}</td>
                {hires.map((h) => (
                  <td key={h.id} className={clsx("border-b border-brand-lea/5 px-3 py-1.5 text-center text-brand-grey break-words dark:border-white/10 dark:text-slate-400", COLUMN_RULE)}>{get(h)}</td>
                ))}
              </tr>
            ))}

            {/* task groups (built-in + custom), hidden tasks dropped */}
            {checklist.map((g) => {
              const groupTasks = g.tasks.filter((t) => !t.hidden);
              if (groupTasks.length === 0) return null;
              return (
                <Fragment key={g.key}>
                  <tr>
                    <td className="sticky left-0 z-10 border-b border-r border-brand-lea/10 bg-brand-cloudDancer/60 px-3 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide text-brand-gold dark:border-white/10 dark:bg-white/5">
                      {g.label}
                    </td>
                    {hires.map((h) => (
                      <td key={h.id} className={clsx("border-b border-brand-lea/5 bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5", COLUMN_RULE)} />
                    ))}
                  </tr>
                  {groupTasks.map((def) => (
                    <tr key={def.key} className="row-wash dark:hover:bg-white/5">
                      <td className="row-wash-sticky sticky left-0 z-10 border-b border-r border-brand-lea/10 bg-white px-3 py-1.5 text-right text-brand-black dark:border-white/10 dark:bg-brand-panel dark:text-slate-100">{def.label}</td>
                      {hires.map((h) => {
                        const task = h.tasks.find((t) => t.key === def.key);
                        if (!task) return <td key={h.id} className={clsx("border-b border-brand-lea/5 text-center text-brand-grey/50 dark:border-white/10", COLUMN_RULE)}>–</td>;
                        return (
                          <td key={h.id} className={clsx("border-b border-brand-lea/5 text-center dark:border-white/10", COLUMN_RULE)}>
                            <button
                              type="button"
                              onClick={() => cycle(h.id, task.id, task.status)}
                              className="inline-flex h-8 w-full items-center justify-center transition-colors hover:bg-brand-gold/10 dark:hover:bg-white/5"
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
      )}
    </div>
  );
}
