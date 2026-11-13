import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { resolveCandidateStoragePath } from "@/lib/files/candidate-file-storage";

export type StoredFileInput = {
  storageKey: string;
  bytes: Buffer;
  contentType?: string | null;
  metadata?: Record<string, string>;
};

export type StoredFileOutput = {
  bytes: Buffer;
  contentType?: string | null;
};

export type FileStorageAdapter = {
  provider: "local-dev" | "s3";
  write(input: StoredFileInput): Promise<void>;
  read(storageKey: string): Promise<StoredFileOutput>;
};

export type PresignedUploadInput = {
  storageKey: string;
  contentType?: string | null;
  metadata?: Record<string, string>;
  expiresInSeconds?: number;
};

class LocalDevFileStorageAdapter implements FileStorageAdapter {
  provider = "local-dev" as const;

  async write(input: StoredFileInput) {
    const storagePath = resolveCandidateStoragePath(input.storageKey);
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, input.bytes);
  }

  async read(storageKey: string) {
    return {
      bytes: await readFile(resolveCandidateStoragePath(storageKey))
    };
  }
}

class S3FileStorageAdapter implements FileStorageAdapter {
  provider = "s3" as const;
  private client = new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1"
  });

  private get bucket() {
    const bucket = process.env.S3_CANDIDATE_FILES_BUCKET;

    if (!bucket) {
      throw new Error("S3_CANDIDATE_FILES_BUCKET is required when FILE_STORAGE_PROVIDER=s3.");
    }

    return bucket;
  }

  async write(input: StoredFileInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        Body: input.bytes,
        ContentType: input.contentType ?? "application/octet-stream",
        Metadata: input.metadata,
        ServerSideEncryption: "AES256"
      })
    );
  }

  async read(storageKey: string): Promise<StoredFileOutput> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey
      })
    );

    if (!response.Body) {
      throw new Error("S3 object did not include a response body.");
    }

    return {
      bytes: await readS3Body(response.Body),
      contentType: response.ContentType ?? null
    };
  }

  async createUploadUrl(input: PresignedUploadInput) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.storageKey,
      ContentType: input.contentType ?? "application/octet-stream",
      Metadata: input.metadata,
      ServerSideEncryption: "AES256"
    });

    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds ?? 900 });
  }
}

async function readS3Body(body: unknown): Promise<Buffer> {
  const transformable = body as { transformToByteArray?: () => Promise<Uint8Array> };

  if (typeof transformable.transformToByteArray === "function") {
    return Buffer.from(await transformable.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Large files that arrive in parts (feedback screen recordings).
//
// Vercel refuses a request body over ~4.5 MB and the bucket has no CORS, so a
// big file reaches us as several small objects. These helpers stitch them into
// ONE object, hand back a short-lived read link, and clean up.
//
// S3 multipart needs every part but the last to be at least 5 MB, and our parts
// are 3 MB, so parts are read back and regrouped into ~6 MB pieces here. Memory
// stays at one piece at a time, whatever the file size.
// ---------------------------------------------------------------------------

const MULTIPART_MIN_BYTES = 5 * 1024 * 1024;

export async function combineStoredParts(input: {
  partKeys: string[];
  storageKey: string;
  contentType: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const provider = process.env.FILE_STORAGE_PROVIDER?.toLowerCase();
  if (provider !== "s3") {
    const adapter = getFileStorageAdapter();
    const pieces: Buffer[] = [];
    for (const key of input.partKeys) pieces.push((await adapter.read(key)).bytes);
    await adapter.write({ storageKey: input.storageKey, bytes: Buffer.concat(pieces), contentType: input.contentType, metadata: input.metadata });
    return;
  }

  const bucket = process.env.S3_CANDIDATE_FILES_BUCKET;
  if (!bucket) throw new Error("S3_CANDIDATE_FILES_BUCKET is required when FILE_STORAGE_PROVIDER=s3.");
  const client = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
  const adapter = getFileStorageAdapter();

  const created = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: input.storageKey,
      ContentType: input.contentType,
      Metadata: input.metadata,
      ServerSideEncryption: "AES256"
    })
  );
  const uploadId = created.UploadId;
  if (!uploadId) throw new Error("S3 did not start the multipart upload.");

  try {
    const done: Array<{ ETag: string; PartNumber: number }> = [];
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    const flush = async () => {
      const PartNumber = done.length + 1;
      const result = await client.send(
        new UploadPartCommand({ Bucket: bucket, Key: input.storageKey, UploadId: uploadId, PartNumber, Body: Buffer.concat(pending) })
      );
      if (!result.ETag) throw new Error(`S3 did not confirm part ${PartNumber}.`);
      done.push({ ETag: result.ETag, PartNumber });
      pending = [];
      pendingBytes = 0;
    };
    for (const key of input.partKeys) {
      const bytes = (await adapter.read(key)).bytes;
      pending.push(bytes);
      pendingBytes += bytes.byteLength;
      if (pendingBytes >= MULTIPART_MIN_BYTES) await flush();
    }
    if (pendingBytes > 0 || done.length === 0) await flush();
    await client.send(
      new CompleteMultipartUploadCommand({ Bucket: bucket, Key: input.storageKey, UploadId: uploadId, MultipartUpload: { Parts: done } })
    );
  } catch (error) {
    // Leave nothing half-made behind: an unfinished multipart upload is billed
    // storage that nothing lists.
    await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: input.storageKey, UploadId: uploadId })).catch(() => undefined);
    throw error;
  }
}

/** Remove stored objects. Best-effort per key; used to clear upload parts once combined. */
export async function deleteStoredFiles(storageKeys: string[]): Promise<void> {
  if (storageKeys.length === 0) return;
  const provider = process.env.FILE_STORAGE_PROVIDER?.toLowerCase();
  if (provider !== "s3") {
    await Promise.all(storageKeys.map((key) => unlink(resolveCandidateStoragePath(key)).catch(() => undefined)));
    return;
  }
  const bucket = process.env.S3_CANDIDATE_FILES_BUCKET;
  if (!bucket) throw new Error("S3_CANDIDATE_FILES_BUCKET is required when FILE_STORAGE_PROVIDER=s3.");
  const client = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
  for (let i = 0; i < storageKeys.length; i += 1000) {
    await client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: storageKeys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } })
    );
  }
}

/**
 * A short-lived link that reads one object straight from S3, for files too big
 * to send through a Vercel response (also capped near 4.5 MB). Content type and
 * disposition are pinned on the link, so S3 serves exactly what we decided, not
 * what was recorded at upload. Null when storage is local (dev): the caller
 * serves the bytes itself.
 */
export async function createStoredFileReadUrl(input: {
  storageKey: string;
  contentType: string;
  filename: string;
  expiresInSeconds?: number;
}): Promise<string | null> {
  if (process.env.FILE_STORAGE_PROVIDER?.toLowerCase() !== "s3") return null;
  const bucket = process.env.S3_CANDIDATE_FILES_BUCKET;
  if (!bucket) throw new Error("S3_CANDIDATE_FILES_BUCKET is required when FILE_STORAGE_PROVIDER=s3.");
  const client = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: input.storageKey,
      ResponseContentType: input.contentType,
      ResponseContentDisposition: `inline; filename="${input.filename.replace(/["\\\r\n]/g, "'")}"`,
      ResponseCacheControl: "private, no-store"
    }),
    { expiresIn: input.expiresInSeconds ?? 600 }
  );
}

export function getFileStorageAdapter(): FileStorageAdapter {
  const provider = process.env.FILE_STORAGE_PROVIDER?.toLowerCase();

  if (provider === "s3") {
    return new S3FileStorageAdapter();
  }

  return new LocalDevFileStorageAdapter();
}

export async function createS3UploadUrl(input: PresignedUploadInput) {
  const adapter = getFileStorageAdapter();
  if (adapter.provider !== "s3") {
    throw new Error("Direct upload URLs require FILE_STORAGE_PROVIDER=s3.");
  }

  return (adapter as S3FileStorageAdapter).createUploadUrl(input);
}
