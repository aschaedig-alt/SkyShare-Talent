import { CandidateComparison } from "@/components/candidates/CandidateComparison";
import { CandidateViewTabs } from "@/components/candidates/CandidateViewTabs";
import { getCandidateComparisonData } from "@/lib/data/candidates";
import { requireModulePageAccess } from "@/lib/data/module-access";

export default async function CandidateComparePage() {
  await requireModulePageAccess("candidates");
  const data = await getCandidateComparisonData();

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      {/* Header */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Candidate operations</p>
        <h1 className="mt-0.5 text-3xl font-semibold text-white">Compare candidates</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/75">
          Compare flight time, type ratings, and certificates across everyone in one sortable table. Click a column to
          sort; filter by rating or certificate; export the current view to CSV.
        </p>
      </section>

      <CandidateViewTabs active="compare" />

      <CandidateComparison data={data} />
    </div>
  );
}
