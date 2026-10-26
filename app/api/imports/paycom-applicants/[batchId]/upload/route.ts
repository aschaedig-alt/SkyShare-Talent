import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { UPLOAD_PART_BYTES, loadBatch, partKey } from "@/lib/paycom/applicant-batch";

type RouteContext = { params: Promise<{ batchId: string }> };

/**
 * One part of one uploaded file: POST ?file=<index>&part=<index>, the raw bytes as the
 * body. Every part but the last is exactly UPLOAD_PART_BYTES, so a part of the wrong
 * size is refused here rather than discovered as a corrupt zip at preview time.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { batchId } = await context.params;
  const loaded = await loadBatch(batchId);
  if (!loaded) return NextResponse.json({ message: "No such Paycom upload." }, { status: 404 });
  if (loaded.batch.status !== "UPLOADING") return NextResponse.json({ message: "This upload has already been read." }, { status: 409 });

  const url = new URL(request.url);
  const fileIndex = Number(url.searchParams.get("file"));
  const part = Number(url.searchParams.get("part"));
  const upload = loaded.summary.uploads[fileIndex];
  if (!upload || !Number.isInteger(part) || part < 0 || part >= upload.parts) {
    return NextResponse.json({ message: "That part does not belong to this upload." }, { status: 400 });
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  const expected = part === upload.parts - 1 ? upload.size - part * UPLOAD_PART_BYTES : UPLOAD_PART_BYTES;
  if (bytes.byteLength !== expected) {
    return NextResponse.json({ message: `${upload.name} part ${part + 1} arrived as ${bytes.byteLength} bytes, expected ${expected}.` }, { status: 400 });
  }

  await getFileStorageAdapter().write({
    storageKey: partKey(upload, part),
    bytes,
    contentType: "application/octet-stream",
    metadata: { source: "paycom-applicant-upload", importBatchId: batchId, uploadedByEmail: auth.user.email ?? "unknown" }
  });
  return NextResponse.json({ ok: true });
}
