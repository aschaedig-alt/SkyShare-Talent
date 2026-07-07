"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { RotateCcw, Building2, CalendarClock, Trash2 } from "lucide-react";
import type { NewHireRow } from "@/lib/data/onboarding";
import { BulkActionBar, bulkUpdateHires, bulkDeleteHires, type BulkAction, type BulkPatch } from "@/components/people/BulkActionBar";
import { Button, Badge, EmptyState, type BadgeTone } from "@/components/ui";

const ARCHIVED_BULK_ACTIONS: BulkAction[] = [
  { kind: "patch", key: "restore", label: "Restore to active", icon: RotateCcw, patch: { stage: "ACTIVE" }, tone: "primary" },
  { kind: "date", key: "orientation", label: "Set orientation date", icon: CalendarClock },
  { kind: "text", key: "dept", label: "Set department", icon: Building2, placeholder: "Department" },
  { kind: "delete", key: "delete", label: "Delete", icon: Trash2 }
];

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "—";
}

function stateOf(r: NewHireRow): { label: string; tone: BadgeTone } {
  if (r.employmentStatus === "TERMINATED") return { label: "Terminated", tone: "danger" };
  if (r.canceled) return { label: "Canceled", tone: "neutral" };
  return { label: "Archived", tone: "neutral" };
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
      if (n.has(id)) n.delete(id);
      else n.add(id);
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
    setSelected(new Set());
    router.refresh();
  }

  async function restore(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/new-hires/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "ACTIVE" })
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return <EmptyState title="Nothing archived." />;
  }
  return (
    <div className="space-y-3">
      <BulkActionBar count={selected.size} actions={ARCHIVED_BULK_ACTIONS} onApply={applyBulk} onDelete={deleteSelected} onClear={() => setSelected(new Set())} busy={bulkBusy} />

      {/* Mobile: stacked cards (the table below is desktop-only) */}
      <div className="space-y-2 sm:hidden">
        {rows.map((r) => {
          const state = stateOf(r);
          return (
            <div key={r.id} className={clsx("rounded bg-white p-3 shadow-panel ring-1 dark:bg-brand-panel", selected.has(r.id) ? "ring-brand-eden/40" : "ring-brand-lea/10 dark:ring-white/10")}>
              <div className="flex items-start justify-between gap-2">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} aria-label={`Select ${r.name}`} className="mt-0.5 h-4 w-4" />
                  <Link href={`/people/${r.id}`} className="font-semibold text-brand-lea hover:underline dark:text-slate-100">{r.name}</Link>
                </label>
                <Badge tone={state.tone}>{state.label}</Badge>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-brand-grey dark:text-slate-400">
                <div><dt className="inline font-semibold">Position:</dt> {r.position ?? "—"}</div>
                <div><dt className="inline font-semibold">Dept:</dt> {r.department ?? "—"}</div>
                <div><dt className="inline font-semibold">Start:</dt> {fmtDate(r.startDate)}</div>
                <div><dt className="inline font-semibold">Terminated:</dt> {fmtDate(r.terminationDate)}</div>
              </dl>
              <div className="mt-2">
                <Button variant="secondary" size="sm" onClick={() => restore(r.id)} disabled={busy === r.id}>
                  {busy === r.id ? "..." : "Restore to active"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 sm:block dark:bg-brand-panel dark:ring-white/10">
      <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:border-white/10 dark:text-slate-400">
            <th className="w-10 px-3 py-3 text-center"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 align-middle" /></th>
            <th className="px-4 py-3 text-left">Name</th>
            <th className="px-4 py-3 text-left">Position</th>
            <th className="px-4 py-3 text-left">Department</th>
            <th className="px-4 py-3 text-left">Start date</th>
            <th className="px-4 py-3 text-left">Termination date</th>
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
                <td className="px-4 py-3 text-brand-grey dark:text-slate-400">{fmtDate(r.terminationDate)}</td>
                <td className="px-4 py-3">
                  <Badge tone={state.tone}>{state.label}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="secondary" size="sm" onClick={() => restore(r.id)} disabled={busy === r.id}>
                    {busy === r.id ? "..." : "Restore to active"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      </div>
    </div>
  );
}
