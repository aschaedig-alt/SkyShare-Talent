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
- [x] 2.2 Candidate Suggestion Engine (Jun 16) — matches candidates to open roles via pilot-requirement gates plus a scoring engine (sub-scores, per-position config, triage + feedback); per-job candidate fit shows on the Recruiting Jobs detail (JobScreeningPanel) and a candidate scan runs on Pilot Requirements
- [x] 2.3 Google Calendar Sync, two-way (Jun 10) — service account, stage color-coding

## Phase 3: UX & Polish
Making the day-to-day experience better.
- [x] Sidebar redesign (Jun 11) — squared icon rail + items panel; domains Home/Recruiting/People/Data/Admin; Publishing folded into Recruiting as a collapsible section (Job Post Builder, Final Review, Content Blocks); collapsible sections remember their state; hover flyouts + mobile drawer
- [x] People workspace — Pre-onboarding, Orientation tracker, and Compliments recognition are all shipped (see People Ops section)
- [ ] 3.1 Command Center Redesign
- [x] 3.2 Candidate Profile Editing UX (Jun 10) — split layout, profile tabs, inline PDF preview for resume/pilot app, add/rename/delete docs
- [x] 3.3 Calendar UX Improvements (Jun 10) — month/week/day views, drag-to-reschedule, autofill, stages
- [ ] 3.4 Pilot Requirements Layout

## Phase 4: Feature Completeness
Filling out the platform.
- [x] Manual candidate create + job linking (Jun 14) — "New candidate" button on the Candidates page creates a candidate from a form (no CSV); "Add candidate" on a job's Linked-candidates panel links an existing candidate (searchable) or creates a new one and links them in one step. Backed by POST /api/candidates and /api/candidate-applications
- [x] Resume intake (Jun 14) — "Upload resumes" button (Candidates page + each job): drop multiple resumes and each one auto-creates a candidate (name/email/phone parsed from the file via unpdf extraction), attaches the resume, and (from a job) links them all to that job in one step. POST /api/resume-intake (one file per request to stay under the ~4.5MB serverless body cap); dedupes by email/phone; shows a per-file result list. Name is best-guess (filename/header heuristics) — editable on the profile; an LLM extraction upgrade would improve accuracy (tracked under Document Intelligence below)
- [x] Document checklist + type filter (Jun 14) — candidate profile sidebar shows a real document checklist driven by the type tags: each expected document is green (on file) or red (required + missing) / muted (optional + missing), with an X/Y summary; the Documents tab gained type-filter chips to narrow files by tag
- [x] Document currency roll-up + live widget (Jun 14) — Reports gained a "Document currency" panel: workspace-wide counts (expired / due 30 / due 90 / tracked) + a table of the soonest expirations linking to each candidate. New data-bound "Document currency (live)" widget reads the same roll-up and can be dropped on the Jobs/Calendar editable pages (widgets can now receive live data via EditableGrid). lib/data/document-currency.ts is the shared source
- [x] Document expiry + currency panel (Jun 14) — CandidateFile.expiresAt; expirable docs (Medical, Passport, Driver's License, FCC, Pilot's Certificate, Insurance) get a date picker on the Documents tab. A Currency panel on the profile counts down each dated doc and color-codes expired (red) / due within 30 days (amber) / current (green), and lists expirable docs still missing a date
- [x] Document type tags (Jun 14) — CandidateFile.documentType (Resume, Pilot Application, Paycom Application, Medical, Passport, FCC Radio Operator's License, Driver's License, Pilot's Certificate, Insurance, Other). Auto-detected from filename on every upload path (resume/document intake, profile Add, Link); editable via a dropdown on each document in the Documents tab. lib/files/document-types.ts holds the list + detector
- [x] Bulk document intake (Jun 14) — "Upload documents" button (Candidates page + each job): drop many docs and each is matched to an EXISTING candidate (by email in the file, then by the name on the filename) and attached; unmatched files drop into the Documents "Link" queue. POST /api/document-intake (one file per request); optional jobId also links matched candidates to the job
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
- [~] Job Builder layout redesign — Layout Lab shipped (Jun 11): a draggable/resizable widget board (/jobs/layout-lab) with every field box from Job Builder, Final Review, and Content Blocks; widgets show real Gulfstream G450 & GV Captain content; now includes every box from all 3 pages with cross-page duplicates visible (two previews, two exports, both readiness/status) so they can be merged, plus per-widget lock (now truly immovable via collision prevention), hide-a-box to declutter duplicates, and a snap-grid toggle; arrange + Copy layout, then bake the winner into the real top half and retire Final Review
- [x] Layout Lab as a reusable tool (Jun 13) — Settings > Layout Lab: a tab (left rail, grouped by domain) for every one of the 20 real pages, each auto-seeded with its real boxes; drag/resize, lock, hide, adjustable snap grid, density, auto-arrange, and move-a-box-to-another-page; Copy this page exports the arrangement
- [~] Edit-in-place layouts (Jun 14) — pivoted from the static lab to editing the REAL pages: admins get an in-page "Edit layout" mode (drag/resize the real panels with real data) that saves to the database, so whatever is saved becomes the global layout for everyone. Live on Calendar + Recruiting Jobs; reusable EditableGrid + page-layout WorkspaceSetting store. Roll out to more pages after sign-off, then retire the static lab + /jobs/layout-lab
- [x] Candidates page visual refresh (Jun 14) — hand-designed: gradient header with inline search, icon stat cards, avatar initials, color-coded stage pills, contact/activity chips (testing the hand-design approach vs the drag tool)
- [~] Widget palette (Jun 14) — Edit-layout mode now has an "Add widget" drawer with a catalog of config-driven blocks (flight hours gauge, type ratings, compliance gates, currency countdown, readiness score, stat tile, pipeline funnel, coverage bars, document checklist, quick actions, aircraft spotlight, note). Each addable, configurable (gear), removable, and saved globally with the layout. Live on Calendar + Recruiting Jobs. Next: bind data-driven widgets to real candidate/requirement data and add the expiry-date fields some widgets need
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
- [x] Project moved off OneDrive (Jun 17) — repo now lives at C:/Users/Recruiter/Projects/skyshare-talent-ops; path references updated; stale OneDrive-pinned sessions archived
- [x] Secured leaked database credential (Jun 17) — .env had been committed to the public GitHub repo; rotated the Neon password, untracked .env, removed redundant plaintext secret copies, verified prod + local still connect
- [ ] Full local dev parity — real Google login + real S3 uploads on localhost (today dev bypasses auth and saves files to local disk, which is fine for everyday work); when wanted, add the localhost OAuth redirect URI in Google Cloud Console and fill AUTH_GOOGLE_ID/SECRET + AWS keys in .env.local (templates already stubbed there)
- [ ] Data security audit — confirm no personal / candidate data is publicly accessible: review unauthenticated API routes, S3 public access vs presigned URLs, and any NEXT_PUBLIC_ env leaks
- [ ] Employee self-signup link — send a join link so employees can sign up with their company email (settings/users); gate by allowed domain

## Document Intelligence
Making candidate documents searchable and structured.
- [x] Full-text document search (Jun 10) — extracts text from PDFs; candidates list searches inside resumes/pilot apps and shows a matching snippet
- [x] In-profile document find (Jun 10) — PDF.js viewer highlights matches in-page, jumps between them, with per-document match badges
- [x] Serverless PDF extraction via unpdf (Jun 11) — fixed text extraction failing on Vercel; self-healing scan re-extracts files missing text
- [x] Flight-data extraction v1 (Jun 11) — Scan docs pulls Total Time, PIC/SIC, Turbine, Multi, Jet (incl. PIC sub-values), Night, Instrument, Cross-Country, type ratings, certificates, medical
- [x] Flight Profile review controls (Jun 11) — suggest/confirm, edit label + value, sticky reject, and manually add a field
- [x] Sortable candidates table (Jun 18) — /candidates → Compare tab: one table comparing flight metrics, type ratings, and certificates across everyone; click-to-sort columns (missing values sort last), name/role search, type-rating + certificate filters, min-total-time filter, column show/hide, and CSV export of the current view; unconfirmed extractions flagged
- [ ] OCR for scanned/image PDFs — so photographed/scanned docs become searchable
- [ ] Upgrade extraction to Claude LLM — swap regex for a Claude call once proven; needs ANTHROPIC_API_KEY (deferred to avoid dev-time cost; see memory note)

## Candidate Evaluation
Tools for assessing candidates — must stay transparent and fair.
- [x] Candidate pros & cons (Jun 18) — a Pros & cons card on the candidate profile: add/remove strength and concern tags (green/amber chips), saved per candidate; recruiter observations, not an automated score (compliance note left in code for the later transparency review)
- [ ] Hired-candidate evaluation score — score candidates after hire to learn what works
- [ ] Scoring transparency & compliance — clear documented explanation of how a candidate is scored; review CA + NY law (NYC Local Law 144 bias audit, CA FEHA / automated-decision rules) to prevent discrimination — gates the scoring features; needs legal review

## People Ops / Onboarding
Supporting the team beyond recruiting.
- [x] Pre-onboarding tracker (Jun 11) — replaced the Google Sheet; imported the 34 current hires from CSV; per-hire detail with the universal checklist; lifecycle moves hires Active → Post-onboard → Archived
- [x] Pre-onboarding tabs (Jun 11) — Dashboard (charts: status donut, by department, starts-by-week, progress funnel + needs-attention/upcoming), Grid (frozen-column matrix, click-to-cycle cells), Milestones (10 key milestones + progress), Post-onboard (auto-receives onboarded hires; 30/60/90-day + benefits check-ins with due reminders), Archived
- [x] Orientation module (Jun 12) — People > Orientation: create in-person SLC sessions; per-session prep checklist (default template with owners + due-X-days-before, editable); attendees suggested from pre-onboarding orientation dates (add/remove for last-minute changes); per-attendee confirm / travel / iPad (pilots) / credit card / swag; auto headcounts (out-of-town, pilots); editable email-template library with a who's-been-emailed send tracker (manual mark-sent for now, live send later); Mark complete ticks each attendee's Attended orientation
- [x] Orientation cohorts & calendar (Jun 12) — Cohorts tab on Orientation: a mini month calendar marking orientation dates (hire count) + sessions, and cohort cards grouping active pre-onboarding hires by their orientation date with one-click "Create session + add all" or "Add N to existing session" (auto-links hires to the matching session)
- [ ] Orientation: live email send — wire actual sending (Front/Gmail) so templates go out and track received automatically
- [x] Compliments by SkyShare recognition program (Jun 12) — peer-to-peer recognition on the NewHire roster: give to feed to points to redeem rewards to manager analytics, plus an ADMIN Budget tab (cost report, reward catalog CRUD, program settings). Nav item under People; verified end-to-end
- [ ] Update Values in Action options — refresh the recognition categories on the Compliments page to match the current core values
- [ ] Integrate the orientation tracker into the site — fold standalone orientation tracking into the existing Pre-onboarding / Orientation workstream so it lives in one place (extends the shipped Orientation module)

## Bugs & UX Fixes
Smaller fixes and polish.
- [x] Calendar weekly view errors (Jun 10) — dynamic hour range so interviews are never clipped; no column crushing
- [x] Click outside a window/panel to close it (Jun 10) — interview editor + feedback panel close on outside click
- [x] Feedback & suggestions inbox (Jun 10) — covered by the Feedback button + Settings inbox
- [x] Candidate duplicate merge & dismiss (Jun 11) — review queue now lets you pick which record to keep, merge, or mark not-a-duplicate
- [x] Candidate document upload fixes (Jun 11) — fixed upload error, removed the redundant upload button, and added "Link" to attach an Imports-uploaded file to a candidate
- [x] PDF viewer polish (Jun 11) — 100% zoom, whole-page fit, and search match navigation that scrolls inside the pane
- [x] Job role classification fix (Jun 11) — imported jobs are Pilot only when the TITLE says Captain / First Officer / PIC / SIC / Pilot (aircraft names no longer imply pilot, so "Senior Gulfstream Technician" is support); added a Pilot/Support toggle + seat/aircraft editor on the Jobs detail that clears pilot tags everywhere and removes the role from Pilot Requirements when set to Support; corrected the existing mis-flagged job

## Scheduling / Booking Links (Calendly replacement)
Public "schedule with me" links so candidates and guests can self-book onto the shared SkyShare calendar.
- [x] Calendar Timeline view (Jun 15) — per-person schedule timeline (rows = recruiting team with avatars, bars colored by interview stage) added as a 4th calendar view alongside Month / Week / Day
- [x] Booking data model (Jun 15) — BookingHost per employee (slug + settings), recurring weekly availability, per-date overrides (vacation / holiday / custom hours), meeting types (30 / 45 / 60 min, 0 or 10-min buffer, Interview or Meeting), and Booking records
- [x] Slot engine (Jun 15) — recurring weekly windows minus busy time, honoring minimum notice (default 6h), bookable window (default 90 days), max bookings per day, buffers, and the invitee's timezone
- [x] Per-host availability on one shared calendar (Jun 15) — every booking event is tagged with the host id so each person's free/busy is independent even though all events live on the single shared Google Calendar; also reads the host's optional personal @skyshare calendar free/busy
- [x] Public booking pages (Jun 15) — /book/(slug): pick a meeting type, see open times in your own timezone, and book; Interview-type bookings auto-create or match a candidate + interview; no login required
- [x] Admin scheduling page (Jun 15) — /scheduling: manage team members, weekly availability, date overrides, meeting types, settings (min notice / max per day / buffer / window), and copyable share links
- [ ] Read @skyshare calendars without each manager opting in — enable service-account domain-wide delegation (one-time Workspace-admin step) so each host's real Google calendar free/busy is honored automatically
- [ ] Email confirmations — confirmation + reschedule/cancel emails to invitee and host (needs a transactional email service or Gmail send)
- [ ] Text / SMS reminders — optional SMS reminders before the meeting
- [ ] Reschedule / cancel links — self-serve tokenized links for invitees
- [ ] Round-robin pool — one link that assigns whichever team member is free
- [ ] General meetings on the in-app calendar — show MEETING-type bookings (no candidate) on the calendar / timeline, not just on Google
- [ ] Scheduling nav entry + anti-spam — add Scheduling to the sidebar and add basic bot protection (honeypot / rate limit) to the public booking endpoint

## Candidate Intake Automation
Auto-ingest applicants from Paycom into the system, hands-off.
- [ ] Paycom new-applicant email — configure Paycom to auto-send a new-applicant notification to a dedicated address on every application (confirm whether the resume can ride along as an attachment)
- [ ] Recruiting intake Google account + Drive folder — stand up a dedicated account and intake folder with least-privilege access (only what the script needs)
- [ ] Daily intake script — scan the intake Drive folder, create the candidate (with resume) in the system, then move the processed file to an archived / uploaded state so it is not re-imported

## Candidates & Matcher
Working a candidate's record and acting on matcher results.
- [ ] Candidate notes & history on the record — view a candidate's previous notes and activity history right on their profile
- [ ] Matcher bulk export — multi-select results in the resume matcher and bulk-export the selected candidates' contact info (name, phone, email, matched job) for Front emailing or Paycom re-entry; gate the export behind role-based permissions (ties into Phase 4 access controls)
- [ ] Multiple & duplicate resumes per candidate — define how the system handles several resumes on one candidate and duplicate resumes (extends the candidate duplicate merge work)

## Interview & Evaluation
Streamline the end-to-end interview experience.
- [x] Independent interviewer scoring (Jun 18) — dedicated /interviews/[id] page where each interviewer fills their own scorecard (multiple per interview), reachable from the calendar interview modal; an aggregate shows every recommendation side by side
- [x] Per-question interview rubric (Jun 18) — each scorecard rates questions on the 4-point scale (Exceeds / Meets / Can Develop / Does Not Meet); questions pre-fill from the bank for the interview's department and are editable per scorecard
- [x] Rubric to numeric mapping (Jun 18) — Exceeds=4 / Meets=3 / Can Develop=2 / Does Not Meet=1; shows the labels but computes a per-scorecard average and a combined interview score (each interviewer weighted equally) for ranking
- [x] Interview question bank (Jun 18) — Recruiting > Question Bank: a reusable, searchable library of interview questions tagged by category, core value, and department, with full create / edit / delete and active toggle; the source the guide generator will draw from
- [x] Interview guide generator (Jun 18) — Question Bank > Build guide: pick a department, the core values to cover, and a length, and it assembles a balanced set of active questions from the bank (grouped by value, with category badges and interviewer guidance), with regenerate and copy-to-clipboard

## Calendar
- [x] Calendar department filter + color-coding (Jun 18) — canonical departments (Crew, Maintenance, FBO, Support, each with sub-groups) drive a drill-down filter and color every interview on all calendar views by department; a Dept/Stage toggle switches the coloring (defaults to department); jobs map onto the taxonomy via an editable resolver; interviews with no linked job group under Unassigned
- [x] Editable department colors (Jun 18) — admins recolor each department (Crew/Maintenance/FBO/Support) from an on-brand palette via a Colors button on the calendar; saved per workspace, no migration
- [x] Interviewer roster + multi-department assignment (Jun 18) — team members (Scheduling) can each be assigned to one or more departments; the calendar interviewer field is now a roster picker that surfaces interviewers matching the selected job's department first (with their department tags), free text still allowed — foundation for per-interviewer scoring
- [ ] Rename hiring manager to hiring team — update the label across the calendar view and likely the requisitions system-wide
`;
