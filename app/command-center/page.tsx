import { CommandCenterWorkspace } from "@/components/command-center/CommandCenterWorkspace";
import { getCommandCenterData } from "@/lib/data/command-center";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function CommandCenterPage() {
  await requireModulePageAccess("command-center");
  const data = await getCommandCenterData();

  return <CommandCenterWorkspace data={data} />;
}
