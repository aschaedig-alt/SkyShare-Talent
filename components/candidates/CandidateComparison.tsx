"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  SlidersHorizontal,
  Columns3,
  Download,
  Check,
  X
} from "lucide-react";
import type { CandidateComparisonData, CandidateComparisonRow, ComparisonColumn } from "@/lib/data/candidates";

type SortKey = string; // a column key, or "name", "type_ratings", "certificates"
type SortDir = "asc" | "desc";

// Scalar columns shown by default (the rest are available via the Columns menu).
const DEFAULT_VISIBLE = new Set(["total_time", "pic", "sic", "jet", "multi_engine"]);

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Compact multi-select popover used for the type-rating and certificate filters. */
function FacetFilter({
  label,
  options,
  selected,
  onChange
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggle(option: string) {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(next);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition hover:shadow-glow ${
          selected.size > 0
            ? "border-brand-gold/50 bg-brand-gold/10 text-brand-lea"
            : "border-brand-lea/15 bg-white text-brand-grey hover:text-brand-lea"
        }`}
      >
        {label}
        {selected.size > 0 ? (
          <span className="rounded bg-brand-lea px-1.5 text-[11px] font-bold text-white">{selected.size}</span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-56 rounded-xl border border-brand-lea/15 bg-white p-1.5 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-brand-grey">{label}</span>
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="text-[11px] font-semibold text-brand-eden hover:text-brand-lea"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {options.length === 0 ? (
              <p className="px-2 py-2 text-xs text-brand-grey">None found.</p>
            ) : (
              options.map((option) => {
                const isOn = selected.has(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(option)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-brand-lea transition hover:bg-brand-cloudDancer/70 hover:shadow-glow"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isOn ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/30"
                      }`}
                    >
                      {isOn ? <Check className="h-3 w-3" /> : null}
                    </span>
                    {option}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CandidateComparison({ data }: { data: CandidateComparisonData }) {
  const [sortKey, setSortKey] = useState<SortKey>("total_time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [nameQuery, setNameQuery] = useState("");
  const [typeRatingFilter, setTypeRatingFilter] = useState<Set<string>>(new Set());
  const [certFilter, setCertFilter] = useState<Set<string>>(new Set());
  const [minTotal, setMinTotal] = useState("");
  const [visible, setVisible] = useState<Set<string>>(
    () => new Set([...DEFAULT_VISIBLE, "type_ratings", "certificates"])
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!columnsOpen) return;
    function onDocClick(event: MouseEvent) {
      if (columnsRef.current && !columnsRef.current.contains(event.target as Node)) setColumnsOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [columnsOpen]);

  const scalarColumns = data.columns;
  const visibleScalar = useMemo(
    () => scalarColumns.filter((column) => visible.has(column.key)),
    [scalarColumns, visible]
  );
  const showTypeRatings = visible.has("type_ratings");
  const showCertificates = visible.has("certificates");

  const rows = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    const min = minTotal.trim() ? Number(minTotal.replace(/[^\d.]/g, "")) : null;

    const filtered = data.rows.filter((row) => {
      if (q) {
        const haystack = `${row.displayName} ${row.currentTitle ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (typeRatingFilter.size > 0 && !row.typeRatings.some((rating) => typeRatingFilter.has(rating))) {
        return false;
      }
      if (certFilter.size > 0 && !row.certificates.some((cert) => certFilter.has(cert))) {
        return false;
      }
      if (min !== null && !Number.isNaN(min)) {
        const total = row.metrics.total_time?.number ?? null;
        if (total === null || total < min) return false;
      }
      return true;
    });

    const factor = sortDir === "asc" ? 1 : -1;
    const valueFor = (row: CandidateComparisonRow): number | string | null => {
      if (sortKey === "name") return row.displayName.toLowerCase();
      if (sortKey === "type_ratings") return row.typeRatings.length;
      if (sortKey === "certificates") return row.certificates.length;
      return row.metrics[sortKey]?.number ?? null;
    };

    return [...filtered].sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      // Missing values always sort to the bottom, regardless of direction.
      if (av === null && bv === null) return a.displayName.localeCompare(b.displayName);
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        const cmp = av.localeCompare(bv);
        return cmp !== 0 ? cmp * factor : 0;
      }
      const cmp = (av as number) - (bv as number);
      return cmp !== 0 ? cmp * factor : a.displayName.localeCompare(b.displayName);
    });
  }, [data.rows, nameQuery, typeRatingFilter, certFilter, minTotal, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  function toggleColumn(key: string) {
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function exportCsv() {
    const cols: Array<{ label: string; get: (row: CandidateComparisonRow) => string }> = [
      { label: "Name", get: (row) => row.displayName },
      { label: "Title", get: (row) => row.currentTitle ?? "" },
      ...visibleScalar.map((column) => ({
        label: column.label,
        get: (row: CandidateComparisonRow) => {
          const metric = row.metrics[column.key];
          if (!metric) return "";
          return metric.number !== null ? String(metric.number) : metric.text ?? "";
        }
      }))
    ];
    if (showTypeRatings) cols.push({ label: "Type Ratings", get: (row) => row.typeRatings.join("; ") });
    if (showCertificates) cols.push({ label: "Certificates", get: (row) => row.certificates.join("; ") });

    const header = cols.map((column) => csvCell(column.label)).join(",");
    const lines = rows.map((row) => cols.map((column) => csvCell(column.get(row))).join(","));
    const csv = [header, ...lines].join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "candidate-comparison.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const hasFilters = nameQuery.trim() || typeRatingFilter.size > 0 || certFilter.size > 0 || minTotal.trim();

  function clearFilters() {
    setNameQuery("");
    setTypeRatingFilter(new Set());
    setCertFilter(new Set());
    setMinTotal("");
  }

  function SortIcon({ columnKey }: { columnKey: SortKey }) {
    if (sortKey !== columnKey) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-brand-gold" /> : <ArrowDown className="h-3 w-3 text-brand-gold" />;
  }

  // The list columns the user can toggle, surfaced in the Columns menu alongside scalars.
  const listColumnToggles = [
    { key: "type_ratings", label: "Type Ratings" },
    { key: "certificates", label: "Certificates" }
  ];

  return (
    <section className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey" />
          <input
            value={nameQuery}
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder="Filter by name or role"
            className="w-full rounded-lg border border-brand-lea/15 bg-white py-2 pl-9 pr-3 text-sm text-brand-black outline-none transition focus:border-brand-gold"
          />
        </div>

        <FacetFilter label="Type rating" options={data.typeRatingOptions} selected={typeRatingFilter} onChange={setTypeRatingFilter} />
        <FacetFilter label="Certificate" options={data.certificateOptions} selected={certFilter} onChange={setCertFilter} />

        <label className="inline-flex items-center gap-1.5 rounded-lg border border-brand-lea/15 bg-white px-3 py-2 text-sm text-brand-grey">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="font-semibold">Min total</span>
          <input
            value={minTotal}
            onChange={(event) => setMinTotal(event.target.value)}
            inputMode="numeric"
            placeholder="0"
            className="w-16 rounded border border-brand-lea/15 px-1.5 py-0.5 text-sm text-brand-black outline-none focus:border-brand-gold"
          />
        </label>

        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-semibold text-brand-eden transition hover:text-brand-lea"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <div ref={columnsRef} className="relative">
            <button
              type="button"
              onClick={() => setColumnsOpen((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-lea/15 bg-white px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea hover:shadow-glow"
            >
              <Columns3 className="h-4 w-4" /> Columns
            </button>
            {columnsOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-brand-lea/15 bg-white p-1.5 shadow-lg">
                <div className="max-h-72 overflow-y-auto">
                  {[...scalarColumns, ...listColumnToggles].map((column) => {
                    const isOn = visible.has(column.key);
                    return (
                      <button
                        key={column.key}
                        type="button"
                        onClick={() => toggleColumn(column.key)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-brand-lea transition hover:bg-brand-cloudDancer/70 hover:shadow-glow"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            isOn ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/30"
                          }`}
                        >
                          {isOn ? <Check className="h-3 w-3" /> : null}
                        </span>
                        {column.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-lea/15 bg-white px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex items-center justify-between border-b border-brand-lea/10 px-5 py-3">
          <p className="text-xs text-brand-grey">
            <span className="font-semibold text-brand-lea">{rows.length}</span> of {data.rows.length} candidates
            {hasFilters ? " (filtered)" : ""}
          </p>
          <p className="text-[11px] text-brand-grey">
            <span className="text-brand-gold">•</span> = unconfirmed extraction
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cloudDancer/70">
              <Search className="h-5 w-5 text-brand-grey" />
            </div>
            <div className="mt-3 text-base font-semibold text-brand-lea">No candidates match</div>
            <p className="mt-1 text-sm text-brand-grey">Adjust or clear the filters above.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.12em] text-brand-grey">
                <tr>
                  <th className="sticky left-0 z-10 bg-brand-cloudDancer px-5 py-3 font-bold">
                    <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-brand-lea">
                      Candidate <SortIcon columnKey="name" />
                    </button>
                  </th>
                  {visibleScalar.map((column) => (
                    <th key={column.key} className="px-3 py-3 text-right font-bold">
                      <button
                        type="button"
                        onClick={() => toggleSort(column.key)}
                        className="inline-flex items-center gap-1 hover:text-brand-lea"
                      >
                        {column.label} <SortIcon columnKey={column.key} />
                      </button>
                    </th>
                  ))}
                  {showTypeRatings ? (
                    <th className="px-3 py-3 font-bold">
                      <button type="button" onClick={() => toggleSort("type_ratings")} className="inline-flex items-center gap-1 hover:text-brand-lea">
                        Type ratings <SortIcon columnKey="type_ratings" />
                      </button>
                    </th>
                  ) : null}
                  {showCertificates ? (
                    <th className="px-3 py-3 font-bold">
                      <button type="button" onClick={() => toggleSort("certificates")} className="inline-flex items-center gap-1 hover:text-brand-lea">
                        Certificates <SortIcon columnKey="certificates" />
                      </button>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-lea/10">
                {rows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-brand-sweet/10">
                    <td className="sticky left-0 z-10 bg-white px-5 py-3">
                      <Link href={`/candidates/${row.id}`} className="font-semibold text-brand-lea hover:text-brand-eden">
                        {row.displayName}
                      </Link>
                      <div className="text-xs text-brand-grey">{row.currentTitle ?? "No current role"}</div>
                    </td>
                    {visibleScalar.map((column) => {
                      const metric = row.metrics[column.key];
                      const value = metric?.number ?? null;
                      return (
                        <td key={column.key} className="px-3 py-3 text-right tabular-nums text-brand-black">
                          {value !== null ? (
                            <span>
                              {formatNumber(value)}
                              {metric && !metric.confirmed ? (
                                <span title="Unconfirmed extraction" className="ml-0.5 text-brand-gold">
                                  •
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-brand-grey/50">—</span>
                          )}
                        </td>
                      );
                    })}
                    {showTypeRatings ? (
                      <td className="px-3 py-3">
                        <Chips items={row.typeRatings} highlight={typeRatingFilter} />
                      </td>
                    ) : null}
                    {showCertificates ? (
                      <td className="px-3 py-3">
                        <Chips items={row.certificates} highlight={certFilter} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Chips({ items, highlight }: { items: string[]; highlight: Set<string> }) {
  if (items.length === 0) return <span className="text-xs text-brand-grey/50">—</span>;
  return (
    <div className="flex max-w-[260px] flex-wrap gap-1">
      {items.map((item) => {
        const isMatch = highlight.has(item);
        return (
          <span
            key={item}
            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
              isMatch ? "bg-brand-gold/30 text-brand-lea" : "bg-brand-sweet/25 text-brand-lea"
            }`}
          >
            {item}
          </span>
        );
      })}
    </div>
  );
}
