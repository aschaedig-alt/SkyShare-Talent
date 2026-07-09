"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Search, Users, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { EmployeeRow, EmployeeCounts } from "@/lib/data/employees";
import { Badge, EmptyState } from "@/components/ui";
import type { BadgeTone } from "@/components/ui/Badge";

type Filter = "all" | "current" | "past";

const FILTER_KEY = "skyshare-employees-filter";
const isFilter = (v: unknown): v is Filter => v === "all" || v === "current" || v === "past";

type SortKey = "name" | "position" | "department" | "location" | "startDate" | "tenureDays" | "roleCount" | "status";
type SortState = { key: SortKey; dir: "asc" | "desc" };
const SORT_KEY = "skyshare-employees-sort";
const SORT_KEYS: SortKey[] = ["name", "position", "department", "location", "startDate", "tenureDays", "roleCount", "status"];

// ACTIVE (current) sorts ahead of CONTRACT, then TERMINATED (past).
function statusRank(e: EmployeeRow): number {
  return e.employmentStatus === "ACTIVE" ? 0 : e.employmentStatus === "CONTRACT" ? 1 : 2;
}

function compareBy(a: EmployeeRow, b: EmployeeRow, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name);
    case "position":
      return (a.position ?? "").localeCompare(b.position ?? "");
    case "department":
      return (a.department ?? "").localeCompare(b.department ?? "");
    case "location":
      return (a.location ?? "").localeCompare(b.location ?? "");
    case "startDate":
      return (a.startDate ?? "").localeCompare(b.startDate ?? ""); // ISO strings sort chronologically
    case "tenureDays":
      return (a.tenureDays ?? 0) - (b.tenureDays ?? 0);
    case "roleCount":
      return a.roleCount - b.roleCount;
    case "status":
      return statusRank(a) - statusRank(b);
  }
}

// Current employees are ACTIVE; CONTRACT reads as its own amber "Contract" pill;
// everyone else (TERMINATED) is a neutral "Past".
function statusBadge(e: EmployeeRow): { tone: BadgeTone; label: string } {
  if (e.employmentStatus === "CONTRACT") return { tone: "warning", label: "Contract" };
  return e.current ? { tone: "success", label: "Current" } : { tone: "neutral", label: "Past" };
}

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "—";
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
  // null = the default order from the server (current first, then most recent).
  const [sort, setSort] = useState<SortState | null>(null);

  // Remember the Current/Past/All choice and the column sort across reloads.
  useEffect(() => {
    const savedFilter = window.localStorage.getItem(FILTER_KEY);
    if (isFilter(savedFilter)) setFilter(savedFilter);
    try {
      const raw = window.localStorage.getItem(SORT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SortState>;
        if (SORT_KEYS.includes(parsed.key as SortKey) && (parsed.dir === "asc" || parsed.dir === "desc")) {
          setSort({ key: parsed.key as SortKey, dir: parsed.dir });
        }
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem(FILTER_KEY, filter);
  }, [filter]);
  useEffect(() => {
    if (sort) window.localStorage.setItem(SORT_KEY, JSON.stringify(sort));
    else window.localStorage.removeItem(SORT_KEY);
  }, [sort]);

  // Click a header to cycle: ascending → descending → back to default order.
  function toggleSort(key: SortKey) {
    setSort((cur) => (cur?.key === key ? (cur.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = employees.filter((e) => {
      if (filter === "current" && !e.current) return false;
      if (filter === "past" && e.current) return false;
      if (!needle) return true;
      return [e.name, e.legalName, e.position, e.department, e.location].filter(Boolean).some((v) => v!.toLowerCase().includes(needle));
    });
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => factor * compareBy(a, b, sort.key) || a.name.localeCompare(b.name));
  }, [employees, q, filter, sort]);

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
              placeholder="Search name, role, department, location"
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
                  {(() => { const b = statusBadge(e); return <Badge tone={b.tone}>{b.label}</Badge>; })()}
                </div>
                <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{[e.position, e.department, e.location].filter(Boolean).join(" · ") || "—"}</div>
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
                    <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Current role" sortKey="position" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Department" sortKey="department" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Location" sortKey="location" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Started" sortKey="startDate" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Tenure" sortKey="tenureDays" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Roles" sortKey="roleCount" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
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
                      <td className="px-4 py-2.5 text-brand-grey dark:text-slate-400">{e.location ?? "—"}</td>
                      <td className="px-4 py-2.5 text-brand-grey dark:text-slate-400">{fmtDate(e.startDate)}</td>
                      <td className="px-4 py-2.5 text-brand-grey dark:text-slate-400">{tenure(e.tenureDays)}</td>
                      <td className="px-4 py-2.5 text-brand-grey dark:text-slate-400">{e.roleCount || "—"}{e.stintCount > 1 ? ` · ${e.stintCount} stints` : ""}</td>
                      <td className="px-4 py-2.5">{(() => { const b = statusBadge(e); return <Badge tone={b.tone}>{b.label}</Badge>; })()}</td>
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

function SortableTh({
  label,
  sortKey,
  sort,
  onSort
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState | null;
  onSort: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th className="px-4 py-3 text-left" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 font-bold uppercase tracking-[0.14em] transition hover:text-brand-lea dark:hover:text-slate-200"
      >
        {label}
        {active ? (
          sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );
}
