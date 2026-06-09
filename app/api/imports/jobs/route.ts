import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { importJobRows } from "@/lib/imports/job-import";
import { parseCsv } from "@/lib/imports/csv";

export async function POST(request: Request) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return auth.response;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Upload a jobs CSV file." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ message: "Use the Job PDFs import card for PDF files." }, { status: 400 });
  }

  const rows = parseCsv(await file.text());
  if (!rows.length) return NextResponse.json({ message: "CSV did not contain importable job rows." }, { status: 400 });

  const result = await importJobRows({
    rows,
    sourceFilename: file.name,
    sourceType: "jobs-csv-import",
    importBatchType: "JOBS_CSV"
  });

  return NextResponse.json({
    ok: true,
    message: `Imported ${result.created + result.updated} jobs and created ${result.requirements} pilot requirement draft${result.requirements === 1 ? "" : "s"}.`,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    warnings: result.warnings
  });
}
