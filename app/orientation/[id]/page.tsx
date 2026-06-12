import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getSessionDetail } from "@/lib/data/orientation";
import { OrientationSessionDetail } from "@/components/orientation/OrientationSessionDetail";

export const dynamic = "force-dynamic";

export default async function OrientationSessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulePageAccess("people");
  const { id } = await params;
  const session = await getSessionDetail(id);
  if (!session) {
    notFound();
  }
  return <OrientationSessionDetail session={session} />;
}
