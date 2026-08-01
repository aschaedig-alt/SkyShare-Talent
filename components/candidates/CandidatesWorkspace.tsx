import Link from "next/link";
import {
  Users,
  UserCheck,
  FileText,
  Send,
  CalendarClock,
  Mail,
  Phone,
  StickyNote,
  Search,
  Archive,
  ArrowRight
} from "lucide-react";
import type { CandidateListData, CandidateTagOption } from "@/lib/data/candidates";
import { CandidateStageCell } from "@/components/candidates/CandidateStageCell";
import { CandidateTagCell } from "@/components/candidates/CandidateTagCell";
import { CandidateTagFilter } from "@/components/candidates/CandidateTagFilter";
import { NewCandidateButton } from "@/components/candidates/NewCandidateButton";
import { ResumeIntake } from "@/components/candidates/ResumeIntake";
import { DocumentIntake } from "@/components/candidates/DocumentIntake";
import { CandidateViewTabs } from "@/components/candidates/CandidateViewTabs";
import { EditableGrid, type GridItem } from "@/components/shared/EditableGrid";
import type { WidgetInstance } from "@/lib/data/page-layout";

type CandidatesWorkspaceProps = {
  data: CandidateListData;
  query: string;
  /** Every tag that exists, most-used-on-live-people first. */
  tagOptions?: CandidateTagOption[];
  /** Tags currently narrowing the list, from ?tags= in the URL. */
  activeTags?: string[];
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

/** Wrap occurrences of query in <mark> for highlighted snippets. */
function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-brand-gold/40 px-0.5 text-brand-lea dark:text-slate-100">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Color a stage pill by keyword so the pipeline reads at a glance. */
function stagePill(stage: string | null) {
  const s = (stage ?? "").toLowerCase();
  if (!stage) return "border-brand-lea/15 bg-brand-cloudDancer/60 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400";
  if (s.includes("hire") || s.includes("offer")) return "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (s.includes("interview") || s.includes("screen")) return "border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
  if (s.includes("reject") || s.includes("declin") || s.includes("withdraw")) return "border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400";
  if (s.includes("new") || s.includes("appl") || s.includes("lead")) return "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "border-brand-gold/30 bg-brand-gold/10 text-brand-lea dark:text-slate-100";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function CandidatesWorkspace({
  data,
  query,
  tagOptions = [],
  activeTags = [],
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
          <CandidateTagFilter options={tagOptions} active={activeTags} query={query} />
          <span className="rounded bg-brand-cloudDancer/70 px-3 py-1 text-xs font-semibold text-brand-lea dark:bg-white/5 dark:text-slate-100">
            {data.candidates.length} shown
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {data.candidates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-left text-sm">
              <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.16em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-bold">Candidate</th>
                  <th className="px-4 py-3 font-bold">Stage</th>
                  <th className="px-4 py-3 font-bold">Contact</th>
                  <th className="px-4 py-3 font-bold">Tags</th>
                  <th className="px-4 py-3 font-bold">Activity</th>
                  <th className="px-4 py-3 font-bold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-lea/10 dark:divide-white/10">
                {data.candidates.map((candidate) => (
                  <tr key={candidate.id} className="row-wash align-top">
                    <td className="px-5 py-4">
                      <div className="flex gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-lea/10 text-xs font-bold text-brand-lea dark:text-slate-100">
                          {initials(candidate.displayName) || "—"}
                        </span>
                        <div className="min-w-0">
                          <span className="inline-flex items-center gap-1.5">
                            {/* prefetch={false}: this table renders up to 100
                                rows, and the fresh production logs from the
                                sidebar fix immediately showed the SAME pattern
                                one level down — ~15 simultaneous
                                /candidates/[id] prefetches the instant this
                                page loaded, one for every row in the initial
                                viewport. A candidate profile is a heavier
                                fetch than the list itself (interviews, notes,
                                files, applications, tags, travel), so this was
                                likely contributing to the slowness at least as
                                much as the sidebar was. */}
                            <Link href={`/candidates/${candidate.id}`} prefetch={false} className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100">
                              {candidate.displayName}
                            </Link>
                            {/* Only shown once someone has pasted a real link on the
                                profile — nothing to click here otherwise. */}
                            {candidate.paycomLink && (
                              <a
                                href={candidate.paycomLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open in Paycom"
                                aria-label={`Open ${candidate.displayName} in Paycom`}
                                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-black leading-none text-white transition hover:brightness-110"
                                style={{ backgroundColor: "#2E9E5B" }}
                              >
                                P
                              </a>
                            )}
                          </span>
                          <div className="text-xs text-brand-grey dark:text-slate-400">{candidate.currentTitle ?? "No current role"}</div>
                          {candidate.docMatch && (
                            <div className="mt-1.5 max-w-[380px] rounded border border-brand-lea/10 bg-brand-cloudDancer/50 px-2.5 py-1.5 text-[11px] leading-5 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                              <span className="font-semibold text-brand-lea dark:text-slate-100">{candidate.docMatch.filename}: </span>
                              {highlight(candidate.docMatch.snippet, query)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <CandidateStageCell
                        candidateId={candidate.id}
                        candidateName={candidate.displayName}
                        stage={candidate.stage}
                        pillClass={stagePill(candidate.stage)}
                        canEdit={canEdit}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1 text-xs text-brand-grey dark:text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 shrink-0 text-brand-lea/50" />
                          <span className="min-w-0 truncate">{candidate.primaryEmail ?? "No email"}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 shrink-0 text-brand-lea/50" />
                          <span>{candidate.primaryPhone ?? "No phone"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <CandidateTagCell chips={candidate.tagChips} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-brand-grey dark:text-slate-400">
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300" title="Files">
                          <FileText className="h-3 w-3" /> {candidate.fileCount}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-brand-cloudDancer/70 px-1.5 py-0.5 text-brand-lea dark:bg-white/5 dark:text-slate-100" title="Notes">
                          <StickyNote className="h-3 w-3" /> {candidate.noteCount}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" title="Applications">
                          <Send className="h-3 w-3" /> {candidate.applicationCount}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-brand-grey dark:text-slate-400">{formatDate(candidate.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cloudDancer/70 dark:bg-white/5">
              <Search className="h-5 w-5 text-brand-grey dark:text-slate-400" />
            </div>
            <div className="mt-3 text-base font-semibold text-brand-lea dark:text-slate-100">No candidates found</div>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              Seed data will appear here after the local recruiting seed runs, or clear the search.
            </p>
          </div>
        )}
      </div>
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
            <form className="flex w-full gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey" />
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Search name, role, tag, or text inside resumes & pilot apps"
                  className="w-full rounded border border-white/20 bg-white/95 py-2.5 pl-9 pr-3 text-sm text-brand-black shadow-sm outline-none transition focus:ring-2 focus:ring-brand-gold/50"
                />
              </div>
              <button type="submit" className="rounded border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20">
                Search
              </button>
            </form>
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
