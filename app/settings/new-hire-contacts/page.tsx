import { headers } from "next/headers";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getNewHireContactsConfig } from "@/lib/new-hire-contacts/config.server";
import { getContactCandidates } from "@/lib/data/new-hire-contacts";
import { NewHireContactsAdmin } from "@/components/new-hire-contacts/NewHireContactsAdmin";

export const dynamic = "force-dynamic";

export default async function NewHireContactsSettingsPage() {
  await requireModulePageAccess("settings");

  // The curated ids are read first so the picker pool can pin them: someone who
  // has left is still shown (badged) rather than collapsing to "Unknown employee".
  const config = await getNewHireContactsConfig();
  const curatedIds = Array.from(new Set(config.groups.flatMap((g) => g.members.map((m) => m.personId))));

  const [candidates, headerList] = await Promise.all([getContactCandidates(curatedIds), headers()]);

  const host = headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const shareUrl = host ? `${proto}://${host}/welcome` : "/welcome";

  return <NewHireContactsAdmin initialConfig={config} candidates={candidates} shareUrl={shareUrl} />;
}
