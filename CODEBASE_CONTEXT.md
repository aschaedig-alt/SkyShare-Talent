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
- **Database:** 
  - Local: SQLite (file: `./prisma/dev.db`)
  - Production: PostgreSQL (via Vercel)
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

### Deployment:
- Git initialized locally, all Phase 1 files committed to `master` branch
- Pushed to GitHub: `aschaedig-alt/SkyShare-Talent`
- Environment variable set on Vercel: `DATABASE_URL=file:./prisma/dev.db`
- Build status: Awaiting redeploy confirmation

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
| `prisma/schema.prisma` | SQLite schema definition (local dev) |
| `prisma/schema.postgres.prisma` | PostgreSQL schema (production) |
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

# Set up database (creates SQLite dev.db if needed)
npm run dev

# Database migrations (if needed)
npm run db:push

# Seed database with master jobs
npm run db:import-master
```

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
- None currently blocking deployment

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

**Local Development (.env.local):**
```
DATABASE_URL=file:./prisma/dev.db
NEXTAUTH_SECRET=<random_string>
NEXTAUTH_URL=http://localhost:3000
```

**Production (Vercel):**
```
DATABASE_URL=<PostgreSQL_connection_string>
NEXTAUTH_SECRET=<production_secret>
NEXTAUTH_URL=https://skyshare-talent.vercel.app
AWS_ACCESS_KEY_ID=<aws_key>
AWS_SECRET_ACCESS_KEY=<aws_secret>
AWS_REGION=us-east-1
AWS_S3_BUCKET=<bucket_name>
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
**Database:** SQLite locally, PostgreSQL in production (Vercel)  
**Build script:** `npm run build` (local) / `npm run build:hosted` (Vercel with postgres)  
**Type checking:** Strict mode enabled, no `any` types allowed  
**Testing:** Jest configured but tests minimal - focus on manual testing  
**Deployment status:** Phase 1 complete, awaiting final redeploy confirmation
