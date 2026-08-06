import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CandidateViewTabs } from "@/components/candidates/CandidateViewTabs";
import { SavedViewWorkspace } from "@/components/candidates/SavedViewWorkspace";
import { getCandidateView } from "@/lib/data/candidate-views";
import { getCandidatesByIds } from "@/lib/data/candidates";
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

  const members = await getCandidatesByIds(view.candidateIds);

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

      <SavedViewWorkspace
        viewId={view.id}
        name={view.name}
        note={view.note}
        createdByEmail={view.createdByEmail}
        members={members}
        missingCount={view.candidateIds.length - members.length}
        canEdit={isAdminOrRecruiter(access.role)}
      />
    </div>
  );
}
