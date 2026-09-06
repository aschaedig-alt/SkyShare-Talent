import Link from "next/link";
import { UserCheck } from "lucide-react";
import type { CandidateListData, CandidateTagOption } from "@/lib/data/candidates";
import { SelectableCandidateTable } from "@/components/candidates/SelectableCandidateTable";
import { CandidateTagFilter } from "@/components/candidates/CandidateTagFilter";
import { CandidateDepartmentFilter } from "@/components/candidates/CandidateDepartmentFilter";
import { CandidatePageSize } from "@/components/candidates/CandidatePageSize";
import { NewCandidateButton } from "@/components/candidates/NewCandidateButton";
import { ResumeIntake } from "@/components/candidates/ResumeIntake";
import { DocumentIntake } from "@/components/candidates/DocumentIntake";
import { CandidateViewTabs } from "@/components/candidates/CandidateViewTabs";
import { CandidateSearchBox } from "@/components/candidates/CandidateSearchBox";
import { CandidateSegmentTiles } from "@/components/candidates/CandidateSegmentTiles";
import { BUCKET_LABEL, type CandidateAcross, type CandidateBucket } from "@/lib/candidates/buckets";
import type { CandidateStage } from "@/lib/candidates/stages";

type CandidatesWorkspaceProps = {
  data: CandidateListData;
  query: string;
  /** Every tag that exists, most-used-on-live-people first. */
  tagOptions?: CandidateTagOption[];
  /** Tags currently narrowing the list, from ?tags= in the URL. */
  activeTags?: string[];
  /** Departments currently narrowing the list, from ?depts= in the URL. */
  activeDepartments?: string[];
  canEdit?: boolean;
  // Set when the user arrived here via "Start from a candidate" on New hires, so
  // the list carries the intent instead of dropping them onto an anonymous page.
  onboardingIntent?: boolean;
  /** Segment currently selected in the bar, from ?bucket= in the URL. */
  activeBucket?: CandidateBucket | null;
  /** Cross-cutting filter from ?across= in the URL. */
  activeAcross?: CandidateAcross | null;
  /** The live stage vocabulary, edited at /candidates/manage. */
  stageList?: CandidateStage[];
};

// NO EDITABLE GRID ON THIS PAGE.
//
// It carried the statistics strip, which the segment tiles replaced; asked to
// drop "Edit layout" as well, since there is nothing on this page worth
// rearranging. Checked before removing rather than assumed: the saved
// page-layout row for "candidates" held widgets: [] and two stale entries
// ("stats", "records") naming panels that no longer exist, so nothing a person
// had arranged was lost. The row is left in the database untouched — it is
// harmless, and deleting live data to tidy up is not worth it.


export function CandidatesWorkspace({
  data,
  query,
  tagOptions = [],
  activeTags = [],
  activeDepartments = [],
  canEdit = false,
  onboardingIntent = false,
  activeBucket = null,
  activeAcross = null,
  stageList
}: CandidatesWorkspaceProps) {
  // Everything the segment bar must carry through when you switch segment, so a
  // search and its filters survive the click instead of silently resetting.
  const segmentParams: Record<string, string | undefined> = {
    q: query || undefined,
    tags: activeTags.length ? activeTags.join(",") : undefined,
    depts: activeDepartments.length ? activeDepartments.join(",") : undefined,
    size: data.listLimit !== 100 ? String(data.listLimit) : undefined,
    // Carried so the two axes survive each other: switching segment keeps the
    // cross-cutting filter, and toggling that keeps the segment. The bar strips
    // whichever key it is rewriting.
    bucket: activeBucket ?? undefined,
    across: activeAcross ?? undefined
  };
  // WAS the statistics strip. The segments ARE the counts now, so one row does
  // both jobs instead of two rows showing counts of the same people.
  //
  // In ordinary page flow, NOT a fixed slot. It briefly sat in the grid panel
  // the strip had used and inherited its 148px, which fit at full width and
  // overflowed by 18px at 1100px and below, where the filter row under the tiles
  // wraps — spilling silently over whatever sat beneath.
  const segmentTiles = (
    <CandidateSegmentTiles
      counts={data.bucketCounts}
      acrossCounts={data.acrossCounts}
      active={activeBucket ?? null}
      activeAcross={activeAcross ?? null}
      searchParams={segmentParams}
    />
  );

  // The archive pointer moved out of the stat strip and under the segments —
  // "where did the rest go" still has an answer on screen.
  const archiveNote = data.stats.archived > 0 && (
    <p className="text-[11px] text-brand-grey dark:text-slate-400">
      The working list holds your live candidates. {data.stats.archived.toLocaleString()} older records from the
      JazzHR import live in the{" "}
      <Link href="/archive" className="font-semibold text-brand-lea underline hover:text-brand-gold dark:text-slate-100">
        historical archive
      </Link>{" "}
      — and searching here finds them too.
    </p>
  );

  const recordsPanel = (
    // No h-full and no overflow: this panel is in ordinary page flow now, so it
    // grows to its rows and the PAGE scrolls. Dropping overflow-hidden also stops
    // the filter popovers in the header being clipped by their own card.
    <section className="flex flex-col rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
        <div>
          {/* Names the SEGMENT when one is picked. A heading that stayed
              "Candidate records" while the rail said Talent pool leaves the
              count looking wrong rather than filtered. */}
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">
            {activeBucket ? BUCKET_LABEL[activeBucket] : "Candidate records"}
          </h2>
          {/* Say plainly when the list is a subset. "Showing up to 100" left you
              to work out whether 45 meant "that is all of them" or "the rest are
              hidden" — which is the confusion that made this look like data loss. */}
          <p className="text-xs text-brand-grey dark:text-slate-400">
            {data.matchingTotal > data.candidates.length
              ? `Showing the first ${data.candidates.length} of ${data.matchingTotal.toLocaleString()}${query ? ` matching "${query}"` : ""} — search to narrow it down.`
              : `Showing all ${data.candidates.length}${query ? ` matching "${query}"` : ""}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CandidatePageSize size={data.listLimit} query={query} tags={activeTags} departments={activeDepartments} />
          <CandidateDepartmentFilter
            active={activeDepartments}
            query={query}
            tags={activeTags}
            size={data.listLimit}
          />
          <CandidateTagFilter
            options={tagOptions}
            active={activeTags}
            query={query}
            departments={activeDepartments}
            size={data.listLimit}
          />
          <span className="rounded bg-brand-cloudDancer/70 px-3 py-1 text-xs font-semibold text-brand-lea dark:bg-white/5 dark:text-slate-100">
            {data.candidates.length} shown
          </span>
        </div>
      </div>
      <SelectableCandidateTable candidates={data.candidates} query={query} canEdit={canEdit} stageList={stageList} />
    </section>
  );

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Candidate operations</p>
            <h1 className="mt-0.5 text-2xl font-semibold text-white">Candidates</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/75">
              Search and manage candidates — including the text inside their resumes and pilot apps.
            </p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-2 xl:w-[560px]">
            <div className="flex flex-wrap justify-end gap-2">
              <ResumeIntake variant="solid" />
              <DocumentIntake variant="solid" />
              <NewCandidateButton />
            </div>
            {/* Was an inline form with a lone q input, which meant a search wiped
                whatever tag / department / size filter was in the URL. The shared
                component carries them as hidden inputs, and is the same box the
                candidate profile now renders. */}
            <CandidateSearchBox
              defaultQuery={query}
              tags={activeTags}
              departments={activeDepartments}
              size={data.listLimit}
              tone="dark"
            />
          </div>
        </div>
      </section>

      {onboardingIntent && (
        <div className="flex items-start gap-3 rounded border border-brand-gold/40 bg-brand-sweet/15 px-4 py-3 dark:bg-brand-gold/10">
          <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-eden dark:text-brand-sweet" />
          <p className="text-sm text-brand-lea dark:text-slate-100">
            <span className="font-semibold">Onboarding someone?</span> Find and open their candidate below, then use <span className="font-semibold">Move to onboarding</span> on their profile. Not in the list yet? Add them with <span className="font-semibold">New candidate</span>.
          </p>
        </div>
      )}

      <CandidateViewTabs active="list" />

      {/* The segments are in ORDINARY PAGE FLOW, not a grid slot.
          They were briefly the grid's panel, inheriting the statistics strip's
          fixed 148px. That fit at full width and overflowed by 18px at 1100px
          and below, where the row of filters under the tiles wraps — spilling
          silently over whatever sat beneath it, which is the exact failure the
          calendar hit. A saved layout still carries the old height, so raising
          the default would not have fixed it for anyone who has arranged this
          page. Out of the grid it simply grows to its content.
          The grid stays for WIDGETS, which are independent of panels — "Edit
          layout" and anything already added still work. */}
      {segmentTiles}
      {archiveNote}


      {recordsPanel}
    </div>
  );
}
