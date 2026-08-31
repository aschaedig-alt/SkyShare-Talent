import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { importJobRows } from "@/lib/imports/job-import";
import { parseCsv } from "@/lib/imports/csv";

export async function POST(request: Request) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) {
  return NextResponse.json(
    { message: "Unauthorized" },
    { status: 401 }
  );
}

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
    message:
      `Imported ${result.created + result.updated} jobs and created ${result.requirements} pilot requirement draft${result.requirements === 1 ? "" : "s"}.` +
      // Reviving a requirement puts a role back on the Matchboard, so it is said out
      // loud rather than left to be discovered.
      (result.requirementsReactivated
        ? ` Also reactivated ${result.requirementsReactivated} existing requirement${result.requirementsReactivated === 1 ? "" : "s"} whose job is open again.`
        : ""),
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    warnings: result.warnings,
    requirementsReactivated: result.requirementsReactivated
  });
}
