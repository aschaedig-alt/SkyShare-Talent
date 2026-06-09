import type { FileStorageAdapter } from "@/lib/files/storage-adapter";

export function isHostedRuntime() {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV?.toLowerCase();
  return process.env.NODE_ENV === "production" || appEnv === "staging" || appEnv === "production";
}

export function shouldRequirePrivateFileStorage() {
  return isHostedRuntime() || process.env.REQUIRE_PRIVATE_FILE_STORAGE === "true";
}

export function isPrivateFileStorageReady(storage: FileStorageAdapter) {
  return storage.provider === "s3" && Boolean(process.env.S3_CANDIDATE_FILES_BUCKET);
}
