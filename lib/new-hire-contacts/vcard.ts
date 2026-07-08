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

export type VcardContact = {
  fullName: string;
  org?: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
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
  lines.push(`ORG:${esc(contact.org ?? VCARD_ORG)}`);

  const title = clean(contact.title);
  if (title) lines.push(`TITLE:${esc(title)}`);

  const phone = clean(contact.phone);
  if (phone) lines.push(`TEL;TYPE=CELL,VOICE:${phone}`);

  const email = clean(contact.email);
  if (email) lines.push(`EMAIL;TYPE=INTERNET:${email}`);

  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/** A .vcf file body for one or many contacts. */
export function buildVcardFile(contacts: VcardContact[]): string {
  return contacts.map(buildVcard).join("\r\n") + "\r\n";
}
