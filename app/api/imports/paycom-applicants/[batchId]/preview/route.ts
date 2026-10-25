import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { buildPreview } from "@/lib/paycom/applicant-import";
import { loadBatch, readBatchUploads, saveSummary } from "@/lib/paycom/applicant-batch";

// Reading two bundles of ~450 pages and matching 100 people takes tens of seconds.
export const maxDuration = 300;

type RouteContext = { params: Promise<{ batchId: string }> };

/** Read the uploaded zips and work out what would happen. Writes only the batch's own summary. */
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { batchId } = await context.params;
  const loaded = await loadBatch(batchId);
  if (!loaded) return NextResponse.json({ message: "No such Paycom upload." }, { status: 404 });
  if (loaded.batch.status.includes("UNDONE")) {
    return NextResponse.json({ message: "This upload was undone. Upload the files again." }, { status: 409 });
  }

  try {
    const read = await readBatchUploads(loaded.summary);
    const preview = await buildPreview(read);
    await saveSummary(
      batchId,
      { ...loaded.summary, applications: read.applications, preview },
      {
        status: loaded.batch.status === "UPLOADING" ? "PREVIEWED" : loaded.batch.status,
        rowCount: read.applications.length,
        warningCount: preview.problems.length
      }
    );
    return NextResponse.json({ ok: true, batchId, preview });
  } catch (error) {
    console.error("Paycom applicant preview failed:", error);
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ message: `Could not read the upload: ${message}` }, { status: 500 });
  }
}
