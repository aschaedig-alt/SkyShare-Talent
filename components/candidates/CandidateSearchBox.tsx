import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { BUCKET_ALL } from "@/lib/candidates/list-url";
import {
  ALL_PLACES,
  EXPERIENCE_PLACES,
  SEARCH_PLACES,
  isEverywhere,
  placesParam,
  type SearchPlace
} from "@/lib/candidates/search/query";

/**
 * The candidate search, as one component that can sit on more than one page.
 *
 * WHY IT IS A COMPONENT NOW. It used to be an inline form in CandidatesWorkspace,
 * which meant the only way to search was to be standing on /candidates. Opening a
 * candidate and then wanting to look up a second one cost three moves: back to the
 * list, retype, open. The profile's own "Back to candidates" link makes that worse
 * than it sounds — it is a bare href="/candidates" with no query string, so it
 * discards the search that got you there and drops you on the unfiltered list.
 *
 * ACTION IS EXPLICIT, not inherited. A bare <form> posts to whatever route it is
 * rendered on, which is right on /candidates and wrong everywhere else — from a
 * profile it would submit to /candidates/<id> and search nothing. action always
 * names /candidates so the box behaves identically wherever it is mounted.
 *
 * IT CARRIES THE FILTERS, which the old inline form did not. That form had a
 * single q input, so submitting a search silently dropped ?tags=, ?depts= and
 * ?size= — filter to a tag, search a name, and the tag filter vanished with no
 * sign it had. Hidden inputs are the native-GET equivalent of the one-param
 * rewrite the client controls use (hrefWithParam, lib/candidates/list-url.ts):
 * lists comma-joined, everything else passed through untouched.
 *
 * A hidden input is easy to forget when a filter is added, which is how the
 * segment and the status filter came to be missing from this list. If you add a
 * parameter to /candidates, add it here too.
 *
 * NO CLIENT JS ON PURPOSE. It is a plain GET form, so it works before hydration
 * and cannot get stuck in a loading state. Deliberately NOT a typeahead: the
 * quick-search API matches name and email only, while this search reaches the
 * text inside resumes and pilot applications — a dropdown here would quietly find
 * less than the box it replaced.
 */
export function CandidateSearchBox({
  defaultQuery = "",
  tags = [],
  departments = [],
  stages = [],
  // Defaults to "everyone" rather than to absent. This box also sits on a
  // candidate profile, where there is no segment to carry — and an absent
  // bucket means "use the remembered one", which would answer a search for a
  // name with an empty list whenever the remembered segment happened not to
  // contain them. A search should span the list unless something narrows it.
  bucket = BUCKET_ALL,
  across,
  size,
  places = ALL_PLACES,
  tone = "dark",
  placeholder = 'Search anything - try challenger 350 -"cabin attendant"',
  className = ""
}: {
  /**
   * Where the search looks, ticked in the "Search in" picker and sent as one
   * ?in= per box. Unticking everything means everywhere - a search can never
   * look nowhere. See lib/candidates/search/query.ts.
   */
  places?: SearchPlace[];
  /** Shown in the box, so a search you ran is still visible after it runs. */
  defaultQuery?: string;
  /** Carried through untouched, so searching cannot drop a filter. */
  tags?: string[];
  departments?: string[];
  stages?: string[];
  /**
   * The selected segment, and the "all" sentinel for none. Both are carried for
   * the same reason the rest are — but the sentinel matters on its own: with no
   * bucket param at all the server hands back the segment you were last on, so
   * a search run from Everyone would come back filtered to something else.
   */
  bucket?: string;
  across?: string;
  size?: number;
  /** "dark" sits on the navy header band; "light" on a white panel. */
  tone?: "dark" | "light";
  placeholder?: string;
  className?: string;
}) {
  const dark = tone === "dark";

  return (
    <form action="/candidates" method="get" className={`relative flex w-full gap-2 ${className}`}>
      {/* Comma-joined into ONE param each, matching parseListParam. Rendered only
          when set, so an empty filter does not put ?tags= in the URL. */}
      {tags.length > 0 && <input type="hidden" name="tags" value={tags.join(",")} />}
      {departments.length > 0 && <input type="hidden" name="depts" value={departments.join(",")} />}
      {stages.length > 0 && <input type="hidden" name="stages" value={stages.join(",")} />}
      {bucket && <input type="hidden" name="bucket" value={bucket} />}
      {across && <input type="hidden" name="across" value={across} />}
      {/* The default size is sent too, unlike the lists above. An absent ?size=
          means "I did not choose", which the server answers with the REMEMBERED
          size — so omitting it at 100 would quietly return 500 rows. */}
      {size && <input type="hidden" name="size" value={String(size)} />}

      <div className="relative order-1 min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey" />
        <input
          name="q"
          defaultValue={defaultQuery}
          placeholder={placeholder}
          aria-label="Search candidates"
          className={
            dark
              ? "w-full rounded border border-white/20 bg-white/95 py-2.5 pl-9 pr-3 text-sm text-brand-black shadow-sm outline-none transition focus:ring-2 focus:ring-brand-gold/50"
              : "w-full rounded border border-brand-lea/15 bg-white py-1.5 pl-9 pr-3 text-sm text-brand-black shadow-sm outline-none transition focus:ring-2 focus:ring-brand-gold/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:placeholder:text-slate-500"
          }
        />
      </div>
      {/* FIRST SUBMIT BUTTON IN SOURCE ORDER, ON PURPOSE. Enter in the box
          submits with the form's first submit button, and the picker below holds
          two preset buttons - were either first, Enter would quietly apply it.
          It is drawn last with order-3. */}
      <button
        type="submit"
        className={
          dark
            ? "order-3 rounded border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
            : "order-3 rounded border border-brand-lea/15 px-3 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-gold hover:bg-brand-gold/10 hover:text-brand-lea hover:shadow-glow dark:border-white/10 dark:text-slate-300 dark:hover:bg-brand-gold/15 dark:hover:text-slate-100"
        }
      >
        Search
      </button>
      <PlacePicker places={places} dark={dark} />
    </form>
  );
}

/**
 * "Search in": where every term is looked for. A native <details>, so it opens
 * and closes with no JavaScript like the rest of this box. The ticks ride along
 * with the form as ?in=; the two presets are submit buttons that name their own
 * ?in= and win over the ticks (see parsePlaces).
 */
function PlacePicker({ places, dark }: { places: SearchPlace[]; dark: boolean }) {
  const everywhere = isEverywhere(places);
  const experience = placesParam(places) === placesParam(EXPERIENCE_PLACES);
  const label = everywhere ? "Everywhere" : experience ? "Experience" : `${places.length} of ${ALL_PLACES.length} places`;
  const preset =
    "rounded border px-2.5 py-1 text-xs font-semibold transition hover:shadow-glow dark:border-white/15 dark:text-slate-100";
  return (
    <details className="group order-2">
      <summary
        title="Where to search"
        className={
          dark
            ? "flex h-full cursor-pointer list-none items-center gap-1.5 rounded border border-white/30 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20 [&::-webkit-details-marker]:hidden"
            : "flex h-full cursor-pointer list-none items-center gap-1.5 rounded border border-brand-lea/15 px-2.5 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-gold hover:shadow-glow dark:border-white/10 dark:text-slate-300 [&::-webkit-details-marker]:hidden"
        }
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 top-full z-40 mt-1.5 w-[min(360px,100%)] rounded bg-white p-3 text-left text-brand-black shadow-panel ring-1 ring-brand-lea/15 dark:bg-brand-panel dark:text-slate-100 dark:ring-white/10">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-gold">Search in</p>
        <div className="mt-1.5 space-y-1">
          {SEARCH_PLACES.map((place) => (
            <label key={place.id} className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-brand-cloudDancer/60 dark:hover:bg-white/5">
              <input
                type="checkbox"
                name="in"
                value={place.id}
                defaultChecked={places.includes(place.id)}
                className="mt-0.5 h-3.5 w-3.5 accent-brand-lea"
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-brand-lea dark:text-slate-100">{place.label}</span>
                <span className="block text-[11px] leading-4 text-brand-grey dark:text-slate-400">{place.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-brand-lea/10 pt-2 dark:border-white/10">
          <button
            type="submit"
            name="in"
            value="experience"
            title="Resumes, applications, flight data and notes - where somebody describes their own experience"
            className={`${preset} border-brand-gold/60 bg-brand-gold/10 text-brand-lea`}
          >
            Experience only
          </button>
          <button type="submit" name="in" value="all" className={`${preset} border-brand-lea/20 text-brand-eden`}>
            Everywhere
          </button>
        </div>
        <div className="mt-2 border-t border-brand-lea/10 pt-2 text-[11px] leading-5 text-brand-grey dark:border-white/10 dark:text-slate-400">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-gold">How to search</p>
          <ul className="mt-1 space-y-0.5">
            <li><code className="font-semibold text-brand-lea dark:text-slate-100">&quot;first officer&quot;</code> an exact phrase</li>
            <li>
              <code className="font-semibold text-brand-lea dark:text-slate-100">-pilatus</code> leave out anyone it matches, anywhere - whatever is
              ticked above. <code className="font-semibold text-brand-lea dark:text-slate-100">NOT pilatus</code> works too
            </li>
            <li>
              <code className="font-semibold text-brand-lea dark:text-slate-100">-&quot;cabin attendant&quot;</code> leave out a phrase. It needs the
              quotes: <code className="font-semibold text-brand-lea dark:text-slate-100">-cabin attendant</code> leaves out cabin and searches FOR
              attendant
            </li>
            <li><code className="font-semibold text-brand-lea dark:text-slate-100">cl350 OR g450</code> either one</li>
            <li><code className="font-semibold text-brand-lea dark:text-slate-100">resume:&quot;cl 350&quot;</code> or <code className="font-semibold text-brand-lea dark:text-slate-100">-jobs:captain</code> one word, one place</li>
            <li>
              Aircraft are recognised: <code className="font-semibold text-brand-lea dark:text-slate-100">challenger 350</code> also finds CL-30,
              CL350, Challenger 300/350 and BD-100. Quote it for that one spelling.
            </li>
            <li>Upper and lower case never matter.</li>
          </ul>
        </div>
      </div>
    </details>
  );
}
