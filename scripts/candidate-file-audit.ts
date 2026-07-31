/**
 * Find candidate documents whose bytes are missing from S3, and optionally
 * repair the ones whose bytes are still sitting on this machine.
 *
 * WHY: local dev defaults to writing files to local disk while the DATABASE is
 * shared with production. Anything uploaded from a laptop without
 * FILE_STORAGE_PROVIDER=s3 therefore creates a live database row pointing at an
 * S3 key that was never written — the document looks present on the profile and
 * fails to open. Kevin Wayman's Jul 27 pilot application was found this way.
 *
 * Read-only by default. With --apply it uploads local copies to the key the row
 * ALREADY references, so no database row is touched — the object is simply put
 * where the row always said it was.
 *
 *   npx tsx scripts/candidate-file-audit.ts
 *   npx tsx scripts/candidate-file-audit.ts --apply
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

process.env.FILE_STORAGE_PROVIDER = "s3";
process.env.S3_CANDIDATE_FILES_BUCKET ??= "skyshare-talent-candidate-files";
process.env.AWS_REGION = "us-east-2";

import fs from "node:fs";
import path from "node:path";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";

const BUCKET = process.env.S3_CANDIDATE_FILES_BUCKET!;

async function listAllKeys(): Promise<Set<string>> {
  const client = new S3Client({ region: process.env.AWS_REGION });
  const keys = new Set<string>();
  let token: string | undefined;
  do {
    const res = await client.send(new ListObjectsV2Command({ Bucket: BUCKET, ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key) keys.add(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function main() {
  const apply = process.argv.includes("--apply");
  // Repair a single person first and prove the path before touching the rest.
  const filterArg = process.argv.indexOf("--filter");
  const filter = filterArg > -1 ? process.argv[filterArg + 1]?.toLowerCase() : null;

  const keys = await listAllKeys();
  console.log(`S3 holds ${keys.size} objects in ${BUCKET}`);

  const rows = await prisma.candidateFile.findMany({
    select: {
      id: true, displayFilename: true, storageKey: true, sizeBytes: true, source: true, uploadedAt: true,
      candidate: { select: { id: true, displayName: true } }
    },
    orderBy: { uploadedAt: "asc" }
  });
  console.log(`Database holds ${rows.length} candidate file rows\n`);

  const missing = rows.filter((r) => r.storageKey && !keys.has(r.storageKey));
  console.log(`${missing.length} rows point at an object that is NOT in S3\n`);

  const repairable: typeof missing = [];
  const bySource: Record<string, number> = {};

  for (const r of missing) {
    bySource[r.source ?? "(none)"] = (bySource[r.source ?? "(none)"] ?? 0) + 1;
    const local = path.join(process.cwd(), "storage", r.storageKey);
    const here = fs.existsSync(local);
    if (here) repairable.push(r);
    console.log(
      `${here ? "REPAIRABLE" : "LOST      "} ${r.uploadedAt.toISOString().slice(0, 10)} ${r.candidate?.displayName ?? "(unassigned)"} — ${r.displayFilename} (${r.source ?? "-"})`
    );
  }

  console.log(`\nby source: ${JSON.stringify(bySource)}`);
  console.log(`${repairable.length} of ${missing.length} have their bytes on THIS machine and can be repaired`);

  if (!apply) {
    if (repairable.length) console.log("\nRe-run with --apply to upload those local copies to S3.");
    return;
  }

  const storage = getFileStorageAdapter();
  if (storage.provider !== "s3") throw new Error("Refusing to repair: storage provider is not S3.");

  const targets = filter
    ? repairable.filter((r) => (r.candidate?.displayName ?? "").toLowerCase().includes(filter))
    : repairable;
  if (filter) console.log(`\n--filter ${filter}: repairing ${targets.length} of ${repairable.length}`);

  let fixed = 0;
  for (const r of targets) {
    const local = path.join(process.cwd(), "storage", r.storageKey);
    const bytes = fs.readFileSync(local);
    if (r.sizeBytes && bytes.byteLength !== r.sizeBytes) {
      console.log(`SKIP  ${r.displayFilename} — local copy is ${bytes.byteLength}B but the row says ${r.sizeBytes}B`);
      continue;
    }
    await storage.write({
      storageKey: r.storageKey,
      bytes,
      contentType: r.displayFilename.toLowerCase().endsWith(".pdf") ? "application/pdf" : null,
      metadata: { candidateId: r.candidate?.id ?? "", source: r.source ?? "repair", repairedFrom: "local-dev-disk" }
    });
    fixed++;
    console.log(`REPAIRED ${r.candidate?.displayName} — ${r.displayFilename} (${bytes.byteLength}B)`);
  }
  console.log(`\nrepaired=${fixed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
