import { Search } from "lucide-react";
import { CANDIDATE_LIST_LIMIT } from "@/lib/candidates/list-config";

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
 * sign it had. buildCandidatesHref (lib/candidates/list-url.ts) exists precisely
 * to stop a control clobbering parameters it does not own; the search form never
 * adopted it. Hidden inputs are the native-GET equivalent, and they mirror that
 * builder exactly: comma-joined lists, and size omitted when it is the default.
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
  size,
  tone = "dark",
  placeholder = "Search name, role, tag, or text inside resumes & pilot apps",
  className = ""
}: {
  /** Shown in the box, so a search you ran is still visible after it runs. */
  defaultQuery?: string;
  /** Carried through untouched, so searching cannot drop a filter. */
  tags?: string[];
  departments?: string[];
  size?: number;
  /** "dark" sits on the navy header band; "light" on a white panel. */
  tone?: "dark" | "light";
  placeholder?: string;
  className?: string;
}) {
  const dark = tone === "dark";

  return (
    <form action="/candidates" method="get" className={`flex w-full gap-2 ${className}`}>
      {/* Comma-joined into ONE param each, matching parseListParam. Rendered only
          when set, so an empty filter does not put ?tags= in the URL. */}
      {tags.length > 0 && <input type="hidden" name="tags" value={tags.join(",")} />}
      {departments.length > 0 && <input type="hidden" name="depts" value={departments.join(",")} />}
      {size && size !== CANDIDATE_LIST_LIMIT && <input type="hidden" name="size" value={String(size)} />}

      <div className="relative min-w-0 flex-1">
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
      <button
        type="submit"
        className={
          dark
            ? "rounded border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
            : "rounded border border-brand-lea/15 px-3 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-gold hover:bg-brand-gold/10 hover:text-brand-lea hover:shadow-glow dark:border-white/10 dark:text-slate-300 dark:hover:bg-brand-gold/15 dark:hover:text-slate-100"
        }
      >
        Search
      </button>
    </form>
  );
}
