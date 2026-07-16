// Re-run the candidate duplicate scan so historical(Jazz)↔new matches surface as
// DuplicateReviewItems (which drive the profile "Historical record" panel).
// Creates review items only — no merges/deletes.
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });
import { scanCandidateDuplicates } from "../lib/duplicates/candidate-scan";
import { prisma } from "../lib/prisma";

async function main() {
  const result = await scanCandidateDuplicates();
  console.log("Scan result:", JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
