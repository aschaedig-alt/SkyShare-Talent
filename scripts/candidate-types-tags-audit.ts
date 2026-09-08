/**
 * READ-ONLY audit of TYPE RATINGS and TAGS across every candidate.
 *
 * Answers the two questions worth asking before either is cleaned up:
 *   - what is actually stored, and
 *   - which of it is wrong, duplicated, or unusable.
 *
 * Writes nothing. Emits a JSON file alongside the console summary so the
 * findings can be turned into a report without re-querying.
 *
 *   npx tsx scripts/candidate-types-tags-audit.ts [outfile.json]
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

/** Same splitting the app uses for a stored list value (lib/data/candidates.ts). */
function splitListValue(value: string | null): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[,;/|]+|\band\b/gi)
        .map((part) => part.trim())
        .filter(Boolean)
    )
  ];
}

/**
 * A loose canonical key for an aircraft type, used ONLY to spot the same type
 * written several ways. Deliberately aggressive — strips punctuation, spaces
 * and common manufacturer words — because its job is to group "CE-525",
 * "CE525" and "Citation 525" together for review, not to rename anything.
 */
function typeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(citation|cessna|gulfstream|embraer|pilatus|beech(craft)?|bombardier|hawker|learjet|dassault|falcon|challenger|phenom|legacy|king ?air)\b/g, " ")
    .replace(/\b(series|type|rating|typed|pic|sic)\b/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

/** Does this look like a real aircraft type at all? */
function looksLikeType(raw: string): { ok: boolean; why?: string } {
  const t = raw.trim();
  if (!t) return { ok: false, why: "empty" };
  if (/^\d+$/.test(t)) return { ok: false, why: "just a number" };
  if (t.length > 60) return { ok: false, why: "very long — probably a sentence" };
  if (!/[a-z]/i.test(t)) return { ok: false, why: "no letters" };
  if (/\b(hours?|hrs|total|time)\b/i.test(t)) return { ok: false, why: "reads like an hours figure" };
  return { ok: true };
}

async function main() {
  const out = process.argv[2] ?? "candidate-types-tags-audit.json";

  const [candTotal, liveTotal] = await Promise.all([
    prisma.candidate.count({ where: { status: { not: "MERGED" } } }),
    prisma.candidate.count({ where: { status: { not: "MERGED" }, archivedAt: null } })
  ]);

  // ======================= TYPE RATINGS =======================
  const metrics = await prisma.candidateMetric.findMany({
    where: { key: "type_ratings" },
    select: {
      valueText: true,
      status: true,
      candidate: {
        select: { id: true, displayName: true, archivedAt: true, status: true, origin: true }
      }
    }
  });

  const byStatus = new Map<string, number>();
  const typeCounts = new Map<string, { count: number; people: string[] }>();
  const junk: Array<{ person: string; value: string; why: string; status: string }> = [];
  let peopleWithTypes = 0;
  let livePeopleWithTypes = 0;
  let emptyValue = 0;

  for (const m of metrics) {
    if (m.candidate.status === "MERGED") continue;
    byStatus.set(m.status, (byStatus.get(m.status) ?? 0) + 1);

    const parts = splitListValue(m.valueText);
    if (parts.length === 0) {
      emptyValue++;
      continue;
    }
    if (m.status !== "DISMISSED") {
      peopleWithTypes++;
      if (!m.candidate.archivedAt) livePeopleWithTypes++;
    }
    for (const p of parts) {
      const verdict = looksLikeType(p);
      if (!verdict.ok) {
        junk.push({ person: m.candidate.displayName, value: p, why: verdict.why!, status: m.status });
        continue;
      }
      const e = typeCounts.get(p) ?? { count: 0, people: [] };
      e.count++;
      if (e.people.length < 4) e.people.push(m.candidate.displayName);
      typeCounts.set(p, e);
    }
  }

  // Spellings of the same type
  const spellings = new Map<string, Array<[string, number]>>();
  for (const [value, e] of typeCounts) {
    const k = typeKey(value);
    if (!k) continue;
    if (!spellings.has(k)) spellings.set(k, []);
    spellings.get(k)!.push([value, e.count]);
  }
  const variants = [...spellings.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([k, v]) => ({ key: k, spellings: v.sort((a, b) => b[1] - a[1]) }))
    .sort((a, b) => b.spellings.length - a.spellings.length);

  // ======================= TAGS =======================
  const tags = await prisma.tag.findMany({
    select: {
      label: true,
      color: true,
      candidates: {
        select: { source: true, candidate: { select: { archivedAt: true, status: true } } }
      }
    },
    orderBy: { label: "asc" }
  });

  const tagRows = tags.map((t) => {
    const links = t.candidates.filter((c) => c.candidate.status !== "MERGED");
    const live = links.filter((c) => !c.candidate.archivedAt).length;
    const manual = links.filter((c) => (c.source ?? "").toUpperCase() === "MANUAL").length;
    return {
      label: t.label,
      color: t.color,
      total: links.length,
      live,
      archived: links.length - live,
      manual,
      imported: links.length - manual,
      // A "1.2 " / "2.2 " style prefix marks a JazzHR workflow step rather than
      // something a recruiter chose to say about a person.
      workflowPrefixed: /^\d+\.\d+\s/.test(t.label)
    };
  });

  const orphans = tagRows.filter((t) => t.total === 0);
  const liveOnly = tagRows.filter((t) => t.live > 0);
  const archivedOnly = tagRows.filter((t) => t.total > 0 && t.live === 0);
  const workflow = tagRows.filter((t) => t.workflowPrefixed);
  const uncoloured = tagRows.filter((t) => !t.color);

  // Near-duplicate labels: same letters and digits, different punctuation/case.
  const tagKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const byKey = new Map<string, string[]>();
  for (const t of tagRows) {
    const k = tagKey(t.label);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(t.label);
  }
  const nearDupes = [...byKey.values()].filter((v) => v.length > 1);

  const candidatesWithAnyTag = await prisma.candidate.count({
    where: { status: { not: "MERGED" }, candidateTags: { some: {} } }
  });
  const liveWithAnyTag = await prisma.candidate.count({
    where: { status: { not: "MERGED" }, archivedAt: null, candidateTags: { some: {} } }
  });

  // ======================= REPORT =======================
  const L = (s: string) => console.log(s);
  L(`CANDIDATES: ${candTotal} non-merged, of which ${liveTotal} are in the working list\n`);

  L("=================== TYPE RATINGS ===================");
  L(`metric rows: ${metrics.length}   (statuses: ${[...byStatus].map(([k, v]) => `${k}=${v}`).join("  ")})`);
  L(`people with a kept type rating: ${peopleWithTypes} (${livePeopleWithTypes} of them in the working list)`);
  L(`coverage: ${((peopleWithTypes / candTotal) * 100).toFixed(1)}% of all candidates, ${((livePeopleWithTypes / liveTotal) * 100).toFixed(1)}% of the working list`);
  if (emptyValue) L(`rows storing nothing usable: ${emptyValue}`);
  L(`distinct type values after splitting: ${typeCounts.size}`);

  L(`\n-- values that are not aircraft types (${junk.length}) --`);
  for (const j of junk.sort((a, b) => a.person.localeCompare(b.person))) {
    L(`   ${j.person.padEnd(24)} ${JSON.stringify(j.value).padEnd(28)} ${j.why}  [${j.status}]`);
  }

  L(`\n-- the same type written more than one way (${variants.length} groups) --`);
  for (const v of variants.slice(0, 25)) {
    L(`   ${v.spellings.map(([s, n]) => `${s} (${n})`).join("   |   ")}`);
  }

  L(`\n-- every type, most common first --`);
  const sortedTypes = [...typeCounts.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [t, e] of sortedTypes.slice(0, 40)) {
    L(`   ${String(e.count).padStart(4)}  ${t}`);
  }
  if (sortedTypes.length > 40) L(`   … and ${sortedTypes.length - 40} more, all in the JSON`);

  L("\n=================== TAGS ===================");
  L(`tags: ${tagRows.length}`);
  L(`candidates carrying at least one: ${candidatesWithAnyTag} (${liveWithAnyTag} in the working list)`);
  L(`total links: ${tagRows.reduce((n, t) => n + t.total, 0)}`);
  L(`  applied by hand: ${tagRows.reduce((n, t) => n + t.manual, 0)}   from the import: ${tagRows.reduce((n, t) => n + t.imported, 0)}`);

  L(`\n-- on nobody (${orphans.length}) --`);
  for (const t of orphans) L(`   ${t.label}`);

  L(`\n-- only on archived people, so invisible in the working list (${archivedOnly.length}) --`);
  for (const t of archivedOnly.sort((a, b) => b.total - a.total)) {
    L(`   ${String(t.total).padStart(4)}  ${t.label}`);
  }

  L(`\n-- JazzHR workflow steps rather than descriptions (${workflow.length}) --`);
  for (const t of workflow.sort((a, b) => b.total - a.total)) {
    L(`   ${String(t.total).padStart(4)} total, ${String(t.live).padStart(3)} live   ${t.label}`);
  }

  L(`\n-- in use on the working list (${liveOnly.length}) --`);
  for (const t of liveOnly.sort((a, b) => b.live - a.live)) {
    L(`   ${String(t.live).padStart(4)} live / ${String(t.total).padStart(4)} total   ${t.label}${t.color ? "" : "   (no colour)"}`);
  }

  if (nearDupes.length) {
    L(`\n-- labels that differ only by punctuation or case --`);
    for (const g of nearDupes) L(`   ${g.join("   |   ")}`);
  }
  L(`\ntags with no colour set: ${uncoloured.length}`);

  writeFileSync(
    out,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        candidates: { total: candTotal, live: liveTotal },
        types: {
          metricRows: metrics.length,
          byStatus: Object.fromEntries(byStatus),
          peopleWithTypes,
          livePeopleWithTypes,
          distinctValues: typeCounts.size,
          junk,
          variants,
          all: sortedTypes.map(([value, e]) => ({ value, count: e.count, examples: e.people }))
        },
        tags: {
          count: tagRows.length,
          candidatesWithAnyTag,
          liveWithAnyTag,
          rows: tagRows,
          orphans: orphans.map((t) => t.label),
          archivedOnly: archivedOnly.map((t) => t.label),
          workflow: workflow.map((t) => t.label),
          nearDupes
        }
      },
      null,
      2
    )
  );
  L(`\nfull detail written to ${out}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
