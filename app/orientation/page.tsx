import { requireModulePageAccess } from "@/lib/data/module-access";
import { getOrientationSessions } from "@/lib/data/orientation";
import { OrientationOverview } from "@/components/orientation/OrientationOverview";

export const dynamic = "force-dynamic";

export default async function OrientationPage() {
  await requireModulePageAccess("people");
  const sessions = await getOrientationSessions();
  return <OrientationOverview upcoming={sessions.upcoming} past={sessions.past} />;
}
