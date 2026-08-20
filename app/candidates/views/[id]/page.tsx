import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { CandidateViewTabs } from "@/components/candidates/CandidateViewTabs";
import { SavedViewWorkspace } from "@/components/candidates/SavedViewWorkspace";
import { getCandidateView } from "@/lib/data/candidate-views";
import { getCandidatesByIds, visibleCandidateIdsFor } from "@/lib/data/candidates";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { isAdminOrRecruiter } from "@/lib/auth/roles";

type Props = { params: Promise<{ id: string }> };

export default async function SavedViewPage({ params }: Props) {
  const access = await requireModulePageAccess("candidates");
  const { id } = await params;
  const view = await getCandidateView(id);

  if (!view) {
    return (
      <div className="space-y-5 px-5 py-5 lg:px-8">
        <CandidateViewTabs active="views" />
        <section className="rounded border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/15">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">That saved view no longer exists.</p>
          <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
            It may have been deleted.{" "}
            <Link href="/candidates/views" className="underline">
              See every saved view
            </Link>
            .
          </p>
        </section>
      </div>
    );
  }

  // Pass the SAVED ids and let the data layer apply the scoping, so the rule
  // stays in one place. Then account for the two ways this list can come back
  // short, separately: ids this viewer's access withholds (the people exist,
  // they may not see them) and ids that no longer resolve at all (deleted or
  // merged). Rolling them into one number has the workspace announce that live
  // candidates were deleted, which is worse than saying nothing.
  //
  // visibleCandidateIdsFor answers that with BOTH narrowing mechanisms, matching
  // what getCandidatesByIds itself filters on. Asking scopeCandidateIds here
  // instead read only the allowlist, so for a department-scoped hiring manager
  // every member outside their department fell through into missingCount and the
  // amber "deleted or merged" panel fired on people who are alive and in play.
  //
  // Together rather than in sequence: neither needs the other's answer, and for
  // a department-scoped viewer each one costs a round trip.
  const [members, visibleIds] = await Promise.all([
    getCandidatesByIds(view.candidateIds, access.viewer),
    visibleCandidateIdsFor(view.candidateIds, access.viewer)
  ]);
  const withheldCount = view.candidateIds.length - visibleIds.length;

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Candidate operations</p>
        <h1 className="mt-0.5 text-3xl font-semibold text-white">{view.name}</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/75">
          A shortlist you picked by hand. Click a name to read them beside the list, and drop anyone who does not
          belong — everything shown is live, so stages and notes stay current.
        </p>
      </section>

      <CandidateViewTabs active="views" />

      <Link
        href="/candidates/views"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All saved views
      </Link>

      {/* Not a warning — nothing is broken — so it is styled as a quiet note
          rather than borrowing the amber "that view is gone" panel above. */}
      {withheldCount > 0 && (
        <section className="flex items-start gap-2 rounded border border-brand-gold/40 bg-brand-cloudDancer/60 px-4 py-3 dark:border-brand-gold/30 dark:bg-brand-gold/10">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-lea dark:text-brand-gold" />
          <p className="text-xs text-brand-grey dark:text-slate-300">
            <span className="font-semibold text-brand-lea dark:text-slate-100">
              Showing {members.length} of {view.candidateIds.length} saved.
            </span>{" "}
            {/* Names the withheld number rather than saying "the rest", which
                would also claim credit for anyone deleted or merged away — the
                panel below counts those, and they are a different problem. */}
            {withheldCount} of them {withheldCount === 1 ? "is" : "are"} outside your candidate access. Ask a recruiter
            if you need to see them.
          </p>
        </section>
      )}

      <SavedViewWorkspace
        viewId={view.id}
        name={view.name}
        note={view.note}
        createdByEmail={view.createdByEmail}
        members={members}
        missingCount={visibleIds.length - members.length}
        canEdit={isAdminOrRecruiter(access.role)}
      />
    </div>
  );
}
