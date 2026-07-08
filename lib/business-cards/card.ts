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
