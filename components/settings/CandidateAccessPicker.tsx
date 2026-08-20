"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_ALLOWED_CANDIDATES } from "@/lib/auth/scoping-options";

export type PickedCandidate = { id: string; displayName: string };

type SearchResult = {
  id: string;
  displayName: string;
  currentTitle: string | null;
  stage: string | null;
  primaryEmail: string | null;
  archived: boolean;
};

type CandidateAccessPickerProps = {
  value: PickedCandidate[];
  onChange: (next: PickedCandidate[]) => void;
  disabled?: boolean;
};

// Search + chips for choosing exactly which candidates one person may see.
//
// Searches through the EXISTING GET /api/candidates?q= route rather than a new
// endpoint. Only an admin can reach this component, and an admin is never
// allowlist-scoped, so the search they run here is unrestricted and returns the
// full pool — which is what picking from it requires.
export function CandidateAccessPicker({ value, onChange, disabled = false }: CandidateAccessPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a slow early request landing after a fast later one and
  // repainting the list with stale matches.
  const requestRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const ticket = ++requestRef.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        // includeArchived: somebody being brought in to review a past applicant is
        // a real case, and an archived candidate is still a candidate you can be
        // granted.
        const res = await fetch(`/api/candidates?q=${encodeURIComponent(trimmed)}&includeArchived=1`);
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as { candidates: SearchResult[] };
        if (ticket === requestRef.current) {
          setResults(data.candidates ?? []);
          setError(null);
        }
      } catch {
        if (ticket === requestRef.current) {
          setError("Could not search candidates.");
          setResults([]);
        }
      } finally {
        if (ticket === requestRef.current) setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const pickedIds = new Set(value.map((c) => c.id));
  const atCap = value.length >= MAX_ALLOWED_CANDIDATES;

  function add(candidate: SearchResult) {
    if (pickedIds.has(candidate.id) || atCap) return;
    onChange([...value, { id: candidate.id, displayName: candidate.displayName }]);
    setQuery("");
    setResults([]);
  }

  function remove(id: string) {
    onChange(value.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-2">
      <div>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
          Candidates this person may see
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled || atCap}
          placeholder={atCap ? `Limit of ${MAX_ALLOWED_CANDIDATES} reached` : "Search by name or email…"}
          className="mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 disabled:opacity-50 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
        />
      </div>

      {searching && <p className="text-xs text-brand-grey dark:text-slate-400">Searching…</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {results.length > 0 && (
        <ul className="max-h-48 divide-y divide-brand-lea/10 overflow-y-auto rounded border border-brand-lea/20 dark:divide-white/10 dark:border-white/10">
          {results.map((candidate) => {
            const already = pickedIds.has(candidate.id);
            return (
              <li key={candidate.id}>
                <button
                  type="button"
                  onClick={() => add(candidate)}
                  disabled={already || disabled || atCap}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-brand-gold/10 disabled:cursor-default disabled:opacity-50 dark:hover:bg-brand-gold/10"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-brand-lea dark:text-slate-100">
                      {candidate.displayName}
                      {candidate.archived && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-grey dark:text-slate-400">
                          archived
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-brand-grey dark:text-slate-400">
                      {[candidate.currentTitle, candidate.primaryEmail].filter(Boolean).join(" · ") || "No details"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-brand-eden dark:text-brand-sweet">
                    {already ? "Added" : "Add"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {query.trim().length >= 2 && !searching && results.length === 0 && !error && (
        <p className="text-xs text-brand-grey dark:text-slate-400">No candidates match that.</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {value.length === 0 ? (
          <p className="text-xs text-brand-grey dark:text-slate-400">
            Nobody picked yet — with the restriction on, this person would see no candidates at all.
          </p>
        ) : (
          value.map((candidate) => (
            // rounded (4px), never rounded-full: pills are rectangles here.
            <span
              key={candidate.id}
              className="inline-flex items-center gap-1.5 rounded bg-brand-lea px-2 py-1 text-xs font-semibold text-white dark:bg-brand-lea"
            >
              {candidate.displayName}
              <button
                type="button"
                onClick={() => remove(candidate.id)}
                disabled={disabled}
                aria-label={`Remove ${candidate.displayName}`}
                className="text-brand-gold transition hover:text-white disabled:opacity-50"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      {value.length > 0 && (
        <p className="text-xs text-brand-grey dark:text-slate-400">
          {value.length} candidate{value.length === 1 ? "" : "s"} selected.
        </p>
      )}
    </div>
  );
}
