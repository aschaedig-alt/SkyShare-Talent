# Free Hosted Prototype Setup

Last updated: June 8, 2026

## Goal

Run SkyShare Talent Ops online while the product is still being built, without committing to an always-on AWS RDS cost yet.

Recommended build-stage stack:

```text
Hosting: Vercel Hobby
Database: Neon Free Postgres
Files: Private AWS S3 bucket
Auth: Google Workspace via Auth.js
```

This is appropriate for prototype/staging use. Before long-term production use, revisit paid hosting/database tiers, backups, monitoring, and support needs.

## What Is Already Prepared In Code

- Vercel hosted build command:

```text
npm run build:hosted
```

- PostgreSQL schema generation:

```text
npm run db:postgres:schema
```

- Hosted database push command for prototype setup:

```text
npm run db:hosted:push
```

- Runtime database adapter switching:
  - `file:` URLs use local SQLite.
  - `postgresql://` or `postgres://` URLs use Postgres/Neon.

- Real file uploads are blocked in hosted/staging/production unless private S3 is configured.
- Google auth is required in hosted/staging/production.

## Step 1 - Create Neon Free Postgres

1. Create a Neon project.
2. Copy the Postgres connection string.
3. Use the pooled or recommended app connection string if Neon provides one.
4. Keep `sslmode=require` in the URL if Neon includes it.

Example:

```text
DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
```

## Step 2 - Create The Database Tables

On your local machine, temporarily point Prisma at the Neon URL and push the hosted schema:

```powershell
cd "C:\Users\Recruiter\Projects\skyshare-talent-ops"
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
& 'C:\Program Files\nodejs\npm.cmd' run db:hosted:push
```

This creates the tables in Neon. It should be used for the hosted prototype. For mature production, switch to Prisma migrations.

## Step 3 - Create A Private S3 Bucket

Minimum bucket rules:

- Block all public access.
- Enable server-side encryption.
- Do not host files publicly.
- Use the app API for authenticated file access.

Environment variables:

```text
FILE_STORAGE_PROVIDER="s3"
REQUIRE_PRIVATE_FILE_STORAGE="true"
AWS_REGION="us-east-1"
S3_CANDIDATE_FILES_BUCKET="your-private-bucket-name"
AWS_ACCESS_KEY_ID="limited-s3-access-key"
AWS_SECRET_ACCESS_KEY="limited-s3-secret"
```

Create a limited IAM user/access key for the app. It should have access only to this private candidate-files bucket. Do not use your AWS root account keys.

## Step 4 - Create Google OAuth Client

Use Google Cloud Console and create a Web OAuth client.

Authorized JavaScript origin:

```text
https://your-vercel-app-url.vercel.app
```

Authorized redirect URI:

```text
https://your-vercel-app-url.vercel.app/api/auth/callback/google
```

Local redirect URI for testing:

```text
http://127.0.0.1:3001/api/auth/callback/google
```

Recommended app access:

```text
AUTH_ADMIN_EMAILS="aschaedig@skyshare.com"
AUTH_ALLOWED_DOMAINS="skyshare.com"
```

That means any `@skyshare.com` Google Workspace user can sign in, but the app can still control their role after login.

## Step 5 - Create Vercel Project

1. Import the repository/project into Vercel.
2. Set the build command to:

```text
npm run build:hosted
```

The included `vercel.json` also sets this.

3. Add the environment variables from:

```text
.env.hosted.example
```

4. Deploy.

## Step 6 - Validate

After deploy:

1. Visit the Vercel URL.
2. Confirm protected pages redirect to login.
3. Sign in as `aschaedig@skyshare.com`.
4. Confirm Settings shows auth, Postgres, S3, and environment checks as ready.
5. Upload one harmless test PDF.
6. Confirm the file is private and opens only through the app.

## Important Safety Notes

- Do not upload sensitive candidate documents until Google auth and S3 are configured.
- Do not use local SQLite for hosted real data.
- Do not make the S3 bucket public.
- Do not store Google secrets in source code.
- Do not commit real `.env` files.

## Later Production Upgrade

When the app is ready for heavier real use:

- Move from prototype `db push` to Prisma migrations.
- Add database backups/restore runbook.
- Consider paid Neon, Vercel Pro, or AWS RDS/Amplify depending on usage.
- Add file malware scan decision.
- Add monitoring and uptime alerts.
