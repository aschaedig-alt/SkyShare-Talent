// Business card model + the automatic rules that match the SkyShare Business
// Cards order spreadsheet / printer proof.
//
// Card layout (from the printer proof):
//   Name
//   TITLE
//   skyops <#>   mobile <cell>
//   email <@skyshare>   web <site>
//
// The only piece that varies is the "skyops" number:
//   - Pilots & cabin attendants use the shared SkyOps line.
//   - Everyone else uses the main SkyLove number.
// Everything else comes straight off the employee record.

// Per-person order status. Cards are ordered in bulk ahead of orientation, and
// not everyone gets one, so the state machine is:
//   NEEDED (default, will remind) → ORDERED → RECEIVED, or NOT_NEEDED.
export const CARD_STATUSES = ["NEEDED", "ORDERED", "RECEIVED", "NOT_NEEDED"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];
export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  NEEDED: "Needed",
  ORDERED: "Ordered",
  RECEIVED: "Received",
  NOT_NEEDED: "Not needed"
};
export const isCardStatus = (v: unknown): v is CardStatus => CARD_STATUSES.includes(v as CardStatus);

// Order ~2 weeks out; the hard deadline to still arrive in time is ~1 week before.
export const CARD_REMIND_LEAD_DAYS = 14;
export const CARD_ORDER_BY_LEAD_DAYS = 7;
const CARD_DAY = 24 * 60 * 60 * 1000;

export type CardOrderState = {
  orderByISO: string | null; // latest date to place the order (orientation − 1 week)
  daysUntilOrientation: number | null;
  needsAction: boolean; // still NEEDED and orientation is within the reminder window
  overdue: boolean; // still NEEDED and past the order-by deadline
};

// Given a person's orientation date + card status, work out whether an order is
// due (and by when). Only NEEDED people with an upcoming orientation are flagged.
export function cardOrderState(orientationISO: string | null, status: string, now: number): CardOrderState {
  if (!orientationISO) return { orderByISO: null, daysUntilOrientation: null, needsAction: false, overdue: false };
  const orientation = new Date(orientationISO).getTime();
  const orderBy = orientation - CARD_ORDER_BY_LEAD_DAYS * CARD_DAY;
  const daysUntilOrientation = Math.ceil((orientation - now) / CARD_DAY);
  const open = status === "NEEDED";
  // Remind once orientation is within the lead window, until a few days after it.
  const inWindow = orientation <= now + CARD_REMIND_LEAD_DAYS * CARD_DAY && daysUntilOrientation >= -3;
  return {
    orderByISO: new Date(orderBy).toISOString(),
    daysUntilOrientation,
    needsAction: open && inWindow,
    overdue: open && inWindow && now > orderBy
  };
}

export const SKYOPS_NUMBER = "801.516.9189"; // shared SkyOps line — pilots & cabin attendants
export const SKYLOVE_NUMBER = "855.SKY.LOVE"; // main line — everyone else
export const DEFAULT_WEB = "skyshare.com";

export type BusinessCardInput = {
  name: string;
  position: string | null;
  phone: string | null; // personal cell → the card's "mobile"
  ssEmail: string | null; // @skyshare email
};

export type BusinessCard = {
  name: string;
  title: string;
  skyops: string;
  mobile: string;
  email: string;
  web: string;
  isFlightCrew: boolean;
  missing: string[]; // fields the record doesn't have yet (mobile / email)
};

// Pilots (Captain / First Officer / Pilot) and Cabin Attendants get the shared
// SkyOps line; everyone else gets the main SkyLove number.
export function isFlightCrew(position: string | null | undefined): boolean {
  return /\b(captain|first officer|\bfo\b|pilot|cabin attendant)\b/i.test(position ?? "");
}

export function buildBusinessCard(input: BusinessCardInput): BusinessCard {
  const crew = isFlightCrew(input.position);
  const mobile = (input.phone ?? "").trim();
  const email = (input.ssEmail ?? "").trim();
  const missing: string[] = [];
  if (!mobile) missing.push("mobile");
  if (!email) missing.push("email");
  return {
    name: input.name,
    title: (input.position ?? "").trim().toUpperCase(),
    skyops: crew ? SKYOPS_NUMBER : SKYLOVE_NUMBER,
    mobile,
    email,
    web: DEFAULT_WEB,
    isFlightCrew: crew,
    missing
  };
}

export type VariantOverride = {
  label: string;
  title?: string | null;
  skyops?: string | null;
  mobile?: string | null;
  email?: string | null;
  web?: string | null;
};

// A secondary card: start from the person's primary, then apply the overrides.
// Any blank override falls back to the primary/profile value.
export function buildVariantCard(input: BusinessCardInput, variant: VariantOverride): BusinessCard {
  const base = buildBusinessCard(input);
  const title = (variant.title?.trim() || input.position || "").toUpperCase();
  const mobile = variant.mobile?.trim() || base.mobile;
  const email = variant.email?.trim() || base.email;
  const missing: string[] = [];
  if (!mobile) missing.push("mobile");
  if (!email) missing.push("email");
  return {
    name: input.name,
    title,
    skyops: variant.skyops?.trim() || base.skyops,
    mobile,
    email,
    web: variant.web?.trim() || base.web,
    isFlightCrew: base.isFlightCrew,
    missing
  };
}

// One card in the printer's format (what you paste into the order email).
export function formatCardText(c: BusinessCard): string {
  return [c.name, c.title, `skyops ${c.skyops}   mobile ${c.mobile}`, `email ${c.email}   web ${c.web}`].join("\n");
}

// Several cards for one order — blank line between each.
export function formatCardsBatch(cards: BusinessCard[]): string {
  return cards.map(formatCardText).join("\n\n");
}
