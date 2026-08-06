/**
 * Reading a person out of a resume file: name, email, phone.
 *
 * This lived inline in app/api/resume-intake/route.ts. It moved here so that a
 * DRY RUN can predict exactly what the real upload will do. A pre-flight that
 * reimplements these regexes is worse than no pre-flight at all: it reports a
 * clean run and then the route parses something different.
 *
 * Every rule below is here because it went wrong on real files. Read the
 * comments before "simplifying" any of them.
 */
import { normalizeEmail, normalizePhone } from "@/lib/candidates/normalize";

export function parseEmail(text: string): string | null {
  const m = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? normalizeEmail(m[0]) : null;
}

export function parsePhone(text: string): string | null {
  const m = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  return m ? normalizePhone(m[0]) : null;
}

const NAME_LINE = /^[A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+){1,2}$/;
const NOT_A_NAME = /(resume|curriculum|vitae|cv|profile|summary|objective|experience|references|contact)/i;

/**
 * The name at the head of a line that then runs on into prose.
 *
 * The lookahead also accepts an ALL-CAPS word, because a common layout is the
 * name followed straight into a section heading — "Yaakov Nissenbaum EDUCATION
 * VOLUNTEER FLIGHT PROFILE". NOT_A_NAME still guards the captured part, so a
 * line that BEGINS with a heading ("FLIGHT EXPERIENCE KILEY LYNCH...") is
 * rejected rather than read as a person called Flight Experience.
 */
const NAME_HEAD = /^([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,2})\s+(?=[A-Z][a-z]|[A-Z]{3,}|\d|\()/;

/**
 * Words that open resume prose and are capitalised, so they look like a surname
 * to any pattern. "Matthew Johnson Active Certified Flight Instructor..." would
 * otherwise be filed under the surname "Active".
 */
const PROSE_OPENERS =
  /^(active|experienced|certified|commercial|airline|professional|dedicated|motivated|highly|seeking|results|accomplished|skilled|current|total|flight|pilot|captain|first|senior|licensed|qualified|safety)$/i;

/**
 * Section headings that follow the name directly on the same line. Allowing an
 * ALL-CAPS word after the name (so "Yaakov Nissenbaum EDUCATION" is found at
 * all) means the heading itself must be trimmed back off, or it becomes the
 * surname — which is worse than not matching.
 */
const SECTION_HEADINGS =
  /^(education|experience|employment|skills?|certifications?|qualifications?|objective|summary|profile|training|licenses?|ratings?|volunteer|awards?|references?|contact|military|aviation|career|highlights?)$/i;

/** Trim trailing prose words and section headings, never below two tokens. */
function trimProse(name: string): string {
  const parts = name.split(/\s+/);
  while (
    parts.length > 2 &&
    (PROSE_OPENERS.test(parts[parts.length - 1]) || SECTION_HEADINGS.test(parts[parts.length - 1]))
  ) {
    parts.pop();
  }
  return parts.join(" ");
}

export function looksLikePdf(mimeType: string | null, filename: string): boolean {
  return (mimeType ?? "").includes("pdf") || filename.toLowerCase().endsWith(".pdf");
}

/**
 * Do two readings of a name refer to the same person? Used to decide whether the
 * PDF header name is trustworthy enough to override the filename. Any shared
 * word of three or more letters counts — enough to tell "Adam Kavis Rolph" from
 * "Adam Rolph" (same person, richer) apart from "Human Managment Office Chief"
 * against "ANTONIO PRIETO" (a job title that happened to be set large).
 */
export function sharesAName(a: string, b: string): boolean {
  const words = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 3)
    );
  const left = words(a);
  return [...words(b)].some((word) => left.has(word));
}

export function nameFromText(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 8);
  for (const line of lines) {
    if (NAME_LINE.test(line) && !NOT_A_NAME.test(line)) return line;
  }
  // A resume whose header is not on its own line: "Matthew Johnson Active
  // Certified Flight Instructor with a strong focus on safety...". The strict
  // whole-line test above cannot match that, and every Paycom import fell
  // through to the filename because of it.
  for (const line of lines) {
    const head = NAME_HEAD.exec(line);
    if (head && !NOT_A_NAME.test(head[1])) {
      const trimmed = trimProse(head[1]);
      if (trimmed.split(/\s+/).length >= 2) return trimmed;
    }
  }
  return null;
}

/**
 * A filename is the LAST resort for a name, and the shapes that arrive here are
 * hostile. A Paycom export sends "(334021)-Haydn Paffi Resume.docx (1) (1).pdf.pdf":
 * a person-id prefix, duplicate markers, and a doubled extension. Stripping only
 * the final extension left a stray "pdf" that became somebody's surname, and the
 * id prefix became their first name — 11 candidates imported as "(333909) pdf".
 */
export function nameFromFilename(filename: string): string {
  return filename
    .replace(/^\(\d{4,8}\)[-_\s]*/, "")            // Paycom person-id prefix
    .replace(/(\.[A-Za-z0-9]{2,5})+$/, "")         // ".pdf.pdf", ".docx (1).pdf"
    .replace(/\(\d+\)/g, " ")                      // "(1)" duplicate markers
    .replace(/'s\b/gi, "")                         // "Jared Davis's Resume"
    .replace(/[_\-.]+/g, " ")
    .replace(/\b(resume|resumé|cv|curriculum vitae|application|app|pilot|final|current|updated|copy|new|pdf|docx?)\b/gi, " ")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi, " ")
    .replace(/\(\s*\)/g, " ")                      // parens emptied by the above
    .replace(/\d+/g, " ")                          // any leftover digits
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reject a "name" that is really a fragment of a filename. Without this the
 * import happily stores "(333909) pdf" as a person and it looks like real data.
 */
export function looksLikeAName(value: string): boolean {
  const v = value.trim();
  if (v.length < 3) return false;
  if (/^\(?\d+\)?$/.test(v)) return false;                       // bare id
  if (/\d{3,}/.test(v)) return false;                            // any long number
  if (/^(pdf|docx?|resume|cv|file|document|scan)$/i.test(v)) return false;
  return /[A-Za-z]{2,}/.test(v);
}

/**
 * Pick the best raw name from the three readings of a file.
 *
 * Typography beats prose. extractFileText collapses all whitespace, so the
 * line-based readers are really scanning one enormous line and routinely fuse
 * the name to whatever follows it ("Aadan Kenck PO Box"). The PDF header name
 * instead takes the largest text at the top of page 1, which is where a resume
 * always puts the name.
 *
 * It is used to CONFIRM or ENRICH, never to overrule on its own: measured over
 * 45 real resumes it agreed with the stored name 24 times, improved on it 6
 * times (middle names the filename could not know), returned nothing 14 times,
 * and was wrong once — a resume that sets a job title larger than the person's
 * name. Requiring it to share a word with the filename keeps that one out.
 */
export function resolveRawName(input: {
  fromHeader: string | null;
  fromText: string | null;
  fromFile: string | null;
}): string {
  const { fromHeader, fromText, fromFile } = input;
  const corroborated =
    fromHeader && looksLikeAName(fromHeader) && fromFile && sharesAName(fromHeader, fromFile)
      ? fromHeader
      : null;
  return corroborated ?? [fromFile, fromHeader, fromText].find((n) => n && looksLikeAName(n)) ?? "";
}
