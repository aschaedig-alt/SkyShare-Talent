import { headers } from "next/headers";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getNewHireContactsConfig } from "@/lib/new-hire-contacts/config.server";
import { ensureShareToken, buildShareUrl } from "@/lib/new-hire-contacts/share-link";
import { getContactCandidates } from "@/lib/data/new-hire-contacts";
import { NewHireContactsAdmin } from "@/components/new-hire-contacts/NewHireContactsAdmin";

export const dynamic = "force-dynamic";

export default async function NewHireContactsSettingsPage() {
  await requireModulePageAccess("settings");

  // The curated ids are read first so the picker pool can pin them: someone who
  // has left is still shown (badged) rather than collapsing to "Unknown employee".
  const config = await getNewHireContactsConfig();
  const curatedIds = Array.from(new Set(config.groups.flatMap((g) => g.members.map((m) => m.personId))));

  // ensureShareToken() generates one on first visit to this screen. It is
  // deliberately only reachable from here (behind settings module access) — the
  // public routes fail closed instead of minting a token for themselves.
  const [candidates, headerList, token] = await Promise.all([
    getContactCandidates(curatedIds),
    headers(),
    ensureShareToken()
  ]);

  const host = headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const shareUrl = buildShareUrl(host ? `${proto}://${host}` : "", token);

  return <NewHireContactsAdmin initialConfig={config} candidates={candidates} shareUrl={shareUrl} />;
}
