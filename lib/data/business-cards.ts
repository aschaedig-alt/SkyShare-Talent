import { prisma } from "@/lib/prisma";
import { buildBusinessCard, type BusinessCard } from "@/lib/business-cards/card";

export type BusinessCardRow = {
  id: string;
  department: string | null;
  onboarding: boolean; // still in pre-onboarding (a fresh hire likely needing a card)
  card: BusinessCard;
};

// Active staff (onboarding + current), each turned into a printer-ready card.
export async function getBusinessCards(): Promise<BusinessCardRow[]> {
  const people = await prisma.newHire.findMany({
    where: { stage: { in: ["ACTIVE", "POST_ONBOARD"] }, employmentStatus: "ACTIVE" },
    select: { id: true, name: true, position: true, department: true, phone: true, ssEmail: true, stage: true },
    orderBy: { name: "asc" }
  });
  return people.map((p) => ({
    id: p.id,
    department: p.department,
    onboarding: p.stage === "ACTIVE",
    card: buildBusinessCard({ name: p.name, position: p.position, phone: p.phone, ssEmail: p.ssEmail })
  }));
}
