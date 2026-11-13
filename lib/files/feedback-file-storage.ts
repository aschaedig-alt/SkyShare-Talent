import { randomUUID } from "node:crypto";
import path from "node:path";
import { sanitizeFilename } from "@/lib/files/candidate-file-storage";

// Feedback screenshots live under storage/feedback-files/<feedbackId>/... —
// resolved and path-validated by resolveCandidateStoragePath, which guards the
// storage root against traversal.
export function createFeedbackStorageKey(feedbackId: string, filename: string) {
  const safeName = sanitizeFilename(filename);
  const extension = path.extname(safeName);
  const baseName = path.basename(safeName, extension).slice(0, 90) || "screenshot";
  const storedName = `${Date.now()}-${randomUUID()}-${baseName}${extension}`;
  return path.join("feedback-files", feedbackId, storedName).replace(/\\/g, "/");
}

// Images only, and a deliberately narrow list. This is not the candidate-document
// allowlist: feedback attachments are rendered straight back into an admin page,
// so anything that a browser might execute in that context stays out. SVG is
// excluded ON PURPOSE — it is a script-carrying document, not a picture.
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** 10 MB — comfortably more than a full-page screenshot, far less than a video. */
export const MAX_FEEDBACK_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * How many screenshots one report may carry.
 *
 * A cap rather than no limit, because each is up to 10 MB and they are written
 * to the live bucket. Four covers the case this exists for - a report that had
 * to be split in two just to attach a second picture - without letting one
 * submission write 40 MB.
 */
export const MAX_FEEDBACK_IMAGES = 4;

export function isSupportedFeedbackImage(filename: string, mimeType: string | null): boolean {
  const extensionOk = IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
  // Both must agree. The extension alone is trivially renamed, and the mime type
  // alone is whatever the browser felt like sending.
  const mimeOk = Boolean(mimeType && IMAGE_MIME_TYPES.has(mimeType.toLowerCase()));
  return extensionOk && mimeOk;
}

// ---------------------------------------------------------------------------
// Screen recordings (feedback cmwfkklis, Nov 13 2026: "It won't let me add a
// video with feedback", sent from an iPhone).
//
// A phone recording is tens of MB, far past Vercel's ~4.5 MB request limit, so a
// video is NOT part of the feedback post. The report is saved first, then the
// video arrives in FEEDBACK_VIDEO_PART_BYTES parts (app/api/feedback/[id]/video)
// and is stitched into one object. Stored as a FeedbackImage row - the table
// holds every attachment; mimeType tells a video from a picture.
//
// iPhone recordings come as .mov (video/quicktime) or .mp4; webm is what a
// desktop browser's own recorder makes. Nothing else: these are played back
// inside an admin page.
// ---------------------------------------------------------------------------
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm"]);

/** 200 MB: a few minutes of phone screen recording. Written to the live bucket. */
export const MAX_FEEDBACK_VIDEO_BYTES = 200 * 1024 * 1024;
/** Under Vercel's ~4.5 MB request body ceiling with room to spare (same as the Paycom upload). */
export const FEEDBACK_VIDEO_PART_BYTES = 3 * 1024 * 1024;

export function isSupportedFeedbackVideo(filename: string, mimeType: string | null): boolean {
  const extensionOk = VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
  const mimeOk = Boolean(mimeType && VIDEO_MIME_TYPES.has(mimeType.toLowerCase()));
  return extensionOk && mimeOk;
}

export function isFeedbackVideoMime(mimeType: string | null): boolean {
  return Boolean(mimeType && VIDEO_MIME_TYPES.has(mimeType.toLowerCase()));
}

/** Where one part of an in-progress video upload is kept until it is stitched together. */
export function feedbackVideoPartKey(feedbackId: string, uploadId: string, part: number) {
  return `feedback-files/${feedbackId}/upload-${uploadId}/part-${String(part).padStart(4, "0")}`;
}

/**
 * A safe Content-Type to serve a stored feedback image back with. Never trust the
 * value we recorded at upload time: pin it to the known list, and fall back to a
 * type the browser will not execute.
 */
export function safeFeedbackImageContentType(mimeType: string | null): string {
  const normalized = mimeType?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES.has(normalized) || VIDEO_MIME_TYPES.has(normalized) ? normalized : "application/octet-stream";
}
