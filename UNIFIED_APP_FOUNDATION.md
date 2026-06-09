# Unified App Foundation

This app is the long-term SkyShare Talent Ops codebase.

## Current Foundation Completed

- Copied the stronger Next.js / Prisma Job Builder codebase into a clean folder.
- Renamed app metadata and package identity to SkyShare Talent Ops.
- Preserved all Job Builder routes and workflows.
- Added grouped recruiting navigation around the existing publishing tools.
- Added placeholder pages for the recruiting modules that will be rebuilt next.
- Added an additive Prisma schema draft for candidates, jobs, files, pilot requirements, interviews, imports, duplicate review, settings, audit history, and Google Calendar metadata.

## Important Route Split

- `/recruiting-jobs` is the future recruiting Jobs workspace.
- `/jobs` remains the existing Job Builder publishing workspace for now.

This avoids breaking the existing Job Builder while we rebuild the ATS-style Jobs module cleanly.

## Verification

- `npx prisma validate` passes.
- `npx tsc --noEmit` passes.

## Next Safest Step

Build seed/sandbox data and the first real Candidate list route using the new Prisma models, then migrate one workflow at a time from the prototype Candidate Tracker.
