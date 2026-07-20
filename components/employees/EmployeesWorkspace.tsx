"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Search, Users, ChevronUp, ChevronDown, ChevronsUpDown, GitMerge, SlidersHorizontal, Columns3, X, Check } from "lucide-react";
import type { EmployeeRow, EmployeeCounts } from "@/lib/data/employees";
import { EMPLOYEE_COLUMN_KEYS, type EmployeeColumnKey } from "@/lib/employees/columns";
import { EmployeeTags, displayTags } from "@/components/employees/EmployeeTags";
import { Badge, Button, EmptyState, Modal } from "@/components/ui";
import type { BadgeTone } from "@/components/ui/Badge";
import { useDialogClose } from "@/lib/hooks/useDialogClose";

type Filter = "all" | "current" | "past";
const FILTER_KEY = "skyshare-employees-filter";
const isFilter = (v: unknown): v is Filter => v === "all" || v === "current" || v === "past";

type SortKey = "name" | "role" | "department" | "tags" | "location" | "aircraft" | "seat" | "pool" | "started" | "serviceDate" | "seniority" | "lastRoleChange" | "tenure" | "roles" | "status";
type SortState = { key: SortKey; dir: "asc" | "desc" };
const SORT_KEY = "skyshare-employees-sort";
const SORT_KEYS: SortKey[] = ["name", "role", "department", "tags", "location", "aircraft", "seat", "pool", "started", "serviceDate", "seniority", "lastRoleChange", "tenure", "roles", "status"];
const UNTAGGED = "__untagged__";

function statusRank(e: EmployeeRow): number {
  return e.employmentStatus === "ACTIVE" ? 0 : e.employmentStatus === "CONTRACT" ? 1 : 2;
}
function statusBadge(e: EmployeeRow): { tone: BadgeTone; label: string } {
  // Contract is no longer a status badge — it shows as a pill in the Tags column
  // (derived from employmentStatus). Status is simply Current vs Past, matching
  // the headcount tabs (Current = ACTIVE; everyone else is Past).
  return e.current ? { tone: "success", label: "Current" } : { tone: "neutral", label: "Past" };
}
const isPilot = (e: EmployeeRow) => Boolean(e.aircraft || e.seat);
function poolLabel(e: EmployeeRow): string {
  if (!isPilot(e)) return "—";
  return e.managed ? "Managed" : "Fractional";
}

function fmtDate(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "—";
}
function fmtDay(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "—";
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

// The full column catalog. Name is always shown (not here). sortKey omitted = not sortable.
const COLUMNS: Record<EmployeeColumnKey, { label: string; sortKey?: SortKey; cell: (e: EmployeeRow) => ReactNode }> = {
  role: { label: "Current role", sortKey: "role", cell: (e) => e.position ?? "—" },
  department: { label: "Department", sortKey: "department", cell: (e) => e.department ?? "—" },
  tags: { label: "Tags", sortKey: "tags", cell: (e) => <EmployeeTags tags={e.tags} employmentStatus={e.employmentStatus} /> },
  location: { label: "Location", sortKey: "location", cell: (e) => e.location ?? "—" },
  aircraft: { label: "Aircraft", sortKey: "aircraft", cell: (e) => e.aircraft ?? "—" },
  seat: { label: "Seat", sortKey: "seat", cell: (e) => e.seat ?? "—" },
  pool: { label: "Pool", sortKey: "pool", cell: (e) => poolLabel(e) },
  started: { label: "Started", sortKey: "started", cell: (e) => fmtDate(e.startDate) },
  serviceDate: { label: "Service date", sortKey: "serviceDate", cell: (e) => fmtDate(e.serviceDate) },
  seniority: { label: "Seniority", sortKey: "seniority", cell: (e) => fmtDate(e.seniorityDate) },
  lastRoleChange: { label: "Last role change", sortKey: "lastRoleChange", cell: (e) => fmtDate(e.lastRoleChange) },
  tenure: { label: "Tenure", sortKey: "tenure", cell: (e) => tenure(e.tenureDays) },
  roles: { label: "Roles", sortKey: "roles", cell: (e) => `${e.roleCount || "—"}${e.stintCount > 1 ? ` · ${e.stintCount} stints` : ""}` },
  status: { label: "Status", sortKey: "status", cell: (e) => { const b = statusBadge(e); return <Badge tone={b.tone}>{b.label}</Badge>; } },
  phone: { label: "Phone", cell: (e) => e.phone ?? "—" },
  workEmail: { label: "Work email", cell: (e) => e.workEmail ?? "—" },
  personalEmail: { label: "Personal email", cell: (e) => e.personalEmail ?? "—" },
  birthday: { label: "Birthday", cell: (e) => fmtDay(e.birthday) },
  birthCountry: { label: "Birth country", cell: (e) => e.birthCountry ?? "—" },
  citizenship: { label: "Citizenship", cell: (e) => e.citizenship ?? "—" }
};

function compareBy(a: EmployeeRow, b: EmployeeRow, key: SortKey): number {
  switch (key) {
    case "name": return a.name.localeCompare(b.name);
    case "role": return (a.position ?? "").localeCompare(b.position ?? "");
    case "department": return (a.department ?? "").localeCompare(b.department ?? "");
    case "tags": return displayTags(a.tags, a.employmentStatus).join(",").localeCompare(displayTags(b.tags, b.employmentStatus).join(","));
    case "location": return (a.location ?? "").localeCompare(b.location ?? "");
    case "aircraft": return (a.aircraft ?? "").localeCompare(b.aircraft ?? "");
    case "seat": return (a.seat ?? "").localeCompare(b.seat ?? "");
    case "pool": return poolLabel(a).localeCompare(poolLabel(b));
    case "started": return (a.startDate ?? "").localeCompare(b.startDate ?? "");
    case "serviceDate": return (a.serviceDate ?? "").localeCompare(b.serviceDate ?? "");
    case "seniority": return (a.seniorityDate ?? "").localeCompare(b.seniorityDate ?? "");
    case "lastRoleChange": return (a.lastRoleChange ?? "").localeCompare(b.lastRoleChange ?? "");
    case "tenure": return (a.tenureDays ?? 0) - (b.tenureDays ?? 0);
    case "roles": return a.roleCount - b.roleCount;
    case "status": return statusRank(a) - statusRank(b);
  }
}

type Filters = { pool: "all" | "fractional" | "managed"; aircraft: string; department: string; tag: string; location: string; after: string; before: string };
const EMPTY_FILTERS: Filters = { pool: "all", aircraft: "", department: "", tag: "", location: "", after: "", before: "" };
const distinct = (vals: (string | null)[]) => Array.from(new Set(vals.filter((v): v is string => Boolean(v)))).sort();

export function EmployeesWorkspace({ employees, counts, initialColumns }: { employees: EmployeeRow[]; counts: EmployeeCounts; initialColumns: EmployeeColumnKey[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortState | null>(null);

  const [visible, setVisible] = useState<EmployeeColumnKey[]>(initialColumns);
  const [colsOpen, setColsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeErr, setMergeErr] = useState<string | null>(null);
  const selectedRows = useMemo(() => employees.filter((e) => selected.has(e.id)), [employees, selected]);

  // Escape closes each open overlay. The merge dialog ignores Escape mid-merge,
  // matching its busy-guarded backdrop.
  useDialogClose(() => { if (!merging) setMergeOpen(false); }, mergeOpen);
  useDialogClose(() => setFiltersOpen(false), filtersOpen);
  useDialogClose(() => setColsOpen(false), colsOpen);

  useEffect(() => {
    const savedFilter = window.localStorage.getItem(FILTER_KEY);
    if (isFilter(savedFilter)) setFilter(savedFilter);
    try {
      const raw = window.localStorage.getItem(SORT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SortState>;
        if (SORT_KEYS.includes(parsed.key as SortKey) && (parsed.dir === "asc" || parsed.dir === "desc")) setSort({ key: parsed.key as SortKey, dir: parsed.dir });
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => { window.localStorage.setItem(FILTER_KEY, filter); }, [filter]);
  useEffect(() => {
    if (sort) window.localStorage.setItem(SORT_KEY, JSON.stringify(sort));
    else window.localStorage.removeItem(SORT_KEY);
  }, [sort]);

  function toggleSort(key: SortKey) {
    setSort((cur) => (cur?.key === key ? (cur.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
  }

  const orderedVisible = useMemo(() => EMPLOYEE_COLUMN_KEYS.filter((k) => visible.includes(k)), [visible]);
  const aircraftOptions = useMemo(() => distinct(employees.map((e) => e.aircraft)), [employees]);
  const deptOptions = useMemo(() => distinct(employees.map((e) => e.department)), [employees]);
  const tagOptions = useMemo(() => distinct(employees.flatMap((e) => displayTags(e.tags, e.employmentStatus))), [employees]);
  const locOptions = useMemo(() => distinct(employees.map((e) => e.location)), [employees]);
  const activeFilterCount = (filters.pool !== "all" ? 1 : 0) + (filters.aircraft ? 1 : 0) + (filters.department ? 1 : 0) + (filters.tag ? 1 : 0) + (filters.location ? 1 : 0) + (filters.after ? 1 : 0) + (filters.before ? 1 : 0);

  async function saveColumns(next: EmployeeColumnKey[]) {
    const prev = visible;
    setVisible(next);
    try {
      const res = await fetch("/api/workspace-settings/employee-columns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ columns: next }) });
      if (!res.ok) setVisible(prev);
    } catch {
      setVisible(prev);
    }
  }
  const toggleColumn = (key: EmployeeColumnKey) => saveColumns(visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key]);
  const toggleSelect = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function openMerge() {
    if (selectedRows.length !== 2) return;
    const rank = (x: EmployeeRow) => (x.current ? 1000 : 0) + x.roleCount * 10 + (x.tenureDays ?? 0) / 1000;
    const [a, b] = selectedRows;
    setPrimaryId(rank(a) >= rank(b) ? a.id : b.id);
    setMergeErr(null);
    setMergeOpen(true);
  }
  async function doMerge() {
    const secondaryId = selectedRows.find((e) => e.id !== primaryId)?.id;
    if (!primaryId || !secondaryId) return;
    setMerging(true);
    setMergeErr(null);
    try {
      const res = await fetch("/api/new-hires/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ primaryId, secondaryId }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? "Merge failed.");
      setMergeOpen(false);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setMergeErr(e instanceof Error ? e.message : "Merge failed.");
    } finally {
      setMerging(false);
    }
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = employees.filter((e) => {
      if (filter === "current" && !e.current) return false;
      if (filter === "past" && e.current) return false;
      if (filters.pool === "managed" && !e.managed) return false;
      if (filters.pool === "fractional" && (!isPilot(e) || e.managed)) return false;
      if (filters.aircraft && e.aircraft !== filters.aircraft) return false;
      if (filters.department && e.department !== filters.department) return false;
      if (filters.tag) {
        const dt = displayTags(e.tags, e.employmentStatus);
        if (filters.tag === UNTAGGED ? dt.length > 0 : !dt.includes(filters.tag)) return false;
      }
      if (filters.location && e.location !== filters.location) return false;
      if (filters.after && (e.startDate ?? "").slice(0, 10) < filters.after) return false;
      if (filters.before && (e.startDate ?? "9999").slice(0, 10) > filters.before) return false;
      if (!needle) return true;
      return [e.name, e.legalName, e.position, e.department, e.location, e.aircraft].filter(Boolean).some((v) => v!.toLowerCase().includes(needle));
    });
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => factor * compareBy(a, b, sort.key) || a.name.localeCompare(b.name));
  }, [employees, q, filter, filters, sort]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.total },
    { key: "current", label: "Current", count: counts.current },
    { key: "past", label: "Past", count: counts.past }
  ];

  const chips: { label: string; clear: () => void }[] = [];
  if (filters.pool !== "all") chips.push({ label: filters.pool === "managed" ? "Managed pilots" : "Fractional pilots", clear: () => setFilters((f) => ({ ...f, pool: "all" })) });
  if (filters.aircraft) chips.push({ label: `Aircraft: ${filters.aircraft}`, clear: () => setFilters((f) => ({ ...f, aircraft: "" })) });
  if (filters.department) chips.push({ label: `Dept: ${filters.department}`, clear: () => setFilters((f) => ({ ...f, department: "" })) });
  if (filters.tag) chips.push({ label: filters.tag === UNTAGGED ? "Untagged" : `Tag: ${filters.tag}`, clear: () => setFilters((f) => ({ ...f, tag: "" })) });
  if (filters.location) chips.push({ label: `Location: ${filters.location}`, clear: () => setFilters((f) => ({ ...f, location: "" })) });
  if (filters.after) chips.push({ label: `Started after ${filters.after}`, clear: () => setFilters((f) => ({ ...f, after: "" })) });
  if (filters.before) chips.push({ label: `Started before ${filters.before}`, clear: () => setFilters((f) => ({ ...f, before: "" })) });

  const filterSelect = "w-full rounded border border-brand-lea/20 bg-white px-2 py-1.5 text-xs text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

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
              className={clsx("rounded px-3 py-1.5 text-sm font-semibold transition hover:shadow-glow", filter === t.key ? "bg-brand-lea text-white" : "border border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400")}
            >
              {t.label} <span className="opacity-70">· {t.count}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, role, aircraft…"
                className="w-56 rounded border border-brand-lea/20 py-2 pl-8 pr-3 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              />
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => { setFiltersOpen((o) => !o); setColsOpen(false); }}
                className={clsx("inline-flex items-center gap-1.5 rounded border px-2.5 py-2 text-sm font-semibold transition", activeFilterCount > 0 ? "border-brand-gold/60 bg-brand-gold/15 text-brand-lea dark:text-brand-gold" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400")}
              >
                <SlidersHorizontal className="h-4 w-4" /> Filter{activeFilterCount > 0 ? <span className="rounded shrink-0 bg-brand-gold px-1.5 text-[10px] font-bold text-brand-black">{activeFilterCount}</span> : null}
              </button>
              {filtersOpen ? (
                <>
                  <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setFiltersOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-64 space-y-2.5 rounded border border-brand-lea/15 bg-white p-3 shadow-panel dark:border-white/10 dark:bg-brand-panel">
                    <div>
                      <div className="mb-1 text-[11px] font-semibold text-brand-grey dark:text-slate-400">Pilot pool</div>
                      <select value={filters.pool} onChange={(e) => setFilters((f) => ({ ...f, pool: e.target.value as Filters["pool"] }))} className={filterSelect}>
                        <option value="all">All</option>
                        <option value="fractional">Fractional (SkyShare)</option>
                        <option value="managed">Managed</option>
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-semibold text-brand-grey dark:text-slate-400">Aircraft</div>
                      <select value={filters.aircraft} onChange={(e) => setFilters((f) => ({ ...f, aircraft: e.target.value }))} className={filterSelect}>
                        <option value="">Any</option>
                        {aircraftOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-semibold text-brand-grey dark:text-slate-400">Department</div>
                      <select value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))} className={filterSelect}>
                        <option value="">Any</option>
                        {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    {tagOptions.length ? (
                      <div>
                        <div className="mb-1 text-[11px] font-semibold text-brand-grey dark:text-slate-400">Tag</div>
                        <select value={filters.tag} onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))} className={filterSelect}>
                          <option value="">Any</option>
                          {tagOptions.map((t) => <option key={t} value={t}>{t}</option>)}
                          <option value={UNTAGGED}>Untagged</option>
                        </select>
                      </div>
                    ) : null}
                    <div>
                      <div className="mb-1 text-[11px] font-semibold text-brand-grey dark:text-slate-400">Location</div>
                      <select value={filters.location} onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))} className={filterSelect}>
                        <option value="">Any</option>
                        {locOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] font-semibold text-brand-grey dark:text-slate-400">Started</div>
                      <div className="flex gap-2">
                        <input type="date" aria-label="Started after" value={filters.after} onChange={(e) => setFilters((f) => ({ ...f, after: e.target.value }))} className={filterSelect} />
                        <input type="date" aria-label="Started before" value={filters.before} onChange={(e) => setFilters((f) => ({ ...f, before: e.target.value }))} className={filterSelect} />
                      </div>
                    </div>
                    {activeFilterCount > 0 ? (
                      <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs font-semibold text-brand-eden hover:underline dark:text-slate-300">Clear all filters</button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => { setColsOpen((o) => !o); setFiltersOpen(false); }}
                className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-2.5 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
              >
                <Columns3 className="h-4 w-4" /> Columns
              </button>
              {colsOpen ? (
                <>
                  <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setColsOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-52 rounded border border-brand-lea/15 bg-white p-2 shadow-panel dark:border-white/10 dark:bg-brand-panel">
                    <div className="px-1.5 pb-1.5 text-[11px] font-semibold text-brand-grey dark:text-slate-400">Shows for everyone</div>
                    {EMPLOYEE_COLUMN_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleColumn(key)}
                        className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-sm text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:text-slate-200 dark:hover:bg-white/5"
                      >
                        <span className={clsx("flex h-4 w-4 items-center justify-center rounded border", visible.includes(key) ? "border-brand-gold bg-brand-gold text-brand-black" : "border-brand-lea/30 dark:border-white/20")}>
                          {visible.includes(key) ? <Check className="h-3 w-3" /> : null}
                        </span>
                        {COLUMNS[key].label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {chips.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {chips.map((c, i) => (
              <button key={i} type="button" onClick={c.clear} className="inline-flex items-center gap-1 rounded bg-brand-gold/15 px-2.5 py-0.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-gold/25 dark:text-brand-gold">
                {c.label} <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded bg-brand-lea px-4 py-2.5 text-sm text-white shadow-panel">
          <span className="font-semibold">{selected.size} selected</span>
          <span className="text-white/70">{selected.size === 2 ? "Same person twice? Merge them into one." : "Select exactly 2 records to merge duplicates."}</span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={openMerge} disabled={selected.size !== 2} className="inline-flex items-center gap-1.5 rounded bg-brand-gold px-3 py-1.5 text-xs font-bold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50">
              <GitMerge className="h-3.5 w-3.5" /> Merge 2 records…
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="rounded border border-white/30 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10">Clear</button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No employees match" description="Try a different search or filter." />
      ) : (
        <>
          <div className="space-y-2 sm:hidden">
            {rows.map((e) => (
              <div key={e.id} className={clsx("flex items-start gap-2 rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 transition-shadow hover:shadow-glow dark:bg-brand-panel dark:ring-white/10", selected.has(e.id) && "ring-brand-gold")}>
                <input type="checkbox" aria-label={`Select ${e.name}`} className="mt-1" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} />
                <Link href={`/people/${e.id}`} className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-brand-lea dark:text-slate-100">{e.name}</span>
                    {(() => { const b = statusBadge(e); return <Badge tone={b.tone}>{b.label}</Badge>; })()}
                  </div>
                  <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{[e.position, e.department, e.location].filter(Boolean).join(" · ") || "—"}</div>
                  {displayTags(e.tags, e.employmentStatus).length ? <div className="mt-1"><EmployeeTags tags={e.tags} employmentStatus={e.employmentStatus} /></div> : null}
                  <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">{fmtDate(e.startDate)} – {e.current ? "Present" : fmtDate(e.endDate)} · {tenure(e.tenureDays)}{e.roleCount > 1 ? ` · ${e.roleCount} roles` : ""}</div>
                </Link>
              </div>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 sm:block dark:bg-brand-panel dark:ring-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:border-white/10 dark:text-slate-400">
                    <th className="w-8 px-3 py-3" aria-label="Select" />
                    <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                    {orderedVisible.map((key) => {
                      const col = COLUMNS[key];
                      return col.sortKey ? (
                        <SortableTh key={key} label={col.label} sortKey={col.sortKey} sort={sort} onSort={toggleSort} />
                      ) : (
                        <th key={key} className="px-4 py-3 text-left font-bold uppercase tracking-[0.14em]">{col.label}</th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className={clsx("row-wash border-b border-brand-lea/5 dark:border-white/10 dark:hover:bg-white/5", selected.has(e.id) && "bg-brand-gold/10 dark:bg-brand-gold/10")}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" aria-label={`Select ${e.name}`} checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} />
                      </td>
                      <td className="px-4 py-2.5">
                        <Link href={`/people/${e.id}`} className="font-semibold text-brand-lea hover:underline dark:text-slate-100">{e.name}</Link>
                      </td>
                      {orderedVisible.map((key) => (
                        <td key={key} className="px-4 py-2.5 text-brand-grey dark:text-slate-400">{COLUMNS[key].cell(e)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} busy={merging}>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-lea dark:text-slate-100">
          <GitMerge className="h-5 w-5" /> Merge two records into one
        </h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Pick which record to <strong>keep</strong>. The other merges into it — its roles, dates, travel, business cards and recognition all move over — and is then <strong>permanently deleted</strong>. This can&apos;t be undone.
        </p>
        <div className="mt-4 space-y-2">
          {selectedRows.map((e) => {
            const keep = primaryId === e.id;
            const b = statusBadge(e);
            return (
              <label key={e.id} className={clsx("flex cursor-pointer items-start gap-3 rounded border p-3 transition", keep ? "border-brand-gold bg-brand-gold/10" : "border-brand-lea/15 hover:border-brand-lea/30 dark:border-white/10")}>
                <input type="radio" name="merge-primary" className="mt-1" checked={keep} onChange={() => setPrimaryId(e.id)} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-brand-lea dark:text-slate-100">{e.name}</span>
                    {keep ? <span className="rounded bg-brand-gold/25 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-lea dark:text-brand-gold">Keep</span> : <span className="text-[10px] font-semibold uppercase text-brand-grey dark:text-slate-500">merges in</span>}
                    <Badge tone={b.tone}>{b.label}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">{[e.position, e.department, e.location].filter(Boolean).join(" · ") || "No role on file"}</div>
                  <div className="text-xs text-brand-grey dark:text-slate-400">{fmtDate(e.startDate)} – {e.current ? "Present" : fmtDate(e.endDate)} · {e.roleCount} role{e.roleCount === 1 ? "" : "s"}{e.stintCount > 1 ? ` · ${e.stintCount} stints` : ""}</div>
                </div>
              </label>
            );
          })}
        </div>
        {mergeErr ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{mergeErr}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" data-dialog-close onClick={() => setMergeOpen(false)} disabled={merging}>Cancel</Button>
          <Button variant="danger" onClick={doMerge} disabled={merging || !primaryId}>{merging ? "Merging…" : "Merge & delete the other"}</Button>
        </div>
      </Modal>
    </div>
  );
}

function SortableTh({ label, sortKey, sort, onSort }: { label: string; sortKey: SortKey; sort: SortState | null; onSort: (key: SortKey) => void }) {
  const active = sort?.key === sortKey;
  return (
    <th className="px-4 py-3 text-left" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 font-bold uppercase tracking-[0.14em] transition hover:text-brand-lea dark:hover:text-slate-200">
        {label}
        {active ? (sort.dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
      </button>
    </th>
  );
}
