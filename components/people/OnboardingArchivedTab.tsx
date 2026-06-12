"use client";

import Link from "next/link";
import type { NewHireRow } from "@/lib/data/onboarding";

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "—";
}

export function OnboardingArchivedTab({ rows }: { rows: NewHireRow[] }) {
  if (rows.length === 0) {
    return <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10">Nothing archived.</p>;
  }
  return (
    <div className="overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey">
            <th className="px-4 py-3 text-left">Name</th>
            <th className="px-4 py-3 text-left">Position</th>
            <th className="px-4 py-3 text-left">Department</th>
            <th className="px-4 py-3 text-left">Start date</th>
            <th className="px-4 py-3 text-left">State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-brand-lea/5 hover:bg-brand-cloudDancer/30">
              <td className="px-4 py-3">
                <Link href={`/people/${r.id}`} className="font-semibold text-brand-lea hover:underline">{r.name}</Link>
              </td>
              <td className="px-4 py-3 text-brand-grey">{r.position ?? "—"}</td>
              <td className="px-4 py-3 text-brand-grey">{r.department ?? "—"}</td>
              <td className="px-4 py-3 text-brand-grey">{fmtDate(r.startDate)}</td>
              <td className="px-4 py-3">
                <span className="rounded-full bg-brand-cloudDancer px-2.5 py-0.5 text-xs font-semibold text-brand-grey">
                  {r.canceled ? "Canceled" : "Archived"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
