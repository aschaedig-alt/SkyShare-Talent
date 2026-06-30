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
- [~] Edit-in-place layouts (Jun 14) — pivoted from the static lab to editing the REAL pages: admins get an in-page "Edit layout" mode (drag/resize the real panels with real data) that saves to the database, so whatever is saved becomes the global layout for everyone. Live on Calendar, Recruiting Jobs, and Candidates (list + profile); reusable EditableGrid + page-layout WorkspaceSetting store. Roll out to more pages after sign-off, then retire the static lab + /jobs/layout-lab
- [x] Candidates page visual refresh (Jun 14) — hand-designed: gradient header with inline search, icon stat cards, avatar initials, color-coded stage pills, contact/activity chips (testing the hand-design approach vs the drag tool)
- [~] Widget palette (Jun 14) — Edit-layout mode now has an "Add widget" drawer with a catalog of config-driven blocks (flight hours gauge, type ratings, compliance gates, currency countdown, readiness score, stat tile, pipeline funnel, coverage bars, document checklist, quick actions, aircraft spotlight, note). Each addable, configurable (gear), removable, and saved globally with the layout. Live on Calendar + Recruiting Jobs. Next: bind data-driven widgets to real candidate/requirement data and add the expiry-date fields some widgets need
- [ ] Publishing cleanup, step B — consider merging Final Review into Job Builder (review a sample first)
- [ ] Changes / version history — build out later if needed
- [ ] Approvals workflow — build out later if needed

## Fleet Positions & Roles
Keeping the position list consistent and modeling how SkyShare actually hires.
- [x] Canonical position order site-wide (Jun 19) — every position list now sorts by the FLEET_POSITIONS size order (PC-12 → … → Legacy 650) instead of alphabetically / by usage count; the Pilot Requirements list also groups SkyShare vs Managed. Sorting where useful still allowed. lib/fleet/positions.ts fleetOrderIndex/fleetSeatRank are the shared sort keys
- [x] SkyShare vs Managed role split + de-duplicate (Jun 19) — shipped the ManagedVariant model + a "Managed aircraft" panel on each role: a canonical role holds the shared qualifications/gates, and each managed aircraft attaches as a variant carrying its own tail number, pay, base, and schedule. Consolidated the whole pilot fleet: SkyShare-vs-Managed grouping site-wide, duplicate/mislabeled rows merged (recategorize/merge only, no removals), and every managed tail recorded (Phenom 100 N450JF, Phenom 300 N409KG, M2 N785PD, CJ N443BC, 560XLS+ N6TM, G450-NV N787JS, Legacy 650 N650JF, PC-12 NG N413UU, PC-12 NGX N825NX retired). 26 roles total (10 SkyShare + 16 managed seats). Follow-ups: newly-created managed roles carry cloned/approximate gates to review per airframe; the dual-aircraft job link is tracked separately below
- [x] Dual-aircraft positions (Jun 20) — a requirement can now link additional fleet positions (linkedFleetPositionSlugs) for roles covering two airframes (e.g. PC-12 Captain + M2 First Officer). Set them in the Fleet position editor ("Also covers (dual position)"); the detail shows a "Dual position" badge; and the linked positions' aircraft are folded into candidate aircraft-fit scoring. Deeper per-seat scoring of each linked position is a future enhancement

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
- [x] Data security audit (Jun 19) — reviewed unauthenticated API routes, S3 presigned-URL usage, and NEXT_PUBLIC env leaks: no live PII exposure (prod enforces auth + internal permission checks). Defense-in-depth hardening (auth-bypass guard, route-prefix checks) recommended but NOT yet applied — left for approval before touching auth
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
- [x] Overqualified lowers seat fit (Jun 19) — an SIC/first-officer seat where the candidate already has >= 2x the role's total-time minimum now reduces the seat-fit sub-score (retention risk: likely wants a PIC seat). PIC seats are never penalized for more hours
- [x] Commercial-or-ATP either/or cert (Jun 19) — the ATP cert requirement is now "Commercial pilot certificate or ATP" and awards credit if the candidate holds either (a pilot needs one or the other)
- [x] Multi-select positions in scoring setup (Jun 19) — tick several positions in the scoring sidebar and copy the settings on screen to all of them at once (still saved on "Save scoring")
- [x] Recency weight zeroed pending real data (Jun 19) — recency/currency defaulted to 0% because nothing structured feeds it (the old scan just looked for the word "current" in a resume)
- [x] Real recency / currency signal (Jun 20) — added a structured "Hours (last 12 mo)" metric (recency_12mo) entered on the Flight Profile panel; the Recency category now scores off it vs a configurable currency threshold (Scoring setup > Hours logic, default 100 hrs): at/above = current (full), half-to-threshold = partial, below = not current. Recency weight re-enabled (default 8%); falls back to a weak resume-keyword hint when no hours are on file
- [x] Custom + either/or cert items (Jun 20) — Scoring setup > Custom certs & ratings: add your own cert/rating rows (label + comma-separated match terms + hard/soft/bonus/none). Each row is its own either/or group — credited if the candidate has ANY listed term in their certificates/profile text. Stored in the scoring config; the engine scores them in the Certs category and honors bonus vs gate status
- [x] Matcher bulk export (Jun 20) — multi-select candidates on the candidate-fit panel (per pilot requirement) with select-all, then export the selected contacts (name, email, phone, current title, matched job) to CSV. Recruiter/admin only (behind the scoring edit guard)
- [x] Category-weight explanations (Jun 19) — the scoring setup Category weights section now shows a short plain-English description under each name (what aircraft fit / seat fit / hour mins / time in type / recency / certs actually measure) so the weight can be set with confidence
- [x] Scoring requirement row hover highlight (Jun 19) — requirement rows in the scoring setup highlight (gold border + tint + soft glow) on hover so it's clear which row you're on
- [x] Review cloned gates on new managed roles (Jun 20) — verified the cloned hour minimums against peer airframes: 560XLS+ matches 560XL, Phenom 300 matches the light-jet-captain template (Phenom 100/M2/CJ2 = 1,500/1,500/1,500), Legacy 650 matches the G450 large-jet tier. All consistent with the existing fleet; editable per role from the front end
- [x] Verify scoring-setup positions completeness (Jun 20) — confirmed all 26 roles map to 24 clean (aircraft, seat) profiles with zero missing aircraft tags (no "Any aircraft" collapse); the earlier "missing positions" worry is resolved

## People Ops / Onboarding
Supporting the team beyond recruiting.
- [x] Pre-onboarding tracker (Jun 11) — replaced the Google Sheet; imported the 34 current hires from CSV; per-hire detail with the universal checklist; lifecycle moves hires Active → Post-onboard → Archived
- [x] Self-service hire import (Jun 23) — "Import hires" button on Pre-onboarding: paste rows straight from the roster spreadsheet (or upload a CSV), it maps the columns (Name, Offer Sent/Signed, Start, Orientation, Phone, SS Email, Personal Email, Position, Department) onto each profile, previews who will be added. Each imported hire gets the standard checklist.
- [x] Hire import: real-sheet layout + upsert (Jun 30) — the importer now auto-detects the actual SkyShare "Pre-Onboarding Status" layout where field names run DOWN the first column and each person is a COLUMN (it was reading field labels as names). Handles the Archived sheet's extra Role Tag/Owner columns and blank gaps. And it now UPSERTS instead of skip-only: matches a person by name/email, updates just the dates/info that changed (never wipes a value the sheet leaves blank), leaves unchanged people alone, and adds anyone new. Verified against both real CSVs (Main 16 + Archived 72, zero mis-parses).
- [x] Hire import: sync the checklist too (Jun 30) — the import now also reads the sheet's task rows (Verbal offer, Background check, Attended orientation, etc.) and sets each hire's onboarding checklist: TRUE -> done, FALSE -> to-do, N/A -> n/a, blanks left untouched; any other note counts as done. Idempotent (only flips tasks that differ) and folded into the add/update/unchanged result with a "N checklist items updated" count. Handles the Main sheet's renamed "Titan" row (= EBCO).
- [x] Bulk actions on the people tabs (Jun 23) — multi-select on Grid, Post-onboard, and Archived with a contextual bulk-action bar: select people (per-row checkbox + select-all; per-column on the Grid) and Mark onboarded / Archive (with confirm) / Restore, plus bulk Set orientation date and Set department. Backed by POST /api/new-hires/bulk (mirrors the single-hire stage logic).
- [x] People status labels + delete + restore polish (Jun 23) — renamed the confusing onboarding statuses to plain language: "In process" to In progress, "Urgent" to Due soon (starts within 7 days), "Blocked" to Overdue (start date passed). Archived now shows a Restore button on every row (was only terminated). Added permanent Delete to the bulk-action bar on all three tabs (select then Delete, with an explicit "this cannot be undone" confirm) via POST /api/new-hires/bulk-delete — so test/junk entries can be removed for good.
- [x] Merge Grid + Milestones into one tab (Jun 30) — the Pre-onboarding "Grid" and "Milestones" tabs (mostly the same info) are now a single "Grid & milestones" tab with a Grid / Milestones view toggle; old ?tab=milestones links redirect to it.
- [x] Pre-onboarding tabs (Jun 11) — Dashboard (charts: status donut, by department, starts-by-week, progress funnel + needs-attention/upcoming), Grid (frozen-column matrix, click-to-cycle cells), Milestones (10 key milestones + progress), Post-onboard (auto-receives onboarded hires; 30/60/90-day + benefits check-ins with due reminders), Archived
- [x] Orientation module (Jun 12) — People > Orientation: create in-person SLC sessions; per-session prep checklist (default template with owners + due-X-days-before, editable); attendees suggested from pre-onboarding orientation dates (add/remove for last-minute changes); per-attendee confirm / travel / iPad (pilots) / credit card / swag; auto headcounts (out-of-town, pilots); editable email-template library with a who's-been-emailed send tracker (manual mark-sent for now, live send later); Mark complete ticks each attendee's Attended orientation
- [x] Orientation cohorts & calendar (Jun 12) — Cohorts tab on Orientation: a mini month calendar marking orientation dates (hire count) + sessions, and cohort cards grouping active pre-onboarding hires by their orientation date with one-click "Create session + add all" or "Add N to existing session" (auto-links hires to the matching session)
- [x] Orientation attendees: suggestions, tentative, move-to-next (Jun 30) — the "Add attendee" picker now suggests active pre-onboarding people who haven't attended orientation yet (so nobody is missed) above the full employee roster. Added a Tentative confirm status (Pending / Tentative / Confirmed / Declined). Each attendee row gets a one-click "Move to next" (bumps to the soonest upcoming orientation) plus a "Move to…" picker for a specific one; if there's no next session, they drop to the existing "still needs an orientation" waiting list on the Orientation overview.
- [x] Reschedule orientation + Mountain Time (Jun 23) — a Reschedule button on the orientation session page changes the date/time (attendees keep their spots). All orientation times now render and are entered in Mountain Time (labeled "MT") regardless of the viewer's or server's zone: a 9:30 AM session is 9:30 AM Mountain, stored as the correct UTC instant (DST-aware via lib/calendar/format mountainWallClockToIso); cohort-created sessions default to 9:00 AM MT.
- [x] Pre-onboarding dashboard drill-downs (Jun 23) — the headline metric cards (Starting in 7 days, Hires with missing items, Needs attention) are now clickable and expand an inline list of exactly those people, each linking to their record.
- [x] Pre-onboarding dashboard widgets (Jun 23) — added four views (existing widgets kept): "Ready for their start?" strip (everyone starting in 3 weeks with % complete + status), "Where it's jamming" (onboarding tasks most often still to-do across active hires), Orientation timing (% scheduled within a month of start, with breakdown), and Travel readiness (booked vs needs-booking vs none among upcoming starters — ties in the Travel module). Longer-term idea on the list: turnover/retention correlated with orientation timeliness (needs cohorts to accumulate).
- [x] Orientation form + grid polish (Jun 23) — widened the New-session Time field so the full "9:30 AM" shows (was clipped); added a Google Maps link next to the session address (alongside the Meet link). The Pre-onboarding Grid now shows the full roster fields like the source spreadsheet — Offer sent, Offer signed, Phone, SkyShare email, Personal email (plus the existing Start/Orientation/Position/Department and the status badge).
- [ ] Orientation: live email send — wire actual sending (Front/Gmail) so templates go out and track received automatically
- [x] Compliments by SkyShare recognition program (Jun 12) — peer-to-peer recognition on the NewHire roster: give to feed to points to redeem rewards to manager analytics, plus an ADMIN Budget tab (cost report, reward catalog CRUD, program settings). Nav item under People; verified end-to-end
- [x] Update Values in Action options (Jun 20) — recognition values now match SkyShare's core values from the job posts: Safety First, Team Alignment, Deliver the Wow, Solutions Focused, Own the Outcome (each mapped to a distinct color slot; existing demo recognitions retagged)
- [ ] Integrate the orientation tracker into the site — fold standalone orientation tracking into the existing Pre-onboarding / Orientation workstream so it lives in one place (extends the shipped Orientation module)
- [x] Travel & logistics tracker (onboarding + candidate fly-outs) (Jun 22) — Travel panel on the new-hire detail page and a Travel tab on the candidate profile: add trips (purpose + status Needed/Booked/Completed/Canceled), capture the request details (airports, orientation/indoc dates, requested arrival/return, preferred airline, frequent-flyer + hotel + rental loyalty numbers, preferences, special requests — mirrors Hannah's Google form), then log booked items (flight/car/hotel/transport with vendor, confirmation #, cost, dates), attach receipts, and see per-trip + grand totals. Attaches to the correct new hire OR candidate (pre-hire fly-outs). Auto-saving fields, on-brand, dark-mode.
- [x] Travel loyalty numbers on the profile (Jun 22) — frequent-flyer, hotel, and rental-car loyalty numbers are saved on the new hire / candidate profile (edited once in the Travel panel) and auto-pulled onto every new trip, so they never have to be looked up or re-entered. Removed the per-trip loyalty fields in favor of the profile-level ones.
- [~] Travel auto-fill from confirmations — STARTED (Jun 22): paste an airline/hotel/rental confirmation into the trip's "Auto-fill from a confirmation" box and it extracts the vendor, confirmation #, cost, date, and route, shows them for review, and adds the items + fills the trip on one click (source-agnostic regex parser in lib/extraction/travel-confirmation.ts; review-before-commit, nothing auto-saved). REMAINING: (a) the inbound-email pipeline so a forwarded email lands on the right record with no copy/paste (shared backbone with sourcing + Paycom intake — needs an email provider/domain decision); (b) tune the parser against real FlightBridge samples, or swap it for a Claude LLM extractor (see extraction-llm-upgrade).
- [x] Travel spend reporting (Jun 22) — Reports now has a Travel spend section: total spend, hired-traveler vs. not-hired spend, cost per hire, and a by-purpose breakdown (excludes canceled trips), so we can answer "how much should we spend".
- [x] Central Travel page (Jun 23) — a Travel hub under People (/travel) listing every trip across new hires AND candidates, not just orientation: filter by status / purpose / hire-vs-candidate / search, top-line totals (trips, needs-booking, booked, total spend), and each row crisscrosses to that person's record (where trips are added/edited). A "New trip" button on the hub lets you pick any traveler (searchable across the full roster) + purpose and creates the trip, then opens that person's record to fill it in. Travel is its own thing now, with the per-person panels + Orientation chips linking around it.
- [x] Travel tied into Orientation (Jun 23) — the orientation session page now derives each attendee's travel status + cost from their real trips (Booked/Needed chip linking to the hire, superseding the manual flag where trips exist; the manual Local/Needed flag stays as a fallback for hires with no trips yet), plus session-level "Travel booked X/Y" and "Travel spend" roll-ups.

## Bugs & UX Fixes
Smaller fixes and polish.
- [x] Calendar weekly view errors (Jun 10) — dynamic hour range so interviews are never clipped; no column crushing
- [x] Click outside a window/panel to close it (Jun 10) — interview editor + feedback panel close on outside click
- [x] Movable feedback button (Jun 20) — shift-click and drag the floating Feedback button to reposition it (so it no longer covers resize handles); position persists across reloads via localStorage
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

## Candidate Sourcing (paid job boards)
Surface matches from the boards we already pay for: ClimbTo350 + BizJetJobs (pilots) and JSFirm (maintenance).
- [ ] Job-board sourcing integration — pull resume-database candidates from the paid board accounts that match our open pilot requirements, dedupe against existing candidates, and queue them for recruiter review inside the Matcher. Decide the connection per board before building: official API / resume-database access (preferred) vs. authorized bulk export vs. assisted login — each has different ToS, reliability, and cost. Document which boards even offer an employer resume-search / API tier.
- [ ] Sourcing cost & matching model — scope cost (per board, per month, plus any per-search or compute cost) and the cheapest viable path (periodic export + import vs. live automated scan), and how a sourced profile is scored against a requirement before it reaches the recruiter.

## Historical Candidate Archive (Jazz import)
Fold years of legacy JazzHR recruiting history into the app so old candidates appear as ordinary candidates — one profile per person, fully relational, origin (Paycom/Jazz/manual) invisible to recruiters. Source: full relational Jazz export (~3,282 candidates, 3,817 applications, 18k interviews, ~3,800 resumes, 162 jobs).
- [x] Test-data cleanup (Jun 26) — removed 4 TEST-flagged candidates so the import dedupes against a clean roster (42 → 38); reusable read-only audit at scripts/find-test-candidates.ts
- [x] Phase 0: schema + sync (Jun 26) — origin discriminator on Candidate + CandidateApplication, plus HistoricalSource, TimelineEvent, Tag/CandidateTag, CandidateAiSummary; pushed to Neon, existing 38 candidates auto-tagged PAYCOM
- [x] Phase 1: profile surfaces (Jun 26) — Historical Match banner (live facts: previous candidate, # applications, interviewers, notes, hired/declined, resume archived), unified Timeline tab, AI summary tab (display + empty state); shown on any candidate carrying Jazz history
- [x] Phase 2: import engine (Jun 26) — csv parser, weighted dedupe, dry-run + commit + undo (prisma/import-jazz.ts), bounded-concurrency writes. FULL IMPORT DONE: 3,159 Jazz candidates created + 3 merged into Paycom profiles, 56 jobs, 3,816 applications, 282 interviews, 5,710 files, 109 hour-metrics, 4,098 timeline events, 0 errors. System now 3,197 candidates total
- [x] Historical candidates searchable (Jun 26) — candidate search now spans archived/historical records (default list stays active-only); Jazz candidates findable by name/email/phone/resume text
- [x] Phase 3: historical search (Jun 26) — /archive page (nav: Data → Historical Archive) with advanced filters (keyword, recruiter, interviewer, disposition, job title, candidate #, application #, date range); duplicate-review handled by existing /duplicate-review queue
- [x] Phase 4: AI summary (Jun 26) — Claude generation wired (@anthropic-ai/sdk, lib/archive/ai-summary.ts, /api/candidates/[id]/ai-summary, Generate/Regenerate button); on-demand, inputHash-gated, Haiku by default (ARCHIVE_SUMMARY_MODEL); graceful "not configured" until ANTHROPIC_API_KEY is set
- [x] Phase 5: reporting (Jun 26) — /archive/reports: applications by year, repeat applicants, offer acceptance rate, rejection reasons, recruiter + interviewer activity
- [x] Communication History (Jun 26) — imported the Jazz email archive (11,577 messages linked to candidates; the "283k" was inflated line-count, real records ~11.6k) into CandidateCommunication; new "Communication" tab on the profile with readable (HTML-stripped) threads + direction. Reversible via import-jazz-comms.ts --undo
- [x] Tag normalization (Jun 26) — backfilled 38 Tags + 1,661 Jazz category links (candidate_categories.csv: pipeline stages, assessments) into Tag/CandidateTag; profile + candidate list now read the union of legacy tagsJson and normalized CandidateTag (prisma/backfill-tags.ts, idempotent)

## Candidates & Matcher
Working a candidate's record and acting on matcher results.
- [x] Candidate notes & history (Jun 18) — the candidate profile Notes tab now adds/removes notes (attributed to the author) and a new Activity tab shows a per-candidate history timeline (edits, note add/remove, dedupe, interview changes) built from the activity log
- [x] Candidate pages resizable + document polish (Jun 19) — the Candidates list and the individual profile now have the Edit-layout resizable board (like Jobs/Calendar) with documents rendered inline; fixed the resume frame to fill its panel as you resize (was a fixed height), the inner cards to fill in edit mode, and the Currency panel to show an empty-state instead of a blank box
- [x] Matcher bulk export (Jun 20) — multi-select matched candidates (per pilot requirement) with select-all, then export the selected contacts (name, email, phone, current title, matched job) to CSV for Front / Paycom; recruiter/admin only. (Also listed under Candidate Evaluation.)
- [ ] Multiple & duplicate resumes per candidate — define how the system handles several resumes on one candidate and duplicate resumes (extends the candidate duplicate merge work)
- [ ] Seed one complete sample application — upload a real Paycom candidate application and fill in every field (candidate details, application linked to a job, documents, flight metrics) so the system shows one fully complete, polished application end to end; doubles as a check that an application record looks good and complete

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
- [x] Rename hiring manager to hiring team (Jun 20) — renamed the user-facing label to "Hiring Team" across the interview-type roles, scheduling host roles, and the Job Builder field; stored enum values (HIRING_MANAGER) kept for data integrity

## Design & Consistency
Make the whole app feel like one professionally designed product.
- [x] Match corner radii on the Interview guide & Candidates pages (Jun 18) — swapped the rounded-2xl heroes/cards on the Candidates (records + compare) and interview pages (question bank, guide, interview detail) to the site-standard rounded-xl (public booking + the color-editor modal left for the broader review)
- [ ] Full-site design review — go through every page from a professional graphic designer's perspective and make the design elements consistent (corner radius, spacing, typography, color usage, buttons, cards, headers); document the standard and apply it site-wide
- [x] Design system v1 (Jun 18) — locked tokens applied site-wide: 4px corners, cool-mist #eaf0f7 page background, strong gold-glow hover, navy+gold selected state; oval pills squared
- [x] Dark mode v1 — opt-in (Jun 19) — class-based dark theme behind a sidebar toggle (persists to localStorage, with a no-flash script); page background flips to #0b1622, white cards to #10243a, body text to slate-100; dark: variants swept across the app incl. the newer Managed-aircraft panel and scoring-setup UI. Light mode is unaffected (dark: variants are inert in light)
- [x] Dark mode wired + polished (Jun 19) — fixed the real issue: the toggle component existed but was never rendered, so dark mode wasn't reachable; added it to the sidebar rail + mobile drawer. Also found dark: utilities were compiling class-based correctly in production (a stale local .next cache had made them look media-only). QA pass on key pages: strengthened the selected-state fill in dark (sweet tint), fixed the environment banner that stayed white, confirmed value chips read fine. Cards/text convert cleanly; contrast scan came back clean
- [x] Site-wide code & visual audit + cleanup (Jun 20) — parallel read-only audits across the whole codebase, then fixed everything safe: dark-mode class conflicts from the sweep (transparent panels, washed-out tabs, invisible body text — 61 files), the viewport-breakpoints-inside-resizable-panels bug on several pages (auto-fit grids), real text-overflow clipping (min-w-0), corner-radius source drift normalized to the 4px system (zero visual change), and dead-code trim to 0 lint warnings (removed unused imports/vars + a dead BlockLibrary retire feature, consolidated parseStringArray ×12 into one util). Types + production build verified clean
`;
