/**
 * The parts of one person's contact card that can be left off it.
 *
 * For adding to a contact that is ALREADY on the phone: iPhone's "Add to
 * Existing Contact" appends every line on the card even when the same number
 * or address is already there, in any format, so the only way to add just
 * what is new is to send just what is new (Aimee, feedback Nov 21 2026 — her
 * screen recording shows the phone and both emails doubled up). The name
 * always comes; it is how the phone knows whose card it is.
 *
 * Used by the Make contact picker (which builds ?only=...) and the vcard route
 * (which reads it), so the two cannot disagree on the names.
 */
export const VCARD_PARTS = ["phone", "work", "home", "title", "location"] as const;
export type VcardPart = (typeof VCARD_PARTS)[number];

export const VCARD_PART_LABEL: Record<VcardPart, string> = {
  phone: "Mobile",
  work: "SkyShare email",
  home: "Personal email",
  title: "Job title and department",
  location: "Work location"
};

/** ?only=a,b — unknown names are ignored; nothing valid means the whole card. */
export function parseVcardParts(raw: string | null | undefined): Set<VcardPart> {
  const picked = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is VcardPart => (VCARD_PARTS as readonly string[]).includes(s));
  return new Set(picked.length ? picked : VCARD_PARTS);
}
