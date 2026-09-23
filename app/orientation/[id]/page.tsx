import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getSessionDetail } from "@/lib/data/orientation";
import { getUsedOrientationPlaces } from "@/lib/orientation/places-used";
import { OrientationSessionDetail } from "@/components/orientation/OrientationSessionDetail";

export const dynamic = "force-dynamic";

export default async function OrientationSessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulePageAccess("people");
  const { id } = await params;
  // In parallel: the places list is only for the time-and-place picker and does
  // not depend on the session.
  const [session, usedPlaces] = await Promise.all([getSessionDetail(id), getUsedOrientationPlaces()]);
  if (!session) {
    notFound();
  }
  return <OrientationSessionDetail session={session} usedPlaces={usedPlaces} />;
}
