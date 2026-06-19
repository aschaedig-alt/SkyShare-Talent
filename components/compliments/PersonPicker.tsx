"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Avatar } from "@/components/compliments/Avatar";
import type { RosterPerson } from "@/lib/compliments/types";

type PersonPickerProps = {
  label: string;
  people: RosterPerson[];
  value: string;
  onChange: (id: string) => void;
  excludeId?: string;
  error?: string;
  /** Render the selected person's points balance under their name. */
  showBalance?: boolean;
};

/** Searchable roster picker → selected person renders as a removable chip. */
export function PersonPicker({
  label,
  people,
  value,
  onChange,
  excludeId,
  error,
  showBalance = false
}: PersonPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = people.find((p) => p.id === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => p.id !== excludeId)
      .filter((p) => (q ? p.name.toLowerCase().includes(q) || (p.position ?? "").toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [people, query, excludeId]);

  if (selected) {
    return (
      <div>
        <p className="mb-2 block text-sm font-medium text-brand-lea dark:text-slate-100">{label}</p>
        <div className="flex items-center gap-2.5 rounded-element bg-brand-cloudDancer/60 px-3 py-2 dark:bg-white/5">
          <Avatar name={selected.name} initials={selected.initials} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-brand-lea dark:text-slate-100">{selected.name}</p>
            <p className="truncate text-xs text-brand-grey dark:text-slate-400">
              {showBalance
                ? `${selected.pointsBalance.toLocaleString()} points available`
                : selected.position ?? "New hire"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
            className="rounded p-1 text-brand-grey transition hover:bg-white hover:text-brand-lea dark:text-slate-400 dark:bg-[#10243a] dark:text-slate-100"
            aria-label={`Remove ${selected.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-brand-lea dark:text-slate-100">{label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search by name or role..."
          className="w-full rounded-element border-[0.5px] border-brand-lea/20 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-value-innovation focus:ring-2 focus:ring-value-innovation/30 dark:border-white/10"
        />
        {open && matches.length > 0 ? (
          <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-element border-[0.5px] border-brand-lea/15 bg-white py-1 shadow-panel dark:border-white/10 dark:bg-[#10243a]">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-brand-cloudDancer/50 hover:shadow-glow dark:bg-white/5"
                >
                  <Avatar name={p.name} initials={p.initials} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-brand-lea dark:text-slate-100">{p.name}</p>
                    <p className="truncate text-xs text-brand-grey dark:text-slate-400">
                      {[p.position, p.department].filter(Boolean).join(" · ") || "New hire"}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs text-brand-red">{error}</p> : null}
    </div>
  );
}
