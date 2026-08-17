import Link from "next/link";
import {
  Users,
  UserCheck,
  FileText,
  Send,
  CalendarClock,
  Archive,
  ArrowRight
} from "lucide-react";
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
import { EditableGrid, type GridItem } from "@/components/shared/EditableGrid";
import type { WidgetInstance } from "@/lib/data/page-layout";

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
  savedLayout?: GridItem[] | null;
  savedWidgets?: WidgetInstance[] | null;
  // Set when the user arrived here via "Start from a candidate" on New hires, so
  // the list carries the intent instead of dropping them onto an anonymous page.
  onboardingIntent?: boolean;
};

// Default arrangement of the resizable boxes (stats row + records table).
const CANDIDATES_DEFAULT_LAYOUT: GridItem[] = [
  { i: "stats", x: 0, y: 0, w: 12, h: 4 },
  { i: "records", x: 0, y: 4, w: 12, h: 26 }
];

type StatConfig = {
  key: keyof CandidateListData["stats"];
  label: string;
  icon: typeof Users;
  accent: string; // background tint + text for the icon chip
};

// "Total candidates" used to count every record ever imported, so the page
// announced 3,213 above a list of 45 and read as though candidates had gone
// missing. Every tile now counts what this page actually shows; the historical
// import is its own clearly-labelled tile.
const statConfig: StatConfig[] = [
  { key: "total", label: "Candidates here", icon: Users, accent: "bg-brand-lea/10 text-brand-lea dark:text-slate-100" },
  { key: "active", label: "Active", icon: UserCheck, accent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { key: "withFiles", label: "With files", icon: FileText, accent: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  { key: "withApplications", label: "With applications", icon: Send, accent: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
  { key: "scheduledInterviews", label: "Scheduled interviews", icon: CalendarClock, accent: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300" },
  { key: "archived", label: "In historical archive", icon: Archive, accent: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300" }
];

export function CandidatesWorkspace({
  data,
  query,
  tagOptions = [],
  activeTags = [],
  activeDepartments = [],
  canEdit = false,
  savedLayout = null,
  savedWidgets = null,
  onboardingIntent = false
}: CandidatesWorkspaceProps) {
  const statsPanel = (
    <section className="grid h-full content-start gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
      {statConfig.map(({ key, label, icon: Icon, accent }) => (
        <div key={key} className="flex items-center gap-3 rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 transition hover:ring-brand-gold/40 dark:bg-brand-panel dark:ring-white/10">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded ${accent}`}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-xl font-semibold leading-none text-brand-lea dark:text-slate-100">{data.stats[key]}</div>
            <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">{label}</div>
          </div>
        </div>
      ))}
      {/* Sits in the stat row but reads as a DOOR, not a number — navy fill
          instead of the white card, no count, an arrow instead of a value. The
          other tiles say what IS; this one says where to go. A real Link since
          it loads a different page. */}
      <Link
        href="/candidates/recent-interviews"
        className="flex items-center gap-3 rounded bg-brand-lea p-4 shadow-panel ring-1 ring-brand-lea transition hover:bg-brand-eden hover:shadow-glow"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-white/15 text-brand-gold">
          <CalendarClock className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight text-white">Recent interviews</div>
          <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
            Who you&apos;re working on <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </Link>
      {/* Make the archive reachable from the number, so "where did the rest go"
          has an answer on screen rather than needing to be asked. */}
      {data.stats.archived > 0 && (
        <p className="col-span-full -mt-1 text-[11px] text-brand-grey dark:text-slate-400">
          The working list holds your live candidates. {data.stats.archived.toLocaleString()} older records from the
          JazzHR import live in the{" "}
          <Link href="/archive" className="font-semibold text-brand-lea underline hover:text-brand-gold dark:text-slate-100">
            historical archive
          </Link>{" "}
          — and searching here finds them too.
        </p>
      )}
    </section>
  );

  const recordsPanel = (
    <section className="flex h-full flex-col overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
        <div>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Candidate records</h2>
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
      <SelectableCandidateTable candidates={data.candidates} query={query} canEdit={canEdit} />
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

      <EditableGrid
        pageKey="candidates"
        canEdit={canEdit}
        savedLayout={savedLayout}
        savedWidgets={savedWidgets}
        defaultLayout={CANDIDATES_DEFAULT_LAYOUT}
        panels={[
          { id: "stats", title: "Statistics", node: statsPanel },
          { id: "records", title: "Candidate records", node: recordsPanel }
        ]}
      />
    </div>
  );
}
