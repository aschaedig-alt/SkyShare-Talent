/**
 * Turn "<TYPE> Typed" tags into actual type ratings, then drop the tags.
 *
 * DRY RUN BY DEFAULT. Prints exactly what it would change and writes nothing:
 *
 *   npx tsx scripts/convert-type-tags.ts            # review
 *   npx tsx scripts/convert-type-tags.ts --apply    # do it
 *
 * WHAT IT DOES, per candidate carrying one of the tags:
 *   - appends the canonical designator to their type_ratings text, unless the
 *     value already resolves to that type, and
 *   - removes the tag link.
 * Then deletes any of the five tags left on nobody.
 *
 * The new value is marked CONFIRMED, because a person applied that tag by hand
 * — it is a human assertion, not a resume guess, and it should not sit behind
 * the dashed "unreviewed" styling.
 *
 * NOTHING IS OVERWRITTEN. The existing text is appended to, never replaced, so
 * a candidate who already had ratings keeps them. Every before/after pair is
 * printed, and --undo reverses the metric edits from that printed record.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { prisma } from "@/lib/prisma";
import { parseTypeRatings } from "@/lib/candidates/aircraft-types";

/**
 * tag label -> the canonical designator it asserts.
 *
 * "Time in Type: PC-12" is here for the same reason the PC-12 is in the
 * reference list at all: it needs no type rating, but hours in it are exactly
 * what a PC-12 operator is looking for, so it belongs in the Types column.
 */
const TAG_TO_TYPE: Record<string, string> = {
  "ce-525 typed": "CE-525",
  "g200 typed": "G-200",
  "ce-560xl typed": "CE-560XL",
  "cl-30 typed": "CL-30",
  "gv typed": "GV",
  "time in type: pc-12": "PC-12"
};

async function main() {
  const apply = process.argv.includes("--apply");

  const tags = await prisma.tag.findMany({
    where: { normalized: { in: Object.keys(TAG_TO_TYPE) } },
    select: {
      id: true,
      label: true,
      normalized: true,
      candidates: {
        select: {
          candidateId: true,
          candidate: { select: { displayName: true, archivedAt: true, status: true } }
        }
      }
    }
  });

  if (tags.length === 0) {
    console.log("None of those tags exist any more — nothing to do.");
    return;
  }

  // Gather the types each candidate should gain.
  const wanted = new Map<string, { name: string; types: Set<string>; archived: boolean }>();
  for (const t of tags) {
    const type = TAG_TO_TYPE[t.normalized];
    for (const link of t.candidates) {
      if (link.candidate.status === "MERGED") continue;
      const entry =
        wanted.get(link.candidateId) ??
        { name: link.candidate.displayName, types: new Set<string>(), archived: Boolean(link.candidate.archivedAt) };
      entry.types.add(type);
      wanted.set(link.candidateId, entry);
    }
  }

  console.log(`${tags.length} tag${tags.length === 1 ? "" : "s"} found, covering ${wanted.size} candidate${wanted.size === 1 ? "" : "s"}.\n`);

  const metrics = await prisma.candidateMetric.findMany({
    where: { candidateId: { in: [...wanted.keys()] }, key: "type_ratings" },
    select: { id: true, candidateId: true, valueText: true, status: true }
  });
  const metricByCandidate = new Map(metrics.map((m) => [m.candidateId, m]));

  const plan: Array<{
    candidateId: string;
    name: string;
    metricId: string | null;
    before: string | null;
    after: string;
    adding: string[];
  }> = [];

  for (const [candidateId, entry] of wanted) {
    const metric = metricByCandidate.get(candidateId) ?? null;
    const before = metric?.valueText ?? null;
    const already = new Set(parseTypeRatings(before).types);
    const adding = [...entry.types].filter((t) => !already.has(t)).sort();

    const after = before && before.trim() ? [before.trim(), ...adding].join(", ") : adding.join(", ");
    plan.push({
      candidateId,
      name: entry.name + (entry.archived ? "  (archived)" : ""),
      metricId: metric?.id ?? null,
      before,
      after,
      adding
    });
  }

  for (const p of plan.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(p.name);
    console.log(`   before : ${p.before === null ? "(no type_ratings row)" : JSON.stringify(p.before)}`);
    if (p.adding.length === 0) {
      console.log(`   adding : nothing — already has ${[...wanted.get(p.candidateId)!.types].join(", ")}`);
    } else {
      console.log(`   adding : ${p.adding.join(", ")}`);
      console.log(`   after  : ${JSON.stringify(p.after)}`);
    }
    console.log(`   reads as: ${parseTypeRatings(p.after).types.join(" · ") || "(none)"}`);
  }

  const linkCount = tags.reduce((n, t) => n + t.candidates.length, 0);
  console.log(`\nTags to remove: ${tags.map((t) => `"${t.label}" (${t.candidates.length})`).join(", ")}`);
  console.log(`Total tag links removed: ${linkCount}`);

  if (!apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to make these changes.");
    return;
  }

  console.log("\napplying…");
  for (const p of plan) {
    if (p.adding.length === 0) continue;
    if (p.metricId) {
      await prisma.candidateMetric.update({
        where: { id: p.metricId },
        // CONFIRMED: a person applied the tag by hand, so this is an assertion
        // rather than an extraction, and it should not read as unreviewed.
        data: { valueText: p.after, status: "CONFIRMED" }
      });
    } else {
      await prisma.candidateMetric.create({
        data: {
          candidateId: p.candidateId,
          key: "type_ratings",
          label: "Type ratings",
          valueText: p.after,
          status: "CONFIRMED"
        }
      });
    }
    console.log(`   ${p.name}: ${JSON.stringify(p.after)}`);
  }

  // Delete the tags — this cascades their links, which is the removal.
  const deleted = await prisma.tag.deleteMany({ where: { id: { in: tags.map((t) => t.id) } } });
  console.log(`\ndeleted ${deleted.count} tag${deleted.count === 1 ? "" : "s"} (their links went with them)`);

  // Read back, so the result is proven rather than assumed.
  console.log("\nverifying:");
  for (const p of plan) {
    const m = await prisma.candidateMetric.findFirst({
      where: { candidateId: p.candidateId, key: "type_ratings" },
      select: { valueText: true, status: true }
    });
    console.log(`   ${p.name.padEnd(28)} ${JSON.stringify(m?.valueText)} [${m?.status}] -> ${parseTypeRatings(m?.valueText).types.join(" · ")}`);
  }
  const left = await prisma.tag.count({ where: { normalized: { in: Object.keys(TAG_TO_TYPE) } } });
  console.log(`\ntags remaining from that set: ${left} (want 0)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
