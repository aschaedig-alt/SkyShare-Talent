// vCard (.vcf) generation for the New Hire Contacts hand-off.
//
// Format choice: vCard 3.0 — the version iOS is happiest importing, and widely
// supported on Android. One .vcf can hold many contacts (multiple VCARD blocks),
// which is what powers the "Add all" / "Add selected" buttons. Per RFC 6350 the
// line ending is CRLF.
//
// Design notes:
//   - ORG is always "SkyShare" so contacts land looking professional.
//   - A blank phone/email simply omits that line (never emit an empty TEL/EMAIL).
//   - Text values (FN/N/ORG/TITLE) are escaped for the four special chars vCard
//     reserves; phone/email are sanitized rather than escaped.
//
// ORG and ADR are STRUCTURED values: their components are separated by a RAW
// semicolon, and each component is escaped on its own. That is why department
// and work location are their own fields rather than something a caller can
// smuggle in as "SkyShare;Flight Ops" — esc() would escape that semicolon and
// the phone would show one org literally named "SkyShare;Flight Ops".

export type VcardContact = {
  fullName: string;
  org?: string;
  /** Department — the second ORG unit, e.g. ORG:SkyShare;Flight Ops. */
  department?: string | null;
  title?: string | null;
  phone?: string | null;
  /**
   * A single, untyped email. Use this when a record has only one address; it
   * emits exactly what it always has (EMAIL;TYPE=INTERNET).
   */
  email?: string | null;
  /** Company address, emitted as EMAIL;TYPE=INTERNET,WORK. */
  workEmail?: string | null;
  /** Personal address, emitted as EMAIL;TYPE=INTERNET,HOME. */
  homeEmail?: string | null;
  /** Home base / job location (e.g. "SLC", "Home-Based") — the WORK ADR locality. */
  workLocation?: string | null;
};

export const VCARD_ORG = "SkyShare";

// Escape the characters vCard treats as structural inside a text value.
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// Split a display name into structured N (Family;Given;;;). For single-token or
// org-style names ("SkyShare Recruiting") we keep the whole thing as the given
// name and leave family blank — FN carries the human-readable value regardless.
function structuredName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return `;${esc(fullName.trim())};;;`;
  const family = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(" ");
  return `${esc(family)};${esc(given)};;;`;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** One VCARD block (no trailing newline). */
export function buildVcard(contact: VcardContact): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];
  const name = clean(contact.fullName) || "SkyShare Contact";
  lines.push(`N:${structuredName(name)}`);
  lines.push(`FN:${esc(name)}`);
  // ORG's second component is the department. Each unit is escaped separately
  // and joined with a raw ";" — see the structured-value note at the top.
  const org = esc(contact.org ?? VCARD_ORG);
  const department = clean(contact.department);
  lines.push(department ? `ORG:${org};${esc(department)}` : `ORG:${org}`);

  const title = clean(contact.title);
  if (title) lines.push(`TITLE:${esc(title)}`);

  const phone = clean(contact.phone);
  if (phone) lines.push(`TEL;TYPE=CELL,VOICE:${phone}`);

  // Emails, in the order a phone should offer them. A record that carries both
  // a company and a personal address emits both, typed, and marks the first PREF
  // so the contact app knows which to reach for. The same address arriving in
  // two fields is written once — a duplicated EMAIL line shows up as a duplicate
  // row on the contact card.
  //
  // A caller passing only `email` gets the identical single untyped line it
  // always did (no PREF, since there is nothing to prefer it over).
  const emails: { value: string; type: string }[] = [];
  const seenEmails = new Set<string>();
  const addEmail = (value: string | null | undefined, type: string) => {
    const v = clean(value);
    if (!v || seenEmails.has(v.toLowerCase())) return;
    seenEmails.add(v.toLowerCase());
    emails.push({ value: v, type });
  };
  addEmail(contact.email, "INTERNET");
  addEmail(contact.workEmail, "INTERNET,WORK");
  addEmail(contact.homeEmail, "INTERNET,HOME");
  for (const [i, entry] of emails.entries()) {
    const pref = i === 0 && emails.length > 1 ? ",PREF" : "";
    lines.push(`EMAIL;TYPE=${entry.type}${pref}:${entry.value}`);
  }

  // ADR is PO box;extended;street;locality;region;postal code;country. What we
  // hold is a base code, not a mailing address, so it goes in the LOCALITY slot
  // — the line a phone renders as the city — and the other six stay empty rather
  // than inventing a street. Deliberate tradeoff: tapping it will not map to
  // anything useful, but "SLC" under Work reads correctly on the card.
  const workLocation = clean(contact.workLocation);
  if (workLocation) lines.push(`ADR;TYPE=WORK:;;;${esc(workLocation)};;;`);

  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/** A .vcf file body for one or many contacts. */
export function buildVcardFile(contacts: VcardContact[]): string {
  return contacts.map(buildVcard).join("\r\n") + "\r\n";
}
