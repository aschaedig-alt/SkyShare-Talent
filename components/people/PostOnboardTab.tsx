"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { Archive, CalendarClock, Building2, Trash2, ListChecks } from "lucide-react";
import type { Checkin, EmploymentStatus, GridTaskStatus, PostOnboardHire } from "@/lib/data/onboarding";
import { MAINTENANCE_TASKS } from "@/lib/onboarding/tasks";
import { BulkActionBar, bulkUpdateHires, bulkDeleteHires, type BulkAction, type BulkPatch } from "@/components/people/BulkActionBar";
import { EmptyState } from "@/components/ui";
import { formatCalendarDayShort, formatMomentDateShort } from "@/lib/dates/display";

// startDate is a chosen calendar day (UTC); onboardedAt is the moment they were
// marked onboarded, so it reads in Mountain. See lib/dates/display.ts.
function fmtDate(iso: string | null) {
  return formatCalendarDayShort(iso) || "—";
}
function fmtMoment(iso: string | null) {
  return formatMomentDateShort(iso) || "—";
}

const POST_ONBOARD_BULK_ACTIONS: BulkAction[] = [
  { kind: "choice", key: "checkin", label: "Mark check-in done", icon: ListChecks, options: MAINTENANCE_TASKS.map((t) => ({ value: t.key, label: t.label })) },
  { kind: "patch", key: "archive", label: "Archive", icon: Archive, patch: { stage: "ARCHIVED" }, confirm: true, tone: "danger" },
  { kind: "date", key: "orientation", label: "Set orientation date", icon: CalendarClock },
  { kind: "text", key: "dept", label: "Set department", icon: Building2, placeholder: "Department" },
  { kind: "delete", key: "delete", label: "Delete", icon: Trash2 }
];

export function PostOnboardTab({ hires: initial }: { hires: PostOnboardHire[] }) {
  const router = useRouter();
  const [hires, setHires] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    const res = await bulkUpdateHires(ids, patch);
    setBusy(false);
    if (!res.ok) return;
    if (patch.stage) setHires((cur) => cur.filter((h) => !selected.has(h.id)));
    setSelected(new Set());
    router.refresh();
  }
  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    const res = await bulkDeleteHires(ids);
    setBusy(false);
    if (!res.ok) {
      window.alert(res.message ?? "Could not delete.");
      return;
    }
    setHires((cur) => cur.filter((h) => !selected.has(h.id)));
    setSelected(new Set());
    router.refresh();
  }

  async function bulkCheckin(_actionKey: string, key: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding-tasks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hireIds: ids, key, status: "DONE" })
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; archivedIds?: string[]; message?: string };
      if (!res.ok || !data.ok) {
        window.alert(data.message ?? "Could not update check-ins.");
        return;
      }
      const archived = new Set(data.archivedIds ?? []);
      setHires((cur) =>
        cur
          .filter((h) => !archived.has(h.id))
          .map((h) =>
            selected.has(h.id)
              ? { ...h, checkins: h.checkins.map((c) => (c.key === key ? { ...c, status: "DONE" as GridTaskStatus, dueSoon: false } : c)) }
              : h
          )
      );
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setEmployment(hireId: string, status: EmploymentStatus) {
    const prev = hires;
    // Terminating moves the employee to Archived, so drop them from this list.
    setHires((cur) => (status === "TERMINATED" ? cur.filter((h) => h.id !== hireId) : cur.map((h) => (h.id === hireId ? { ...h, employmentStatus: status } : h))));
    try {
      const res = await fetch(`/api/new-hires/${hireId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employmentStatus: status })
      });
      if (!res.ok) throw new Error();
      if (status === "TERMINATED") router.refresh();
    } catch {
      setHires(prev);
    }
  }

  async function toggle(hireId: string, c: Checkin) {
    if (!c.id) return;
    const next: GridTaskStatus = c.status === "DONE" ? "TODO" : "DONE";
    const prev = hires;
    setHires((cur) =>
      cur.map((h) =>
        h.id === hireId
          ? { ...h, checkins: h.checkins.map((x) => (x.id === c.id ? { ...x, status: next, dueSoon: next === "DONE" ? false : x.dueSoon } : x)) }
          : h
      )
    );
    try {
      const res = await fetch(`/api/onboarding-tasks/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      if (!res.ok) throw new Error();
      const data = (await res.json().catch(() => ({}))) as { archived?: boolean };
      // All check-ins done → the server moved them to Archived. Drop them here.
      if (data.archived) {
        setHires((cur) => cur.filter((h) => h.id !== hireId));
        router.refresh();
      }
    } catch {
      setHires(prev);
    }
  }

  if (hires.length === 0) {
    return <EmptyState title="No post-onboard employees yet." description="Mark an active hire as onboarded and they will appear here." />;
  }

  const heads = hires[0].checkins.map((c) => c.short);

  return (
    <div className="space-y-3">
      <BulkActionBar count={selected.size} actions={POST_ONBOARD_BULK_ACTIONS} onApply={applyBulk} onChoice={bulkCheckin} onDelete={deleteSelected} onClear={() => setSelected(new Set())} busy={busy} />
      <div className="overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:border-white/10 dark:text-slate-400">
              <th className="w-10 px-3 py-3 text-center"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 align-middle" /></th>
              <th className="px-4 py-3 text-left">Employee</th>
              <th className="px-4 py-3 text-left">Department</th>
              <th className="px-4 py-3 text-left">Started</th>
              <th className="px-4 py-3 text-left">Onboarded</th>
              <th className="px-4 py-3 text-left">Status</th>
              {heads.map((h) => (
                <th key={h} className="px-3 py-3 text-center">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hires.map((h) => {
              const terminated = h.employmentStatus === "TERMINATED";
              return (
              <tr key={h.id} className={clsx("row-wash border-b border-brand-lea/5 dark:border-white/10 dark:hover:bg-white/5", selected.has(h.id) ? "bg-brand-gold/10" : terminated && "bg-brand-cloudDancer/30 dark:bg-white/5")}>
                <td className="px-3 py-3 text-center">
                  <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleOne(h.id)} aria-label={`Select ${h.name}`} className="h-4 w-4 align-middle" />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/people/${h.id}`} className={clsx("font-semibold hover:underline", terminated ? "text-brand-grey dark:text-slate-400" : "text-brand-lea dark:text-slate-100")}>{h.name}</Link>
                  <div className="text-xs text-brand-grey dark:text-slate-400">{h.position ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-brand-grey dark:text-slate-400">{h.department ?? "—"}</td>
                <td className="px-4 py-3 text-brand-grey dark:text-slate-400">{fmtDate(h.startDate)}</td>
                <td className="px-4 py-3 text-brand-grey dark:text-slate-400">{fmtMoment(h.onboardedAt)}</td>
                <td className="px-4 py-3">
                  <select
                    value={h.employmentStatus}
                    onChange={(e) => setEmployment(h.id, e.target.value as EmploymentStatus)}
                    className={clsx(
                      "rounded border px-2 py-1 text-xs font-semibold outline-none transition",
                      terminated
                        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
                        : h.employmentStatus === "CONTRACT"
                          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                    )}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="TERMINATED">Terminated</option>
                  </select>
                </td>
                {h.checkins.map((c) => (
                  <td key={c.key} className="px-3 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => toggle(h.id, c)}
                      title={c.status === "DONE" ? "Done — click to undo" : c.dueSoon ? "Due — click when complete" : "Click when complete"}
                      className="inline-flex items-center justify-center rounded transition hover:bg-brand-gold/10"
                    >
                      {c.status === "DONE" ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                      ) : c.dueSoon ? (
                        <span className="inline-flex animate-pulse items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-2 ring-red-300 dark:ring-red-500/40">
                          due
                        </span>
                      ) : (
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-brand-grey/30" />
                      )}
                    </button>
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-brand-lea/10 px-4 py-3 text-xs text-brand-grey dark:border-white/10 dark:text-slate-400">
        Check-ins are 30 / 60 / 90-day + benefits for now — tell me the ones you actually run and I will swap them in.
      </p>
      </div>
    </div>
  );
}
