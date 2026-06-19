"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import type { NewHireRow } from "@/lib/data/onboarding";

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
    <div className="overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:border-white/10 dark:text-slate-400">
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
              <tr key={r.id} className="border-b border-brand-lea/5 hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:bg-white/5">
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
  );
}
