import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";
import { generateCandidateSummary } from "../lib/archive/ai-summary";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// --limit N : only do the first N (great for a test run)
// --force   : regenerate even candidates that already have a summary
// --all     : include every candidate, not just historical (Jazz) ones
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? parseInt(process.argv[i + 1] || "", 10) : null;
})();
const FORCE = process.argv.includes("--force");
const ALL = process.argv.includes("--all");
const CONCURRENCY = 4;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("\nANTHROPIC_API_KEY is not set — add it to .env.local first.\n");
    await prisma.$disconnect();
    return;
  }

  const where = {
    ...(ALL ? {} : { OR: [{ origin: "JAZZ" }, { historicalSourceId: { not: null } }] }),
    ...(FORCE ? {} : { aiSummary: { is: null } })
  };

  let ids = (await prisma.candidate.findMany({ where, select: { id: true }, orderBy: { displayName: "asc" } })).map((c) => c.id);
  if (LIMIT) ids = ids.slice(0, LIMIT);

  console.log(`\n=== GENERATE AI SUMMARIES ===`);
  console.log(`Candidates to process: ${ids.length}${FORCE ? " (force regenerate)" : " (missing a summary)"}`);
  console.log(`Model: ${process.env.ARCHIVE_SUMMARY_MODEL || "claude-haiku-4-5"}  |  concurrency: ${CONCURRENCY}\n`);

  let done = 0, generated = 0, cached = 0, errors = 0;

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    await Promise.all(
      ids.slice(i, i + CONCURRENCY).map(async (id) => {
        try {
          const r = await generateCandidateSummary(id, FORCE);
          if (r.regenerated) generated++;
          else cached++;
        } catch (e) {
          errors++;
          if (errors <= 5) console.log(`  error on ${id}: ${(e as Error).message.slice(0, 120)}`);
        } finally {
          done++;
          if (done % 50 === 0) console.log(`  ...${done}/${ids.length}  (generated ${generated}, errors ${errors})`);
        }
      })
    );
  }

  console.log(`\n--- Done ---`);
  console.log(`Newly generated ... ${generated}`);
  console.log(`Already current ... ${cached}`);
  console.log(`Errors ............ ${errors}\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
