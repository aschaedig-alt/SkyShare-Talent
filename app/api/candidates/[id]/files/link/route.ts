import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { extractFileText } from "@/lib/files/pdf-text";

type RouteContext = { params: Promise<{ id: string }> };

// Attach an existing (unassigned) uploaded file to this candidate.
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("files:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as { fileId?: string };
    if (!body.fileId) {
      return NextResponse.json({ message: "fileId is required." }, { status: 400 });
    }

    const candidate = await prisma.candidate.findUnique({ where: { id }, select: { id: true } });
    if (!candidate) {
      return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
    }

    const file = await prisma.candidateFile.findUnique({ where: { id: body.fileId } });
    if (!file) {
      return NextResponse.json({ message: "File not found." }, { status: 404 });
    }
    if (file.candidateId) {
      return NextResponse.json({ message: "That file is already attached to a candidate." }, { status: 400 });
    }

    // Best-effort: extract text now if we have the bytes and haven't yet.
    let extractedText = file.extractedText;
    if (!extractedText && file.storageKey) {
      try {
        const { bytes } = await getFileStorageAdapter().read(file.storageKey);
        extractedText = (await extractFileText(Buffer.from(bytes), file.mimeType, file.displayFilename || file.originalFilename)) || null;
      } catch {
        extractedText = file.extractedText;
      }
    }

    await prisma.candidateFile.update({
      where: { id: file.id },
      data: {
        candidateId: id,
        extractedText: extractedText ?? file.extractedText,
        textExtractedAt: extractedText ? new Date() : file.textExtractedAt
      }
    });

    await prisma.auditEvent.create({
      data: {
        actorId: auth.user.id,
        eventType: "CANDIDATE_FILE_LINKED",
        entityType: "Candidate",
        entityId: id,
        summary: `Attached uploaded file ${file.displayFilename || file.originalFilename} to candidate.`,
        payloadJson: JSON.stringify({ fileId: file.id, byEmail: auth.user.email })
      }
    });

    return NextResponse.json({ ok: true, message: "File attached." });
  } catch (error) {
    console.error("Link file error:", error);
    return NextResponse.json({ message: "Unable to attach file." }, { status: 500 });
  }
}
