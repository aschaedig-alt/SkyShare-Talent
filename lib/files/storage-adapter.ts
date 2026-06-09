import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
