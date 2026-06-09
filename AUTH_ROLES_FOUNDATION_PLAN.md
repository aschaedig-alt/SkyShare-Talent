# Authentication And Roles Foundation Plan

Last updated: June 7, 2026

## Current State

SkyShare Talent Ops currently runs as a local development app with a real Auth.js / Google authentication foundation.

Local development remains open by default while all records are fake/sandbox data. Production, or any environment with `REQUIRE_AUTH=true`, requires real signed session validation.

## Recommended Direction

Use a standard authentication provider rather than custom password handling.

Good future options:

- Auth.js / NextAuth with Google Workspace login. This is now implemented as the first provider.
- AWS Cognito if the app is deeply standardized on AWS.
- A managed identity provider if SkyShare already uses one.

## Required Roles

Initial roles:

### Admin

- Manage settings.
- Manage imports.
- Manage users/roles.
- Archive/delete records.
- Configure Google Calendar connection.
- Configure deployment/storage settings.

### Recruiter

- View and edit candidates.
- Upload candidate files.
- Schedule interviews.
- Manage candidate notes.
- View jobs and pilot requirements.
- Use matching suggestions.

### Hiring Manager / Viewer

- View candidates and jobs.
- View interview schedule.
- View candidate files if allowed.
- No destructive actions.

### Publisher

- Manage Job Builder pages.
- Edit job posts and content blocks.
- Submit final reviews/approvals.

## Route Protection Plan

Protect all routes before production:

- `/candidates`
- `/candidate-files`
- `/imports`
- `/duplicate-review`
- `/calendar`
- `/settings`
- all API routes that read/write data

Public routes should be intentional only.

## Current Implementation

The app now includes a route-protection middleware foundation:

```text
middleware.ts
```

Behavior:

- Local development remains open by default.
- Production or `REQUIRE_AUTH=true` requires authentication.
- If auth is required but Google auth credentials or an allowlist are missing, protected pages redirect to `/login`.
- Protected API routes return `401`.
- If Google auth is configured, protected routes require a valid Auth.js signed session token.

Implemented files:

```text
auth.ts
app/api/auth/[...nextauth]/route.ts
middleware.ts
types/next-auth.d.ts
```

Auth requires these environment variables before production access is allowed:

```text
AUTH_PROVIDER=google-workspace
REQUIRE_AUTH=true
NEXTAUTH_URL=...
NEXTAUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
AUTH_ADMIN_EMAILS=...
AUTH_ALLOWED_EMAILS=...
AUTH_ALLOWED_DOMAINS=...
```

Users are accepted only when their email is in the admin/email allowlist or belongs to an allowed domain.

This is intentional. It prevents accidental production exposure while keeping local development usable.

## Data Access Rules

Before real data:

- Candidate records require authenticated access.
- Candidate file downloads require authenticated access.
- Candidate file uploads require authenticated access.
- Hosted/staging/production file uploads require private S3 storage.
- Admin/settings require Admin role.
- Destructive actions require Admin role and confirmation.
- Google Calendar OAuth must be tied to a signed-in user/workspace.

## Prisma Foundation

The schema already has a `User` model:

- id
- name
- email
- emailVerified
- image
- role
- Auth.js accounts/sessions relations
- notes relation
- audit events relation

The schema now also includes Auth.js `Account`, `Session`, and `VerificationToken` models.

Likely future additions:

- Workspace/team model if multiple teams use the app.
- Permission table if roles become more granular.

## Audit Requirements

Audit events should record:

- user id
- event type
- entity type/id
- summary
- safe payload metadata
- timestamp

Do not log sensitive file contents, OAuth tokens, or full resume text in audit payloads.

## Next Step

Create Google OAuth credentials, set the production environment variables, and test login in a staging deployment before importing real candidate data.
