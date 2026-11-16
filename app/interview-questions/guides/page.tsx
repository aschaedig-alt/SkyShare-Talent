import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { getRecentGuides } from "@/lib/data/interview-guides";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { InterviewTabs } from "@/components/interview-questions/InterviewTabs";
import { formatDateShort, formatDateTimeWithZone } from "@/lib/calendar/format";

export const dynamic = "force-dynamic";

export default async function SavedGuidesPage() {
  const access = await requireModulePageAccess("interview-questions");
  const guides = await getRecentGuides(access.viewer);

  return (
    <div className="space-y-5 px-4 py-5 sm:px-5 lg:px-8">
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview &amp; evaluation</p>
        <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-semibold text-white sm:text-3xl">
          <ClipboardList className="h-7 w-7 shrink-0" /> Saved guides
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-white/75">Every guide saved for an interview, newest first. Open one to type answers or rate the core values.</p>
      </section>

      <InterviewTabs active="saved" />

      {guides.length === 0 ? (
        <section className="rounded bg-white px-4 py-12 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-base font-semibold text-brand-lea dark:text-slate-100">No saved guides yet</p>
          <Link href="/interview-questions/guide" className="mt-3 inline-flex items-center gap-1.5 rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:shadow-glow">
            <Plus className="h-4 w-4" /> Build a guide
          </Link>
        </section>
      ) : (
        <ul className="space-y-2">
          {guides.map((g) => (
            <li key={g.id}>
              <Link
                href={`/interview-questions/guides/${g.id}`}
                className="block rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 transition hover:shadow-glow dark:bg-brand-panel dark:ring-white/10"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold text-brand-lea dark:text-slate-100">{g.title}</span>
                  <span className="shrink-0 text-xs text-brand-grey dark:text-slate-400">
                    {g.answered} of {g.items.length} answered · updated {formatDateShort(g.updatedAt)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                  {g.candidate ? g.candidate.displayName : "No candidate linked"}
                  {g.interview ? ` · ${formatDateTimeWithZone(g.interview.startDateTime, g.interview.timezone)}` : " · no interview linked"}
                  {g.interviewer ? ` · ${g.interviewer}` : ""}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
