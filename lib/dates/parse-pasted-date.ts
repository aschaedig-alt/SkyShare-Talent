/**
 * Turn a human-written date into the yyyy-mm-dd that <input type="date"> needs.
 *
 * Native date inputs only take input in the browser's own segmented format, so
 * pasting "10/02/2026" — copied out of a spreadsheet, an offer letter, or an
 * email — does nothing at all. Every date in this app arrives that way, which
 * makes it real friction on travel dates, orientation dates and start dates.
 *
 * Deliberately conservative: anything it can't read with confidence returns null
 * and the paste is left alone, rather than guessing a wrong date onto a record.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

/** Two-digit years: 69 and below are 20xx, above are 19xx (the POSIX convention). */
function expandYear(y: number, raw: string): number {
  if (raw.length > 2) return y;
  return y <= 69 ? 2000 + y : 1900 + y;
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  if (y < 1900 || y > 2999) return false;
  // Catches Feb 30 and friends — the Date would roll over to March.
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * @returns "yyyy-mm-dd", or null when the text isn't confidently a date.
 */
export function parsePastedDate(input: string): string | null {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text || text.length > 40) return null;

  // Already ISO (also what a date input itself copies out) — 2026-10-02.
  const isoMatch = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return isRealDate(+y, +m, +d) ? iso(+y, +m, +d) : null;
  }

  // Numeric, US order — 10/02/2026, 10-2-26, 10.02.2026.
  const numeric = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numeric) {
    const [, a, b, rawY] = numeric;
    const y = expandYear(+rawY, rawY);
    // US month-first is the house format (every sheet and offer letter here uses
    // it). Only fall back to day-first when month-first is impossible — "22/07"
    // can only be the 22nd of July.
    if (isRealDate(y, +a, +b)) return iso(y, +a, +b);
    if (isRealDate(y, +b, +a)) return iso(y, +b, +a);
    return null;
  }

  // Month name in front — "Oct 2, 2026", "October 2 2026".
  const monthFirst = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})$/);
  if (monthFirst) {
    const [, name, d, rawY] = monthFirst;
    const m = MONTHS[name.toLowerCase()];
    const y = expandYear(+rawY, rawY);
    if (m && isRealDate(y, m, +d)) return iso(y, m, +d);
    return null;
  }

  // Day first — "2 October 2026", "02-Oct-2026".
  const dayFirst = text.match(/^(\d{1,2})(?:st|nd|rd|th)?[ -]([A-Za-z]{3,9})\.?[ -](\d{2,4})$/);
  if (dayFirst) {
    const [, d, name, rawY] = dayFirst;
    const m = MONTHS[name.toLowerCase()];
    const y = expandYear(+rawY, rawY);
    if (m && isRealDate(y, m, +d)) return iso(y, m, +d);
    return null;
  }

  return null;
}
