/* ============================================================================
 *  📋  PROJECT ROADMAP  —  EDIT THIS LIST TO UPDATE THE COMMAND CENTER CHECKLIST
 * ----------------------------------------------------------------------------
 *  This is the ONE place to edit. The Command Center checklist reads from here.
 *
 *  HOW TO ADD / CHANGE ITEMS (just edit the text between the backticks below):
 *
 *    ## Section Title            → starts a new section (a phase/group)
 *    A short line under it        → optional one-line description for the section
 *    - [x] Did this thing (Jun 10)   → DONE  (the "(Jun 10)" date is optional)
 *    - [~] Working on this now        → IN PROGRESS
 *    - [ ] Haven't started yet        → TO DO
 *    - [ ] Item text — extra note     → text after " — " shows as a small note
 *
 *  Section status (Complete / In Progress / Upcoming) is figured out
 *  automatically from its items, so you don't have to set it.
 *
 *  Don't worry about making it pretty — just jot items in and ask Claude to
 *  reformat. Only rule: avoid using the backtick character ( ` ) in the text.
 * ========================================================================== */

export const ROADMAP_MARKDOWN = `
## Phase 1: Critical Fixes
Essential bugs and missing features from the initial build.
- [x] Candidate editing (Jun 8)
- [x] CSV import reliability (Jun 8)
- [x] Remove "prisma-backed" UI text (Jun 8)

## Phase 2: High Priority Features
Core recruiting capabilities.
- [x] 2.1 Duplicate Job Detection & Merge (Jun 9) — shipped; quality improvements planned
- [ ] 2.2 Candidate Suggestion Engine — match candidates to open roles
- [x] 2.3 Google Calendar Sync, two-way (Jun 10) — service account, stage color-coding

## Phase 3: UX & Polish
Making the day-to-day experience better.
- [ ] 3.1 Command Center Redesign
- [ ] 3.2 Candidate Profile Editing UX
- [x] 3.3 Calendar UX Improvements (Jun 10) — month/week/day views, drag-to-reschedule, autofill, stages
- [ ] 3.4 Pilot Requirements Layout

## Phase 4: Feature Completeness
Filling out the platform.
- [ ] 4.1 Jobs Page Integration
- [x] 4.2 User Access Controls / RBAC (Jun 9) — 4 roles, permission matrix
- [x] 4.3 User Statistics Dashboard (Jun 9) — activity logging + team analytics

## Job Builder / Publishing
Restoring the publishing toolset after the move to Vercel.
- [x] Job Builder data restored (Jun 10) — migrated 79 jobs, 16 blocks, 660 instances, templates from local dev.db to Postgres
- [x] Content Blocks, Sandbox, Final Review live (Jun 10)
- [ ] Approvals page — build out (currently placeholder)
- [ ] Changes / version history page — build out (currently placeholder)

## Platform & Infrastructure
Behind-the-scenes work that keeps everything running.
- [x] Google OAuth login fixed (Jun 9) — env vars via Vercel CLI
- [x] PostgreSQL (Neon) for local + production (Jun 9)
- [x] Settings pages: Team Members + Activity (Jun 9)
- [x] Editable roadmap powering this checklist (Jun 10)
- [x] Feedback button + admin review page (Jun 10) — any user submits ideas/bugs/questions

## Candidate Evaluation
Tools for assessing candidates — must stay transparent and fair.
- [ ] Candidate pros & cons — capture strengths and concerns on each candidate
- [ ] Hired-candidate evaluation score — score candidates after hire to learn what works
- [ ] Scoring transparency & compliance — clear documented explanation of how a candidate is scored; review CA + NY law (NYC Local Law 144 bias audit, CA FEHA / automated-decision rules) to prevent discrimination — gates the scoring features; needs legal review

## People Ops / Onboarding
Supporting the team beyond recruiting.
- [ ] Orientation tracker — track new-hire orientation progress
- [ ] Pre-onboarding sheet — collect new-hire info before day one
- [ ] Recognition program — idea stage; shape the concept first

## Bugs & UX Fixes
Smaller fixes and polish.
- [x] Calendar weekly view errors (Jun 10) — dynamic hour range so interviews are never clipped; no column crushing
- [x] Click outside a window/panel to close it (Jun 10) — interview editor + feedback panel close on outside click
- [x] Feedback & suggestions inbox (Jun 10) — covered by the Feedback button + Settings inbox
`;
