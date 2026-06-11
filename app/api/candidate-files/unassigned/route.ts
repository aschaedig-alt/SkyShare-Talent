import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

// List files uploaded via Imports that aren't attached to any candidate yet.
export async function GET() {
  const auth = await requireApiPermission("files:read");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }

  const files = await prisma.candidateFile.findMany({
    where: { candidateId: null, archivedAt: null },
    orderBy: { uploadedAt: "desc" },
    take: 100,
    select: {
      id: true,
      displayFilename: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      uploadedAt: true
    }
  });

  return NextResponse.json({
    files: files.map((f) => ({ ...f, uploadedAt: f.uploadedAt.toISOString() }))
  });
}
