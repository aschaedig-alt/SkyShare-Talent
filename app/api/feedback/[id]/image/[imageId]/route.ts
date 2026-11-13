import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createStoredFileReadUrl, getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isFeedbackVideoMime, safeFeedbackImageContentType } from "@/lib/files/feedback-file-storage";

type RouteContext = { params: Promise<{ id: string; imageId: string }> };

// Serve ONE of a report's attached screenshots.
//
// The sibling route without an imageId still serves the single legacy image on
// the Feedback row itself; this one serves the FeedbackImage rows that newer
// multi-file submissions write. Identical gate on purpose — settings:admin, the
// same permission as the feedback list — because a screenshot of this app
// routinely contains candidate PII.
export async function GET(_request: Request, context: RouteContext) {
  try {
    const auth = await requireApiPermission("settings:admin");
    if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { id, imageId } = await context.params;
    // Matched on BOTH ids, so an image id cannot be used to read an attachment
    // from a different report by guessing.
    const image = await prisma.feedbackImage.findFirst({
      where: { id: imageId, feedbackId: id },
      select: { storageKey: true, filename: true, mimeType: true }
    });
    if (!image) {
      return NextResponse.json({ message: "That image is not attached to this feedback." }, { status: 404 });
    }

    // A screen recording is far bigger than a Vercel response may be (~4.5 MB),
    // so it is played from a ten-minute signed S3 link instead. The gate above
    // still decides who gets the link; the link itself pins the content type.
    // S3 also answers the Range requests Safari needs to play a video.
    if (isFeedbackVideoMime(image.mimeType)) {
      const url = await createStoredFileReadUrl({
        storageKey: image.storageKey,
        contentType: safeFeedbackImageContentType(image.mimeType),
        filename: image.filename
      });
      if (url) return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
    }

    const { bytes } = await getFileStorageAdapter().read(image.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        // Pinned to a known image type rather than echoing what was recorded at
        // upload, so a stored file can never be served as something the browser
        // would execute in an admin's session.
        "Content-Type": safeFeedbackImageContentType(image.mimeType),
        "Content-Disposition": `inline; filename="${image.filename.replace(/"/g, "'")}"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to open the image." }, { status: 500 });
  }
}
