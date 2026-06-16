import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isDocumentType } from "@/lib/files/document-types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function contentDisposition(filename: string) {
  const safeFilename = filename.replace(/"/g, "'");
  return `inline; filename="${safeFilename}"`;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireApiPermission("files:read");

    if (!auth.ok) {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

    const { id } = await context.params;
    const file = await prisma.candidateFile.findUnique({
      where: { id },
      select: {
        id: true,
        candidateId: true,
        storageKey: true,
        displayFilename: true,
        originalFilename: true,
        mimeType: true
      }
    });

    if (!file?.storageKey) {
      return NextResponse.json({ message: "File content is not available in local storage." }, { status: 404 });
    }

    const { bytes } = await getFileStorageAdapter().read(file.storageKey);

    await prisma.auditEvent.create({
      data: {
        actorId: auth.user.id,
        eventType: "CANDIDATE_FILE_OPEN",
        entityType: "CandidateFile",
        entityId: file.id,
        summary: `Opened candidate file ${file.displayFilename || file.originalFilename}.`,
        payloadJson: JSON.stringify({
          candidateId: file.candidateId,
          filename: file.displayFilename || file.originalFilename,
          authMode: auth.user.authMode,
          openedByEmail: auth.user.email
        })
      }
    });

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType ?? "application/octet-stream",
        "Content-Disposition": contentDisposition(file.displayFilename || file.originalFilename),
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to open candidate file." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("files:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as { displayFilename?: string; documentType?: string; expiresAt?: string | null };
    const hasName = typeof body.displayFilename === "string";
    const hasType = typeof body.documentType === "string";
    const hasExpiry = "expiresAt" in body;

    if (!hasName && !hasType && !hasExpiry) {
      return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
    }

    const data: { displayFilename?: string; documentType?: string; expiresAt?: Date | null; renamedAt?: Date } = {};

    if (hasExpiry) {
      if (body.expiresAt === null || body.expiresAt === "") {
        data.expiresAt = null;
      } else {
        const parsed = new Date(body.expiresAt as string);
        if (Number.isNaN(parsed.getTime())) {
          return NextResponse.json({ message: "Invalid expiry date." }, { status: 400 });
        }
        data.expiresAt = parsed;
      }
    }

    if (hasName) {
      const displayFilename = (body.displayFilename ?? "").trim();
      if (displayFilename.length < 1) {
        return NextResponse.json({ message: "A file name is required." }, { status: 400 });
      }
      if (displayFilename.length > 200) {
        return NextResponse.json({ message: "File name is too long." }, { status: 400 });
      }
      data.displayFilename = displayFilename;
      data.renamedAt = new Date();
    }

    if (hasType) {
      if (!isDocumentType(body.documentType)) {
        return NextResponse.json({ message: "Unknown document type." }, { status: 400 });
      }
      data.documentType = body.documentType;
    }

    const existing = await prisma.candidateFile.findUnique({ where: { id }, select: { candidateId: true } });
    if (!existing) {
      return NextResponse.json({ message: "File not found." }, { status: 404 });
    }

    const updated = await prisma.candidateFile.update({
      where: { id },
      data,
      select: {
        id: true,
        originalFilename: true,
        displayFilename: true,
        documentType: true,
        expiresAt: true,
        storageKey: true,
        mimeType: true,
        sizeBytes: true,
        source: true,
        uploadedAt: true
      }
    });

    await prisma.auditEvent.create({
      data: {
        actorId: auth.user.id,
        eventType: "CANDIDATE_FILE_UPDATED",
        entityType: "CandidateFile",
        entityId: id,
        summary: hasExpiry ? `Set expiry to ${data.expiresAt ? data.expiresAt.toISOString().slice(0, 10) : "none"}.` : hasType ? `Set document type to ${data.documentType}.` : `Renamed candidate file to ${data.displayFilename}.`,
        payloadJson: JSON.stringify({ candidateId: existing.candidateId, displayFilename: data.displayFilename, documentType: data.documentType, expiresAt: data.expiresAt?.toISOString() })
      }
    });

    return NextResponse.json({
      ...updated,
      uploadedAt: updated.uploadedAt.toISOString(),
      expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to update file." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("files:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const existing = await prisma.candidateFile.findUnique({
      where: { id },
      select: { candidateId: true, displayFilename: true, originalFilename: true }
    });
    if (!existing) {
      return NextResponse.json({ message: "File not found." }, { status: 404 });
    }

    // Note: the stored blob is intentionally left in place (no adapter delete yet);
    // only the candidate's reference to it is removed.
    await prisma.candidateFile.delete({ where: { id } });

    await prisma.auditEvent.create({
      data: {
        actorId: auth.user.id,
        eventType: "CANDIDATE_FILE_DELETED",
        entityType: "CandidateFile",
        entityId: id,
        summary: `Removed candidate file ${existing.displayFilename || existing.originalFilename}.`,
        payloadJson: JSON.stringify({ candidateId: existing.candidateId })
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to delete file." }, { status: 500 });
  }
}
