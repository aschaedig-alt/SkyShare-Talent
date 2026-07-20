import { prisma } from "@/lib/prisma";
import { buildBusinessCard, buildVariantCard, cardOrderState, type BusinessCard, type CardOrderState } from "@/lib/business-cards/card";

export type BusinessCardRow = {
  key: string; // unique per card (person id, or person:variant)
  personId: string;
  variantId: string | null;
  label: string | null; // null = the primary card; else the variant's label
  department: string | null;
  onboarding: boolean;
  status: string; // per-person order status (NEEDED | ORDERED | RECEIVED | NOT_NEEDED)
  orientationDate: string | null;
  orderState: CardOrderState;
  card: BusinessCard;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Everyone currently on staff, each turned into their primary card plus any
// secondary cards. This is intentionally NOT gated on onboarding stage: you order
// cards for brand-new hires AND reorder for long-tenured employees, and once a hire
// finishes onboarding + check-ins they auto-archive to stage ARCHIVED while staying
// employmentStatus ACTIVE. Gating on stage hid every established employee (147 of
// them). So the gate is employment status only — current staff (ACTIVE), never
// former (TERMINATED), never a fallen-through offer (canceled).
export async function getBusinessCards(): Promise<BusinessCardRow[]> {
  const now = Date.now();
  const people = await prisma.newHire.findMany({
    where: { employmentStatus: "ACTIVE", canceled: false },
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      phone: true,
      ssEmail: true,
      stage: true,
      orientationDate: true,
      businessCardStatus: true,
      businessCardTitle: true,
      businessCardVariants: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true, title: true, skyops: true, mobile: true, email: true, web: true } }
    },
    orderBy: { name: "asc" }
  });

  const rows: BusinessCardRow[] = [];
  for (const p of people) {
    const input = { name: p.name, position: p.position, phone: p.phone, ssEmail: p.ssEmail, cardTitle: p.businessCardTitle };
    const orientationDate = iso(p.orientationDate);
    const orderState = cardOrderState(orientationDate, p.businessCardStatus, now);
    const shared = {
      personId: p.id,
      department: p.department,
      onboarding: p.stage === "ACTIVE",
      status: p.businessCardStatus,
      orientationDate,
      orderState
    };
    rows.push({ key: p.id, variantId: null, label: null, card: buildBusinessCard(input), ...shared });
    for (const v of p.businessCardVariants) {
      rows.push({ key: `${p.id}:${v.id}`, variantId: v.id, label: v.label, card: buildVariantCard(input, v), ...shared });
    }
  }
  return rows;
}
