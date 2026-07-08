import { prisma } from "@/lib/prisma";
import { buildBusinessCard, buildVariantCard, type BusinessCard } from "@/lib/business-cards/card";

export type BusinessCardRow = {
  key: string; // unique per card (person id, or person:variant)
  personId: string;
  variantId: string | null;
  label: string | null; // null = the primary card; else the variant's label
  department: string | null;
  onboarding: boolean;
  card: BusinessCard;
};

// Active staff, each turned into their primary card plus any secondary cards.
export async function getBusinessCards(): Promise<BusinessCardRow[]> {
  const people = await prisma.newHire.findMany({
    where: { stage: { in: ["ACTIVE", "POST_ONBOARD"] }, employmentStatus: "ACTIVE" },
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      phone: true,
      ssEmail: true,
      stage: true,
      businessCardVariants: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, title: true, skyops: true, mobile: true, email: true, web: true } }
    },
    orderBy: { name: "asc" }
  });

  const rows: BusinessCardRow[] = [];
  for (const p of people) {
    const input = { name: p.name, position: p.position, phone: p.phone, ssEmail: p.ssEmail };
    const onboarding = p.stage === "ACTIVE";
    rows.push({ key: p.id, personId: p.id, variantId: null, label: null, department: p.department, onboarding, card: buildBusinessCard(input) });
    for (const v of p.businessCardVariants) {
      rows.push({ key: `${p.id}:${v.id}`, personId: p.id, variantId: v.id, label: v.label, department: p.department, onboarding, card: buildVariantCard(input, v) });
    }
  }
  return rows;
}
