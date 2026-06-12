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
- [x] Sidebar redesign (Jun 11) — squared icon rail + items panel; domains Home/Recruiting/People/Data/Admin; Publishing folded into Recruiting as a collapsible section (Job Post Builder, Final Review, Content Blocks); collapsible sections remember their state; hover flyouts + mobile drawer
- [~] People workspace — Pre-onboarding shipped (below); orientation tracker + recognition still to come
- [ ] 3.1 Command Center Redesign
- [x] 3.2 Candidate Profile Editing UX (Jun 10) — split layout, profile tabs, inline PDF preview for resume/pilot app, add/rename/delete docs
- [x] 3.3 Calendar UX Improvements (Jun 10) — month/week/day views, drag-to-reschedule, autofill, stages
- [ ] 3.4 Pilot Requirements Layout

## Phase 4: Feature Completeness
Filling out the platform.
- [ ] 4.1 Jobs Page Integration
- [ ] Support-role gates — when a job is Support, disable most pilot gates but keep U.S. work authorization and U.S. driver's license required; allow position-specific gate fields
- [ ] Role identity defaults to job title — pilot requirement role identity should default to the job post title instead of a synthesized "Citation 560 XL Captain"; support roles get a non-pilot seat/identity
- [x] 4.2 User Access Controls / RBAC (Jun 9) — 4 roles, permission matrix
- [x] Access control condense (Jun 11) — merged each role's sidebar checkbox + access dropdown into one Hidden/View/Full control (5 columns, no horizontal scroll), grouped by domain, equal-width controls; still driven by the nav registry so new pages appear automatically
- [x] 4.3 User Statistics Dashboard (Jun 9) — activity logging + team analytics

## Job Builder / Publishing
Restoring and streamlining the publishing toolset.
- [x] Job Builder data restored (Jun 10) — migrated 79 jobs, 16 blocks, 660 instances, templates from local dev.db to Postgres
- [x] Content Blocks + Final Review live (Jun 10)
- [x] Publishing cleanup, step A (Jun 10) — removed Sandbox Lab, empty Changes/Approvals tabs; moved Templates into Settings; deleted dead code. 7 tabs → 3
- [x] Content block library UX (Jun 11) — group blocks by category/scope/placement, one-click category filter chips with counts, sort (name / most used / recently updated), and collapsible groups so it is not one long scroll
- [x] Block editor Save at top (Jun 11) — sticky editor header with a Save button so you do not have to scroll down to save
- [x] Mixed block formatting (Jun 11) — new "Bullets + text" format: start a line with - for a bullet, other lines stay paragraphs, mixable in one block; renders the same in the editor preview, the final job post, and all exports (HTML / limited HTML / plain text)
- [x] Content Blocks page condense (Jun 11) — narrower library list, inline editing (no separate edit screen) with Save at top, Apply-to-jobs + Version history as a side column; moved Archive/Delete + the jobs-using list to a new Settings → Block management tab (admin-only)
- [~] Job Builder layout redesign — Layout Lab shipped (Jun 11): a draggable/resizable widget board (/jobs/layout-lab) with every field box from Job Builder, Final Review, and Content Blocks; arrange + Copy layout, then bake the winner into the real top half and retire Final Review
- [ ] Publishing cleanup, step B — consider merging Final Review into Job Builder (review a sample first)
- [ ] Changes / version history — build out later if needed
- [ ] Approvals workflow — build out later if needed

## Platform & Infrastructure
Behind-the-scenes work that keeps everything running.
- [ ] Hard-delete test data — bulk-select checkboxes on the Candidates and Jobs lists to permanently remove test records; irreversible, admin-only, with confirmation (build when closer to going live)
- [x] Google OAuth login fixed (Jun 9) — env vars via Vercel CLI
- [x] PostgreSQL (Neon) for local + production (Jun 9)
- [x] Settings pages: Team Members + Activity (Jun 9)
- [x] Editable roadmap powering this checklist (Jun 10)
- [x] Feedback button + admin review page (Jun 10) — any user submits ideas/bugs/questions
- [x] Workspace logo library (Jun 11) — admins upload multiple named logos in Settings (Branding) and assign one to each placement: sidebar mark, login page, and reports/exports; logo also serves as the Home button
- [x] Sidebar polish (Jun 11) — rail locked to full screen height (only panel/content scroll), Admin pinned to the bottom, thin gold hairline dividers between rail items, wider 70px rail; Settings tabs (General/Team Members/Activity/Feedback/Templates) moved into the Admin panel as nav items

## Document Intelligence
Making candidate documents searchable and structured.
- [x] Full-text document search (Jun 10) — extracts text from PDFs; candidates list searches inside resumes/pilot apps and shows a matching snippet
- [x] In-profile document find (Jun 10) — PDF.js viewer highlights matches in-page, jumps between them, with per-document match badges
- [x] Serverless PDF extraction via unpdf (Jun 11) — fixed text extraction failing on Vercel; self-healing scan re-extracts files missing text
- [x] Flight-data extraction v1 (Jun 11) — Scan docs pulls Total Time, PIC/SIC, Turbine, Multi, Jet (incl. PIC sub-values), Night, Instrument, Cross-Country, type ratings, certificates, medical
- [x] Flight Profile review controls (Jun 11) — suggest/confirm, edit label + value, sticky reject, and manually add a field
- [ ] Sortable candidates table — compare Total Time / type ratings / certs across everyone (next big piece)
- [ ] OCR for scanned/image PDFs — so photographed/scanned docs become searchable
- [ ] Upgrade extraction to Claude LLM — swap regex for a Claude call once proven; needs ANTHROPIC_API_KEY (deferred to avoid dev-time cost; see memory note)

## Candidate Evaluation
Tools for assessing candidates — must stay transparent and fair.
- [ ] Candidate pros & cons — capture strengths and concerns on each candidate
- [ ] Hired-candidate evaluation score — score candidates after hire to learn what works
- [ ] Scoring transparency & compliance — clear documented explanation of how a candidate is scored; review CA + NY law (NYC Local Law 144 bias audit, CA FEHA / automated-decision rules) to prevent discrimination — gates the scoring features; needs legal review

## People Ops / Onboarding
Supporting the team beyond recruiting.
- [x] Pre-onboarding tracker (Jun 11) — replaced the Google Sheet; imported the 34 current hires from CSV; per-hire detail with the universal checklist; lifecycle moves hires Active → Post-onboard → Archived
- [x] Pre-onboarding tabs (Jun 11) — Dashboard (charts: status donut, by department, starts-by-week, progress funnel + needs-attention/upcoming), Grid (frozen-column matrix, click-to-cycle cells), Milestones (10 key milestones + progress), Post-onboard (auto-receives onboarded hires; 30/60/90-day + benefits check-ins with due reminders), Archived
- [ ] Orientation tracker — group pre-onboarding hires by orientation date and run the session (builds on the cohorts idea)
- [ ] Recognition program — idea stage; shape the concept first

## Bugs & UX Fixes
Smaller fixes and polish.
- [x] Calendar weekly view errors (Jun 10) — dynamic hour range so interviews are never clipped; no column crushing
- [x] Click outside a window/panel to close it (Jun 10) — interview editor + feedback panel close on outside click
- [x] Feedback & suggestions inbox (Jun 10) — covered by the Feedback button + Settings inbox
- [x] Candidate duplicate merge & dismiss (Jun 11) — review queue now lets you pick which record to keep, merge, or mark not-a-duplicate
- [x] Candidate document upload fixes (Jun 11) — fixed upload error, removed the redundant upload button, and added "Link" to attach an Imports-uploaded file to a candidate
- [x] PDF viewer polish (Jun 11) — 100% zoom, whole-page fit, and search match navigation that scrolls inside the pane
- [x] Job role classification fix (Jun 11) — imported jobs are Pilot only when the TITLE says Captain / First Officer / PIC / SIC / Pilot (aircraft names no longer imply pilot, so "Senior Gulfstream Technician" is support); added a Pilot/Support toggle + seat/aircraft editor on the Jobs detail that clears pilot tags everywhere and removes the role from Pilot Requirements when set to Support; corrected the existing mis-flagged job
`;
