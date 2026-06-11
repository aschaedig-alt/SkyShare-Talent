import { TemplateTokensPanel } from "@/components/template-tokens/TemplateTokensPanel";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function SettingsTemplatesPage() {
  await requireModulePageAccess("settings");

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin foundation</p>
        <h1 className="text-2xl font-semibold text-brand-lea">Templates</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey">
          Brand template &amp; design tokens. These are locked reference values used across job posts.
        </p>
      </section>

      <div className="max-w-2xl">
        <TemplateTokensPanel />
      </div>
    </div>
  );
}
