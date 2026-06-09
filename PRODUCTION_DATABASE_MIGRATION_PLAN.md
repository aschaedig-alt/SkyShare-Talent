# Production Database Migration Plan

Last updated: June 7, 2026

## Current State

SkyShare Talent Ops currently uses a local SQLite development database through Prisma. This is appropriate for local prototyping and fake/sandbox data.

Production should use PostgreSQL. For the build-stage hosted prototype, Neon Free Postgres is acceptable. For mature production, use a paid managed Postgres tier such as Neon paid Postgres or Amazon RDS for PostgreSQL.

## Why PostgreSQL

PostgreSQL is the better long-term choice for the expected workload:

- 5,000+ candidates.
- Candidate history, notes, interviews, applications, files, and import rows.
- Duplicate review queues.
- Pilot requirement matching.
- Future Google Calendar sync records.
- Real backup/restore and operational reliability.

SQLite should remain a local development convenience only.

## Migration Strategy

### Phase 1: Keep Local SQLite

Continue local development with SQLite while the product shape is still changing quickly.

Rules:

- Use `prisma db push` only for local development.
- Keep fake/sandbox data local.
- Do not treat local SQLite as production.

### Phase 2: Add PostgreSQL Schema Validation

Before hosting:

1. Create a PostgreSQL-compatible Prisma schema snapshot.
2. Run Prisma validation against PostgreSQL.
3. Review field types:
   - JSON strings can remain text initially.
   - DateTime fields are already compatible.
   - Add production indexes after scale testing.
4. Ensure generated Prisma client works in the deployment runtime.

Current project command:

```powershell
npm run db:postgres:schema
```

This writes:

```text
prisma/schema.postgres.prisma
```

Production readiness can be checked with:

```powershell
npm run prod:check
```

Use strict mode in CI/deployment checks:

```powershell
npm run prod:check:strict
```

### Phase 3: Introduce Migrations

For the hosted prototype, tables can be created with:

```powershell
npm run db:hosted:push
```

Use this only while the app is still in prototype/staging mode.

For production, use Prisma migrations instead of `db push`.

Planned commands:

```powershell
npx prisma migrate dev --name initial-production-schema
npx prisma migrate deploy
```

Production deploys should run `prisma migrate deploy`, not `prisma db push`.

### Phase 4: Seed Only System Defaults

Production seed should create only:

- Admin/system user if auth requires it.
- Requirement catalog defaults.
- Initial workspace settings.

Production seed should not create fake candidates, fake jobs, or fake interviews.

### Phase 5: Backup And Restore

Minimum production backup plan:

- Automated RDS snapshots.
- Manual snapshot before major imports.
- S3 file backup/versioning for candidate documents.
- Export runbook for user-visible data.

## Required Production Index Review

Likely indexes:

- Candidate normalized email.
- Candidate normalized phone.
- Candidate normalized name.
- Candidate status/stage.
- CandidateApplication candidate/job/requirement.
- CandidateFile candidateId.
- Interview candidate/startDateTime/status.
- Job normalizedTitle/status/isPilotRole.
- PilotRequirement normalizedTitle/status/pilotSeat.
- DuplicateReviewItem status/reviewType.
- ImportRow importBatch/candidate/job.

Most of these are already represented in the Prisma schema; verify with PostgreSQL query plans after import-scale testing.

## Open Decisions

- Whether to maintain one schema and switch provider before production, or keep separate local/prod schema files.
- Whether to store original imported field blobs as text initially or true PostgreSQL JSONB later.
- Whether to add full-text search indexes in PostgreSQL after candidate imports grow.

## Current Hosted Prototype Support

The runtime now switches database adapters based on `DATABASE_URL`:

- `file:` uses SQLite for local development.
- `postgresql://` or `postgres://` uses Postgres for hosted environments.

Hosted builds should use:

```powershell
npm run build:hosted
```

That command generates the PostgreSQL schema snapshot before building.

## Next Implementation Step

Create the Neon prototype database, run `npm run db:hosted:push`, and set the Vercel environment variables.
