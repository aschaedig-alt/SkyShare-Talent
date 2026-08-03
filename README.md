# SkyShare Journey

Unified SkyShare recruiting operations app. This folder started from the stronger SkyShare Job Builder codebase and is being expanded into one long-term platform for candidates, jobs, pilot requirements, imports, scheduling, reports, and publishing.

The existing Job Builder workflow is still available under the Publishing navigation group while the recruiting modules are rebuilt on the same Next.js / Prisma foundation.

## Local Setup

The easiest Windows startup is to double-click one of the launchers in this folder:

- `Open-SkyShare-Job-Builder.bat` opens the main app.
- `Open-SkyShare-Job-Builder-Sandbox.bat` opens the sandbox preview.
- `Start-SkyShare-Job-Builder.bat` starts only the local server.

These launchers use Windows CMD and do not require PowerShell. They also check whether port `3000` is already running before starting another server.

```bash
npm install
npm run dev
```

Manual Windows command-line startup:

```cmd
cd /d "C:\Users\Recruiter\Projects\skyshare-talent-ops"
"C:\Program Files\nodejs\npm.cmd" run dev -- --hostname 127.0.0.1 --port 3000
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000). The dev script generates Prisma Client, creates the local SQLite tables if needed, and loads seed data when the database is empty.

## Current Foundation

- Recruiting placeholders: `/command-center`, `/candidates`, `/recruiting-jobs`, `/pilot-requirements`, `/calendar`, `/imports`, `/duplicate-review`, `/reports`.
- Publishing tools preserved: `/jobs`, `/review`, `/templates`, `/blocks`, `/changes`, `/approvals`, `/jobs-sandbox`.
- Settings remains available at `/settings`.
- Home redirects to `/command-center`.

## Data Model

The Prisma schema supports:

- Candidate records, contact methods, notes, files, applications, imports, duplicate review, and audit events.
- Imported recruiting jobs and links to the publishing Job Builder.
- Editable Pilot Requirement profiles, requirement gates, reusable catalog items, and change history.
- Local interviews and Google Calendar sync metadata placeholders.
- Job posts with Paycom configuration.
- Reusable content blocks.
- Block versions.
- Controlled block formatting: bullet list vs paragraph, approved text weight, approved brand text color, and inline `[b]...[/b]` / `[color=lea]...[/color]` text styling.
- Job-specific block instances.
- Linked, pinned, and forked block modes.
- Locked template tokens.

The safest future block-edit default is to save a new block version, then choose whether all jobs, selected jobs, or only the current job should adopt it.

## Build Direction

This is the canonical future app. The old Candidate Tracker and old standalone Job Builder should be treated as prototypes/reference material until their useful workflows are rebuilt here.
