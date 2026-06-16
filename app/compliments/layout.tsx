import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { ComplimentsTabs } from "@/components/compliments/ComplimentsTabs";

export const metadata: Metadata = {
  title: "Compliments by SkyShare"
};

export default async function ComplimentsLayout({ children }: { children: React.ReactNode }) {
  // Compliments lives under the People module; reuse its access gate.
  const { role } = await requireModulePageAccess("people");
  const isAdmin = role === "ADMIN";

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">People</p>
          <h1 className="text-2xl font-semibold text-brand-lea">
            Compliments <span className="font-normal text-brand-grey">by SkyShare</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-grey">
            Recognize new hires for living our values, celebrate wins on the company wall, and reward great work.
          </p>
        </div>
        <Link
          href="/compliments/give"
          className="inline-flex items-center gap-1.5 rounded-element bg-brand-lea px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-eden"
        >
          <Plus className="h-4 w-4" />
          Give recognition
        </Link>
      </section>

      <ComplimentsTabs isAdmin={isAdmin} />

      {children}
    </div>
  );
}
