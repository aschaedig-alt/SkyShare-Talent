import { randomUUID } from "node:crypto";
import path from "node:path";
import { sanitizeFilename } from "@/lib/files/candidate-file-storage";

// Receipts live under storage/travel-files/<tripId>/... — resolved and
// path-validated by resolveCandidateStoragePath (which guards the storage root).
export function createTravelStorageKey(tripId: string, filename: string) {
  const safeName = sanitizeFilename(filename);
  const extension = path.extname(safeName);
  const baseName = path.basename(safeName, extension).slice(0, 90) || "travel-receipt";
  const storedName = `${Date.now()}-${randomUUID()}-${baseName}${extension}`;
  return path.join("travel-files", tripId, storedName).replace(/\\/g, "/");
}
