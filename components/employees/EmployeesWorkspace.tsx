"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Search, Users } from "lucide-react";
import type { EmployeeRow, EmployeeCounts } from "@/lib/data/employees";
import { Badge, EmptyState } from "@/components/ui";

type Filter = "all" | "current" | "past";

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(new Date(iso)) : "—";
}

function tenure(days: number | null) {
  if (days === null) return "—";
  if (days < 31) return `${days}d`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} mo`;
  const yr = Math.floor(months / 12);
  const mo = months % 12;
  return mo ? `${yr} yr ${mo} mo` : `${yr} yr`;
}

export function EmployeesWorkspace({ employees, counts }: { employees: EmployeeRow[]; counts: EmployeeCounts }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return employees.filter((e) => {
      if (filter === "current" && !e.current) return false;
      if (filter === "past" && e.current) return false;
      if (!needle) return true;
      return [e.name, e.position, e.department].filter(Boolean).some((v) => v!.toLowerCase().includes(needle));
    });
  }, [employees, q, filter]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.total },
    { key: "current", label: "Current", count: counts.current },
    { key: "past", label: "Past", count: counts.past }
  ];

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">People</p>
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Employees</h1>
        <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
          Everyone who is or was part of SkyShare — their dates, roles, and journey. Open a person to see their full role timeline.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={clsx(
                "rounded px-3 py-1.5 text-sm font-semibold transition hover:shadow-glow",
                filter === t.key ? "bg-brand-lea text-white" : "border border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
              )}
            >
              {t.label} <span className="opacity-70">· {t.count}</span>
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, role, department"
              className="w-64 rounded border border-brand-lea/20 py-2 pl-8 pr-3 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            />
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No employees match" description="Try a different search or filter." />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {rows.map((e) => (
              <Link key={e.id} href={`/people/${e.id}`} className="block rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 transition hover:shadow-glow dark:bg-brand-panel dark:ring-white/10">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-brand-lea dark:text-slate-100">{e.name}</span>
                  <Badge tone={e.current ? "success" : "neutral"}>{e.current ? "Current" : "Past"}</Badge>
                </div>
                <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{[e.position, e.department].filter(Boolean).join(" · ") || "—"}</div>
                <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
                  {fmtDate(e.startDate)} – {e.current ? "Present" : fmtDate(e.endDate)} · {tenure(e.tenureDays)}
                  {e.roleCount > 1 ? ` · ${e.roleCount} roles` : ""}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 sm:block dark:bg-brand-panel dark:ring-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:border-white/10 dark:text-slate-400">
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Current role</th>
                    <th className="px-4 py-3 text-left">Department</th>
                    <th className="px-4 py-3 text-left">Started</th>
                    <th className="px-4 py-3 text-left">Tenure</th>
                    <th className="px-4 py-3 text-left">Roles</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="border-b border-brand-lea/5 hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:bg-white/5">
                      <td className="px-4 py-2.5">
                        <Link href={`/people/${e.id}`} className="font-semibold text-brand-lea hover:underline transition hover:shadow-glow dark:text-slate-100">{e.name}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-brand-grey dark:text-slate-400">{e.position ?? "—"}</td>
                      <td className="px-4 py-2.5 text-brand-grey dark:text-slate-400">{e.department ?? "—"}</td>
                      <td className="px-4 py-2.5 text-brand-grey dark:text-slate-400">{fmtDate(e.startDate)}</td>
                      <td className="px-4 py-2.5 text-brand-grey dark:text-slate-400">{tenure(e.tenureDays)}</td>
                      <td className="px-4 py-2.5 text-brand-grey dark:text-slate-400">{e.roleCount || "—"}{e.stintCount > 1 ? ` · ${e.stintCount} stints` : ""}</td>
                      <td className="px-4 py-2.5"><Badge tone={e.current ? "success" : "neutral"}>{e.current ? "Current" : "Past"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
