import { randomUUID } from "node:crypto";
import path from "node:path";
import { sanitizeFilename } from "@/lib/files/candidate-file-storage";

// Orientation attachments live under storage/orientation-files/<sessionId>/... —
// resolved and path-validated by resolveCandidateStoragePath, which guards the
// storage root against traversal.
export function createOrientationStorageKey(sessionId: string, filename: string) {
  const safeName = sanitizeFilename(filename);
  const extension = path.extname(safeName);
  const baseName = path.basename(safeName, extension).slice(0, 90) || "lunch-confirmation";
  const storedName = `${Date.now()}-${randomUUID()}-${baseName}${extension}`;
  return path.join("orientation-files", sessionId, storedName).replace(/\\/g, "/");
}
