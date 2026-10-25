/**
 * Reading Paycom's applicant export — the pure half, no database and no storage.
 *
 * WHAT ARRIVES. Paycom's "documents" export for a date range gives two zips:
 *
 *   (16856)-ApplicationDocuments.zip   ONE OR MORE bundle PDFs, every applicant's
 *                                      application back to back. Paycom caps a bundle
 *                                      at 100: the October 2026 export of 103 came as
 *                                      "Applications(1-100).pdf" + "Applications(101-103).pdf".
 *   (16856)-ResumeDocuments.zip        one file per application, named
 *                                      "(<Application ID>)-<whatever the person uploaded>.pdf"
 *
 * THE KEY IS THE APPLICATION ID, and it is per APPLICATION, not per person. Proven on
 * that October export: David Linn applied to three jobs and has three resumes under
 * three ids (396927, 396932, 399610), each matching a different application. All 103
 * resume prefixes matched an "Application ID" in the bundles, one to one. So the
 * resume for an application is found by its id, never by name.
 *
 * WHERE ONE APPLICATION ENDS. A new application starts on any page carrying BOTH
 * "Application Information" and "Application ID <digits>"; every other page lacks
 * them. That is exact, not a heuristic — the same rule split the Aug 26 2026 bundle
 * by hand (88 pages, 19 applications) — so page counting is never involved.
 *
 * Text arrives one string per page from unpdf (lib/files/pdf-text.ts uses the same
 * library), which keeps Paycom's two-column rows on one line:
 *   "Name Watkins, Allan Jerome Primary Phone +1 (843) 907-5423 [Cell]"
 *   "Date of Application 10-24-2026 Application ID 400408"
 * That line shape is what the patterns below read.
 *
 * Address, references, salary expectation and the free-text answers are NOT lifted
 * out. They stay inside the PDF, which is filed on the profile. Pay in particular
 * has no field in this app on purpose (Paycom owns compensation).
 */

export type ParsedApplication = {
  applicationId: string;
  /** The posting title exactly as Paycom printed it: "Gulfstream G200 First Officer". */
  jobTitle: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  /** "Watkins, Allan Jerome" — kept for the review screen, never stored as a name. */
  paycomName: string;
  email: string | null;
  phone: string | null;
  /** YYYY-MM-DD, the date Paycom printed. */
  appliedOn: string | null;
  /** The Paycom company the posting sat under: SKYSHARE or CB AVIATION INC. */
  appliedTo: string | null;
  referralSource: string | null;
  referralName: string | null;
  /** Which uploaded bundle, and its pages (0-based, inclusive). */
  bundleIndex: number;
  startPage: number;
  endPage: number;
};

export type BundleProblem = { bundleIndex: number; page: number; message: string };

const START_MARKERS = [/Application Information/, /Application ID\s+\d{4,8}/];

export function isApplicationStartPage(text: string): boolean {
  return START_MARKERS.every((re) => re.test(text));
}

/** Paycom writes "Not Provided" in an empty field. */
function provided(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && !/^not provided$/i.test(v) ? v : null;
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/**
 * Re-case a name word only when Paycom's casing is clearly not the person's:
 * all capitals ("NORBERTO", "rOSADO" is left alone — mixed means somebody chose it)
 * or all lower case ("frederick"). "LeRoy", "McClelland", "De La Fuente" keep theirs.
 */
function fixCase(word: string): string {
  if (SUFFIXES.has(word.replace(/\./g, "").toLowerCase())) return word.toUpperCase().replace(/^(J|S)R$/, (m) => m[0] + "r");
  const letters = word.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return word;
  if (letters === letters.toUpperCase() || letters === letters.toLowerCase()) {
    return word.toLowerCase().replace(/(^|[-'’])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return word;
}

/**
 * "Last, First Middle" -> first / last / display.
 *
 * The WHOLE part before the comma is the surname ("De La Fuente Dufresne, Jorge" is
 * Jorge De La Fuente Dufresne — taking the last word, as a free-text name splitter
 * must, would file him as "Jorge Dufresne"). A trailing generational suffix comes off
 * the surname and stays on the display name, the same rule as splitCandidateName.
 * The first name is the first word after the comma; Paycom gives no way to tell a
 * middle name from a two-word first name, so "Christian frederick Macawili" is
 * Christian. People enter their surname as a middle name too ("Pournik, Ali Pournik"),
 * which this ignores for the same reason.
 */
export function parsePaycomName(raw: string): { firstName: string | null; lastName: string | null; displayName: string } {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const comma = cleaned.indexOf(",");
  if (comma === -1) {
    const words = cleaned.split(" ").filter(Boolean).map(fixCase);
    const firstName = words[0] ?? null;
    const lastName = words.length > 1 ? words[words.length - 1] : null;
    return { firstName, lastName, displayName: words.join(" ") || "Unnamed candidate" };
  }
  const lastWords = cleaned.slice(0, comma).split(" ").filter(Boolean).map(fixCase);
  const firstWords = cleaned.slice(comma + 1).split(" ").filter(Boolean).map(fixCase);
  const suffixes: string[] = [];
  while (lastWords.length > 1 && SUFFIXES.has(lastWords[lastWords.length - 1].replace(/\./g, "").toLowerCase())) {
    suffixes.unshift(lastWords.pop() as string);
  }
  const firstName = firstWords[0] ?? null;
  const lastName = lastWords.join(" ") || null;
  const displayName = [firstName, lastName, ...suffixes].filter(Boolean).join(" ") || "Unnamed candidate";
  return { firstName, lastName, displayName };
}

function line(text: string, re: RegExp): RegExpMatchArray | null {
  for (const l of text.split(/\r?\n/)) {
    const m = l.trim().match(re);
    if (m) return m;
  }
  return null;
}

/** Read the header block of one application's first page. Null fields are left null, never guessed. */
export function parseApplicationHeader(firstPage: string) {
  const title = line(firstPage, /^Application for (.+?) (\d{4,8})$/);
  const name = line(firstPage, /^Name (.+?) Primary Phone (.*)$/) ?? line(firstPage, /^Name (.+)$/);
  const dated = line(firstPage, /^Date of Application (\d{2})-(\d{2})-(\d{4}) Application ID (\d{4,8})/);
  const id = dated?.[4] ?? line(firstPage, /Application ID (\d{4,8})/)?.[1] ?? null;
  const applied = line(firstPage, /^Applied to (.+?) Email Address (\S+)$/);
  const referral = line(firstPage, /^Referral Source (.+?) Referral Name (.+)$/);
  const email = provided(applied?.[2])?.replace(/[.,;]+$/, "") ?? null;
  return {
    applicationId: id,
    jobTitle: title?.[1]?.trim() ?? null,
    titleId: title?.[2] ?? null,
    paycomName: name?.[1]?.trim() ?? null,
    phone: provided(name?.[2]?.replace(/\[[^\]]*\]/g, "").trim()),
    appliedOn: dated ? `${dated[3]}-${dated[1]}-${dated[2]}` : null,
    appliedTo: provided(applied?.[1]),
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    referralSource: provided(referral?.[1]),
    referralName: provided(referral?.[2])
  };
}

/**
 * Cut one bundle's pages into applications. A page before the first start page, or a
 * start page whose header cannot be read, is reported rather than folded into a
 * neighbour — an unreadable header is how one person's pages end up on another
 * person's profile.
 */
export function splitBundle(pages: string[], bundleIndex: number): { applications: ParsedApplication[]; problems: BundleProblem[] } {
  const applications: ParsedApplication[] = [];
  const problems: BundleProblem[] = [];
  const starts = pages.map((p, i) => (isApplicationStartPage(p) ? i : -1)).filter((i) => i !== -1);

  if (!starts.length) {
    problems.push({ bundleIndex, page: 0, message: "No application pages found in this PDF." });
    return { applications, problems };
  }
  if (starts[0] !== 0) {
    problems.push({ bundleIndex, page: 0, message: `Pages 1-${starts[0]} come before the first application and were skipped.` });
  }

  starts.forEach((start, n) => {
    const end = (starts[n + 1] ?? pages.length) - 1;
    const h = parseApplicationHeader(pages[start]);
    if (!h.applicationId || !h.jobTitle || !h.paycomName) {
      problems.push({
        bundleIndex,
        page: start,
        message: `Page ${start + 1}: could not read the ${!h.applicationId ? "Application ID" : !h.jobTitle ? "job title" : "applicant name"}.`
      });
      return;
    }
    if (h.titleId && h.titleId !== h.applicationId) {
      problems.push({ bundleIndex, page: start, message: `Page ${start + 1}: the heading says ${h.titleId} but the form says ${h.applicationId}.` });
      return;
    }
    const name = parsePaycomName(h.paycomName);
    applications.push({
      applicationId: h.applicationId,
      jobTitle: h.jobTitle,
      ...name,
      paycomName: h.paycomName,
      email: h.email,
      phone: h.phone,
      appliedOn: h.appliedOn,
      appliedTo: h.appliedTo,
      referralSource: h.referralSource,
      referralName: h.referralName,
      bundleIndex,
      startPage: start,
      endPage: end
    });
  });
  return { applications, problems };
}

/** "(400408)-PDF Resume 2025.docx.pdf" -> 400408 + the name the person gave it. */
export function parseResumeEntryName(entryName: string): { applicationId: string; originalName: string } | null {
  const base = entryName.split(/[\\/]/).pop() ?? entryName;
  const m = base.match(/^\((\d{4,8})\)-(.+)$/);
  return m ? { applicationId: m[1], originalName: m[2] } : null;
}

/** Midnight Mountain time on that day — how every other Paycom application date is stored. */
export function mountainMidnight(ymd: string): Date {
  const noonUtc = new Date(`${ymd}T12:00:00Z`);
  const offsetPart = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", timeZoneName: "shortOffset" })
    .formatToParts(noonUtc)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-6"
  const hours = Number(offsetPart?.replace("GMT", "") || "-7");
  return new Date(`${ymd}T${String(-hours).padStart(2, "0")}:00:00Z`);
}
