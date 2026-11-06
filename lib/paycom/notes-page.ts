/**
 * Reading a Paycom APPLICATION page — the pure half, no database.
 *
 * WHY. Paycom has no integration SkyShare can use, and interview notes are written in
 * Paycom. The only signal that leaves Paycom is the "You've Been Mentioned" email, and it
 * carries no note text — just "Application: <Name> (<Application ID>) ... Mentioned By:
 * <NAME>". So the scheduled Paycom notes scan opens the application in his signed-in
 * Chrome (Claude in Chrome), clicks its Notes tab, and saves the page's text. This turns
 * that text into notes and the applicant's details.
 *
 * WHAT THE TEXT LOOKS LIKE (captured 2026-11-06 from application 395768):
 *
 *   RC
 *   Raymond Cardenas (395768)
 *   Email Address
 *   Pilot.RayCardenas@gmail.com
 *   Application Phone
 *   +1 (702) 335-0247
 *   ...
 *   Challenger 350 First Officer ($130k) - UT
 *   History
 *   ...
 *   Application Started On
 *   10/12/2026
 *   ...
 *   Add Note
 *   AA
 *   ALEXANDER ANDRADE added a note - 11/6/2026 | 10:38 AM
 *   Alex Notes
 *   Ray comes off as very professional ...
 *   AS                      <- a person the note @-mentions: initials, then the name.
 *   Aimee Schaedig             Not part of the note, so it is dropped.
 *   HM
 *   Harry Mitchel added a note - 10/30/2026 | 3:18 PM
 *   ...
 *   Terms of Use | Privacy Policy | ...
 *
 * Times are MOUNTAIN: the 10:38 AM note above is the same minute the mention email
 * arrived (17:38 UTC on a standard-time day).
 */

export type PaycomNote = {
  /** As Paycom prints it: "ALEXANDER ANDRADE", "Harry Mitchel". */
  author: string;
  /** "11/6/2026 | 10:38 AM", kept so a person can find it in Paycom. */
  stamp: string;
  /** The moment, Mountain time resolved to UTC. */
  at: Date;
  title: string;
  /** Paragraphs in order, blank lines removed. */
  lines: string[];
  /** Paycom's "Private" marker: the author limited who can read it. */
  private: boolean;
  /** The interest level Paycom shows on the note ("Highly Interested"), when it has one. */
  interest: string | null;
};

/** Paycom's five interest levels — the same words as the star picker on the record. */
const INTEREST = /^(Not Interested|Slightly Interested|Want to Know More|Interested|Highly Interested)$/;

export type PaycomApplicationPage = {
  applicationId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** The posting title in the page header: "Challenger 350 First Officer ($130k) - UT". */
  jobTitle: string | null;
  /** YYYY-MM-DD from "Application Started On". */
  appliedOn: string | null;
  notes: PaycomNote[];
  /** True when what was saved is Paycom's login page, not an application. */
  signedOut: boolean;
};

const NOTE_HEADER = /^(.+?) added a note - (\d{1,2})\/(\d{1,2})\/(\d{4}) \| (\d{1,2}):(\d{2}) ([AP]M)$/;
const INITIALS = /^[A-Z]{1,3}$/;
const FOOTER = /^Terms of Use\b/;

/** The UTC instant of a Mountain-time wall clock reading, DST included. */
export function mountainToUtc(y: number, m: number, d: number, hour: number, minute: number): Date {
  // Guess with MST, then correct by whatever offset Denver actually had at that instant.
  const guess = new Date(Date.UTC(y, m - 1, d, hour + 7, minute));
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", timeZoneName: "shortOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-6" | "GMT-7"
  const offset = Number(name?.replace("GMT", "") || "-7");
  return new Date(Date.UTC(y, m - 1, d, hour - offset, minute));
}

function valueAfter(lines: string[], label: string): string | null {
  const i = lines.indexOf(label);
  const v = i === -1 ? null : lines[i + 1]?.trim();
  return v && !/^not provided$|^no profile url$/i.test(v) ? v : null;
}

export function looksSignedOut(text: string): boolean {
  return /CLIENT LOG IN|Client Code\s*\*?\s*\n|cl-login\.php/i.test(text) && !/added a note|Application Information|Add Note/.test(text);
}

export function parseApplicationPage(text: string): PaycomApplicationPage {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/​/g, "").trim())
    .filter(Boolean);

  const nameLine = lines.find((l) => /^.+ \(\d{4,8}\)$/.test(l) && !/^Application:/.test(l)) ?? null;
  const nameMatch = nameLine?.match(/^(.+) \((\d{4,8})\)$/);
  const historyAt = lines.indexOf("History");
  const started = valueAfter(lines, "Application Started On")?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  const notes: PaycomNote[] = [];
  const addNoteAt = lines.indexOf("Add Note");
  let current: PaycomNote | null = null;
  for (let i = addNoteAt === -1 ? 0 : addNoteAt + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (FOOTER.test(line)) break;
    const header = line.match(NOTE_HEADER);
    if (header) {
      if (current) notes.push(current);
      const [, author, mo, da, yr, hh, mi, ap] = header;
      const hour = (Number(hh) % 12) + (ap === "PM" ? 12 : 0);
      current = {
        author: author.trim(),
        stamp: `${mo}/${da}/${yr} | ${hh}:${mi} ${ap}`,
        at: mountainToUtc(Number(yr), Number(mo), Number(da), hour, Number(mi)),
        title: "",
        lines: [],
        private: false,
        interest: null
      };
      // Markers Paycom prints between the header and the title, each at most once: a
      // private note shows "Private", and a note can carry an interest level. Seen
      // 2026-11-06 on 397816: "Private / Highly Interested / Private / Please reach out
      // to this guy" — the second "Private" is the TITLE its author typed.
      if (lines[i + 1] === "Private") {
        current.private = true;
        i += 1;
      }
      if (INTEREST.test(lines[i + 1] ?? "")) {
        current.interest = lines[i + 1];
        i += 1;
      }
      if (lines[i + 1] && !NOTE_HEADER.test(lines[i + 1]) && !FOOTER.test(lines[i + 1])) {
        current.title = lines[i + 1];
        i += 1;
      }
      continue;
    }
    if (!current) continue;
    // An avatar chip: initials on their own line, followed by the next note's header (the
    // author's avatar) or a mentioned person's name — neither is note text. It counts as a
    // chip ONLY when the letters are that name's initials: a note line that is just "PIC"
    // or "SIC" must survive.
    if (INITIALS.test(line)) {
      const next = lines[i + 1] ?? "";
      const words = next.replace(/ added a note - .*$/, "").split(/\s+/).filter(Boolean);
      const initials = words.length ? `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ""}`.toUpperCase() : "";
      if (initials && line === initials) {
        if (!NOTE_HEADER.test(next)) i += 1;
        continue;
      }
    }
    current.lines.push(line);
  }
  if (current) notes.push(current);

  return {
    applicationId: nameMatch?.[2] ?? null,
    name: nameMatch?.[1]?.trim() ?? null,
    email: valueAfter(lines, "Email Address"),
    phone: valueAfter(lines, "Application Phone"),
    jobTitle: historyAt > 0 ? lines[historyAt - 1] : null,
    appliedOn: started ? `${started[3]}-${started[1].padStart(2, "0")}-${started[2].padStart(2, "0")}` : null,
    notes,
    signedOut: looksSignedOut(text)
  };
}
