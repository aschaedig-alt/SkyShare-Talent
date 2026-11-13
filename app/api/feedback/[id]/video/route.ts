import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, type ApiRouteUser } from "@/lib/auth/route-auth";
import { sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { combineStoredParts, deleteStoredFiles, getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { isPrivateFileStorageReady, shouldRequirePrivateFileStorage } from "@/lib/files/file-security";
import {
  FEEDBACK_VIDEO_PART_BYTES,
  MAX_FEEDBACK_IMAGES,
  MAX_FEEDBACK_VIDEO_BYTES,
  createFeedbackStorageKey,
  feedbackVideoPartKey,
  isSupportedFeedbackVideo
} from "@/lib/files/feedback-file-storage";

// Stitching a 200 MB recording back together reads and re-sends every part.
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * A screen recording attached to a feedback report, after the report is saved.
 *
 *   PUT  ?upload=<uuid>&part=<n>&size=<total bytes>   one part, raw bytes as the body
 *   POST { upload, size, filename, mimeType }          stitch the parts into one file
 *
 * See lib/files/feedback-file-storage.ts for why a video comes in parts.
 *
 * Only the person who sent the report may attach to it, and only within two
 * hours of sending it: the window a slow phone upload needs, and no more. A
 * report is otherwise read-only to its author.
 */
const UPLOAD_WINDOW_MS = 2 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadOwnFeedback(id: string, user: ApiRouteUser) {
  const feedback = await prisma.feedback.findUnique({
    where: { id },
    select: { id: true, userId: true, createdAt: true, _count: { select: { images: true } } }
  });
  if (!feedback) return { error: NextResponse.json({ message: "That feedback was not found." }, { status: 404 }) };
  // user.id is null only in local dev (auth bypassed); there the report's author is null too.
  if (feedback.userId !== user.id) {
    return { error: NextResponse.json({ message: "You can only attach to your own feedback." }, { status: 403 }) };
  }
  if (Date.now() - feedback.createdAt.getTime() > UPLOAD_WINDOW_MS) {
    return { error: NextResponse.json({ message: "This feedback was sent too long ago to attach to." }, { status: 409 }) };
  }
  return { feedback };
}

function readSize(raw: unknown): number | null {
  const size = Number(raw);
  return Number.isInteger(size) && size > 0 && size <= MAX_FEEDBACK_VIDEO_BYTES ? size : null;
}

function partCount(size: number) {
  return Math.ceil(size / FEEDBACK_VIDEO_PART_BYTES);
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await context.params;
  const loaded = await loadOwnFeedback(id, auth.user);
  if (loaded.error) return loaded.error;

  const url = new URL(request.url);
  const upload = url.searchParams.get("upload") ?? "";
  const part = Number(url.searchParams.get("part"));
  const size = readSize(url.searchParams.get("size"));
  if (!UUID.test(upload)) return NextResponse.json({ message: "Missing upload id." }, { status: 400 });
  if (size === null) return NextResponse.json({ message: "That video is larger than the 200 MB limit." }, { status: 400 });
  const parts = partCount(size);
  if (!Number.isInteger(part) || part < 0 || part >= parts) {
    return NextResponse.json({ message: "That part does not belong to this upload." }, { status: 400 });
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  const expected = part === parts - 1 ? size - part * FEEDBACK_VIDEO_PART_BYTES : FEEDBACK_VIDEO_PART_BYTES;
  if (bytes.byteLength !== expected) {
    return NextResponse.json({ message: `Part ${part + 1} arrived as ${bytes.byteLength} bytes, expected ${expected}.` }, { status: 400 });
  }

  const storage = getFileStorageAdapter();
  if (shouldRequirePrivateFileStorage() && !isPrivateFileStorageReady(storage)) {
    return NextResponse.json({ message: "File storage is not configured." }, { status: 500 });
  }
  await storage.write({
    storageKey: feedbackVideoPartKey(id, upload, part),
    bytes,
    contentType: "application/octet-stream",
    metadata: { feedbackId: id, source: "feedback-video-part", uploadedByEmail: auth.user.email ?? "" }
  });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await context.params;
  const loaded = await loadOwnFeedback(id, auth.user);
  if (loaded.error) return loaded.error;

  const body = (await request.json().catch(() => ({}))) as { upload?: unknown; size?: unknown; filename?: unknown; mimeType?: unknown };
  const upload = typeof body.upload === "string" ? body.upload : "";
  const size = readSize(body.size);
  const filename = sanitizeFilename(typeof body.filename === "string" && body.filename ? body.filename : "screen-recording.mp4");
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";
  if (!UUID.test(upload)) return NextResponse.json({ message: "Missing upload id." }, { status: 400 });
  if (size === null) return NextResponse.json({ message: "That video is larger than the 200 MB limit." }, { status: 400 });
  if (!isSupportedFeedbackVideo(filename, mimeType)) {
    return NextResponse.json({ message: "Attach an MP4, MOV or WEBM video." }, { status: 400 });
  }
  if (loaded.feedback._count.images >= MAX_FEEDBACK_IMAGES) {
    return NextResponse.json({ message: `A report can carry up to ${MAX_FEEDBACK_IMAGES} attachments.` }, { status: 409 });
  }

  const partKeys = Array.from({ length: partCount(size) }, (_, i) => feedbackVideoPartKey(id, upload, i));
  const storageKey = createFeedbackStorageKey(id, `${loaded.feedback._count.images}-${filename}`);
  try {
    // A missing part fails the read inside combineStoredParts, and the final
    // object's size is checked by S3 against the parts it was given.
    await combineStoredParts({
      partKeys,
      storageKey,
      contentType: mimeType,
      metadata: { feedbackId: id, source: "feedback-video-upload", uploadedByEmail: auth.user.email ?? "" }
    });
  } catch (error) {
    console.error("Feedback video could not be combined:", error);
    return NextResponse.json({ message: "The video upload did not finish. Try attaching it again." }, { status: 500 });
  }

  await prisma.feedbackImage.create({
    data: { feedbackId: id, storageKey, filename, mimeType, sizeBytes: size, sortOrder: loaded.feedback._count.images }
  });

  // The parts are only scaffolding now. A failed delete leaves a few orphaned
  // objects under the report's own prefix; it never costs the video.
  await deleteStoredFiles(partKeys).catch((error) => console.error("Feedback video parts were not cleaned up:", error));

  return NextResponse.json({ ok: true });
}
