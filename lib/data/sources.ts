import { prisma } from "@/lib/prisma";
import { sourceKey, suggestCanonical } from "@/lib/sources/normalize";

// ---------------------------------------------------------------------------
// How people found SkyShare - every source a person gave, and the reviewable list
// of tidy names behind them (Reports > Sources).
//
// Asked for 2026-09-29: "if someone lists more than one source we need to note
// all of them. sometimes there can be more than one at different times. we need
// to be able to audit the list of sources incase someone types one wrong for
// example BizJetJobs.com could be listed as just bizjet and its the same place."
//
// WHERE A SOURCE LIVES:
//   Paycom era (Feb 2025 on) - on each APPLICATION: trafficSource (where Paycom saw
//     them arrive from) and referralSource (what they picked for "how did you hear
//     about us"), loaded from Paycom's Source Report by prisma/import-paycom-sources.ts.
//     One application can name two places - it arrived from Indeed, they say
//     BizJetJobs - and both are kept.
//   JazzHR era - on the CANDIDATE: Candidate.source of an origin JAZZ record is the
//     channel Jazz recorded (Indeed, LinkedIn, Career Page...).
//   Candidate.source on a Paycom-era or hand-made record is NOT a source in this
//     sense: it says how the record got into the app ("Paycom hiring metrics
//     import", "Resume intake") and is left out.
//
// A TIDY NAME comes from SourceAlias, keyed by sourceKey(): the original spelling
// is never rewritten. A spelling with no row is "unmapped" - shown as spelled, and
// flagged on the review page with a suggestion - never silently guessed.
// ---------------------------------------------------------------------------

export type SourceNames = Map<string, string>;

/** Every reviewed spelling -> its tidy name. ~70 rows; cheap enough to read per page. */
export async function loadSourceNames(): Promise<SourceNames> {
  const rows = await prisma.sourceAlias.findMany({ select: { key: true, canonical: true } });
  return new Map(rows.map((r) => [r.key, r.canonical]));
}

/** The tidy name for a spelling, or the spelling itself when nobody has named it yet. */
export function sourceName(raw: string | null | undefined, names: SourceNames): string | null {
  const key = sourceKey(raw);
  if (!key || !raw) return null;
  return names.get(key) ?? raw.trim();
}

export type FoundVia = {
  name: string;
  /** Exactly as it arrived, when that differs from the tidy name. */
  spelled: string | null;
  how: "Arrived from" | "Said" | "JazzHR";
};

/** An application's sources: where it arrived from, and what they said - both, once each by tidy name. */
export function applicationSources(
  a: { trafficSource: string | null; referralSource: string | null },
  names: SourceNames
): FoundVia[] {
  const out: FoundVia[] = [];
  for (const [raw, how] of [[a.referralSource, "Said"], [a.trafficSource, "Arrived from"]] as const) {
    const name = sourceName(raw, names);
    if (!name || !raw) continue;
    if (out.some((o) => o.name === name)) continue;
    out.push({ name, spelled: raw.trim() === name ? null : raw.trim(), how });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The review page.
// ---------------------------------------------------------------------------

export type SourceSpelling = {
  key: string;
  /** The spellings seen for this key, most common first. */
  spellings: string[];
  /** Paycom applications naming it as where they arrived from. */
  traffic: number;
  /** Paycom applications naming it as what the applicant said. */
  referral: number;
  /** JazzHR-era people with it as their source. */
  jazz: number;
  canonical: string | null;
  /** For an unmapped spelling: the tidy name it most likely means. */
  suggestion: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type SourceSummary = {
  name: string;
  /** Distinct people naming it, both eras. */
  people: number;
  /** Paycom applications naming it, either way. */
  applications: number;
  /** Of the people, how many were hired (an application marked Hired, or an employee record). */
  hired: number;
  spellings: number;
  mapped: boolean;
};

export type SourceAudit = {
  sources: SourceSummary[];
  spellings: SourceSpelling[];
  names: string[];
  totals: {
    paycomApplications: number;
    paycomWithSource: number;
    paycomWithBoth: number;
    peopleWithSeveral: number;
    jazzPeople: number;
    referralNames: number;
    unmapped: number;
  };
};

export async function getSourceAudit(): Promise<SourceAudit> {
  const [aliases, apps, jazz, hiredApps, hires, paycomApplications] = await Promise.all([
    prisma.sourceAlias.findMany({ select: { key: true, canonical: true, updatedBy: true, updatedAt: true } }),
    prisma.candidateApplication.findMany({
      where: { OR: [{ trafficSource: { not: null } }, { referralSource: { not: null } }, { referralName: { not: null } }] },
      select: { candidateId: true, trafficSource: true, referralSource: true, referralName: true }
    }),
    prisma.candidate.findMany({ where: { origin: "JAZZ", source: { not: null } }, select: { id: true, source: true } }),
    prisma.candidateApplication.findMany({ where: { status: { equals: "Hired", mode: "insensitive" } }, select: { candidateId: true } }),
    prisma.newHire.findMany({ where: { candidateId: { not: null }, canceled: false }, select: { candidateId: true } }),
    prisma.candidateApplication.count({ where: { origin: "PAYCOM", sourceApplicationId: { not: null } } })
  ]);
  const names: SourceNames = new Map(aliases.map((a) => [a.key, a.canonical]));
  const aliasByKey = new Map(aliases.map((a) => [a.key, a]));
  const hired = new Set<string>([...hiredApps.map((h) => h.candidateId), ...hires.map((h) => h.candidateId as string)]);

  // Spellings, by key.
  const spell = new Map<string, { counts: Map<string, number>; traffic: number; referral: number; jazz: number }>();
  const note = (raw: string | null, field: "traffic" | "referral" | "jazz") => {
    const key = sourceKey(raw);
    if (!key || !raw) return;
    const s = spell.get(key) ?? { counts: new Map<string, number>(), traffic: 0, referral: 0, jazz: 0 };
    const r = raw.trim();
    s.counts.set(r, (s.counts.get(r) ?? 0) + 1);
    s[field] += 1;
    spell.set(key, s);
  };
  for (const a of apps) { note(a.trafficSource, "traffic"); note(a.referralSource, "referral"); }
  for (const c of jazz) note(c.source, "jazz");

  // Tidy names, by people / applications / hired.
  const byName = new Map<string, { people: Set<string>; applications: number; keys: Set<string>; mapped: boolean }>();
  const credit = (name: string, key: string, person: string, application: boolean) => {
    const e = byName.get(name) ?? { people: new Set<string>(), applications: 0, keys: new Set<string>(), mapped: names.has(key) };
    e.people.add(person);
    if (application) e.applications += 1;
    e.keys.add(key);
    byName.set(name, e);
  };
  const perPerson = new Map<string, Set<string>>();
  for (const a of apps) {
    const seen = new Set<string>();
    for (const raw of [a.trafficSource, a.referralSource]) {
      const key = sourceKey(raw);
      const name = sourceName(raw, names);
      if (!key || !name || seen.has(name)) continue;
      seen.add(name);
      credit(name, key, a.candidateId, true);
      perPerson.set(a.candidateId, new Set([...(perPerson.get(a.candidateId) ?? []), name]));
    }
  }
  for (const c of jazz) {
    const key = sourceKey(c.source);
    const name = sourceName(c.source, names);
    if (!key || !name) continue;
    credit(name, key, c.id, false);
    perPerson.set(c.id, new Set([...(perPerson.get(c.id) ?? []), name]));
  }

  const known = aliases.map((a) => ({ key: a.key, canonical: a.canonical }));
  const spellings: SourceSpelling[] = [...spell]
    .map(([key, s]) => {
      const alias = aliasByKey.get(key);
      return {
        key,
        spellings: [...s.counts].sort((x, y) => y[1] - x[1]).map(([r]) => r),
        traffic: s.traffic,
        referral: s.referral,
        jazz: s.jazz,
        canonical: alias?.canonical ?? null,
        suggestion: alias ? null : suggestCanonical(key, known),
        updatedBy: alias?.updatedBy ?? null,
        updatedAt: alias ? alias.updatedAt.toISOString() : null
      };
    })
    .sort((x, y) => Number(x.canonical !== null) - Number(y.canonical !== null) || y.traffic + y.referral + y.jazz - (x.traffic + x.referral + x.jazz));

  const sources: SourceSummary[] = [...byName]
    .map(([name, e]) => ({ name, people: e.people.size, applications: e.applications, hired: [...e.people].filter((p) => hired.has(p)).length, spellings: e.keys.size, mapped: e.mapped }))
    .sort((x, y) => y.people - x.people || x.name.localeCompare(y.name));

  return {
    sources,
    spellings,
    names: [...new Set(aliases.map((a) => a.canonical))].sort((x, y) => x.localeCompare(y)),
    totals: {
      paycomApplications,
      paycomWithSource: apps.filter((a) => a.trafficSource || a.referralSource).length,
      paycomWithBoth: apps.filter((a) => {
        const t = sourceName(a.trafficSource, names);
        const r = sourceName(a.referralSource, names);
        return t && r && t !== r;
      }).length,
      peopleWithSeveral: [...perPerson.values()].filter((s) => s.size > 1).length,
      jazzPeople: jazz.length,
      referralNames: apps.filter((a) => a.referralName).length,
      unmapped: spellings.filter((s) => s.canonical === null).length
    }
  };
}
