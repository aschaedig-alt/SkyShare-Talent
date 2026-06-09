import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { importJobRows } from "@/lib/imports/job-import";
import type { ParsedJobPdfRow } from "@/lib/imports/job-pdf-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) {
  return NextResponse.json(
    { message: "Unauthorized" },
    { status: 401 }
  );
}

  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const payload = (await request.json()) as {
      files?: Array<{ filename?: string; parser?: string; extractedCharacters?: number; records?: ParsedJobPdfRow[] }>;
    };
    const files = payload.files ?? [];
    if (!files.length) return NextResponse.json({ message: "No parsed PDF job rows were provided." }, { status: 400 });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let requirements = 0;
    let warnings = 0;
    const parsedFiles: Array<{ filename: string; parser: string; rows: number; extractedCharacters: number }> = [];

    for (const file of files) {
      const records = file.records ?? [];
      const filename = file.filename || "job-pdf-import.pdf";
      if (!records.length) {
        skipped += 1;
        warnings += 1;
        parsedFiles.push({ filename, parser: file.parser ?? "unknown", rows: 0, extractedCharacters: file.extractedCharacters ?? 0 });
        continue;
      }

      const result = await importJobRows({
        rows: records,
        sourceFilename: filename,
        sourceType: "job-pdf-import",
        importBatchType: "JOBS_PDF"
      });

      created += result.created;
      updated += result.updated;
      skipped += result.skipped;
      requirements += result.requirements;
      warnings += result.warnings;
      parsedFiles.push({ filename, parser: file.parser ?? "browser-pdf-parser", rows: records.length, extractedCharacters: file.extractedCharacters ?? 0 });
    }

    return NextResponse.json({
      ok: true,
      message: `Imported ${created + updated} PDF job records and created ${requirements} pilot requirement draft${requirements === 1 ? "" : "s"}.`,
      created,
      updated,
      skipped,
      warnings,
      files: files.length,
      parsedFiles
    });
  }

  return NextResponse.json(
    { message: "Refresh the Imports page and try again. Job PDFs are now extracted in your browser before saving." },
    { status: 400 }
  );
}
