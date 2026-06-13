import { requireModulePageAccess } from "@/lib/data/module-access";
import { SettingsLayoutLab } from "@/components/settings/SettingsLayoutLab";

export const dynamic = "force-dynamic";

export default async function LayoutLabSettingsPage() {
  await requireModulePageAccess("settings");

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin foundation</p>
        <h1 className="text-2xl font-semibold text-brand-lea">Layout Lab</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey">
          A design sandbox with a tab for every page in the app. Each page is seeded with its real boxes — drag, resize,
          lock, hide, and even move a box onto another page to rehearse redesigns and consolidations. Nothing here
          changes the live pages until you ask to bake an arrangement in. Use <span className="font-semibold text-brand-lea">Copy this page</span> to grab a layout.
        </p>
      </section>
      <SettingsLayoutLab />
    </div>
  );
}
