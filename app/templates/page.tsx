import { TemplateTokensPanel } from "@/components/template-tokens/TemplateTokensPanel";
import { requireModulePageAccess } from "@/lib/data/module-access";

export default async function TemplatesPage() {
  await requireModulePageAccess("templates");
  return (
    <div className="px-5 py-5 lg:px-8">
      <div className="mb-5 rounded bg-brand-lea px-6 py-5 text-white shadow-panel">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-sweet">
          Templates
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Locked template overview</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
          Template editing is locked for controlled rollout. Admin permissions can unlock these tokens without changing job content.
        </p>
      </div>
      <div className="max-w-2xl">
        <TemplateTokensPanel />
      </div>
    </div>
  );
}
