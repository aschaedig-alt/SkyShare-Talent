/**
 * The typo pass for Paycom notes copied into the app — fixes spelling, never wording.
 *
 * His request, 2026-11-06: "if you're copying the notes word for word and there's a typo,
 * can you fix that without messing up my notes?" — then: account for name spellings like
 * "Aimee, Devon, Cory" and capitalisations like "SkyShare", and "I'll need to let you know
 * when I see a name spelled wrong."
 *
 * HOW IT WORKS. Whoever reads the note (the scan, or a person) PROPOSES corrections as
 * word pairs: { from: "recehck", to: "recheck" }. This file decides which ones are safe and
 * refuses the rest, so a bad proposal can only ever leave a note as Paycom wrote it:
 *   - ONE word becomes ONE word, a small edit apart (an apostrophe, a swapped or missing
 *     letter: at most 2 edits, and never more than a third of the word).
 *   - Nothing with a digit or a dollar sign ("2450", "$130k", "U42") is touched.
 *   - Nothing written in capitals is touched ("PIC", "SIC", "PRD", "TLDR", "AMEL").
 *   - A name or brand on the PROTECTED list is never changed — and a word may be changed
 *     INTO a protected spelling only when that is its exact protected form ("Skyshare"
 *     -> "SkyShare" yes; "Aimee" -> "Amy" never).
 *   - Every person in the employee directory and the candidate's own name are protected
 *     automatically, so new names need no code.
 * NAME_FIXES is where his reports go ("you spelled X wrong"): those are applied on every
 * note without anyone proposing them.
 *
 * Every applied change is returned so it can be recorded and reversed. Paycom itself is
 * never edited.
 */

/** Exact spellings, kept exactly. Add a word here the day a correction gets it wrong. */
export const PROTECTED_SPELLINGS = [
  "SkyShare",
  "Aimee",
  "Devon",
  "Cory",
  "Paycom",
  "Journey",
  "NetJets",
  "Vista",
  "Calendly",
  "LinkedIn",
  "Climbto350",
  "JSfirm",
  "BizJetJobs",
  "Pilatus",
  "Gulfstream",
  "Citation",
  "Challenger",
  "Phenom",
  "Praetor",
  "Beechjet",
  "Hawker",
  "Falcon",
  "Embraer",
  "Bombardier",
  "Cessna",
  "Evergreen"
] as const;

/**
 * Misspellings he has reported, wrong -> right. Applied to every note automatically.
 * Add one per report, with the date: e.g. "Aimme": "Aimee", // reported 2026-11-..
 */
export const NAME_FIXES: Record<string, string> = {};

export type Correction = { from: string; to: string };
export type CorrectionOutcome = Correction & { applied: boolean; why?: string; count?: number };

/** Edit distance with adjacent swaps counted as one edit (Damerau, restricted). */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const WORD = /^[A-Za-z][A-Za-z'’-]*$/;
const key = (w: string) => w.toLowerCase().replace(/['’]/g, "");

/** Is this correction safe? Null when it is, otherwise the reason it is refused. */
export function refuseReason(c: Correction, protectedWords: Set<string>): string | null {
  const { from, to } = c;
  if (from === to) return "no change";
  if (!WORD.test(from) || !WORD.test(to)) return "not a single plain word (spaces, digits and symbols are never changed)";
  if (from.length >= 2 && from === from.toUpperCase()) return "written in capitals — an abbreviation or deliberate";
  // Protected spellings: never changed, and only ever corrected INTO their exact form.
  const protectedExact = [...protectedWords];
  if (protectedExact.includes(from)) return `"${from}" is a protected spelling`;
  const target = protectedExact.find((p) => key(p) === key(to));
  if (target && target !== to) return `"${to}" is not the protected spelling "${target}"`;
  const sameLetters = key(from) === key(to); // capitalisation or an apostrophe only
  // Turning a word INTO a name with different letters ("Devin" -> "Devon") could make one
  // person into another. Only his reports (NAME_FIXES) do that.
  if (target && !sameLetters) return `changing a word into the name "${target}" is only done from a name he reported`;
  const fromProtectedLike = protectedExact.find((p) => key(p) === key(from));
  if (fromProtectedLike && to !== fromProtectedLike) return `"${from}" is a form of the protected "${fromProtectedLike}"`;
  if (!sameLetters && !target) {
    const distance = editDistance(from.toLowerCase(), to.toLowerCase());
    if (distance > 2 || distance > Math.ceil(from.length / 3)) return "more than a small spelling change";
    // A capitalised word mid-sentence is usually a name; leave names to the protected list.
    if (/^[A-Z]/.test(from) && /^[A-Z]/.test(to) && from.slice(1) !== from.slice(1).toLowerCase()) return "mixed capitals — treated as a name";
  }
  return null;
}

function replaceWord(text: string, from: string, to: string): { text: string; count: number } {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let count = 0;
  const out = text.replace(new RegExp(`(?<![A-Za-z'’-])${escaped}(?![A-Za-z'’-])`, "g"), () => {
    count += 1;
    return to;
  });
  return { text: out, count };
}

/** The protected set for one note: the fixed list, everyone in the directory, and the candidate. */
export function protectedSet(extraNames: Array<string | null | undefined>): Set<string> {
  const words = new Set<string>(PROTECTED_SPELLINGS);
  for (const fix of Object.values(NAME_FIXES)) words.add(fix);
  for (const name of extraNames) {
    for (const w of (name ?? "").split(/[\s,()]+/)) if (WORD.test(w) && w.length > 1 && w !== w.toUpperCase()) words.add(w);
  }
  return words;
}

/**
 * Apply the safe corrections to a note's lines (plain text, one paragraph per line).
 * NAME_FIXES always apply; proposed ones only when refuseReason() lets them through.
 */
export function correctLines(lines: string[], proposed: Correction[], protectedWords: Set<string>) {
  const outcomes: CorrectionOutcome[] = [];
  let out = [...lines];
  const all: Array<Correction & { reported?: boolean }> = [
    ...Object.entries(NAME_FIXES).map(([from, to]) => ({ from, to, reported: true })),
    ...proposed
  ];
  for (const c of all) {
    const why = c.reported ? null : refuseReason(c, protectedWords);
    if (why) {
      outcomes.push({ ...c, applied: false, why });
      continue;
    }
    let count = 0;
    out = out.map((l) => {
      const r = replaceWord(l, c.from, c.to);
      count += r.count;
      return r.text;
    });
    if (count || !c.reported) outcomes.push({ from: c.from, to: c.to, applied: count > 0, count, ...(count ? {} : { why: "not found in the note" }) });
  }
  return { lines: out, outcomes };
}

/** The same corrections on a stored note's HTML — text between tags only, never markup. */
export function correctHtml(html: string, applied: Correction[]): string {
  return html
    .split(/(<[^>]+>)/)
    .map((part) => (part.startsWith("<") ? part : applied.reduce((t, c) => replaceWord(t, c.from, c.to).text, part)))
    .join("");
}
