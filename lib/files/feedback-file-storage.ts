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

/**
 * A safe Content-Type to serve a stored feedback image back with. Never trust the
 * value we recorded at upload time: pin it to the known list, and fall back to a
 * type the browser will not execute.
 */
export function safeFeedbackImageContentType(mimeType: string | null): string {
  const normalized = mimeType?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES.has(normalized) ? normalized : "application/octet-stream";
}
