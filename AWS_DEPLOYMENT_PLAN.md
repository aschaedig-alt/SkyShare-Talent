# SkyShare Talent Ops AWS Deployment Plan

Last updated: June 7, 2026

## Recommendation

SkyShare Talent Ops is now a full-stack Next.js application with Prisma-backed API routes. It should not be deployed as a static-only S3 website.

For the build-stage hosted prototype, a lower-cost path is now documented:

```text
Vercel Hobby + Neon Free Postgres + private S3 + Google Workspace auth
```

See:

```text
FREE_HOSTED_PROTOTYPE_SETUP.md
```

Recommended AWS architecture:

1. **Next.js hosting:** AWS Amplify Hosting SSR as the first production path.
2. **Database:** Amazon RDS for PostgreSQL.
3. **Files:** Private Amazon S3 bucket for resumes, documents, and imported source files.
4. **Secrets/config:** AWS managed environment variables for `DATABASE_URL`, auth settings, and future Google OAuth client configuration.
5. **Future auth:** Google OAuth / Google Calendar integration after production domain and OAuth consent setup are confirmed.

## Why Not Static S3 Only

The old public S3 website model can serve static HTML, CSS, and JavaScript, but this app now depends on server behavior:

- Prisma database reads and writes.
- Candidate file upload routes.
- Interview scheduling API routes.
- Duplicate scan API routes.
- Future Google Calendar sync.

Static S3 hosting cannot run those backend routes.

## Hosting Options

### Preferred First Path: AWS Amplify Hosting SSR

Use Amplify Hosting for the first hosted MVP because AWS documents support for Next.js SSR apps, including API routes and dynamic routes, with minimal setup.

Pros:

- Fastest path from local app to hosted app.
- Supports Next.js 15 SSR.
- Easier than container infrastructure for the first production build.
- Good fit while the app is still evolving quickly.

Watch-outs:

- Confirm Prisma native binary compatibility during deployment.
- Use PostgreSQL, not SQLite, in hosted environments.
- Keep file uploads in S3, not local filesystem.

### Alternate Production Path: AWS App Runner

Use App Runner if Amplify hosting becomes limiting or Prisma/file workflows need a more traditional Node service runtime.

Pros:

- Managed deploy from source/container.
- More control over runtime behavior.
- Scales as a secure web application service.

Watch-outs:

- Requires more deployment setup than Amplify.
- Container/runtime configuration needs to be documented carefully.

## Database Plan

Move from local SQLite to PostgreSQL before real production use.

Required steps:

1. Add a production `DATABASE_URL` for PostgreSQL.
2. Validate Prisma schema against PostgreSQL.
3. Run Prisma migrations, not `db push`, for production.
4. Add backup and restore strategy.
5. Add performance indexes after import-scale testing.

## File Storage Plan

Current local development stores uploaded candidate files under `storage/candidate-files`.

Production should use private S3:

- Store only metadata in Prisma.
- Store file bytes in S3.
- Generate short-lived signed URLs for preview/download.
- Never expose the bucket publicly.
- Keep source import files and candidate documents separate by prefix.

## Google Calendar Plan

Do not hard-code Google secrets in the frontend.

Recommended next steps:

1. Confirm production domain.
2. Create Google Cloud OAuth client.
3. Store OAuth config in environment variables.
4. Use least-privilege Calendar scopes.
5. Store Google event IDs on `Interview`.
6. Add dedupe/conflict rules before enabling two-way sync.

## Deployment Readiness Checklist

- [ ] Choose Amplify SSR or App Runner.
- [ ] Provision RDS PostgreSQL.
- [ ] Convert Prisma production workflow to migrations.
- [ ] Provision private S3 bucket for files.
- [ ] Replace local file storage with S3 adapter.
- [ ] Configure environment variables.
- [ ] Add authentication before real candidate data.
- [ ] Add staging environment.
- [ ] Add backup/restore runbook.
- [ ] Add deployment rollback runbook.

## Sources Checked

- AWS Amplify Hosting SSR documentation: https://docs.aws.amazon.com/amplify/latest/userguide/server-side-rendering-amplify.html
- AWS Amplify support for Next.js: https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html
- AWS App Runner documentation: https://docs.aws.amazon.com/en_us/apprunner/
- Amazon RDS for PostgreSQL documentation: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html
