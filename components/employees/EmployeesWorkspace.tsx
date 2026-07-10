"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Search, Users, ChevronUp, ChevronDown, ChevronsUpDown, GitMerge } from "lucide-react";
import type { EmployeeRow, EmployeeCounts } from "@/lib/data/employees";
import { Badge, Button, EmptyState, Modal } from "@/components/ui";
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
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // null = the default order from the server (current first, then most recent).
  const [sort, setSort] = useState<SortState | null>(null);

  // Duplicate-merge: pick two records, choose which survives, merge + delete the other.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeErr, setMergeErr] = useState<string | null>(null);
  const selectedRows = useMemo(() => employees.filter((e) => selected.has(e.id)), [employees, selected]);

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function openMerge() {
    if (selectedRows.length !== 2) return;
    // Default to keeping the richer / currently-employed record.
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
      const res = await fetch("/api/new-hires/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId, secondaryId })
      });
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

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded bg-brand-lea px-4 py-2.5 text-sm text-white shadow-panel">
          <span className="font-semibold">{selected.size} selected</span>
          <span className="text-white/70">{selected.size === 2 ? "Same person twice? Merge them into one." : "Select exactly 2 records to merge duplicates."}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openMerge}
              disabled={selected.size !== 2}
              className="inline-flex items-center gap-1.5 rounded bg-brand-gold px-3 py-1.5 text-xs font-bold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50"
            >
              <GitMerge className="h-3.5 w-3.5" /> Merge 2 records…
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="rounded border border-white/30 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/10">
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No employees match" description="Try a different search or filter." />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {rows.map((e) => (
              <div key={e.id} className={clsx("flex items-start gap-2 rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10", selected.has(e.id) && "ring-brand-gold")}>
                <input type="checkbox" aria-label={`Select ${e.name}`} className="mt-1" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} />
                <Link href={`/people/${e.id}`} className="min-w-0 flex-1 transition hover:shadow-glow">
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
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 sm:block dark:bg-brand-panel dark:ring-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:border-white/10 dark:text-slate-400">
                    <th className="w-8 px-3 py-3" aria-label="Select" />
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
                    <tr key={e.id} className={clsx("border-b border-brand-lea/5 hover:bg-brand-cloudDancer/30 dark:border-white/10 dark:bg-white/5", selected.has(e.id) && "bg-brand-gold/10 dark:bg-brand-gold/10")}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" aria-label={`Select ${e.name}`} checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)} />
                      </td>
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

      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} busy={merging}>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-lea dark:text-slate-100">
          <GitMerge className="h-5 w-5" /> Merge two records into one
        </h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Pick which record to <strong>keep</strong>. The other one merges into it — its roles, dates, travel, business cards and
          recognition all move over — and is then <strong>permanently deleted</strong>. This can&apos;t be undone.
        </p>
        <div className="mt-4 space-y-2">
          {selectedRows.map((e) => {
            const keep = primaryId === e.id;
            const b = statusBadge(e);
            return (
              <label
                key={e.id}
                className={clsx(
                  "flex cursor-pointer items-start gap-3 rounded border p-3 transition",
                  keep ? "border-brand-gold bg-brand-gold/10" : "border-brand-lea/15 hover:border-brand-lea/30 dark:border-white/10"
                )}
              >
                <input type="radio" name="merge-primary" className="mt-1" checked={keep} onChange={() => setPrimaryId(e.id)} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-brand-lea dark:text-slate-100">{e.name}</span>
                    {keep ? <span className="rounded-full bg-brand-gold/25 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-lea dark:text-brand-gold">Keep</span> : <span className="text-[10px] font-semibold uppercase text-brand-grey dark:text-slate-500">merges in</span>}
                    <Badge tone={b.tone}>{b.label}</Badge>
                  </div>
                  <div className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">{[e.position, e.department, e.location].filter(Boolean).join(" · ") || "No role on file"}</div>
                  <div className="text-xs text-brand-grey dark:text-slate-400">
                    {fmtDate(e.startDate)} – {e.current ? "Present" : fmtDate(e.endDate)} · {e.roleCount} role{e.roleCount === 1 ? "" : "s"}
                    {e.stintCount > 1 ? ` · ${e.stintCount} stints` : ""}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {mergeErr ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{mergeErr}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setMergeOpen(false)} disabled={merging}>Cancel</Button>
          <Button variant="danger" onClick={doMerge} disabled={merging || !primaryId}>{merging ? "Merging…" : "Merge & delete the other"}</Button>
        </div>
      </Modal>
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
