/**
 * READ-ONLY: pull the screenshots attached to feedback reports onto disk so they
 * can actually be looked at.
 *
 * WHY THIS EXISTS. Feedback screenshots are uploaded by real users on the live
 * site, so they land in S3. A developer machine has no S3 configuration, so
 * getFileStorageAdapter() quietly resolves to the local-disk provider and looks
 * for them under ./storage — where they have never existed. The failure is
 * silent and confusing: the database row is right there with an imageKey, a
 * filename and a byte count, so the screenshot LOOKS present and simply cannot
 * be opened. All seven of the July reports failed this way.
 *
 * This uses the app's OWN storage adapter rather than reimplementing the path
 * logic, so it follows FILE_STORAGE_PROVIDER and cannot drift from what the app
 * itself reads.
 *
 * USAGE
 *   npx tsx scripts/feedback-image.ts                 report every screenshot + whether it is reachable
 *   npx tsx scripts/feedback-image.ts <feedbackId>    fetch just that one
 *   npx tsx scripts/feedback-image.ts --out <dir>     where to write (default ./storage/_feedback-images)
 *
 * TO MAKE S3 IMAGES REACHABLE LOCALLY, set in .env.local (git-ignored):
 *   FILE_STORAGE_PROVIDER=s3
 *   S3_CANDIDATE_FILES_BUCKET=<bucket>
 *   AWS_REGION=<region>
 *   AWS_ACCESS_KEY_ID=<READ-ONLY key>
 *   AWS_SECRET_ACCESS_KEY=<READ-ONLY secret>
 *
 * Use a credential with s3:GetObject on that bucket and nothing else. These
 * screenshots routinely contain candidate PII, and a key that can also write or
 * delete is a far bigger loss if it leaks.
 *
 * Both env files are loaded because .env holds only DATABASE_URL — a script that
 * loads .env alone sees no storage configuration and reports a false negative.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { getFileStorageAdapter } from "../lib/files/storage-adapter";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/** Trust the stored filename's extension, then the mime type, then assume PNG. */
function extensionFor(mime: string | null, name: string | null): string {
  const fromName = name ? path.extname(name) : "";
  if (fromName) return fromName;
  if (mime?.includes("png")) return ".png";
  if (mime?.includes("jpeg") || mime?.includes("jpg")) return ".jpg";
  if (mime?.includes("webp")) return ".webp";
  return ".png";
}

async function main() {
  const outDir = argValue("--out") ?? path.join("storage", "_feedback-images");
  const wantedId = process.argv.slice(2).find((a) => !a.startsWith("--") && a !== outDir) ?? null;

  const storage = getFileStorageAdapter();
  console.log(`storage provider : ${storage.provider}`);
  console.log(`FILE_STORAGE_PROVIDER=${process.env.FILE_STORAGE_PROVIDER ?? "(unset)"}  bucket=${process.env.S3_CANDIDATE_FILES_BUCKET ?? "(unset)"}\n`);

  const rows = await prisma.feedback.findMany({
    where: wantedId ? { id: wantedId } : { imageKey: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, imageKey: true, imageName: true, imageMime: true, imageSizeBytes: true,
      message: true, page: true, createdAt: true
    }
  });

  if (rows.length === 0) {
    console.log(wantedId ? `No feedback with id ${wantedId}.` : "No feedback has a screenshot attached.");
    await prisma.$disconnect();
    return;
  }

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  let reachable = 0;
  let unreachable = 0;
  for (const row of rows) {
    console.log(`${row.createdAt.toISOString().slice(0, 10)}  ${row.id}`);
    console.log(`   ${row.message.replace(/\s+/g, " ").trim().slice(0, 96)}`);
    if (!row.imageKey) {
      console.log(`   (no screenshot attached)\n`);
      continue;
    }
    try {
      const { bytes } = await storage.read(row.imageKey);
      const file = path.join(outDir, `${row.id}${extensionFor(row.imageMime, row.imageName)}`);
      writeFileSync(file, Buffer.from(bytes));
      console.log(`   SAVED  ${file}  (${bytes.byteLength} bytes)\n`);
      reachable++;
    } catch (error) {
      console.log(`   UNREACHABLE  ${error instanceof Error ? error.message : String(error)}\n`);
      unreachable++;
    }
  }

  console.log(`reachable: ${reachable}   unreachable: ${unreachable}`);
  if (unreachable > 0 && storage.provider !== "s3") {
    console.log(
      `\nThese were uploaded on the live site, so they are in S3 — and this machine is\n` +
      `using the "${storage.provider}" provider, which only ever looks at local disk.\n` +
      `See the header of this file for the read-only S3 settings to add to .env.local.`
    );
  }
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("FAILED:", error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
