import { resolveFleetPosition } from "@/lib/fleet/positions";

/**
 * Which job in the app a PAYCOM posting title means.
 *
 * WHY THIS EXISTS. The Paycom hiring-metrics import (Sep 10 2026) brought in
 * 8,304 applications that are not linked to any job — it could only link where
 * Paycom's requisition number is stored on a job, and 4 jobs carry one. Each of
 * those applications holds only the posting title Paycom gave it:
 *
 *   "Challenger 350 Captain ($220k-$230k) - UT"
 *   "G450 & GV First Officer (Home-Based) $15k Sign-on bonus!"
 *   "Line Service Technician (Aviation)"
 *
 * which is a MARKETING title — pay, bonus and base are in it because it was an ad.
 * Two pieces of feedback came from that (cmtynseh3 Sep 12, cmubt2fgb Sep 21):
 * nothing showed which job somebody had applied for, and there was no way to link
 * the real job in place. This is the part that decides WHICH job.
 *
 * THREE TIERS, and ONLY THE FIRST can ever be "confident":
 *   exact    the posting title with its ad copy removed says the same thing as a
 *            job's title: "Challenger 350 Captain ($220k-$230k) - UT" is the job
 *            called "Challenger 350 Captain". Word order does not matter ("AP/AR
 *            Specialist" is "AR / AP Specialist"). Confident when it names ONE job.
 *   fleet    both titles are the same seat in the fleet registry
 *            (lib/fleet/positions.ts, the app's own resolver, used unchanged).
 *            Offered, never confident — measured against the live titles on
 *            2026-09-22, the registry calls a Utah "Citation CJ Captain" posting
 *            and the "CJ Captain (Part 91, Georgia)" job the same seat, and they
 *            are not the same job.
 *   similar  most words in common. Offered, never confident.
 *
 * TWO GUARDS learned from those same live titles:
 *   - A title naming two seats ("PC-12 Captain & CE-525 First Officer", "M2
 *     Captain & PC-12 Captain") is a combined posting. The registry resolves it to
 *     ONE of its seats — the first did to "PC-12 First Officer" — so combined
 *     titles never take part in the fleet tier, on either side.
 *   - The fleet tier is for PILOT titles only. "G450 Lead Cabin Attendant" and
 *     "Gulfstream G450 Maintenance Technician" both resolve to the G450 Captain
 *     seat, because the resolver defaults a title with no seat word to captain.
 * And where the posting names a base and the job names a different one (Utah
 * against Georgia), the job is not offered by the exact or fleet tier at all.
 *
 * Merged jobs are never offered: their name belongs to the job they were merged
 * into, which is offered instead.
 */

export type MatchableJob = {
  id: string;
  title: string;
  status: string;
  mergedIntoJobId: string | null;
  city: string | null;
  state: string | null;
};

export type JobSuggestion = {
  jobId: string;
  title: string;
  status: string;
  location: string | null;
  tier: "exact" | "fleet" | "similar";
  /** The ONE job this title names — the only kind of suggestion safe to act on alone. */
  confident: boolean;
};

/**
 * A title with the ad copy taken off. `posting` also strips a trailing base
 * ("- UT", "| OGD, UT", "SLC"): on a POSTING that is where the job was advertised,
 * but on a JOB title it is what tells two jobs apart ("Line Service Technician |
 * OGD" and "| DVO"), so it stays there.
 */
export function coreJobTitle(title: string, opts: { posting?: boolean } = {}): string {
  let t = title
    .toLowerCase()
    .replace(/^\s*\(old\)\s*-?\s*/, " ")
    .replace(/\(\s*no active openings?\s*\)/g, " ")
    // "($220k-$230k)", "($130k)", "(125k-135k + 10k Sign On Bounus)" — pay in brackets.
    .replace(/\([^)]*(?:\$|\d+k\b)[^)]*\)/g, " ")
    // "+ up to $20K Sign-On Bonus!", "$15k Sign-on bonus!", "(Plus a $20k sign-on bonus!)"
    .replace(/\(?\+?\s*(?:plus\s+(?:a\s+)?)?(?:up\s+to\s+)?\$\s?[\d,.]+\s*k?\s*sign[\s-]*on\s+bonus!?\)?/g, " ")
    .replace(/sign[\s-]*on\s+bou?nu?s!?/g, " ")
    // bare pay: "$140K-$160K", "$130k"
    .replace(/\$\s?[\d,.]+\s*k?(?:\s*-\s*\$?\s?[\d,.]+\s*k?)?/g, " ")
    .replace(/\((?:aviation|on-site|amt)\)/g, " ")
    .replace(/\bvp\b/g, "vice president")
    .replace(/home[\s-]*based/g, "home based");
  if (opts.posting) {
    t = t
      .replace(/\|\s*(?:slc|ogd|ogden)\s*,\s*ut\b/g, " ")
      .replace(/(?:\s[-|]\s|\s)(?:ut|utah|slc|ogd|ogden|salt lake city)(?:\s*,\s*ut)?\s*$/g, " ");
  }
  return t.replace(/[^a-z0-9+&]+/g, " ").replace(/\s+/g, " ").trim();
}

// Filler words, ignored when comparing. "part" and "time" are ignored only by the
// SIMILAR tier: for an exact match "Customer Service Representative" and
// "Customer Service Representative | Part-Time" are different jobs.
const FILLER = new Set(["the", "a", "an", "of", "and", "&", "for"]);
const LOOSE_FILLER = new Set([...FILLER, "part", "time"]);

function wordSet(core: string, loose = false): string[] {
  const skip = loose ? LOOSE_FILLER : FILLER;
  return [...new Set(core.split(" ").filter((w) => w && !skip.has(w)))];
}

/** Same word, or one a 3+ letter prefix of the other ("rep" / "representative"). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const shared = a.filter((w) => b.some((v) => sameWord(w, v))).length;
  return shared / (a.length + b.length - shared);
}

const PILOT_SEAT = /\b(captain|first officer|sic|pic|pilot|co-captain|f\/o)\b/i;
const CAPTAIN = /\bcaptain\b/i;
const FIRST_OFFICER = /\b(first officer|sic|f\/o)\b/i;

/** A posting for two seats at once. See the guards in the header. */
function isCombined(title: string): boolean {
  if (CAPTAIN.test(title) && FIRST_OFFICER.test(title)) return true;
  const halves = title.split(/\s(?:&|and|\/)\s/i);
  if (halves.length < 2) return false;
  const seats = halves.map((h) => resolveFleetPosition(h)?.slug).filter(Boolean);
  return new Set(seats).size >= 2;
}

/** Which state a title or location points at, when it says. */
function baseHint(text: string): "UT" | "GA" | "NV" | "CA" | null {
  const t = text.toLowerCase();
  if (/\b(utah|ut|slc|ogd|ogden|salt lake|brigham)\b/.test(t)) return "UT";
  if (/\b(georgia|ga|greensborough|greensboro)\b/.test(t)) return "GA";
  if (/\b(henderson|nv|nevada|las vegas)\b/.test(t)) return "NV";
  if (/\b(novato|dvo|california|ca)\b/.test(t)) return "CA";
  return null;
}

function location(job: MatchableJob): string | null {
  const parts = [job.city, job.state].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(", ") : null;
}

/**
 * The jobs a Paycom posting title most likely means, best first — at most `limit`.
 * `jobs` should be every job; merged ones are dropped here.
 */
export function suggestJobsForTitle(paycomTitle: string, jobs: MatchableJob[], limit = 3): JobSuggestion[] {
  const core = coreJobTitle(paycomTitle, { posting: true });
  if (!core) return [];
  const words = wordSet(core);
  const postingBase = baseHint(paycomTitle);
  const live = jobs.filter((j) => !j.mergedIntoJobId);
  const baseAgrees = (j: MatchableJob) => {
    const jobBase = baseHint(`${j.title} ${j.city ?? ""} ${j.state ?? ""}`);
    return !postingBase || !jobBase || postingBase === jobBase;
  };

  const exact = live.filter((j) => {
    if (!baseAgrees(j)) return false;
    const jc = coreJobTitle(j.title);
    if (jc === core) return true;
    const jw = wordSet(jc);
    return jw.length === words.length && jw.every((w) => words.includes(w));
  });

  const position = PILOT_SEAT.test(paycomTitle) && !isCombined(paycomTitle) ? resolveFleetPosition(paycomTitle) : null;
  const fleet = position
    ? live.filter(
        (j) =>
          !exact.includes(j) &&
          baseAgrees(j) &&
          PILOT_SEAT.test(j.title) &&
          !isCombined(j.title) &&
          resolveFleetPosition(j.title)?.slug === position.slug
      )
    : [];

  const suggestion = (j: MatchableJob, tier: JobSuggestion["tier"], confident: boolean): JobSuggestion => ({
    jobId: j.id,
    title: j.title,
    status: j.status,
    location: location(j),
    tier,
    confident
  });

  const openFirst = (a: MatchableJob, b: MatchableJob) => (a.status === "OPEN" ? 0 : 1) - (b.status === "OPEN" ? 0 : 1);
  const out: JobSuggestion[] = [
    ...[...exact].sort(openFirst).map((j) => suggestion(j, "exact", exact.length === 1)),
    ...[...fleet].sort(openFirst).map((j) => suggestion(j, "fleet", false))
  ];

  if (out.length < limit) {
    const taken = new Set(out.map((s) => s.jobId));
    const similar = live
      .filter((j) => !taken.has(j.id))
      .map((j) => ({ j, score: overlap(wordSet(core, true), wordSet(coreJobTitle(j.title), true)) }))
      .filter((x) => x.score >= 0.6)
      .sort((a, b) => b.score - a.score || openFirst(a.j, b.j));
    for (const { j } of similar) out.push(suggestion(j, "similar", false));
  }

  return out.slice(0, limit);
}

/** The one job a title can be linked to without asking anybody, or null. */
export function confidentJobForTitle(paycomTitle: string, jobs: MatchableJob[]): JobSuggestion | null {
  return suggestJobsForTitle(paycomTitle, jobs, 5).find((s) => s.confident) ?? null;
}
