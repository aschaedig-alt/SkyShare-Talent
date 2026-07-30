/**
 * DRY RUN. Reads PDFs with the coordinate form parser and writes a review file.
 * Writes NOTHING to the database — the point is to check every value against
 * the source document before anything lands in the shared live database.
 *
 *   npx tsx scripts/review-pdf-form-extract.ts <file-or-dir> [...]      local files
 *   npx tsx scripts/review-pdf-form-extract.ts --s3 [limit]             candidate files from S3
 *
 * S3 mode needs the credentials that live COMMENTED OUT in .env.local; this
 * script reads them from there for the run without modifying the file.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

// --- optional S3 credentials, read from the commented block in .env.local ----
if (process.argv.includes("--s3") && existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(
      /^#?\s*(FILE_STORAGE_PROVIDER|AWS_REGION|S3_CANDIDATE_FILES_BUCKET|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\s*=\s*(.+?)\s*$/
    );
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

import { parsePdfForm, mergeByPrecedence, type ParsedDocument } from "../lib/files/pdf-form";

type Doc = { owner: string; filename: string; bytes: Uint8Array };

function collectLocal(targets: string[]): Doc[] {
  const out: Doc[] = [];
  for (const target of targets) {
    if (!existsSync(target)) {
      console.error(`!! not found: ${target}`);
      continue;
    }
    const files = statSync(target).isDirectory()
      ? readdirSync(target).filter((f) => f.toLowerCase().endsWith(".pdf")).map((f) => path.join(target, f))
      : [target];
    for (const file of files) {
      out.push({
        // Group a person's documents together by the longest name-ish prefix.
        owner: path.basename(file).replace(/\.pdf$/i, "").replace(/(Resume|Application|Pilot App|Paycom Application_?)/gi, "").replace(/[_\-\s]+/g, " ").trim() || path.basename(file),
        filename: path.basename(file),
        bytes: new Uint8Array(readFileSync(file))
      });
    }
  }
  return out;
}

async function collectFromS3(limit: number): Promise<Doc[]> {
  const { prisma } = await import("../lib/prisma");
  const { getFileStorageAdapter } = await import("../lib/files/storage-adapter");
  const rows = await prisma.$queryRawUnsafe<Array<{ owner: string; filename: string; key: string }>>(
    `SELECT c."displayName" AS owner, f."displayFilename" AS filename, f."storageKey" AS key
       FROM "Candidate" c JOIN "CandidateFile" f ON f."candidateId" = c."id"
      WHERE f."storageKey" IS NOT NULL AND c."status" = 'ACTIVE'
        AND f."displayFilename" ILIKE '%.pdf'
      ORDER BY c."displayName"
      LIMIT ${Math.max(1, Math.min(400, limit))}`
  );
  const storage = getFileStorageAdapter();
  const out: Doc[] = [];
  let missing = 0;
  for (const row of rows) {
    try {
      const { bytes } = await storage.read(row.key);
      out.push({ owner: row.owner, filename: row.filename, bytes: new Uint8Array(bytes) });
    } catch {
      missing += 1;
    }
  }
  console.log(`S3: ${out.length} downloaded, ${missing} missing from the bucket`);
  await prisma.$disconnect();
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const s3 = args.includes("--s3");
  const docs = s3
    ? await collectFromS3(Number(args[args.indexOf("--s3") + 1]) || 40)
    : collectLocal(args.filter((a) => !a.startsWith("--")));

  if (docs.length === 0) {
    console.error("Nothing to read. Pass PDF paths, a directory, or --s3 [limit].");
    process.exit(1);
  }

  const byOwner = new Map<string, Array<{ filename: string; parsed: Awaited<ReturnType<typeof parsePdfForm>> }>>();
  let recognised = 0;
  for (const doc of docs) {
    let parsed;
    try {
      parsed = await parsePdfForm(doc.bytes);
    } catch (error) {
      console.error(`!! ${doc.filename}: ${(error as Error).message}`);
      continue;
    }
    if (parsed.template) recognised += 1;
    const list = byOwner.get(doc.owner) ?? [];
    list.push({ filename: doc.filename, parsed });
    byOwner.set(doc.owner, list);
  }

  const lines: string[] = [];
  lines.push(`# PDF form extraction — review`);
  lines.push("");
  lines.push(`Dry run. Nothing was written to the database.`);
  lines.push("");
  lines.push(`- documents read: **${docs.length}**`);
  lines.push(`- template recognised: **${recognised}** · unrecognised: **${docs.length - recognised}**`);
  lines.push(`- people: **${byOwner.size}**`);
  lines.push("");
  lines.push(
    `Precedence when documents disagree: **Pilot Application → resume → Paycom**. ` +
      `Every figure is self-reported by the candidate, so a conflict is a question for a human, not a bug.`
  );
  lines.push("");

  let conflictCount = 0;

  for (const [owner, entries] of [...byOwner].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`## ${owner}`);
    lines.push("");

    for (const entry of entries) {
      const t = entry.parsed.template;
      lines.push(`### ${entry.filename}`);
      lines.push("");
      if (!t) {
        lines.push(`_No known template matched — falls back to the LLM extractor._`);
        lines.push("");
        continue;
      }
      lines.push(`Template: **${t.label}** (\`${t.id}\`), ${entry.parsed.pageCount} page(s)`);
      lines.push("");
      if (entry.parsed.fields.length === 0) {
        lines.push(`_Template matched but no fields paired — worth a look._`);
        lines.push("");
        continue;
      }
      lines.push(`| metric | value | read from (verbatim) |`);
      lines.push(`| --- | --- | --- |`);
      for (const field of entry.parsed.fields) {
        const evidence = field.evidence.length > 150 ? `${field.evidence.slice(0, 150)}…` : field.evidence;
        lines.push(`| \`${field.metricKey}\` | **${field.value}** | ${evidence.replace(/\|/g, "\\|")} |`);
      }
      lines.push("");
    }

    const parsedDocs: ParsedDocument[] = entries
      .filter((e) => e.parsed.template)
      .map((e) => ({ templateId: e.parsed.template!.id, fields: e.parsed.fields }));
    const merged = mergeByPrecedence(parsedDocs);

    if (merged.length > 0) {
      lines.push(`**Resolved for ${owner}**`);
      lines.push("");
      lines.push(`| metric | winning value | source | conflicts |`);
      lines.push(`| --- | --- | --- | --- |`);
      for (const metric of merged.sort((a, b) => a.metricKey.localeCompare(b.metricKey))) {
        const conflicts =
          metric.conflicts.length === 0
            ? "—"
            : metric.conflicts.map((c) => `**${c.value}** (${c.templateId})`).join(", ");
        if (metric.conflicts.length > 0) conflictCount += 1;
        lines.push(`| \`${metric.metricKey}\` | **${metric.value}** | ${metric.fromTemplateId} | ${conflicts} |`);
      }
      lines.push("");
    }
  }

  lines.splice(
    9,
    0,
    `- metrics with a cross-document **conflict**: **${conflictCount}**`
  );

  const outPath = path.join(process.cwd(), "pdf-form-extract-review.md");
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`\nreview written to ${outPath}`);
  console.log(`documents ${docs.length} · recognised ${recognised} · people ${byOwner.size} · conflicts ${conflictCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
