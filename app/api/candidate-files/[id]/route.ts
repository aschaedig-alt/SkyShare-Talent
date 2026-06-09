import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { requireApiPermission } from "@/lib/auth/route-auth";

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
      return auth.response;
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
