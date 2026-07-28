import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSupportedCandidateFile, sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { createOrientationStorageKey } from "@/lib/files/orientation-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { requireApiPermission } from "@/lib/auth/route-auth";

/**
 * The lunch order confirmation for one orientation session: upload, download,
 * remove. One file per session, held in inline columns rather than a table —
 * there is exactly one confirmation and a join table would earn nothing.
 *
 * GET is gated the same as the rest of orientation rather than left open: a
 * catering confirmation carries a staff name, a phone number and a headcount.
 */

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 25 * 1024 * 1024;

function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "name" in value;
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const auth = await requireApiPermission("files:write");
    if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const session = await prisma.orientationSession.findUnique({
      where: { id },
      select: { id: true, lunchFileKey: true }
    });
    if (!session) return NextResponse.json({ message: "Session not found." }, { status: 404 });

    const storage = getFileStorageAdapter();
    if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
      return NextResponse.json(
        { message: "File uploads are disabled until private S3 storage is configured for this environment." },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.getAll("files").filter(isFileLike)[0];
    if (!file) return NextResponse.json({ message: "Choose a file to upload." }, { status: 400 });

    const originalFilename = sanitizeFilename(file.name);
    if (!isSupportedCandidateFile(originalFilename)) {
      return NextResponse.json({ message: `${originalFilename} is not a supported file type.` }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ message: `${originalFilename} is larger than the 25 MB limit.` }, { status: 400 });
    }

    const storageKey = createOrientationStorageKey(id, originalFilename);
    await storage.write({
      storageKey,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || null,
      metadata: { sessionId: id, source: "orientation-lunch-confirmation", uploadedByEmail: auth.user.email ?? "" }
    });

    // Replacing an existing confirmation just repoints the row. The previous
    // blob is left in place — the adapter has no delete, and travel receipts
    // already work this way (see app/api/travel/receipts/[id]/route.ts). Adding
    // one is worth doing, but not as a side effect of the lunch feature.
    await prisma.orientationSession.update({
      where: { id },
      data: {
        lunchFileKey: storageKey,
        lunchFileName: originalFilename,
        lunchFileMime: file.type || null,
        lunchFileSizeBytes: file.size
      }
    });

    return NextResponse.json({
      ok: true,
      file: { name: originalFilename, mime: file.type || null, sizeBytes: file.size }
    });
  } catch (error) {
    console.error("Lunch confirmation upload error:", error);
    return NextResponse.json({ message: "Unable to upload the confirmation." }, { status: 500 });
  }
}

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const auth = await requireApiPermission("files:read");
    if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const session = await prisma.orientationSession.findUnique({
      where: { id },
      select: { lunchFileKey: true, lunchFileName: true, lunchFileMime: true }
    });
    if (!session?.lunchFileKey) {
      return NextResponse.json({ message: "No confirmation is attached to this session." }, { status: 404 });
    }

    const { bytes } = await getFileStorageAdapter().read(session.lunchFileKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": session.lunchFileMime || "application/octet-stream",
        "Content-Disposition": `inline; filename="${(session.lunchFileName ?? "lunch-confirmation").replace(/"/g, "'")}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    console.error("Lunch confirmation read error:", error);
    return NextResponse.json({ message: "Unable to open the confirmation." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const auth = await requireApiPermission("files:write");
    if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id } = await ctx.params;
    const session = await prisma.orientationSession.findUnique({
      where: { id },
      select: { lunchFileKey: true }
    });
    if (!session?.lunchFileKey) {
      return NextResponse.json({ message: "No confirmation is attached to this session." }, { status: 404 });
    }

    // Only the row is cleared; the stored blob is left in place, matching how
    // travel receipts already delete. A row pointing at nothing is a broken
    // download, so clearing the pointer is the part that matters.
    await prisma.orientationSession.update({
      where: { id },
      data: { lunchFileKey: null, lunchFileName: null, lunchFileMime: null, lunchFileSizeBytes: null }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Lunch confirmation delete error:", error);
    return NextResponse.json({ message: "Unable to remove the confirmation." }, { status: 500 });
  }
}
