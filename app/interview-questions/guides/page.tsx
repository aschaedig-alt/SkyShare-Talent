import Link from "next/link";
import { ClipboardList, Plus, Pencil } from "lucide-react";
import { getSavedGuides, getUnlinkedGuides } from "@/lib/data/interview-guides";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { InterviewTabs } from "@/components/interview-questions/InterviewTabs";
import { formatDateShort } from "@/lib/calendar/format";
import { DEPARTMENT_LABELS } from "@/lib/calendar/departments";

export const dynamic = "force-dynamic";

/**
 * The guides you KEEP, not every interview (Aimee, Nov 16 2026: "i can do as
 * many as 5 interviews a day. i dont think they all need to show up under
 * saved"). A guide used in an interview lives on that interview.
 */
export default async function SavedGuidesPage() {
  const access = await requireModulePageAccess("interview-questions");
  const [saved, unlinked] = await Promise.all([getSavedGuides(), getUnlinkedGuides(access.viewer)]);

  const rowCls = "block rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 transition hover:shadow-glow dark:bg-brand-panel dark:ring-white/10";

  return (
    <div className="space-y-5 px-4 py-5 sm:px-5 lg:px-8">
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview &amp; evaluation</p>
        <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-semibold text-white sm:text-3xl">
          <ClipboardList className="h-7 w-7 shrink-0" /> Saved guides
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-white/75">
          The question sets you keep. Open one to edit it or use it for an interview, or add one from the interview itself.
          A guide used in an interview shows on that interview.
        </p>
      </section>

      <InterviewTabs active="saved" />

      {saved.length === 0 ? (
        <section className="rounded bg-white px-4 py-12 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="text-base font-semibold text-brand-lea dark:text-slate-100">No saved guides yet</p>
          <Link href="/interview-questions/guide" className="mt-3 inline-flex items-center gap-1.5 rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:shadow-glow">
            <Plus className="h-4 w-4" /> Build a guide
          </Link>
        </section>
      ) : (
        <ul className="space-y-2">
          {saved.map((g) => (
            <li key={g.id}>
              <Link href={`/interview-questions/guides/${g.id}`} className={rowCls}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold text-brand-lea dark:text-slate-100">{g.title}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-grey dark:text-slate-400">
                    <Pencil className="h-3.5 w-3.5" /> Edit or use
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                  {g.items.length} question{g.items.length === 1 ? "" : "s"}
                  {g.departmentKey ? ` · ${DEPARTMENT_LABELS[g.departmentKey as keyof typeof DEPARTMENT_LABELS] ?? g.departmentKey}` : ""}
                  {` · updated ${formatDateShort(g.updatedAt)}`}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Used guides that are on no interview would otherwise be reachable from
          nowhere, so they are listed here until they are linked. */}
      {unlinked.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-brand-sweet">
            Used, but not on an interview · {unlinked.length}
          </h2>
          <ul className="space-y-2">
            {unlinked.map((g) => (
              <li key={g.id}>
                <Link href={`/interview-questions/guides/${g.id}`} className={rowCls}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-semibold text-brand-lea dark:text-slate-100">{g.title}</span>
                    <span className="shrink-0 text-xs text-brand-grey dark:text-slate-400">
                      {g.answered} of {g.items.length} answered · updated {formatDateShort(g.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                    {g.candidate ? g.candidate.displayName : "No candidate linked"} · open it to link the interview
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
