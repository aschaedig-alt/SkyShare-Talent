import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getNewHireDetail } from "@/lib/data/onboarding";
import { getTravelTripsForNewHire } from "@/lib/data/travel";
import { NewHireDetailWorkspace } from "@/components/people/NewHireDetailWorkspace";

export const dynamic = "force-dynamic";

export default async function NewHirePage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulePageAccess("people");
  const { id } = await params;
  const hire = await getNewHireDetail(id);
  if (!hire) {
    notFound();
  }
  const travelTrips = await getTravelTripsForNewHire(id);

  return <NewHireDetailWorkspace hire={hire} travelTrips={travelTrips} />;
}
