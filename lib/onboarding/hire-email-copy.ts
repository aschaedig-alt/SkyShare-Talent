// Formats new-hire info for pasting into an email.
//
// The checklist grid is transposed — each person is a COLUMN — so selecting cells
// in the browser and copying gives you a task row read left-to-right across every
// hire, which is the wrong shape entirely. What actually gets pasted into the email
// is one person's details read top to bottom. This builds that.
//
// The field list and its order are the user's own paste template; don't reorder or
// pad it out without asking.

export type HireInfo = {
  name: string;
  startDate: string | null;
  phone: string | null;
  ssEmail: string | null;
  personalEmail: string | null;
  position: string | null;
  department: string | null;
};

const NONE = "—";

function fmtDate(iso: string | null) {
  // Full date with the year: the grid can get away with "Jul 13" because the
  // column header gives context, an email pasted to another team cannot.
  return iso
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
        new Date(iso)
      )
    : NONE;
}

function fields(h: HireInfo): Array<[string, string]> {
  return [
    ["Name", h.name || NONE],
    ["Start Date", fmtDate(h.startDate)],
    ["Phone", h.phone || NONE],
    ["SkyShare Email", h.ssEmail || NONE],
    ["Personal Email", h.personalEmail || NONE],
    ["Position", h.position || NONE],
    ["Department", h.department || NONE]
  ];
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain-text fallback: one labelled line per field, a blank line between people. */
export function buildHireInfoText(hires: HireInfo[]): string {
  return hires.map((h) => fields(h).map(([label, value]) => `${label}: ${value}`).join("\n")).join("\n\n");
}

/**
 * Rich version for the clipboard. Deliberately plain — inline styles only, no
 * table, no brand colors — because it lands inside an email the user is still
 * writing and should inherit that message's own formatting rather than fight it.
 * Bold labels are the one bit of structure worth keeping.
 */
export function buildHireInfoHtml(hires: HireInfo[]): string {
  const blocks = hires.map((h) => {
    const lines = fields(h)
      .map(([label, value]) => `<strong>${label}:</strong> ${escapeHtml(value)}`)
      .join("<br>");
    return `<p style="margin:0 0 12px">${lines}</p>`;
  });
  return `<div>${blocks.join("")}</div>`;
}
