"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { RotateCcw, Building2, CalendarClock } from "lucide-react";
import type { NewHireRow } from "@/lib/data/onboarding";
import { BulkActionBar, bulkUpdateHires, type BulkAction, type BulkPatch } from "@/components/people/BulkActionBar";

const ARCHIVED_BULK_ACTIONS: BulkAction[] = [
  { kind: "patch", key: "restore", label: "Restore to active", icon: RotateCcw, patch: { stage: "ACTIVE" }, tone: "primary" },
  { kind: "date", key: "orientation", label: "Set orientation date", icon: CalendarClock },
  { kind: "text", key: "dept", label: "Set department", icon: Building2, placeholder: "Department" }
];

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "—";
}

function stateOf(r: NewHireRow): { label: string; cls: string } {
  if (r.employmentStatus === "TERMINATED") return { label: "Terminated", cls: "bg-red-50 text-red-700" };
  if (r.canceled) return { label: "Canceled", cls: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400" };
  return { label: "Archived", cls: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400" };
}

export function OnboardingArchivedTab({ rows }: { rows: NewHireRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  async function applyBulk(patch: BulkPatch) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkBusy(true);
    const res = await bulkUpdateHires(ids, patch);
    setBulkBusy(false);
    if (!res.ok) return;
    setSelected(new Set());
    router.refresh();
  }

  async function restore(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/new-hires/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employmentStatus: "ACTIVE" })
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:text-slate-400 dark:ring-white/10">Nothing archived.</p>;
  }
  return (
    <div className="space-y-3">
      <BulkActionBar count={selected.size} actions={ARCHIVED_BULK_ACTIONS} onApply={applyBulk} onClear={() => setSelected(new Set())} busy={bulkBusy} />
      <div className="overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:border-white/10 dark:text-slate-400">
            <th className="w-10 px-3 py-3 text-center"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 align-middle" /></th>
            <th className="px-4 py-3 text-left">Name</th>
            <th className="px-4 py-3 text-left">Position</th>
            <th className="px-4 py-3 text-left">Department</th>
            <th className="px-4 py-3 text-left">Start date</th>
            <th className="px-4 py-3 text-left">State</th>
            <th className="px-4 py-3 text-left"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const state = stateOf(r);
            return (
              <tr key={r.id} className={clsx("border-b border-brand-lea/5 hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:bg-white/5", selected.has(r.id) && "bg-brand-eden/10")}>
                <td className="px-3 py-3 text-center">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={`Select ${r.name}`} className="h-4 w-4 align-middle" />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/people/${r.id}`} className="font-semibold text-brand-lea hover:underline transition hover:shadow-glow dark:text-slate-100">{r.name}</Link>
                </td>
                <td className="px-4 py-3 text-brand-grey dark:text-slate-400">{r.position ?? "—"}</td>
                <td className="px-4 py-3 text-brand-grey dark:text-slate-400">{r.department ?? "—"}</td>
                <td className="px-4 py-3 text-brand-grey dark:text-slate-400">{fmtDate(r.startDate)}</td>
                <td className="px-4 py-3">
                  <span className={clsx("rounded px-2.5 py-0.5 text-xs font-semibold", state.cls)}>{state.label}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  {r.employmentStatus === "TERMINATED" ? (
                    <button
                      onClick={() => restore(r.id)}
                      disabled={busy === r.id}
                      className="rounded border border-brand-lea/20 px-3 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-50 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
                    >
                      {busy === r.id ? "..." : "Restore to post-onboard"}
                    </button>
                  ) : null}
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
