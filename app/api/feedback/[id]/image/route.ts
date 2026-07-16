import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { safeFeedbackImageContentType } from "@/lib/files/feedback-file-storage";

type RouteContext = { params: Promise<{ id: string }> };

// Serve a feedback screenshot. Gated on settings:admin — the SAME permission as
// the feedback list itself, because a screenshot of this app routinely contains
// candidate PII and must not be reachable by anyone who cannot already read the
// report it belongs to.
export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireApiPermission("settings:admin");
    if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id } = await context.params;
    const feedback = await prisma.feedback.findUnique({
      where: { id },
      select: { imageKey: true, imageName: true, imageMime: true }
    });
    if (!feedback?.imageKey) {
      return NextResponse.json({ message: "No image is attached to this feedback." }, { status: 404 });
    }

    const { bytes } = await getFileStorageAdapter().read(feedback.imageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        // Pinned to a known image type rather than echoing whatever was recorded
        // at upload time, so a stored file can never be served as something the
        // browser would execute in an admin's session.
        "Content-Type": safeFeedbackImageContentType(feedback.imageMime),
        "Content-Disposition": `inline; filename="${(feedback.imageName ?? "screenshot").replace(/"/g, "'")}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to open the image." }, { status: 500 });
  }
}
