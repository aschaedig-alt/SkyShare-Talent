// Server code: it reads the database through Prisma, which is what keeps it out
// of any client bundle - the same as everything in lib/data. (No "server-only"
// import: that package is only an alias inside Next, so a script could not load it.)
import { prisma } from "@/lib/prisma";
import {
  ALL_PLACES,
  markMatches,
  placesFor,
  type ParsedSearch,
  type SearchPlace,
  type SearchTerm,
  type TextSegment
} from "@/lib/candidates/search/query";

/**
 * Runs a parsed candidate search against the database. See query.ts for the
 * language; this file is only the SQL and the bookkeeping.
 *
 * HOW. One query per PLACE, all at once. Each answers "for which people did
 * which terms match here", as a bitmask per person - so the page can decide who
 * is in the list for the ticked places AND say how many people matched in each
 * place, including the unticked ones, from the same pass. The regexes run in
 * Postgres (~*, case-insensitive), over every document's text: about 16 million
 * characters, ~150 ms per pattern on 2026-09-23.
 *
 * The patterns reach the database as bound parameters, never pasted into the
 * SQL, and the SQL around them is built only from fixed column names.
 */

export type PlaceMasks = Partial<Record<SearchPlace, number>>;

export type SearchRun = {
  parsed: ParsedSearch;
  places: SearchPlace[];
  /** Who the search finds with the ticked places. Unused for an exclude-only search. */
  matchedIds: string[];
  /** For an exclude-only search: everybody it leaves out. */
  excludedIds: string[];
  /** Who it would find if every place were ticked - the population place counts come from. */
  everywhereIds: string[];
  /**
   * Who a left-out term removed: people the search found in the ticked places
   * and then left out (for an exclude-only search, everybody it leaves out). Kept
   * so the page can say what each left-out term did.
   */
  leftOutIds: string[];
  /** Per person, per place, which terms matched there. */
  masks: Map<string, PlaceMasks>;
  ms: number;
};

type MaskRow = { id: string; place: SearchPlace; m: number };

/** "$n" placeholders for a growing parameter list. */
function params() {
  const values: unknown[] = [];
  return {
    values,
    add(value: unknown): string {
      values.push(value);
      return `$${values.length}`;
    }
  };
}

function anyPattern(terms: SearchTerm[]): string {
  return terms.map((term) => `(?:${term.pattern})`).join("|");
}

function maskSql(expr: string, terms: SearchTerm[], add: (value: unknown) => string): string {
  const parts = terms.map((term) => `(CASE WHEN ${expr} ~* ${add(term.pattern)} THEN ${term.bit} ELSE 0 END)`);
  return parts.length ? parts.join(" | ") : "0";
}

/** A signed application form, or anything else uploaded. The same rule the hits use. */
const IS_FORM = `(f."searchText" IS NOT NULL OR f."documentType" IN ('Pilot Application', 'Paycom Application'))`;

async function filesQuery(terms: SearchTerm[]): Promise<MaskRow[]> {
  const p = params();
  const any = p.add(anyPattern(terms));
  const sql = `
    SELECT f."candidateId" AS id,
           CASE WHEN ${IS_FORM} THEN 'application' ELSE 'resume' END AS place,
           bit_or(${maskSql("f.t", terms, p.add)})::int AS m
    FROM (
      SELECT "candidateId", "documentType", "searchText", COALESCE("searchText", "extractedText") AS t
      FROM "CandidateFile"
      WHERE "candidateId" IS NOT NULL
    ) f
    WHERE f.t ~* ${any}
    GROUP BY 1, 2`;
  return prisma.$queryRawUnsafe<MaskRow[]>(sql, ...p.values);
}

async function jobsQuery(terms: SearchTerm[]): Promise<MaskRow[]> {
  const p = params();
  const any = p.add(anyPattern(terms));
  const sql = `
    SELECT x.id, 'jobs' AS place, bit_or(${maskSql("x.t", terms, p.add)})::int AS m
    FROM (
      SELECT a."candidateId" AS id, concat_ws(' | ', j."title", a."historicalJobTitle") AS t
      FROM "CandidateApplication" a LEFT JOIN "Job" j ON j."id" = a."jobId"
      UNION ALL
      SELECT f."candidateId", f."appliedForText"
      FROM "CandidateFile" f
      WHERE f."appliedForText" IS NOT NULL AND f."candidateId" IS NOT NULL
    ) x
    WHERE x.t ~* ${any}
    GROUP BY 1`;
  return prisma.$queryRawUnsafe<MaskRow[]>(sql, ...p.values);
}

/**
 * Only a time-in-type row's LABEL is searched ("Time in Type — CL-30"), because
 * that is where its aircraft is; every other label is the same word on everybody
 * ("Total Time"), and searching it would find every scanned pilot.
 */
const FLIGHT_TEXT = `CASE WHEN "key" LIKE '%time_in_type%' THEN concat_ws(' | ', "label", "valueText") ELSE "valueText" END`;

async function flightQuery(terms: SearchTerm[]): Promise<MaskRow[]> {
  const p = params();
  const any = p.add(anyPattern(terms));
  const sql = `
    SELECT x.id, 'flight' AS place, bit_or(${maskSql("x.t", terms, p.add)})::int AS m
    FROM (
      SELECT "candidateId" AS id, ${FLIGHT_TEXT} AS t
      FROM "CandidateMetric"
      WHERE "status" <> 'DISMISSED'
    ) x
    WHERE x.t ~* ${any}
    GROUP BY 1`;
  return prisma.$queryRawUnsafe<MaskRow[]>(sql, ...p.values);
}

/** Private HR notes are searched for the HR team only - the rule every note read here follows. */
async function notesQuery(terms: SearchTerm[], hrNotes: boolean): Promise<MaskRow[]> {
  const p = params();
  const any = p.add(anyPattern(terms));
  const hr = p.add(hrNotes);
  const sql = `
    SELECT "candidateId" AS id, 'notes' AS place, bit_or(${maskSql(`"body"`, terms, p.add)})::int AS m
    FROM "CandidateNote"
    WHERE (${hr}::boolean OR "hrOnly" = false) AND "body" ~* ${any}
    GROUP BY 1`;
  return prisma.$queryRawUnsafe<MaskRow[]>(sql, ...p.values);
}

async function profileQuery(terms: SearchTerm[]): Promise<MaskRow[]> {
  const p = params();
  const any = p.add(anyPattern(terms));
  const sql = `
    SELECT x.id, 'profile' AS place, bit_or(${maskSql("x.t", terms, p.add)})::int AS m
    FROM (
      SELECT c."id" AS id, concat_ws(' | ', c."currentTitle", c."stage", c."source", c."owner", c."tagsJson") AS t
      FROM "Candidate" c
      UNION ALL
      SELECT ct."candidateId", tg."label" FROM "CandidateTag" ct JOIN "Tag" tg ON tg."id" = ct."tagId"
      UNION ALL
      SELECT a."candidateId", a."status" FROM "CandidateApplication" a WHERE a."status" IS NOT NULL
    ) x
    WHERE x.t ~* ${any}
    GROUP BY 1`;
  return prisma.$queryRawUnsafe<MaskRow[]>(sql, ...p.values);
}

/**
 * Name and contact: the name by the word pattern, email as plain text anywhere
 * in it (people search part of an address), phone by its digits, and the JazzHR
 * ids by their start - the same prefix rule lib/candidates/search-terms.ts
 * explains (a job id is a substring of every application id).
 */
async function nameQuery(terms: SearchTerm[]): Promise<MaskRow[]> {
  const p = params();
  const personCases = terms.map((term) => {
    const re = p.add(term.pattern);
    const email = p.add(term.emailNeedle ?? "");
    const digits = p.add(term.phoneDigits ?? "");
    const prefix = p.add(term.idPrefix ?? "");
    return `(CASE WHEN c."displayName" ~* ${re}
      OR (${email} <> '' AND (strpos(lower(coalesce(c."primaryEmail", '')), ${email}) > 0 OR strpos(coalesce(c."normalizedEmail", ''), ${email}) > 0))
      OR (${digits} <> '' AND strpos(coalesce(c."normalizedPhone", ''), ${digits}) > 0)
      OR (${prefix} <> '' AND left(lower(coalesce(c."jazzCandidateNumber", '')), length(${prefix})) = ${prefix})
      THEN ${term.bit} ELSE 0 END)`;
  });
  const applicationCases = terms.map((term) => {
    const prefix = p.add(term.idPrefix ?? "");
    return `(CASE WHEN ${prefix} <> '' AND (
        left(lower(coalesce(a."jazzApplicationNumber", '')), length(${prefix})) = ${prefix}
        OR left(lower(coalesce(j."sourceJobId", '')), length(${prefix})) = ${prefix}
        OR left(lower(coalesce(j."jobReqId", '')), length(${prefix})) = ${prefix})
      THEN ${term.bit} ELSE 0 END)`;
  });
  const sql = `
    SELECT q.id, 'name' AS place, q.m FROM (
      SELECT c."id" AS id, (${personCases.join(" | ")})::int AS m FROM "Candidate" c
    ) q WHERE q.m <> 0
    UNION ALL
    SELECT r.id, 'name' AS place, r.m FROM (
      SELECT a."candidateId" AS id, bit_or(${applicationCases.join(" | ")})::int AS m
      FROM "CandidateApplication" a LEFT JOIN "Job" j ON j."id" = a."jobId"
      GROUP BY 1
    ) r WHERE r.m <> 0`;
  return prisma.$queryRawUnsafe<MaskRow[]>(sql, ...p.values);
}

/** Did this term match this person in these places? A left-out term looks everywhere - placesFor. */
function hitIn(masks: PlaceMasks | undefined, term: SearchTerm, places: SearchPlace[]): boolean {
  if (!masks) return false;
  return placesFor(term, places).some((place) => ((masks[place] ?? 0) & term.bit) !== 0);
}

/** Do the terms to FIND all match, looking only in these places? */
function found(parsed: ParsedSearch, masks: PlaceMasks | undefined, places: SearchPlace[]): boolean {
  return parsed.groups.every((group) => group.some((term) => hitIn(masks, term, places)));
}

/** Does a left-out term leave this person out? The ticked places do not narrow it. */
function leftOut(parsed: ParsedSearch, masks: PlaceMasks | undefined): boolean {
  return parsed.exclude.some((term) => hitIn(masks, term, ALL_PLACES));
}

/** Does this person satisfy the search, finding them only in these places? */
export function satisfies(parsed: ParsedSearch, masks: PlaceMasks | undefined, places: SearchPlace[]): boolean {
  return found(parsed, masks, places) && !leftOut(parsed, masks);
}

export async function runCandidateSearch(
  parsed: ParsedSearch,
  places: SearchPlace[],
  opts: { hrNotes: boolean }
): Promise<SearchRun> {
  const started = Date.now();
  const terms = parsed.terms;
  const rows = (
    await Promise.all([
      filesQuery(terms),
      jobsQuery(terms),
      flightQuery(terms),
      notesQuery(terms, opts.hrNotes),
      profileQuery(terms),
      nameQuery(terms)
    ])
  ).flat();

  const masks = new Map<string, PlaceMasks>();
  for (const row of rows) {
    const entry = masks.get(row.id) ?? {};
    entry[row.place] = (entry[row.place] ?? 0) | Number(row.m);
    masks.set(row.id, entry);
  }

  const matchedIds: string[] = [];
  const everywhereIds: string[] = [];
  const excludedIds: string[] = [];
  const leftOutIds: string[] = [];
  for (const [id, entry] of masks) {
    const out = leftOut(parsed, entry);
    if (parsed.excludeOnly) {
      if (out) excludedIds.push(id);
      continue;
    }
    if (found(parsed, entry, places)) (out ? leftOutIds : matchedIds).push(id);
    if (!out && found(parsed, entry, ALL_PLACES)) everywhereIds.push(id);
  }
  return {
    parsed,
    places,
    matchedIds,
    excludedIds,
    everywhereIds,
    leftOutIds: parsed.excludeOnly ? excludedIds : leftOutIds,
    masks,
    ms: Date.now() - started
  };
}

/**
 * How many people each left-out term removed, over a population the caller has
 * narrowed the way the list is (segment, filters, the viewer's own scope) - so
 * "not cabin attendant, 21 left out" describes the list being looked at. A
 * person two terms both leave out counts under each. Keyed by term bit.
 */
export function countLeftOut(run: SearchRun, population: Iterable<string>): Map<number, number> {
  const counts = new Map(run.parsed.exclude.map((term) => [term.bit, 0]));
  for (const id of population) {
    const entry = run.masks.get(id);
    for (const term of run.parsed.exclude) if (hitIn(entry, term, ALL_PLACES)) counts.set(term.bit, (counts.get(term.bit) ?? 0) + 1);
  }
  return counts;
}

/**
 * How many people the search found in each place, over a population the caller
 * has already narrowed (segment, tags, the viewer's own scope). A person counts
 * in a place when any term they were found by matched there.
 */
export function countPlaces(run: SearchRun, population: Iterable<string>): Record<SearchPlace, number> {
  const positive = run.parsed.groups.flat().reduce((bits, term) => bits | term.bit, 0);
  const counts = Object.fromEntries(ALL_PLACES.map((place) => [place, 0])) as Record<SearchPlace, number>;
  for (const id of population) {
    const entry = run.masks.get(id);
    if (!entry) continue;
    for (const place of ALL_PLACES) if (((entry[place] ?? 0) & positive) !== 0) counts[place] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Where each shown person matched
// ---------------------------------------------------------------------------

export type SearchHit = {
  place: SearchPlace;
  /** "Resume", "Pilot application", "Applied to", "Flight data", "Note", ... */
  label: string;
  /** The file, job or row it came from, when there is one. */
  source: string | null;
  segments: TextSegment[];
};

const PLACE_ORDER: SearchPlace[] = ["resume", "application", "flight", "notes", "jobs", "profile", "name"];

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** A window of text around the first match, cut at word edges. */
function around(text: string, terms: SearchTerm[], radius = 70): string {
  const clean = tidy(text);
  let first = -1;
  for (const term of terms) {
    const m = new RegExp(term.pattern, "i").exec(clean);
    if (m && (first < 0 || m.index < first)) first = m.index;
  }
  if (first < 0) return clean.slice(0, radius * 2);
  let start = Math.max(0, first - radius);
  let end = Math.min(clean.length, first + radius + 30);
  if (start > 0) start = clean.indexOf(" ", start) + 1 || start;
  if (end < clean.length) end = clean.lastIndexOf(" ", end) > first ? clean.lastIndexOf(" ", end) : end;
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

/**
 * For the people on the page (a hundred or so, never the whole list): the places
 * they matched, with the words marked, in the order a recruiter reads them -
 * their own documents first, what they applied to last.
 */
export async function searchHits(run: SearchRun, candidateIds: string[], opts: { hrNotes: boolean }): Promise<Map<string, SearchHit[]>> {
  const out = new Map<string, SearchHit[]>();
  const positive = run.parsed.groups.flat();
  if (positive.length === 0 || candidateIds.length === 0) return out;

  const termsIn = (place: SearchPlace) => positive.filter((term) => placesFor(term, run.places).includes(place));
  const push = (id: string, hit: SearchHit) => {
    const list = out.get(id) ?? [];
    list.push(hit);
    out.set(id, list);
  };
  const docTerms = [...new Set([...termsIn("resume"), ...termsIn("application")])];
  const jobTerms = termsIn("jobs");
  const flightTerms = termsIn("flight");
  const noteTerms = termsIn("notes");
  const profileTerms = termsIn("profile");

  await Promise.all([
    (async () => {
      if (docTerms.length === 0) return;
      const rows = await prisma.$queryRawUnsafe<
        Array<{ candidateId: string; filename: string; documentType: string | null; form: boolean; win: string }>
      >(
        `SELECT f."candidateId" AS "candidateId", f."displayFilename" AS filename, f."documentType" AS "documentType",
                ${IS_FORM} AS form,
                substring(f.t from greatest(1, f.pos - 200) for 520) AS win
         FROM (
           SELECT "candidateId", "displayFilename", "documentType", "searchText", "uploadedAt",
                  COALESCE("searchText", "extractedText") AS t,
                  regexp_instr(COALESCE("searchText", "extractedText"), $1, 1, 1, 0, 'i') AS pos
           FROM "CandidateFile"
           WHERE "candidateId" = ANY($2::text[])
         ) f
         WHERE f.pos > 0
         ORDER BY f."uploadedAt" DESC`,
        anyPattern(docTerms),
        candidateIds
      );
      for (const row of rows) {
        const place: SearchPlace = row.form ? "application" : "resume";
        const terms = termsIn(place);
        if (terms.length === 0) continue;
        const window = around(row.win, terms);
        if (!terms.some((term) => new RegExp(term.pattern, "i").test(window))) continue;
        const label = row.form ? (row.documentType === "Paycom Application" ? "Paycom application" : "Pilot application") : row.documentType === "Resume" ? "Resume" : "Document";
        push(row.candidateId, { place, label, source: row.filename, segments: markMatches(window, terms) });
      }
    })(),
    (async () => {
      if (jobTerms.length === 0) return;
      const rows = await prisma.$queryRawUnsafe<Array<{ candidateId: string; title: string | null; historical: string | null; kind: string }>>(
        `SELECT a."candidateId" AS "candidateId", j."title" AS title, a."historicalJobTitle" AS historical, 'job' AS kind
         FROM "CandidateApplication" a LEFT JOIN "Job" j ON j."id" = a."jobId"
         WHERE a."candidateId" = ANY($2::text[]) AND concat_ws(' | ', j."title", a."historicalJobTitle") ~* $1
         UNION ALL
         SELECT "candidateId", "appliedForText", NULL, 'form' FROM "CandidateFile"
         WHERE "candidateId" = ANY($2::text[]) AND "appliedForText" ~* $1`,
        anyPattern(jobTerms),
        candidateIds
      );
      for (const row of rows) {
        // One title, not the job's and the JazzHR-era one glued together: the
        // job's own when it is the one that matched, else the one that did.
        const matches = (text: string | null) => Boolean(text) && jobTerms.some((term) => new RegExp(term.pattern, "i").test(text!));
        const shown = matches(row.title) ? row.title! : row.historical ?? row.title ?? "";
        push(row.candidateId, {
          place: "jobs",
          label: row.kind === "form" ? "Position on their application" : "Applied to",
          source: null,
          segments: markMatches(tidy(shown), jobTerms)
        });
      }
    })(),
    (async () => {
      if (flightTerms.length === 0) return;
      const rows = await prisma.$queryRawUnsafe<Array<{ candidateId: string; label: string; t: string; n: number | null; unit: string | null }>>(
        `SELECT "candidateId" AS "candidateId", "label", ${FLIGHT_TEXT} AS t, "valueNumber" AS n, "unit"
         FROM "CandidateMetric"
         WHERE "candidateId" = ANY($2::text[]) AND "status" <> 'DISMISSED' AND (${FLIGHT_TEXT}) ~* $1`,
        anyPattern(flightTerms),
        candidateIds
      );
      for (const row of rows) {
        const amount = row.n !== null && row.n !== undefined ? ` — ${Number(row.n).toLocaleString("en-US")}${row.unit ? ` ${row.unit}` : ""}` : "";
        push(row.candidateId, { place: "flight", label: "Flight data", source: row.label, segments: markMatches(`${tidy(row.t)}${amount}`, flightTerms) });
      }
    })(),
    (async () => {
      if (noteTerms.length === 0) return;
      const rows = await prisma.$queryRawUnsafe<Array<{ candidateId: string; body: string }>>(
        `SELECT "candidateId" AS "candidateId", "body" FROM "CandidateNote"
         WHERE "candidateId" = ANY($2::text[]) AND ($3::boolean OR "hrOnly" = false) AND "body" ~* $1
         ORDER BY "createdAt" DESC`,
        anyPattern(noteTerms),
        candidateIds,
        opts.hrNotes
      );
      for (const row of rows) push(row.candidateId, { place: "notes", label: "Note", source: null, segments: markMatches(around(row.body, noteTerms), noteTerms) });
    })(),
    (async () => {
      if (profileTerms.length === 0) return;
      const rows = await prisma.$queryRawUnsafe<Array<{ candidateId: string; t: string; kind: string }>>(
        `SELECT c."id" AS "candidateId", c."currentTitle" AS t, 'Title' AS kind FROM "Candidate" c
           WHERE c."id" = ANY($2::text[]) AND c."currentTitle" ~* $1
         UNION ALL
         SELECT ct."candidateId", tg."label", 'Tag' FROM "CandidateTag" ct JOIN "Tag" tg ON tg."id" = ct."tagId"
           WHERE ct."candidateId" = ANY($2::text[]) AND tg."label" ~* $1
         UNION ALL
         SELECT c."id", concat_ws(' · ', c."stage", c."source", c."owner"), 'Status' FROM "Candidate" c
           WHERE c."id" = ANY($2::text[]) AND concat_ws(' · ', c."stage", c."source", c."owner") ~* $1`,
        anyPattern(profileTerms),
        candidateIds
      );
      for (const row of rows) push(row.candidateId, { place: "profile", label: row.kind, source: null, segments: markMatches(tidy(row.t), profileTerms) });
    })()
  ]);

  for (const [id, hits] of out) {
    // Order by place, drop repeats (two applications to one job, the same resume
    // uploaded twice), and keep each place's first two.
    hits.sort((a, b) => PLACE_ORDER.indexOf(a.place) - PLACE_ORDER.indexOf(b.place));
    const seen = new Set<string>();
    const perPlace = new Map<SearchPlace, number>();
    out.set(
      id,
      hits.filter((hit) => {
        const key = `${hit.place}|${hit.label}|${hit.segments.map((segment) => segment.text).join("")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        const n = (perPlace.get(hit.place) ?? 0) + 1;
        perPlace.set(hit.place, n);
        return n <= 2;
      })
    );
  }
  return out;
}
