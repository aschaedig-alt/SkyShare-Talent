import { headers } from "next/headers";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getNewHireContactsConfig } from "@/lib/new-hire-contacts/config.server";
import { getContactCandidates } from "@/lib/data/new-hire-contacts";
import { NewHireContactsAdmin } from "@/components/new-hire-contacts/NewHireContactsAdmin";

export const dynamic = "force-dynamic";

export default async function NewHireContactsSettingsPage() {
  await requireModulePageAccess("settings");

  const [config, candidates, headerList] = await Promise.all([
    getNewHireContactsConfig(),
    getContactCandidates(),
    headers()
  ]);

  const host = headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const shareUrl = host ? `${proto}://${host}/welcome` : "/welcome";

  return <NewHireContactsAdmin initialConfig={config} candidates={candidates} shareUrl={shareUrl} />;
}
