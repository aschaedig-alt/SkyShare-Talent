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

// ---------------------------------------------------------------------------
// One person's own card-order history.
//
// Deliberately scoped to a single hire: a roster-wide table of everyone's orders
// belongs on the Business cards page, not on somebody's profile. Most new hires
// have none — cards are ordered once, near orientation. This earns its place
// later, when an employee changes title or fleet and gets a second set.
// ---------------------------------------------------------------------------

export type CardOrderView = {
  id: string;
  /** Null for legacy sheet rows that never carried a date; the label says so. */
  orderedOn: string | null;
  orderedLabel: string | null;
  /** Received belongs to the ORDER — the box arrives once for the whole batch. */
  receivedOn: string | null;
  receivedLabel: string | null;
  cardTier: string | null;
  source: string;
  /** How many people were on that order, so a batch reads as a batch. */
  peopleOnOrder: number;
};

export async function getCardOrdersForHire(newHireId: string): Promise<CardOrderView[]> {
  const lines = await prisma.businessCardOrderLine.findMany({
    where: { newHireId },
    select: {
      order: {
        select: {
          id: true,
          orderedOn: true,
          orderedLabel: true,
          receivedOn: true,
          receivedLabel: true,
          cardTier: true,
          source: true,
          _count: { select: { lines: true } }
        }
      }
    }
  });

  return lines
    .map(({ order: o }) => ({
      id: o.id,
      orderedOn: iso(o.orderedOn),
      orderedLabel: o.orderedLabel,
      receivedOn: iso(o.receivedOn),
      receivedLabel: o.receivedLabel,
      cardTier: o.cardTier,
      source: o.source,
      peopleOnOrder: o._count.lines
    }))
    // Newest first. Undated rows sort last rather than being dropped — an order
    // with no date on it still happened.
    .sort((a, b) => {
      if (a.orderedOn && b.orderedOn) return b.orderedOn.localeCompare(a.orderedOn);
      if (a.orderedOn) return -1;
      if (b.orderedOn) return 1;
      return 0;
    });
}
