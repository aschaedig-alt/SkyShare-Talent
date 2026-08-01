"use client";

import { useMemo, useRef, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import type { ContactCandidate } from "@/lib/data/new-hire-contacts";

// Search-as-you-type picker over the whole current-staff roster. Replaces a
// plain <select>, which was unusable once the pool went from 28 people to ~190.
// Matches on name, job title and department so "maintenance" or "chief" finds
// the right person without knowing how their name is spelled.
//
// The "not on this list" escape hatch is deliberately always visible, including
// when there are zero matches — that's exactly the moment an admin needs it.

const MAX_MATCHES = 8;

export function ContactPicker({
  candidates,
  onPick,
  onAddManual
}: {
  candidates: ContactCandidate[];
  onPick: (personId: string) => void;
  onAddManual: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();

  const matches = useMemo(() => {
    const q = trimmed.toLowerCase();
    if (!q) return candidates.slice(0, MAX_MATCHES);
    return candidates
      .filter((c) =>
        [c.name, c.position ?? "", c.department ?? ""].some((field) => field.toLowerCase().includes(q))
      )
      .slice(0, MAX_MATCHES);
  }, [candidates, trimmed]);

  const reset = () => {
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-400" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Add a person — search by name, role or department…"
        className="w-full rounded border border-brand-lea/20 bg-white py-2 pl-9 pr-3 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
      />

      {open ? (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded border border-brand-lea/15 bg-white py-1 shadow-panel dark:border-white/10 dark:bg-brand-panel">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(c.id);
                  reset();
                }}
                className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-brand-gold/[0.07] dark:hover:bg-white/5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-brand-lea dark:text-slate-100">{c.name}</span>
                  <span className="block truncate text-xs text-brand-grey dark:text-slate-400">
                    {[c.position, c.department].filter(Boolean).join(" · ") || "No title on file"}
                  </span>
                  <span className="block truncate text-xs text-brand-grey/80 dark:text-slate-500">
                    {[c.phone, c.ssEmail].filter(Boolean).join(" · ") || "No phone or email on file"}
                  </span>
                </span>
                {!c.isCurrent ? (
                  <span className="mt-0.5 flex-none rounded bg-brand-cloudDancer px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-grey dark:bg-white/5 dark:text-slate-400">
                    Former
                  </span>
                ) : null}
              </button>
            </li>
          ))}

          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-brand-grey dark:text-slate-400">
              No employee matches “{trimmed}”.
            </li>
          ) : null}

          <li className="mt-1 border-t border-brand-lea/10 pt-1 dark:border-white/10">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onAddManual(trimmed);
                reset();
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-brand-lea transition-colors hover:bg-brand-gold/[0.07] dark:text-slate-100 dark:hover:bg-white/5"
            >
              <UserPlus className="h-3.5 w-3.5 flex-none" />
              {trimmed ? `Add “${trimmed}” manually` : "Add someone not on this list"}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
