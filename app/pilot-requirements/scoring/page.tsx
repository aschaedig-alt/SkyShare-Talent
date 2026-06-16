import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getScoringSetupData } from "@/lib/data/scoring-setup";
import { ScoringSetupForm } from "@/components/pilot-requirements/ScoringSetupForm";

export default async function ScoringSetupPage() {
  await requireModulePageAccess("pilot-requirements");
  const data = await getScoringSetupData();

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <Link
          href="/pilot-requirements"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-eden transition hover:text-brand-lea"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to pilot requirements
        </Link>
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Candidate fit</p>
        <h1 className="text-2xl font-semibold text-brand-lea">Scoring setup</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey">
          Tune how candidates are scored per aircraft and seat. This is decision support for triage — it never rejects
          anyone, and it never uses age, name, gender or location. Changes are saved per position and apply to the
          suggested-candidate panel.
        </p>
      </section>

      <ScoringSetupForm data={data} />
    </div>
  );
}
