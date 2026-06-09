import { ImportsWorkspace } from "@/components/imports/ImportsWorkspace";
import { getImportsData } from "@/lib/data/imports";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  await requireModulePageAccess("imports");
  const data = await getImportsData();

  return <ImportsWorkspace data={data} />;
}
