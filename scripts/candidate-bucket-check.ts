/**
 * READ-ONLY. Runs lib/candidates/buckets.ts over the LIVE database and prints
 * the bucket sizes, so the segment rail's numbers can be checked against real
 * data before any UI is built on them.
 *
 * Prints the full scope every time, not just the bucket being questioned: an
 * empty bucket and a broken query look identical from one number.
 *
 *   npx tsx scripts/candidate-bucket-check.ts
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { prisma } from "@/lib/prisma";
import {
  applicationOutcome,
  bucketOf,
  dispositionGroup,
  sortApplicationsForDisplay,
  BUCKET_ORDER,
  BUCKET_LABEL,
  type CandidateBucket
} from "@/lib/candidates/buckets";

async function main() {
  const candidates = await prisma.candidate.findMany({
    where: { status: { not: "MERGED" } },
    select: {
      id: true,
      displayName: true,
      origin: true,
      archivedAt: true,
      applications: {
        select: {
          appliedAt: true,
          status: true,
          disposition: true,
          offerStatus: true,
          origin: true,
          job: { select: { title: true } },
          historicalJobTitle: true
        }
      }
    }
  });

  const counts = new Map<CandidateBucket, number>();
  const groupCounts = new Map<string, number>();
  const examples = new Map<CandidateBucket, string[]>();

  for (const c of candidates) {
    const apps = sortApplicationsForDisplay(c.applications).map((a) => {
      const outcome = applicationOutcome(a.status, a.disposition, a.offerStatus);
      const group = dispositionGroup(a.status, outcome);
      groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
      return { outcome, group };
    });

    // A Jazz-origin record that is archived is the historical archive. An
    // ACTIVE Jazz record has been pulled back into the live pipeline and is not.
    const isHistorical = c.origin === "JAZZ" && c.archivedAt !== null;
    const bucket = bucketOf(apps, isHistorical);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);

    const ex = examples.get(bucket) ?? [];
    if (ex.length < 3) {
      const lead = sortApplicationsForDisplay(c.applications)[0];
      ex.push(
        `${c.displayName} — ${c.applications.length} app(s)` +
          (lead ? ` · latest: ${lead.job?.title ?? lead.historicalJobTitle ?? "(no job)"} / ${lead.status ?? "(no status)"}` : " · none")
      );
      examples.set(bucket, ex);
    }
  }

  const total = candidates.length;
  console.log(`=== BUCKETS (${total} candidates, MERGED excluded) ===\n`);
  let sum = 0;
  for (const b of BUCKET_ORDER) {
    const n = counts.get(b) ?? 0;
    sum += n;
    console.log(`${BUCKET_LABEL[b].padEnd(14)} ${String(n).padStart(6)}`);
    for (const e of examples.get(b) ?? []) console.log(`               ${e}`);
  }
  console.log(`${"TOTAL".padEnd(14)} ${String(sum).padStart(6)}   (must equal ${total})`);
  if (sum !== total) console.log("!! MISMATCH — some candidate fell through the ladder");

  console.log("\n=== DISPOSITION GROUPS across all applications ===");
  const rows = [...groupCounts.entries()].sort((a, b) => b[1] - a[1]);
  const appTotal = rows.reduce((n, r) => n + r[1], 0);
  for (const [g, n] of rows) console.log(`${g.padEnd(16)} ${String(n).padStart(6)}`);
  console.log(`${"TOTAL".padEnd(16)} ${String(appTotal).padStart(6)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
