import { requireModulePageAccess } from "@/lib/data/module-access";
import { getContentBlocks } from "@/lib/data/jobs";
import { BlockManagementWorkspace } from "@/components/settings/BlockManagementWorkspace";

export const dynamic = "force-dynamic";

export default async function ContentBlocksSettingsPage() {
  await requireModulePageAccess("settings");
  const blocks = await getContentBlocks();

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin foundation</p>
        <h1 className="text-2xl font-semibold text-brand-lea">Block management</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey">
          Review where each content block is used, then archive or delete it. Editing block content lives on the
          Content Blocks page; destructive actions live here.
        </p>
      </section>
      <BlockManagementWorkspace blocks={blocks} />
    </div>
  );
}
