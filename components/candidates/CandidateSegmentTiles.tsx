import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import {
  ACROSS_LABEL,
  ACROSS_ORDER,
  BUCKET_LABEL,
  BUCKET_ORDER,
  BUCKET_STAGE,
  type CandidateAcross,
  type CandidateBucket,
  type RailStage
} from "@/lib/candidates/buckets";

type CandidateSegmentTilesProps = {
  /** Exact counts across the whole population in scope, not just this page. */
  counts: Record<CandidateBucket, number>;
  /** Counts for the cross-cutting filters. These do not sum with the buckets. */
  acrossCounts: Record<CandidateAcross, number>;
  active: CandidateBucket | null;
  activeAcross: CandidateAcross | null;
  /** Current query string, so picking a segment keeps the search and filters. */
  searchParams: Record<string, string | undefined>;
};

const STAGE_VAR: Record<RailStage, string> = {
  working: "var(--stage-working)",
  decided: "var(--stage-decided)",
  archive: "var(--stage-archive)",
  across: "var(--stage-across)",
  manage: "var(--stage-manage)"
};

/**
 * The candidate segments, as the page's top row of counts.
 *
 * THIS REPLACED THE STAT-TILE STRIP RATHER THAN SITTING UNDER IT. The page used
 * to carry a row of statistics AND a row of segments, both showing counts of the
 * same people, which is most of why the top felt crowded. One row now does both
 * jobs: the numbers you were reading anyway are the thing you click.
 *
 * Deliberately compact. It lives in the EditableGrid slot the statistics strip
 * used, which is a FIXED pixel height, and a saved layout from before this
 * change still carries the old height — so the tiles and the row under them have
 * to fit in roughly 148px or they would spill over whatever sits below. A fixed
 * slot is legitimate here because this content does not grow with the data:
 * there are always seven segments.
 *
 * Every segment is a REAL LINK: picking one changes the whole screen and gives a
 * URL you can send to somebody, so it has to be ctrl/right-clickable.
 */
export function CandidateSegmentTiles({
  counts,
  acrossCounts,
  active,
  activeAcross,
  searchParams
}: CandidateSegmentTilesProps) {
  // Everyone = the working list: every bucket EXCEPT the archive. Summed from
  // the segments rather than taken from the page total, because that total is
  // narrowed by whichever segment is selected — a number that changes to match
  // the thing beside it is not a total.
  const workingTotal = BUCKET_ORDER.filter((b) => b !== "historical").reduce(
    (sum, b) => sum + (counts[b] ?? 0),
    0
  );

  function href(next: { bucket?: CandidateBucket | null; across?: CandidateAcross | null }) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v && k !== "bucket" && k !== "across") params.set(k, v);
    }
    const bucket = next.bucket !== undefined ? next.bucket : active;
    const across = next.across !== undefined ? next.across : activeAcross;
    if (bucket) params.set("bucket", bucket);
    if (across) params.set("across", across);
    const qs = params.toString();
    return qs ? `/candidates?${qs}` : "/candidates";
  }

  function Tile({ bucket }: { bucket: CandidateBucket | null }) {
    const selected = bucket === active;
    const label = bucket ? BUCKET_LABEL[bucket] : "Everyone";
    const count = bucket ? counts[bucket] : workingTotal;
    const color = bucket ? STAGE_VAR[BUCKET_STAGE[bucket]] : "var(--skyshare-lea)";

    return (
      <Link
        href={href({ bucket })}
        aria-current={selected ? "page" : undefined}
        title={
          bucket
            ? undefined
            : "The working list: Active, Offered, Talent pool, Hired and Not selected. The historical archive is counted separately."
        }
        className={`rounded border p-3 shadow-panel transition hover:shadow-glow ${
          selected
            ? "border-brand-lea bg-brand-lea"
            : "border-brand-lea/10 bg-white dark:border-white/10 dark:bg-brand-panel"
        }`}
        style={{ borderLeft: `3px solid ${selected ? "#eaaa00" : color}` }}
      >
        <div
          className={`text-lg font-semibold leading-none tabular-nums ${
            selected ? "text-white" : "text-brand-lea dark:text-slate-100"
          }`}
        >
          {count.toLocaleString()}
        </div>
        <div
          className={`mt-1 truncate text-[11px] font-semibold uppercase tracking-wide ${
            selected ? "text-brand-sweet" : "text-brand-grey dark:text-slate-400"
          }`}
        >
          {label}
        </div>
      </Link>
    );
  }

  return (
    <section className="grid h-full content-start gap-2.5">
      <div className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(112px,1fr))]">
        <Tile bucket={null} />
        {BUCKET_ORDER.map((b) => (
          <Tile key={b} bucket={b} />
        ))}
      </div>

      {/* A DIFFERENT AXIS, kept visually lighter than the tiles so it does not
          read as more segments. These cut across all seven and STACK with
          whichever tile is selected, so they toggle rather than replace. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-brand-lea/10 pt-2.5 dark:border-white/10">
        <span className="text-[10px] font-bold uppercase tracking-widest text-brand-grey dark:text-slate-400">
          Across all
        </span>
        {ACROSS_ORDER.map((key) => {
          const on = activeAcross === key;
          return (
            <Link
              key={key}
              href={href({ across: on ? null : key })}
              aria-pressed={on}
              title={
                on
                  ? `Stop narrowing to ${ACROSS_LABEL[key].toLowerCase()}`
                  : `Narrow to ${ACROSS_LABEL[key].toLowerCase()} — keeps the segment you are on`
              }
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition ${
                on
                  ? "border-brand-lea bg-brand-lea text-white"
                  : "border-brand-lea/15 bg-white text-brand-lea hover:shadow-glow dark:border-white/15 dark:bg-brand-panel dark:text-slate-100"
              }`}
              style={{ boxShadow: on ? undefined : `inset 3px 0 0 ${STAGE_VAR.across}` }}
            >
              {ACROSS_LABEL[key]}
              <span className={`tabular-nums ${on ? "text-brand-sweet" : "text-brand-grey dark:text-slate-400"}`}>
                {(acrossCounts[key] ?? 0).toLocaleString()}
              </span>
            </Link>
          );
        })}

        <span className="flex-1" />

        {/* Kept from the strip this replaced: a DOOR, not a count. */}
        <Link
          href="/candidates/recent-interviews"
          className="inline-flex items-center gap-1.5 rounded border border-brand-lea/15 bg-white px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/15 dark:bg-brand-panel dark:text-slate-100"
        >
          Recent interviews <ArrowRight className="h-3 w-3" />
        </Link>
        <Link
          href="/candidates/manage"
          title="Rename, merge and tidy the tags and disposition reasons"
          className="inline-flex items-center gap-1.5 rounded border border-dashed border-brand-lea/25 px-2.5 py-1 text-xs font-semibold text-brand-eden transition hover:shadow-glow dark:border-white/25 dark:text-brand-edenOnDark"
        >
          <SlidersHorizontal className="h-3 w-3" /> Manage tags &amp; reasons
        </Link>
      </div>
    </section>
  );
}
