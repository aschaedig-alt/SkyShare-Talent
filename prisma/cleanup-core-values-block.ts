// Core Values content block cleanup:
//   1) Normalize v3 (current) formatting so every line is "[b]Name:[/b] Definition".
//   2) Delete the unused history versions v1 + v2 (old Safety First / Own the Outcome).
// No job post is pinned to v1/v2 (verified), so deleting them is safe.
//   npx tsx prisma/cleanup-core-values-block.ts            (preview)
//   npx tsx prisma/cleanup-core-values-block.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const commit = process.argv.includes("--commit");
const log = (s: string) => console.log((commit ? "✓ " : "· ") + s);

const NORMALIZED_BODY = [
  "[b]Fueled by Passion:[/b] Approaches work with energy, enthusiasm, and a commitment to excellence. Demonstrates a love for aviation and a drive to deliver exceptional results.",
  "[b]Team Alignment:[/b] Works collaboratively across departments, aligning goals and actions with the broader team to ensure seamless operations.",
  "[b]Deliver the Wow:[/b] Creates memorable and high-impact experiences for customers, colleagues, and partners by exceeding expectations.",
  "[b]Solutions Focused:[/b] Approaches challenges with a proactive, problem-solving mindset to ensure efficiency and effectiveness."
].join("\n");
const PLAIN = NORMALIZED_BODY.replace(/\[\/?b\]/g, "");

async function main() {
  const block = await prisma.contentBlock.findFirst({
    where: { name: "Core Values" },
    select: { id: true, currentVersionId: true, versions: { select: { id: true, versionNumber: true } } }
  });
  if (!block) throw new Error("Core Values block not found");

  const current = block.versions.find((v) => v.id === block.currentVersionId);
  const olders = block.versions.filter((v) => v.id !== block.currentVersionId);
  if (!current) throw new Error("No current version resolved");

  // Safety: never delete a version a job post is pinned to.
  for (const v of olders) {
    const pinned = await prisma.jobBlockInstance.count({ where: { blockVersionId: v.id } });
    if (pinned > 0) throw new Error(`v${v.versionNumber} is pinned by ${pinned} job post(s) — aborting`);
  }

  log(`Normalize current version (v${current.versionNumber}) formatting`);
  log(`Delete ${olders.length} old version(s): ${olders.map((v) => `v${v.versionNumber}`).join(", ")}`);

  if (commit) {
    await prisma.contentBlockVersion.update({ where: { id: current.id }, data: { body: NORMALIZED_BODY, plainText: PLAIN } });
    await prisma.contentBlockVersion.deleteMany({ where: { id: { in: olders.map((v) => v.id) } } });
  }

  console.log(`\n${commit ? "APPLIED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
