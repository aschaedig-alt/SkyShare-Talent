import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { readExportBytes } from "@/lib/paycom/employee-export";
import { SOURCE_TYPE, asOfFromFilename, buildPreview, loadBaseline } from "@/lib/paycom/employee-import";
import type { EmployeeBatchSummary } from "@/lib/paycom/employee-batch";

export const maxDuration = 120;

// The Oct 16 export of everybody since 2021 is ~40 KB; Vercel takes ~4.5 MB per request.
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Upload Paycom's employee export and preview it. Writes only the batch that remembers
 * the preview - nothing on anybody's record changes until apply.
 */
export async function POST(request: Request) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Choose Paycom's employee export (.xlsx)." }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name) || file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ message: `${file.name} is not an .xlsx export, is empty, or is over 4 MB.` }, { status: 400 });
  }
  const typed = String(form.get("asOf") ?? "").trim();
  if (typed && !/^\d{4}-\d{2}-\d{2}$/.test(typed)) return NextResponse.json({ message: "The export date must be YYYY-MM-DD." }, { status: 400 });
  const fromName = asOfFromFilename(file.name);
  const asOf = typed || fromName || new Date().toISOString().slice(0, 10);

  try {
    const rows = readExportBytes(new Uint8Array(await file.arrayBuffer()));
    if (!rows.length) return NextResponse.json({ message: "No employees in that file." }, { status: 400 });
    const baseline = await loadBaseline();
    const { preview, positions } = await buildPreview({ rows, file: file.name, asOf, asOfFrom: typed ? "typed" : fromName ? "file name" : "upload day", baseline });
    const summary: EmployeeBatchSummary = {
      file: file.name, asOf, rows, preview, positions, previousPositions: baseline?.positions ?? null, uploadedBy: auth.user.email ?? null
    };
    const batch = await prisma.importBatch.create({
      data: {
        sourceType: SOURCE_TYPE,
        sourceFilename: file.name,
        status: "PREVIEWED",
        rowCount: rows.length,
        warningCount: preview.forPerson.length + preview.unmatched.length,
        summaryJson: JSON.stringify(summary)
      }
    });
    return NextResponse.json({ ok: true, batchId: batch.id, preview });
  } catch (error) {
    console.error("Paycom employee preview failed:", error);
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ message: `Could not read the export: ${message}` }, { status: 400 });
  }
}
