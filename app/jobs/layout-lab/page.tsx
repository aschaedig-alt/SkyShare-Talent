import { requireModulePageAccess } from "@/lib/data/module-access";
import { LayoutLab } from "@/components/job-editor/LayoutLab";

export const dynamic = "force-dynamic";

export default async function LayoutLabPage() {
  await requireModulePageAccess("jobs");
  return <LayoutLab />;
}
