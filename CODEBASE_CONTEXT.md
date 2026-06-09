# SkyShare Talent Ops - Codebase Context

## 1. Project Overview
**Name:** SkyShare Talent Ops  
**Purpose:** Unified recruiting operations workspace for managing candidates, jobs, pilot requirements, publishing, and interview scheduling.  
**Status:** Active development (v0.1.0). Phase 1 critical fixes completed (candidate editing, CSV import reliability, UI cleanup).  
**Live Deployment:** https://skyshare-talent.vercel.app

---

## 2. Tech Stack
- **Framework:** Next.js 15.5 (React 19)
- **Language:** TypeScript 5.7 (strict mode)
- **Database:** PostgreSQL (Neon) - same for local development and production
  - Connection: Neon free tier with pooling
  - URL: Set via `DATABASE_URL` environment variable
- **ORM:** Prisma 7.8.0 with adapter for both SQLite and PostgreSQL
- **Authentication:** NextAuth.js 4.24 with Prisma adapter
- **Styling:** Tailwind CSS 3.4 + PostCSS
- **Form Validation:** React Hook Form 7.77 + Zod 3.23
- **UI Components:** Lucide React icons
- **Drag & Drop:** @dnd-kit (core, sortable, utilities)
- **File Storage:** AWS S3 SDK
- **Deployment:** Vercel
- **Build Tool:** ESBuild via tsx

---

## 3. Architecture

**Structure:**
- `/app/` - Next.js App Router (pages, API routes, layouts)
- `/components/` - Reusable React components (candidates, jobs, imports, etc.)
- `/lib/` - Business logic, utilities, data fetching
- `/prisma/` - Schema definitions, migrations, seed scripts
- `/public/` - Static assets (PDF.js vendor files, images)

**Key Patterns:**
- Server-side data fetching via `lib/data/` functions (e.g., `getCandidateListData`, `getCandidateProfileData`)
- API routes with permission-based access control (`requireApiPermission` from `lib/auth/route-auth.ts`)
- Client components for interactive UX (edit forms, drag-drop, file uploads)
- Workspace components that compose features (e.g., `CandidatesWorkspace`, `JobsWorkspace`)

---

## 4. Current Features

| Feature | Status | Key Files |
|---------|--------|-----------|
| **Candidate Management** | ✅ Complete | `app/candidates/`, `components/candidates/`, `lib/data/candidates.ts` |
| Candidate Editing (Phase 1) | ✅ New | `app/api/candidates/[id]/route.ts`, `CandidateProfileWorkspace.tsx` |
| CSV Import | ✅ Enhanced | `app/api/imports/candidates/route.ts`, `lib/import/csv-parser.ts`, `csv-validator.ts` |
| Job Management | ✅ Complete | `app/jobs/`, `components/job-editor/`, `components/job-preview/` |
| Job Publishing | ✅ Complete | Block-based content system with templates |
| Pilot Requirements | ✅ Complete | `app/pilot-requirements/`, full CRUD operations |
| Interview Scheduling | ✅ Complete | `app/calendar/`, `ScheduleInterviewForm.tsx` |
| Duplicate Detection | ✅ Complete | `app/duplicate-review/`, `lib/duplicates/` |
| File Management | ✅ Complete | S3 storage, presigned URLs, `CandidateFileUploadButton.tsx` |
| Role-Based Access | ✅ Basic | `lib/auth/roles.ts` (ADMIN, RECRUITER, VIEWER, PUBLISHER) |

---

## 5. Recent Work (Phase 1 - Session Completion)

### Completed Fixes:
1. **Candidate Editing System** ✅
   - Created PATCH/GET/DELETE API endpoint: `/api/candidates/[id]/route.ts`
   - New page route: `/app/candidates/[id]/page.tsx`
   - Enhanced component with edit mode and form in `CandidateProfileWorkspace.tsx`
   - Validates email/phone, creates contact records, returns full candidate profile

2. **CSV Import Reliability** ✅
   - Auto-delimiter detection (comma, semicolon, tab, pipe) in `lib/import/csv-parser.ts`
   - Pre-import validation with duplicate detection in `lib/import/csv-validator.ts`
   - Updated API handler with comprehensive error handling and detailed error messages
   - Improved from comma-only to supporting multiple formats transparently

3. **UI Cleanup** ✅
   - Removed unprofessional "Prisma-backed" badge from candidates listing

4. **PostgreSQL Database Migration** ✅
   - Switched from SQLite (local) to PostgreSQL (Neon) for consistency
   - Changed Prisma schema: `provider = "postgresql"` with `DATABASE_URL` env var
   - Created `.env.local` with all Neon PostgreSQL and AWS S3 credentials
   - All 16 Vercel environment variables configured (DATABASE_URL, AWS keys, Google OAuth, Auth settings)
   - Build now compiles without driver incompatibility errors

### Deployment:
- Git initialized locally, all Phase 1 + PostgreSQL files committed to `master` branch
- Pushed to GitHub: `aschaedig-alt/SkyShare-Talent`
- All Vercel environment variables set (PostgreSQL, AWS S3, Google OAuth, NextAuth)
- Build status: ✅ **Live** - PostgreSQL-backed app deployed to https://skyshare-talent.vercel.app

---

## 6. Key Files (Essential References)

| File | Purpose |
|------|---------|
| `lib/auth/roles.ts` | Role definitions, permission matrix, `hasPermission()` function |
| `lib/auth/route-auth.ts` | API route authentication/authorization checks |
| `lib/data/candidates.ts` | `getCandidateListData()`, `getCandidateProfileData()` - core queries |
| `lib/candidates/normalize.ts` | Email/phone/name normalization utilities |
| `lib/import/csv-parser.ts` | CSV parsing with auto-delimiter detection |
| `lib/import/csv-validator.ts` | Pre-import validation, duplicate detection |
| `prisma/schema.prisma` | PostgreSQL schema definition (unified local & production) |
| `app/api/candidates/[id]/route.ts` | Candidate CRUD API (GET/PATCH/DELETE) |
| `components/candidates/CandidateProfileWorkspace.tsx` | Candidate detail view with edit mode |

---

## 7. Setup & Run Instructions

### Prerequisites
- Node.js 18+ and npm
- Git

### Local Development
```bash
# Install dependencies
npm install

# Ensure .env.local exists with DATABASE_URL (Neon PostgreSQL connection string)
# File: .env.local (contains PostgreSQL URL, AWS S3 keys, Google OAuth credentials)

# Push Prisma schema to PostgreSQL
npm run db:push

# Start dev server (http://localhost:3000)
npm run dev

# Optional: Seed database with master jobs
npm run db:import-master
```

**Prerequisites:**
- `.env.local` file with `DATABASE_URL` pointing to Neon PostgreSQL
- AWS S3 credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_CANDIDATE_FILES_BUCKET)
- Google OAuth credentials (AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET)
- NextAuth secret (NEXTAUTH_SECRET)

### Available Commands
```bash
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Build for production
npm start                # Start production server
npm run lint             # Run ESLint
npm run db:seed          # Seed database with test data
npm run db:reset         # Hard reset database (DESTRUCTIVE)
npm run prod:check       # Check production readiness
```

---

## 8. Known Issues & TODOs

### Active Blockers
- ✅ None - Phase 1 fully deployed and working

### Planned Features (Phase 4)
- **Role-Based Access Control Enhancement**
  - User role management interface
  - Permission matrix UI for custom permissions
  - User activity logging system
  - Admin dashboard with user management

### Tech Debt / Improvements
- Standardize error handling across API routes
- Add comprehensive integration tests
- Implement candidate bulk operations
- Add job template management UI
- Improve CSV import performance for large files (1000+ rows)

---

## 9. Important Patterns

### Authentication & Authorization
```typescript
// Check permission in API routes
const auth = await requireApiPermission("candidates:write");
if (!auth.ok) {
  return NextResponse.json(
    { message: "Unauthorized" },
    { status: 401 }
  );
}
```

### Data Fetching (Server-Side)
```typescript
// Async functions in lib/data/ that fetch and transform data
const candidate = await getCandidateProfileData(id);
// Returns fully nested object with contacts, files, notes, applications, interviews
```

### API Response Pattern
```typescript
// Success
return NextResponse.json(data, { status: 200 });
// Errors
return NextResponse.json({ message: "Error message" }, { status: 400 });
```

### Component Organization
- **Workspace components** (e.g., `CandidatesWorkspace`) - render full pages/sections
- **Functional components** - reusable UI elements
- **Client components** - use `"use client"` for interactivity
- **Server components** - default (pages, data-fetching layouts)

### Styling
- Tailwind CSS only (no CSS modules)
- Brand colors: `brand-lea`, `brand-gold`, `brand-eden`, `brand-sweet`, `brand-cloudDancer`
- Consistent spacing, shadows, borders in existing components

---

## 10. Authentication & Environment

### Auth Method
- **NextAuth.js** with custom auth provider
- Session-based authentication
- Requires login for protected routes (checked via `requireModulePageAccess`)
- User roles determine feature access

### Environment Variables Required

**Both Local & Production (PostgreSQL via Neon):**
```
# Database (same for local and production)
DATABASE_URL=postgresql://neondb_owner:...@ep-....us-west-2.aws.neon.tech/neondb?sslmode=require

# NextAuth
NEXTAUTH_SECRET=<random_secret_key>
NEXTAUTH_URL=http://localhost:3000 (local) or https://skyshare-talent.vercel.app (prod)

# AWS S3
AWS_ACCESS_KEY_ID=<aws_key>
AWS_SECRET_ACCESS_KEY=<aws_secret>
AWS_REGION=us-east-2
S3_CANDIDATE_FILES_BUCKET=skyshare-talent-candidate-files

# Google OAuth
AUTH_GOOGLE_ID=<your_google_client_id>
AUTH_GOOGLE_SECRET=<your_google_client_secret>

# App Configuration
NEXT_PUBLIC_APP_ENV=staging
AUTH_PROVIDER=google-workspace
REQUIRE_AUTH=true
FILE_STORAGE_PROVIDER=s3
```

### Permission Scopes
- `candidates:read` - View candidates
- `candidates:write` - Create/edit/delete candidates
- `jobs:read` - View jobs
- `jobs:write` - Create/edit/delete jobs
- `imports:write` - Upload/process imports
- `calendar:read` / `calendar:write` - Manage interviews
- `requirements:read/write` - Pilot requirements
- `duplicates:write` - Resolve candidate duplicates
- `settings:admin` - Admin settings (admin only)

---

## Quick Reference

**Master branch deployment:** GitHub → Vercel (auto-deploys on push)  
**Database:** PostgreSQL (Neon) for both local and production - unified setup  
**Build script:** `npm run build` (same for local and Vercel)  
**Type checking:** Strict mode enabled, no `any` types allowed  
**Testing:** Jest configured but tests minimal - focus on manual testing  
**Deployment status:** ✅ Phase 1 complete and live at https://skyshare-talent.vercel.app  
**Deployment workflow:** Changes → git push → GitHub → Vercel auto-redeploy
