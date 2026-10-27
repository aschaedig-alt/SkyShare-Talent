/**
 * Phone numbers are shown ONE way: 111.111.1111.
 *
 * Her rule, feedback cmvpu6z6r (Oct 26): "make sure the candidates phone number
 * always reads ###.###.#### ... remove any dashes or parenthesis and replace
 * them with periods. it should always be in us number format. if its an
 * international number have it show an error. otherwise always 111.111.1111 for
 * candidate and employee phone numbers".
 *
 * This is a DISPLAY rule. Stored values are not rewritten (the database is
 * shared and live, and a format is not worth a mass write); the edit forms
 * format a number as it is typed in, so new entries are stored this way too.
 *
 * Measured through formatPhone on Oct 26 across 3,382 candidates with a phone:
 * 3,201 show as 111.111.1111 and 181 are flagged (177 not a US number, 4 not a
 * full 10-digit number). All 197 new-hire/employee numbers show as 111.111.1111.
 *
 * Not lib/candidates/normalize.ts's normalizePhone: that one feeds duplicate
 * matching and deliberately accepts a bare 10 digits after any "+". Here a
 * leading "+" must be "+1", so "+33 1234567890" is foreign, not a US number.
 */

/**
 * ok: a US number, `text` is 111.111.1111 (plus " x123" for an extension).
 * not ok: `text` is what was stored, untouched so nothing is hidden, and
 * `reason` says why. One flat shape rather than a union: this repo's compiler
 * settings do not narrow a union on `ok`.
 */
export type FormattedPhone = { ok: boolean; text: string; reason?: string };

const EXTENSION = /\s*(?:x|ext\.?|extension)\s*(\d{1,6})\s*$/i;

export function formatPhone(raw: string | null | undefined): FormattedPhone | null {
  const value = raw?.trim();
  if (!value) return null;

  const ext = value.match(EXTENSION);
  const main = ext ? value.slice(0, ext.index) : value;
  let digits = main.replace(/\D/g, "");

  if (main.startsWith("+") || main.startsWith("011")) {
    // An explicit country code: only +1 is a US number.
    if (!(digits.length === 11 && digits.startsWith("1"))) {
      return { ok: false, text: value, reason: "Not a US number" };
    }
  }
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) {
    return { ok: false, text: value, reason: digits.length > 10 ? "Not a US number" : "Not a full 10-digit number" };
  }

  const text = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return { ok: true, text: ext ? `${text} x${ext[1]}` : text };
}

/** Plain-string form for places that only render text (CSV cells, joined lines). */
export function phoneText(raw: string | null | undefined): string | null {
  return formatPhone(raw)?.text ?? null;
}

/**
 * What an edit form should keep once the box loses focus: the formatted number
 * when it is a US one, otherwise exactly what was typed, so a foreign number
 * can still be recorded and is flagged rather than refused.
 */
export function formatPhoneInput(raw: string): string {
  const f = formatPhone(raw);
  return f && f.ok ? f.text : raw;
}
