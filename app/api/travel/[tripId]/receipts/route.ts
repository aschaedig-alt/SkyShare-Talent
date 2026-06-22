import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSupportedCandidateFile, sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { createTravelStorageKey } from "@/lib/files/travel-file-storage";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = { params: Promise<{ tripId: string }> };

const maxFileSizeBytes = 25 * 1024 * 1024;

function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === "object" && "arrayBuffer" in value && "name" in value;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireApiPermission("files:write");
    if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { tripId } = await context.params;
    const trip = await prisma.travelTrip.findUnique({ where: { id: tripId }, select: { id: true } });
    if (!trip) return NextResponse.json({ message: "Trip not found." }, { status: 404 });

    const formData = await request.formData();
    const files = formData.getAll("files").filter(isFileLike);
    const itemId = (() => {
      const raw = formData.get("itemId");
      return typeof raw === "string" && raw.trim() ? raw.trim() : null;
    })();
    const amountRaw = formData.get("amount");
    const amount = (() => {
      if (typeof amountRaw !== "string" || amountRaw.trim() === "") return null;
      const n = Number(amountRaw.replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : null;
    })();

    const storage = getFileStorageAdapter();
    if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
      return NextResponse.json(
        { message: "Real file uploads are disabled until private S3 storage is configured for this hosted environment." },
        { status: 503 }
      );
    }

    if (files.length === 0) {
      return NextResponse.json({ message: "Choose at least one file to upload." }, { status: 400 });
    }

    const created = [];
    for (const file of files) {
      const originalFilename = sanitizeFilename(file.name);
      if (!isSupportedCandidateFile(originalFilename)) {
        return NextResponse.json({ message: `${originalFilename} is not a supported file type.` }, { status: 400 });
      }
      if (file.size > maxFileSizeBytes) {
        return NextResponse.json({ message: `${originalFilename} is larger than the 25 MB limit.` }, { status: 400 });
      }

      const storageKey = createTravelStorageKey(tripId, originalFilename);
      const bytes = Buffer.from(await file.arrayBuffer());
      await storage.write({
        storageKey,
        bytes,
        contentType: file.type || null,
        metadata: { tripId, source: "travel-receipt-upload", uploadedByEmail: auth.user.email ?? "" }
      });

      const row = await prisma.travelReceipt.create({
        data: {
          tripId,
          itemId,
          originalFilename,
          displayFilename: originalFilename,
          storageKey,
          mimeType: file.type || null,
          sizeBytes: file.size,
          amount: files.length === 1 ? amount : null
        },
        select: { id: true, displayFilename: true, mimeType: true, sizeBytes: true, amount: true, uploadedAt: true }
      });
      created.push({ ...row, uploadedAt: row.uploadedAt.toISOString() });
    }

    return NextResponse.json({
      ok: true,
      message: `Uploaded ${created.length} receipt${created.length === 1 ? "" : "s"}.`,
      receipts: created
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to upload receipt." }, { status: 500 });
  }
}
