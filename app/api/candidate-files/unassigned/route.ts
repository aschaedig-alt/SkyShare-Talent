import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isCandidateAllowlisted } from "@/lib/auth/candidate-scope";

// List files uploaded via Imports that aren't attached to any candidate yet.
export async function GET() {
  const auth = await requireApiPermission("files:read");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }

  // An allowlisted viewer gets nothing here, and the query is skipped entirely.
  // Every row this route can return is by definition attached to no candidate,
  // so none of them is one of the named people that viewer was granted — and
  // filenames routinely carry a person's name, which is exactly the fact the
  // allowlist exists to withhold. An empty list rather than a 403, so it reads
  // as "no unassigned files" rather than as a locked door.
  if (isCandidateAllowlisted(auth.user.viewer)) {
    return NextResponse.json({ files: [] });
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
