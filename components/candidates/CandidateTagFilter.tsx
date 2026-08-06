"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Tag as TagIcon, X, Check, Archive } from "lucide-react";
import { HISTORICAL_CHIP_CLASS, tagChipClass, tagDotClass } from "@/lib/tags/colors";
import type { CandidateTagOption } from "@/lib/data/candidates";
import { buildCandidatesHref } from "@/lib/candidates/list-url";

/** One selectable tag. Historical ones stay grey, matching the pills. */
function TagRow({ option, on, onToggle }: { option: CandidateTagOption; on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={clsx(
        "flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition hover:bg-brand-gold/10",
        on && "bg-brand-gold/15"
      )}
    >
      <span
        className={clsx(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
          on ? "border-brand-gold bg-brand-gold text-white" : "border-brand-lea/25 dark:border-white/20"
        )}
      >
        {on ? <Check className="h-2.5 w-2.5" /> : null}
      </span>
      {option.historical ? (
        <span className={clsx("h-2 w-2 shrink-0 rounded", HISTORICAL_CHIP_CLASS)} />
      ) : (
        <span className={clsx("h-2 w-2 shrink-0 rounded", tagDotClass(option.label, option.color))} />
      )}
      <span
        className={clsx(
          "min-w-0 flex-1 truncate text-[11.5px]",
          option.historical || option.live === 0
            ? "text-brand-grey dark:text-slate-500"
            : "text-brand-lea dark:text-slate-100"
        )}
        title={option.label}
      >
        {option.label}
      </span>
      {/* Live count first, since that is how many you would actually see; the
          archived remainder is the quieter number in brackets. */}
      <span className="shrink-0 text-[10.5px] tabular-nums text-brand-grey dark:text-slate-400">
        {option.live}
        {option.total > option.live ? ` (+${option.total - option.live})` : ""}
      </span>
    </button>
  );
}

/**
 * Narrow the candidate list to one or more tags.
 *
 * Drives ?tags= in the URL rather than local state, for two reasons: the list is
 * capped server-side, so filtering has to happen in the query or it would only
 * search the first page; and a filtered view is then a link somebody can send.
 *
 * router.push is correct HERE despite the house rule against it for navigation:
 * this is not moving to another page, it is re-querying the one you are on, and
 * the URL is the state. Picking a tag is a filter control, not a link.
 */
export function CandidateTagFilter({
  options,
  active,
  query,
  departments = [],
  size
}: {
  options: CandidateTagOption[];
  active: string[];
  query: string;
  /** Carried through so picking a tag does not silently drop the other filters. */
  departments?: string[];
  size?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const activeSet = useMemo(() => new Set(active.map((t) => t.toLowerCase())), [active]);

  // Split the same way the pills are: tags somebody chose, then the imported
  // vocabulary behind its own heading. 38 tags arrived from Jazz and would
  // otherwise bury the few in real use.
  const { chosen, historical } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matching = options.filter((o) => !q || o.label.toLowerCase().includes(q));
    return {
      chosen: matching.filter((o) => !o.historical),
      historical: matching.filter((o) => o.historical)
    };
  }, [options, search]);
  const [showHistorical, setShowHistorical] = useState(false);

  function apply(next: string[]) {
    router.push(buildCandidatesHref({ query, tags: next, departments, size }));
  }

  function toggle(label: string) {
    const has = activeSet.has(label.toLowerCase());
    apply(has ? active.filter((t) => t.toLowerCase() !== label.toLowerCase()) : [...active, label]);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition",
          active.length
            ? "border-brand-gold bg-brand-gold/15 text-brand-lea dark:text-slate-100"
            : "border-brand-lea/20 text-brand-lea hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-100"
        )}
      >
        <TagIcon className="h-3.5 w-3.5" />
        {active.length ? `${active.length} tag${active.length === 1 ? "" : "s"}` : "Filter by tag"}
      </button>

      {active.length > 0 ? (
        <button
          onClick={() => apply([])}
          className="ml-1 inline-flex items-center gap-1 rounded border border-brand-lea/15 px-1.5 py-1 text-[11px] font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
          title="Clear tag filter"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}

      {open ? (
        <>
          {/* Click-away. A plain overlay rather than a focus trap: this is a
              filter menu, and trapping focus for a list of checkboxes is more
              disruptive than the problem it solves. */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-72 rounded border border-brand-lea/15 bg-white p-2 shadow-panel dark:border-white/10 dark:bg-brand-panel">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a tag…"
              className="mb-2 w-full rounded border border-brand-lea/15 px-2 py-1 text-xs text-brand-lea placeholder:text-brand-grey/60 focus:border-brand-gold focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            />

            {active.length > 0 ? (
              <p className="mb-1.5 text-[10.5px] leading-snug text-brand-grey dark:text-slate-400">
                Showing people who carry <span className="font-semibold">all</span> of the selected tags.
              </p>
            ) : null}

            <div className="max-h-72 overflow-auto">
              {chosen.length === 0 && historical.length === 0 ? (
                <p className="px-1 py-2 text-[11px] text-brand-grey dark:text-slate-400">No tag matches that.</p>
              ) : null}

              {chosen.length === 0 && historical.length > 0 && !search ? (
                <p className="px-1 py-2 text-[11px] leading-snug text-brand-grey dark:text-slate-400">
                  No tags added by hand yet. Add one from a candidate&apos;s profile and it will show here.
                </p>
              ) : null}

              {chosen.map((o) => (
                <TagRow key={o.label} option={o} on={activeSet.has(o.label.toLowerCase())} onToggle={() => toggle(o.label)} />
              ))}

              {historical.length > 0 ? (
                <div className={chosen.length ? "mt-1.5 border-t border-brand-lea/10 pt-1.5 dark:border-white/10" : ""}>
                  <button
                    onClick={() => setShowHistorical((v) => !v)}
                    className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[11px] font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    <Archive className="h-3 w-3" />
                    {showHistorical ? "Hide" : "Show"} historical tags ({historical.length})
                  </button>
                  {showHistorical
                    ? historical.map((o) => (
                        <TagRow
                          key={o.label}
                          option={o}
                          on={activeSet.has(o.label.toLowerCase())}
                          onToggle={() => toggle(o.label)}
                        />
                      ))
                    : null}
                </div>
              ) : null}
            </div>
            <p className="mt-1.5 border-t border-brand-lea/10 pt-1.5 text-[10px] leading-snug text-brand-grey dark:border-white/10 dark:text-slate-500">
              Counts are live candidates, with archived ones in brackets.
            </p>
          </div>
        </>
      ) : null}

      {/* The chosen tags, visible without opening the menu — a filter you cannot
          see is a filter you forget is on. */}
      {active.length > 0 ? (
        <div className="absolute right-0 top-full z-10 mt-1 flex max-w-[320px] flex-wrap justify-end gap-1">
          {active.map((label) => {
            const opt = options.find((o) => o.label.toLowerCase() === label.toLowerCase());
            return (
              <button
                key={label}
                onClick={() => toggle(label)}
                className={clsx(
                  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold",
                  tagChipClass(label, opt?.color ?? null)
                )}
                title={`Remove the ${label} filter`}
              >
                {label}
                <X className="h-2.5 w-2.5" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
