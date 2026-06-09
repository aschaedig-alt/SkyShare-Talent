import { randomUUID } from "node:crypto";
import path from "node:path";

export const candidateFileStorageRoot = path.join(process.cwd(), "storage", "candidate-files");

const supportedExtensions = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".gif",
  ".webp",
  ".tif",
  ".tiff",
  ".bmp",
  ".html",
  ".htm",
  ".doc",
  ".docx",
  ".txt",
  ".rtf",
  ".csv",
  ".xls",
  ".xlsx"
]);

export function isSupportedCandidateFile(filename: string) {
  return supportedExtensions.has(path.extname(filename).toLowerCase());
}

export function sanitizeFilename(filename: string) {
  const cleaned = filename
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "candidate-file";
}

export function createCandidateStorageKey(candidateId: string, filename: string) {
  const safeName = sanitizeFilename(filename);
  const extension = path.extname(safeName);
  const baseName = path.basename(safeName, extension).slice(0, 90) || "candidate-file";
  const storedName = `${Date.now()}-${randomUUID()}-${baseName}${extension}`;

  return path.join("candidate-files", candidateId, storedName).replace(/\\/g, "/");
}

export function resolveCandidateStoragePath(storageKey: string) {
  const root = path.join(process.cwd(), "storage");
  const resolved = path.resolve(root, storageKey);
  const relative = path.relative(root, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid candidate file path.");
  }

  return resolved;
}
