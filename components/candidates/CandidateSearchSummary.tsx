import Link from "next/link";
import { clsx } from "clsx";
import { Plane, Search } from "lucide-react";
import type { CandidateSearchSummary as Summary } from "@/lib/data/candidates";
import {
  ALL_PLACES,
  EXPERIENCE_PLACES,
  SEARCH_PLACES,
  isEverywhere,
  placeInfo,
  placesParam,
  type SearchPlace
} from "@/lib/candidates/search/query";

/**
 * Under the list header when there is a search: how the box was read, and how
 * many people it found in each place - each place a real link that ticks or
 * unticks it, so "134 of these are only here because they applied to the
 * Challenger job" is one click from gone.
 *
 * Server-rendered links, no client state: every change is a new URL, which is
 * also what makes a search you narrowed shareable.
 */

const CHIP = "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs transition hover:shadow-glow";

export function CandidateSearchSummary({
  search,
  params
}: {
  search: Summary;
  /** Everything else in the URL, carried into every link. */
  params: Record<string, string | undefined>;
}) {
  const href = (places: SearchPlace[]) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) next.set(key, value);
    const value = placesParam(places);
    if (value) next.set("in", value);
    return `/candidates?${next.toString()}`;
  };
  const toggle = (place: SearchPlace) =>
    search.places.includes(place) ? search.places.filter((p) => p !== place) : [...search.places, place];
  const everywhere = isEverywhere(search.places);
  const experienceOnly = placesParam(search.places) === placesParam(EXPERIENCE_PLACES);

  return (
    <div className="space-y-2 border-b border-brand-lea/10 bg-brand-cloudDancer/35 px-5 py-3 text-xs dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1 font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">
          <Search className="h-3 w-3" /> Searched for
        </span>
        {search.terms.map((term, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            {term.orWithPrevious ? <span className="font-semibold text-brand-grey dark:text-slate-400">or</span> : null}
            <span
              title={
                term.aircraft
                  ? `Every spelling of the ${term.aircraft.type} type rating: ${term.aircraft.spellings.join(", ")}. Put it in quotes to search one spelling only.`
                  : undefined
              }
              className={clsx(
                "inline-flex items-center gap-1 rounded border px-2 py-0.5",
                term.negate
                  ? "border-dashed border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-300"
                  : "border-brand-lea/20 bg-white text-brand-lea dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
              )}
            >
              {term.negate ? <span className="font-semibold">not</span> : null}
              {term.aircraft ? <Plane className="h-3 w-3 text-brand-gold" /> : null}
              <span className="font-semibold">{term.kind === "phrase" ? `“${term.text}”` : term.text}</span>
              {term.aircraft ? (
                <span className="text-brand-grey dark:text-slate-400">
                  as {term.aircraft.type} · {term.aircraft.name}
                </span>
              ) : null}
              {term.places ? (
                <span className="text-brand-grey dark:text-slate-400">in {term.places.map((p) => placeInfo(p).label).join(", ")}</span>
              ) : null}
            </span>
          </span>
        ))}
        <span className="ml-auto text-[10px] text-brand-grey dark:text-slate-500">upper and lower case don&apos;t matter</span>
      </div>

      {search.placeCounts ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">Found in</span>
          {SEARCH_PLACES.map((place) => {
            const on = search.places.includes(place.id);
            const count = search.placeCounts![place.id];
            return (
              <Link
                key={place.id}
                href={href(toggle(place.id))}
                title={`${place.hint}. ${on ? "Click to stop searching here." : "Not searched now - click to search here too."}`}
                className={clsx(
                  CHIP,
                  on
                    ? "border-brand-lea/25 bg-white text-brand-lea dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
                    : "border-dashed border-brand-lea/20 text-brand-grey line-through decoration-brand-grey/50 dark:border-white/10 dark:text-slate-500"
                )}
              >
                <span className={clsx("h-2 w-2 shrink-0 rounded-full", on ? "bg-brand-gold" : "bg-transparent ring-1 ring-brand-grey/60")} />
                <span className={on ? "font-semibold" : undefined}>{place.label}</span>
                <span className={clsx("tabular-nums", count === 0 ? "text-brand-grey/70 dark:text-slate-500" : "font-bold")}>{count.toLocaleString()}</span>
              </Link>
            );
          })}
          <span className="ml-auto flex gap-1.5">
            {!experienceOnly ? (
              <Link
                href={href(EXPERIENCE_PLACES)}
                title="Resumes, applications, flight data and notes - where somebody describes their own experience. Leaves out the jobs they applied to, their title, tags and status, and their name."
                className={clsx(CHIP, "border-brand-gold/60 bg-brand-gold/10 font-semibold text-brand-lea dark:text-slate-100")}
              >
                Experience only
              </Link>
            ) : null}
            {!everywhere ? (
              <Link href={href(ALL_PLACES)} className={clsx(CHIP, "border-brand-lea/20 text-brand-eden dark:border-white/10 dark:text-slate-300")}>
                Search everywhere
              </Link>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
