# Private S3 File Storage Plan

Last updated: June 7, 2026

## Current State

Candidate file uploads now use a storage adapter:

- Local development provider: `local-dev`
- Production provider: `s3`

The local provider writes files under:

```text
storage/candidate-files
```

That folder is ignored by git.

## Production Goal

Move all candidate/resume/source document bytes to a private S3 bucket while keeping Prisma as the source of truth for metadata.

Prisma should store:

- candidateId
- originalFilename
- displayFilename
- storageKey
- mimeType
- sizeBytes
- source
- metadataJson
- uploadedAt
- renamedAt
- archivedAt

S3 should store:

- file bytes only
- preferably encrypted at rest
- no public access

## Required Environment Variables

```text
FILE_STORAGE_PROVIDER=s3
REQUIRE_PRIVATE_FILE_STORAGE=true
AWS_REGION=us-east-1
S3_CANDIDATE_FILES_BUCKET=...
```

Do not store AWS secrets in source code.

## Production Access Pattern

Preferred:

1. Upload API receives file.
2. API writes bytes to private S3.
3. API writes CandidateFile metadata to PostgreSQL.
4. Preview/download endpoint generates a short-lived signed URL or streams from S3.
5. UI never exposes public bucket URLs.

The current implementation uses authenticated secure streaming through the app route:

```text
app/api/candidate-files/[id]/route.ts
```

That route checks the signed user session and `files:read` permission before reading the private object. It also returns `Cache-Control: private, no-store`.

## Adapter Work Remaining

The adapter interface exists in:

```text
lib/files/storage-adapter.ts
```

Completed:

- Add AWS SDK dependency.
- Implement `S3FileStorageAdapter.write`.
- Implement `S3FileStorageAdapter.read`.
- Store uploaded MIME type with the object write.
- Keep local development storage as the default provider.
- Require `files:write` before uploading candidate files.
- Require `files:read` before opening candidate files.
- Disable real uploads in hosted/staging/production environments unless private S3 storage is configured.
- Add upload/open audit events with safe metadata.

Remaining production work:

- Add bucket existence/config validation.
- Add max upload size configuration.
- Add file delete/archive behavior.
- Add virus/malware scan decision if real documents are uploaded.
- Decide whether production downloads should stay as secure streams or move to short-lived signed URLs for very large files.

## Safety Rules

- Private bucket only.
- Block public access.
- Server-side encryption on.
- Signed URLs should be short-lived.
- Store candidate files under scoped prefixes.
- Do not include sensitive file contents in logs.

## Next Step

After the production database target is confirmed, validate the actual S3 bucket/IAM policy and test real uploads in a staging deployment with Google auth enabled.
