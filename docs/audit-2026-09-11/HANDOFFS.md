# Handoff blocks - overnight deep dive, 2026-09-11/12

Seven blocks. ONE COMMIT PER BLOCK, in the order below.

I could NOT run git status: no git at all was an explicit instruction for every agent
tonight. So these paths come from each agent reporting what it edited, not from the index.
Run git status yourself first and reconcile - 80 files should be modified (78 from the six
fix agents, plus lib/data/onboarding.ts which I touched for a type error, plus the new
docs/audit-2026-09-11/ directory and docs/needs-a-person.md).

```
[Time and date correctness - from the 2026-09-11 thirteen-role audit]

claim: .claude/claims/r2-timedate-afdc0817.md

paths:
  components/calendar/EditInterviewModal.tsx
  components/events/EventDetailWorkspace.tsx
  components/travel/TravelPanel.tsx
  components/travel/TravelPersonCalendar.tsx
  lib/activity/logger.ts
  lib/candidates/reactivate.ts
  lib/data/compliments-budget.ts
  lib/data/compliments.ts
  lib/data/events.ts
  lib/data/onboarding.ts
  lib/events/front-event-scan.ts
  lib/validation/interview.ts

do NOT stage:
  scripts/_answers/  scripts/_current_jobs.md  scripts/_decisions.json
  scripts/_dayten-3546d84d.ts  scripts/_ebco-3546d84d.ts  scripts/_final.json
  scripts/_jobs.json  scripts/_normalized-title-repair.md  scripts/_tmp_build.ts
  scripts/_unmatched_roles.csv  scripts/_unmatched_roles.md
  scripts/_paycom_intake_output/  scripts/_preflight_output/  scripts/_reclassify_output/
    (all his own scratch, untracked for weeks - never stage)
  .env.local  (gitignored; I corrected its stale comment block at his request)

message:
  Time and date correctness, from the overnight audit

  13 fixes across 12 files, each re-confirmed against the current code
  before editing. 2 findings skipped and 5 referred, both listed in
  docs/audit-2026-09-11/.

ROADMAP: Bugs & UX Fixes
- [x] Celebrations no longer loses today's birthdays and anniversaries after 6pm Mountain - the today anchor in lib/data/compliments.ts was the UTC host's day, which rolled a genuinely-today anniversary forward to next year (daysUntil 364) and dropped the person out of BOTH the today and upcoming buckets. Verified against the corrected mechanism on a simulated UTC host: Braydan Bengtzen, Olivia Vincent and JD Bumgarner go from missing to Today, and Ricky Lee stops being announced a day early. It also silently inflated the years label by one. Was wrong for about six hours on each of the 162 days a year that carry a celebration.
- [x] A person's travel calendar highlights the right day - TravelPersonCalendar built today from toISOString, the UTC day, so from 6pm Mountain it lit tomorrow while TravelHubCalendar on the same screen lit today.
- [x] Interview times entered in the web form are stored as Mountain wall clock, not UTC - closes the Aug 3 open question about interview times being six to seven hours off. A 2:30pm interview was stored as 2:30pm UTC and displayed as 8:30am. Fixed in lib/validation/interview.ts via the DST-aware zonedWallClockToUtc, and the edit modal now prefills in Mountain to match, so opening an interview and saving it unchanged no longer moves it six hours earlier every time. No migration needed: 0 of 350 interviews were created by this form in production.
- [x] Requested arrival and return on a travel trip stop drifting six hours earlier on every blur - TravelPanel now reads and writes Mountain wall clock and sends an unambiguous instant, the way the item-level field already did. One of the three live requestedArrival rows carries the old fingerprint, a 4am requested arrival.
- [x] An event task stops reading overdue from 6pm Mountain the day before it is due, while the label beside it still said tomorrow - the due date is a calendar day and was being compared against an instant.
- [x] Event day boundaries are Mountain, not the host's - three setHours(0,0,0,0) cutoffs (the Upcoming and Past split, the stock room's committed reorder counts, and the Front event-invitation scan) made local dev and production disagree about whether today's event counts. No visible change today; both live event rows are in the future.
- [x] Smaller date-anchor fixes on the same pass: the reactivation note no longer records a candidate archived at 7pm Mountain as archived tomorrow, the six-week starts chart no longer slides forward a week early on a Sunday evening, the recognition streak and the budget month buckets are anchored to the Mountain day and month, and the activity log buckets by the Mountain day.
- [ ] The interview CREATE form still prefills its date and time in the browser's zone, in components/calendar/ScheduleInterviewForm.tsx and the shared helpers in lib/calendar/format.ts. Harmless for the Mountain-based team, wrong for anyone scheduling from another zone. The edit path was closed; this one was outside the session's file list.
- [ ] 194 of the 282 JazzHR-imported interviews display outside 7am to 6pm Mountain. Cannot be settled from the database - one known interview from the original export, a name and the time the record showed, settles all 282.
- [ ] Two single-row date oddities worth one look each: a TravelItem flight reading 23:50 Mountain, and the one interview row in the database carrying the old parse fingerprint at 03:00 Mountain on 2026-06-19.
- [ ] Worth a person's eye, not a defect: the orientation reminder's armed list holds only the COMPLETE Aug 4 session, so the live Sep 29 session is not armed. Nothing is failing - no reminder is currently due - but the Sep 29 session is probably meant to be armed and the stale Aug 4 entry cleared.

verified: lint PASS (0 errors, 8 warnings - identical to the pre-change baseline),
  tsc PASS (0 errors), and all 39 affected page routes re-requested by the lead after all
  six domains finished: every one 200 with real HTML and zero error-boundary markers.
  NOT VERIFIED: NO page route was confirmed to still return 200. Port 3000 is listening (PID 8120) but did not answer a single request in 4 minutes, via curl on localhost and 127.0.0.1 and via PowerShell Invoke-WebRequest - most likely the dev server thrashing on recompiles w
  NOT VERIFIED: lib/events/front-event-scan.ts - the C7 cutoff change is on a code path that calls the Front API. I did not exercise it; the fix is identical in shape to the two in lib/data/events.ts, which I did verify arithmetically.
  NOT VERIFIED: lib/data/onboarding.ts C10 - the Sunday-evening window slide is correct by construction and by reading the code, but I did not simulate a Sunday 7pm Mountain render of the six-week chart against live NewHire.startDate rows.
  NOT VERIFIED: lib/validation/interview.ts - an interview row whose stored timezone is NOT America/Denver would now be re-parsed as Mountain on a PATCH, because EditInterviewModal does not send a timezone and has no zone picker. No live row is affected: of 350 interviews, ev
```

```
[Dark mode and layout overflow - from the 2026-09-11 thirteen-role audit]

claim: .claude/claims/r2-darkmode-afdc0817.md

paths:
  components/calendar/MonthCalendar.tsx
  components/calendar/TimeGridCalendar.tsx
  components/fleet/orgchart/OrgChart.module.css
  components/job-preview/FormattedJobPost.tsx
  components/reports/ReportsWorkspace.tsx
  components/widgets/registry.tsx

do NOT stage:
  scripts/_answers/  scripts/_current_jobs.md  scripts/_decisions.json
  scripts/_dayten-3546d84d.ts  scripts/_ebco-3546d84d.ts  scripts/_final.json
  scripts/_jobs.json  scripts/_normalized-title-repair.md  scripts/_tmp_build.ts
  scripts/_unmatched_roles.csv  scripts/_unmatched_roles.md
  scripts/_paycom_intake_output/  scripts/_preflight_output/  scripts/_reclassify_output/
    (all his own scratch, untracked for weeks - never stage)
  .env.local  (gitignored; I corrected its stale comment block at his request)

message:
  Dark mode and layout overflow, from the overnight audit

  6 fixes across 6 files, each re-confirmed against the current code
  before editing. 1 findings skipped and 4 referred, both listed in
  docs/audit-2026-09-11/.

ROADMAP: Design & Consistency
- [x] Dark mode, org charts — the four custom properties --card, --line, --danger and --sweet were referenced through var() but defined nowhere, so dark mode kept their light fallbacks while --ink flipped to near-white. The Find-a-person index on both fleet charts rendered at 1.17:1 (measured live in Chrome, with --ink and --color-bg from the same query as the positive control). All four are now defined in the light .wrap block at values identical to the fallbacks they replace, so light mode is unchanged, and three are overridden in the dark block. Also fixes the two crew-chart confirm modals, the profile-link popover on both charts and 32 hairline borders — verified reachable because there is no createPortal in the orgchart directory, so those elements really do inherit from .wrap.
- [x] Dark mode, org charts — CORRECTION to the audit: --sweet was deliberately NOT given a dark override, against the audit's recommendation. Its one call site is a 7px interview tone dot, and its light value measures about 9.2:1 on the dark panel where the proposed dark value measures about 4.7:1, so the override would have been a regression. The audit's provenance for that value was also wrong: it is the light value of --int-bd, not what --eden flips to.
- [x] Reports tab bar — the primary tab bar now uses the SEGMENT_ON and SEGMENT_OFF constants declared 1,100 lines above it in its own file, so selected is navy plus the gold ring and hover is the gold glow. In dark mode the selected chip measured 1.092:1 against its surface, making the gold ring the entire selection signal, and this tab bar was the one place missing it.
- [x] Dark mode, calendars — the today marker on MonthCalendar and TimeGridCalendar was bare navy on a navy panel, measured as the LEAST visible chip on the grid (today 1.055:1 against 29 other days at 1.162:1). Both now use the gold-chip-navy-numerals treatment EventsCalendar already used. ScheduleTimeline has the identical defect and was out of scope for this session — still open.
- [x] Dark mode, Document currency widget — the 90-day count was navy on a near-black tile at about 1.3:1, so the number did not render and the tile read as blank. Added the missing dark variants to that count and to the two amber status pairs in the same row, copying the expired tile beside them.
- [x] Dark mode, job-post preview — the worst of the night and nobody predicted it. The preview paper is pinned to white in both themes on purpose, but the component carried 21 dark variants anyway, so in dark mode 65 of 68 text nodes measured under 3:1 (body 1.48:1, headings 1.10:1) — white on white on the page a recruiter uses to proofread an advert before it goes to the job boards. All 21 dark variants removed; every light-mode class untouched; globals.css deliberately not changed, because explicit child utilities beat inheritance and the paper is meant to stay white. Verified first that all 21 sit on or inside the paper: preview-paper appears exactly twice in the repo, and all four helper components are module-private.
- [ ] Two measured layout defects were NOT fixed because they render outside this session's file list. The /calendar page has two vertical scrollbars, worst inner ratio 54.4:1, from an unpinned overflow-y-auto at CalendarWorkspace.tsx:108 — the axis pin is a safe one-word fix, but whether that EditableGrid panel should scroll at all is a layout decision for a person. And /settings/command-center scrolls sideways by 1,313px from a single shrink-0 span at ProjectChecklistWorkspace.tsx:137 holding a 495-character roadmap value; the fix is min-w-0 plus max-w and truncate with the full text kept in a title attribute, NOT shortening the roadmap data.
- [ ] Roadmap accuracy — the entry claiming TimeGridCalendar still has a max-h-[600px] is stale. The file contains no height utility at all; the only match is a comment recording that the cap was removed on purpose. This is currently holding a fixed item open.

verified: lint PASS (0 errors, 8 warnings - identical to the pre-change baseline),
  tsc PASS (0 errors), and all 39 affected page routes re-requested by the lead after all
  six domains finished: every one 200 with real HTML and zero error-boundary markers.
  NOT VERIFIED: /jobs and /review — the two page routes that render FormattedJobPost — could not be confirmed to still return 200 after the edit. The dev server stopped responding to curl partway through my checks. This is instrument failure, not a page failure, and I have th
  NOT VERIFIED: Nothing in this batch was confirmed by eye in a browser. Every contrast figure I quote is either measured by the Round 1 chrome-live pass before the fix or computed by me from the WCAG formula on the specific hex pairs after it. The dark org-chart modals in pa
  NOT VERIFIED: The interview tone dot in the Find-a-person panel deserves one human glance in dark mode on /fleet/crew, to confirm the pale blue reads as intended now that the panel behind it is dark. I chose not to override it and the arithmetic supports that, but it is the
```

```
[Links, navigation and missing confirmations - from the 2026-09-11 thirteen-role audit]

claim: .claude/claims/r2-wiring-afdc0817.md

paths:
  components/candidates/CandidateApplicationsPanel.tsx
  components/content-blocks/BlockLibrary.tsx
  components/orientation/OrientationEmailPanel.tsx
  components/people/NewHireDetailWorkspace.tsx
  components/people/NewHireDetailWorkspaceClassic.tsx
  components/recruiting-jobs/RecruitingJobsWorkspace.tsx
  components/settings/FeedbackWorkspace.tsx

do NOT stage:
  scripts/_answers/  scripts/_current_jobs.md  scripts/_decisions.json
  scripts/_dayten-3546d84d.ts  scripts/_ebco-3546d84d.ts  scripts/_final.json
  scripts/_jobs.json  scripts/_normalized-title-repair.md  scripts/_tmp_build.ts
  scripts/_unmatched_roles.csv  scripts/_unmatched_roles.md
  scripts/_paycom_intake_output/  scripts/_preflight_output/  scripts/_reclassify_output/
    (all his own scratch, untracked for weeks - never stage)
  .env.local  (gitignored; I corrected its stale comment block at his request)

message:
  Links, navigation and missing confirmations, from the overnight audit

  7 fixes across 7 files, each re-confirmed against the current code
  before editing. 3 findings skipped and 11 referred, both listed in
  docs/audit-2026-09-11/.

ROADMAP: Bugs & UX Fixes
- [x] Wiring fixes from the Sep 11 audit: a stage change now lands on the tab that holds the person — the Mark onboarded / Archive redirect pushed /people?stage=active|post|archived and app/people/page.tsx reads only sp.tab through tabFromParam, where an unrecognised value falls through to dashboard. Verified by positive control before the fix: curl of /people?stage=post and plain /people both marked Dashboard active, while ?tab=post marked Post-onboard. Fixed in both the tabs layout and the parked classic one (byte-identical line). After the edit /people and all three of ?tab=grid, ?tab=post and ?tab=archived return 200.
- [x] A job's linked candidate now opens the person, not a name search — the Linked candidates card on /recruiting-jobs hrefed /candidates?q=<display name> while the candidate id sat on the same element as the React key. One less click, and it ends the duplicate-name ambiguity the codebase already documents (two Matt Smiths kept appearing in search). Now /candidates/<id>.
- [x] Every job title on the candidate applications panel was a 404 — it linked /jobs/<jobId> and there is no app/jobs/[id] route, only /jobs and /jobs/duplicates. Now /recruiting-jobs?id=<jobId>, which is the href the candidate profile already used for the same field twice, and which the page really does read: searchParams.id is matched against prisma.job.findMany rows, the same Job model CandidateApplication.jobId points at. That panel shipped Sep 11, so the defect was one day old. Known limit: a MERGED job is excluded by the page's mergedIntoJobId filter and selects the first job instead of erroring — pre-existing behaviour on the profile, not new, and still better than a 404.
- [x] The Sep 11 Resend fix missed a fifth button, on the orientation grid — the label there read sentTemplateKeys, which is hand-tickable, so a step somebody ticked by hand offered Resend and claimed the app had emailed them. It now reads the send record, the same fact the four people-side buttons take as sentAt. The tick, the date chip and the by-hand caption in that cell were already correct; only the label lied. The aria-label and tooltip were deliberately left reading the tick, because marking and un-marking is what the button beside them does. NOTE FOR THIS SECTION: the existing entry saying the orientation panel already did this correctly and is untouched was true of the tick and not of the label, and should be amended.
- [x] Deleting a feedback report now confirms first, and a failed delete no longer lies — this was one of only 2 of 24 client-side DELETE call sites with no confirmation at all. prisma.feedback.delete is irreversible and FeedbackImage cascades off it, so the confirm names the screenshots. Separately, the row was being removed from the list BEFORE the request with no rollback, so a 403 on this admin-gated route or a 500 left the screen claiming the report was gone while the record survived; the list is now restored on failure. Matched the house window.confirm pattern used in 30-odd other handlers.
- [x] The block editor's manage link is a real Link — it was a raw anchor doing a full document reload, and it goes to a genuinely different page (the editor renders at /blocks, the link targets /settings/content-blocks). Honest caveat: this satisfies the real-link rule and makes it a client-side transition, but it does NOT save unsaved editor state — a soft navigation unmounts the form exactly as a reload does. No unsaved-changes guard exists in that editor; that is a separate decision.
- [ ] The other destructive one-click delete is still open: a travel receipt deletes with no confirm and says nothing on failure, and the route leaves the S3 blob orphaned with no pointer to it. The client half sits in a file another agent owned tonight and the server half is in the security auditor's territory, so both were referred rather than half-fixed. The fix is verified feasible — setError is already in scope in that component and the same file has a two-click arm for deleting a whole trip.
- [ ] Four links still render entity names as dead text or as the wrong element: the Document currency widget names candidates it cannot link (the data already carries the id), the Paycom sweep names every filed candidate and links none of them while telling you the PDF is on their Documents tab, and two internal event links are raw anchors instead of Links. All four are in files outside the wiring agent's list and are one-line changes plus an import.

verified: lint PASS (0 errors, 8 warnings - identical to the pre-change baseline),
  tsc PASS (0 errors), and all 39 affected page routes re-requested by the lead after all
  six domains finished: every one 200 with real HTML and zero error-boundary markers.
  NOT VERIFIED: Four page routes could not be checked over HTTP: /blocks, /settings/feedback, /recruiting-jobs and /candidates. The shared dev server on :3000 went unresponsive partway through my checks under the load of six concurrent agents recompiling - /people, which had 
  NOT VERIFIED: No client-side interaction was tested, and per CLAUDE.md it is effectively untestable in this app anyway (the Browser pane cannot read its rendered content). So: I have NOT seen the feedback confirm dialog appear, NOT clicked a linked candidate through to a pr
  NOT VERIFIED: Nothing permission-related was exercised. Local dev bypasses auth, so the 403 rollback path I added to the feedback delete (the route is settings:admin gated) cannot be triggered here - the restore-on-failure branch is reasoned, not run.
  NOT VERIFIED: The /recruiting-jobs?id=<jobId> href was verified by reading the route's searchParams handling and the Prisma model it queries, not by loading a real job id over HTTP - the server stopped responding before I could. A merged job id selecting the wrong job rathe
```

```
[Accessibility: accessible names, focus and semantics - from the 2026-09-11 thirteen-role audit]

claim: .claude/claims/r2-a11y-afdc0817.md

paths:
  app/compliments/page.tsx
  components/business-cards/BusinessCardVisual.tsx
  components/business-cards/BusinessCardsWorkspace.tsx
  components/candidates/CandidateDepartmentFilter.tsx
  components/candidates/CandidateDocuments.tsx
  components/candidates/CandidateFileUploadButton.tsx
  components/candidates/CandidateStatusFilter.tsx
  components/candidates/CandidateTagFilter.tsx
  components/candidates/CurrencyPanel.tsx
  components/candidates/DocumentIntake.tsx
  components/candidates/FlightProfilePanel.tsx
  components/candidates/LinkedHistoricalPanel.tsx
  components/candidates/MoveToPreOnboardingPanel.tsx
  components/candidates/ResumeIntake.tsx
  components/command-center/CommandCenterWorkspace.tsx
  components/employees/EmployeesWorkspace.tsx
  components/feedback/FeedbackButton.tsx
  components/final-review/FinalReviewWorkspace.tsx
  components/fleet/orgchart/CrewOrgChart.tsx
  components/fleet/orgchart/MaintenanceOrgChart.tsx
  components/fleet/orgchart/TrainingTab.tsx
  components/imports/CandidateCsvImportCard.tsx
  components/imports/ImportActionCards.tsx
  components/jobs/JobDuplicateClusters.tsx
  components/layout/Sidebar.tsx
  components/new-hire-contacts/NewHireContactsView.tsx
  components/offers/OffersWorkspace.tsx
  components/orientation/OrientationOverview.tsx
  components/people/BusinessCardPanel.tsx
  components/people/OnboardingGridTab.tsx
  components/people/OnboardingHistoryPanel.tsx
  components/pilot-requirements/ScoringSetupForm.tsx
  components/recruiting-jobs/NewJobButton.tsx
  components/travel/TravelChecklist.tsx
  components/travel/TravelSpendYear.tsx

do NOT stage:
  scripts/_answers/  scripts/_current_jobs.md  scripts/_decisions.json
  scripts/_dayten-3546d84d.ts  scripts/_ebco-3546d84d.ts  scripts/_final.json
  scripts/_jobs.json  scripts/_normalized-title-repair.md  scripts/_tmp_build.ts
  scripts/_unmatched_roles.csv  scripts/_unmatched_roles.md
  scripts/_paycom_intake_output/  scripts/_preflight_output/  scripts/_reclassify_output/
    (all his own scratch, untracked for weeks - never stage)
  .env.local  (gitignored; I corrected its stale comment block at his request)

message:
  Accessibility: accessible names, focus and semantics, from the overnight audit

  35 fixes across 35 files, each re-confirmed against the current code
  before editing. 6 findings skipped and 8 referred, both listed in
  docs/audit-2026-09-11/.

ROADMAP: Design & Consistency
- [x] Accessibility pass from the Sep 11 audit - accessible names: named the 7 org-chart buttons whose bare X or circle glyph was overriding a useful tooltip (crew take-off-chart and remove-departure, maintenance delete-section, remove-person and delete-opening, training show-on-chart and delete-record), the 4 nameless sliders on the scoring setup page, and 6 visible file inputs across document intake, resume intake and the Imports page. A screen reader announced these as the symbol, or as nothing.
- [x] Accessibility pass - the onboarding grid is readable by a screen reader for the first time: each status cell now announces its task, the hire and the state in words (to do / done / not applicable) instead of just Click to change, and the task column is a real row header with scope, so a status cell is associated with both axes. No visual change - font-normal preserves the old look.
- [x] Accessibility pass - the sidebar now marks the current page with aria-current on both the desktop list and the mobile drawer, and its two navigation landmarks are named Main navigation and Section navigation instead of both announcing as navigation. This affects every page in the app.
- [x] Accessibility pass - keyboard focus restored on 11 controls that were suppressing the only focus ring in the app: all 7 fields on the flight profile panel, the travel checklist note, the candidate document rename field, the tag filter search and the feedback textarea. Caveat worth reading: the restored ring is brand gold, which measures 2.05:1 on a white card against a 3:1 requirement, so these now have a visible-but-low-contrast ring rather than none. The ring colour itself is a decision for Jonathan - see the open item below.
- [x] Accessibility pass - the training table can be sorted from the keyboard (Tab to a column header, Enter or Space to sort) and reports its sort direction. Previously sorting was mouse-only. Used the minimal fix rather than the audit's suggested button conversion, because the header styling lives in a CSS module another session owned tonight and the visual result could not be checked.
- [x] Accessibility pass - 5 filter and column popovers (candidate tag, status and department filters, plus Employees filter and columns) now announce whether they are open, and the two invisible full-screen dismissal buttons on the Employees page no longer trap keyboard focus.
- [x] Accessibility pass - removed two duplicate main landmarks (Command Center and Final Review each shipped two) and fixed one heading-level skip on the travel panel. Both visually inert.
- [x] Accessibility pass - contrast repairs that needed no colour decision: the selected tick in the three candidate filter checkboxes was white on gold at 2.05:1 and is now navy on gold at 7.03:1, matching the Button primitive; 11 gold-filled buttons and chips no longer switch to near-white text in dark mode (1.87:1); and 7 genuine amber and green TEXT failures were darkened from the -600 to the -700 shade, which is already the house-dominant choice.
- [ ] The global keyboard focus ring is brand gold, which measures 2.05:1 on a white card and 1.79:1 on the cool-mist page, below the 3:1 that WCAG requires for a focus indicator. Dark mode is fine at 7.67:1 and 8.90:1, so the DEFAULT theme is the broken one. Measured twice independently - computed from the hex values and measured in a real browser. Not changed, because gold is a locked design token. Decision needed: keep gold and add a dark companion ring (navy is 14.40:1 on white), or give the ring its own darker token. One CSS rule either way.
- [ ] Accessibility items Round 2 corrected rather than applied, so nobody re-derives them wrongly: the audit's 40-site green-and-amber contrast sweep is really about 7 sites. Most of the 40 are icon glyphs, which are held to 3:1 and already pass, and 7 carry no dark-mode override at all, where darkening would push dark mode BELOW 3:1. Only text on a light surface with a dark variant already present was changed.
- [ ] Still open from the accessibility audit, each needing a decision rather than an edit: no Tab trap in any of the 11 hand-rolled modals (Escape works in all 12, Tab escapes all 12); 113 of 121 components give no spoken confirmation of a save or a failed save; 65 of 67 routes serve the same page title; there is no skip link, so every navigation puts the whole sidebar ahead of the content; and the two fleet org-chart pages have no heading of any level.
- [ ] Two nameless buttons remain in components/candidates/CandidateTagEditor.tsx - the confirm-tag and cancel-tag icon buttons, which are 2 of only 4 genuinely nameless buttons out of 806 in the app. Left alone because another session held that file on the night of the audit. Same for the two interview chips on the month and time-grid calendars, which open an interview on click but cannot be reached by keyboard at all.

verified: lint PASS (0 errors, 8 warnings - identical to the pre-change baseline),
  tsc PASS (0 errors), and all 39 affected page routes re-requested by the lead after all
  six domains finished: every one 200 with real HTML and zero error-boundary markers.
  NOT VERIFIED: No route was rendered or fetched. The dev server on :3000 was listening when I started (PID 8120) but returned zero bytes on every route I tried, and by the end the listener was gone and the PID did not exist. I did not start another, by instruction. So nothin
  NOT VERIFIED: What I substituted: an esbuild parse of all 35 edited files, which reported 35 OK and 0 FAIL. That proves syntax, not types. No tsc, no lint, no build was run, by instruction - the combined-tree check still has to pass before any of this is pushed.
  NOT VERIFIED: No screen reader was used. Every accessible-name claim is derived from the HTML and ARIA specs (aria-label overrides name-from-content; title is the last fallback), not heard. CLAUDE.md and chrome-live.md both record that this app's rendered content and access
  NOT VERIFIED: The td-to-th swap in components/people/OnboardingGridTab.tsx is believed visually identical - I added font-normal because Tailwind's preflight contains no th rule, so the browser default bold would otherwise apply, and text-right already overrides the default 
```

```
[Copy: the safe British-English subset - from the 2026-09-11 thirteen-role audit]

claim: .claude/claims/r2-copy-afdc0817.md

paths:
  app/compliments/budget/page.tsx
  app/settings/users/page.tsx
  components/candidates/CandidateTagEditor.tsx
  components/candidates/ManageStageList.tsx
  components/settings/UsersManagementWorkspace.tsx
  docs/sops/00-handbook.html
  docs/sops/01-pre-onboarding.html
  docs/sops/03-business-cards.html
  docs/sops/04-org-charts.html
  lib/events/parse-event-email.ts
  lib/navigation/modules.ts

do NOT stage:
  scripts/_answers/  scripts/_current_jobs.md  scripts/_decisions.json
  scripts/_dayten-3546d84d.ts  scripts/_ebco-3546d84d.ts  scripts/_final.json
  scripts/_jobs.json  scripts/_normalized-title-repair.md  scripts/_tmp_build.ts
  scripts/_unmatched_roles.csv  scripts/_unmatched_roles.md
  scripts/_paycom_intake_output/  scripts/_preflight_output/  scripts/_reclassify_output/
    (all his own scratch, untracked for weeks - never stage)
  .env.local  (gitignored; I corrected its stale comment block at his request)

message:
  Copy: the safe British-English subset, from the overnight audit

  11 fixes across 11 files, each re-confirmed against the current code
  before editing. 6 findings skipped and 17 referred, both listed in
  docs/audit-2026-09-11/.

ROADMAP: Design & Consistency
- [x] The safe British-English subset from the Sep-11 copy audit, applied: 14 edits in 11 files, chosen so nothing stored, matched or generated moved. Two aria-labels that said colour now say color (one of them on a button whose own tooltip two lines above already said color); the in-app Handbook loses all 7 of its British spellings across chapters 0, 1, 3 and 4 (Practising, labelled x4, grey title); the events email parser had centre listed twice in its venue regex and now lists it once. NOT TOUCHED, each for a measured reason rather than caution: unrecognised-subject, because it is a string-literal union compared in PaycomScanButton against a field that file types as a plain string, so a partial rename passes BOTH tsc and lint and silently empties the amber panel that lists Paycom mail the app could not read; brand-grey, because it is a live token on 1,890 lines and the served stylesheet carries brand-grey 24 times and brand-gray zero; every stored and Google-Calendar cancelled spelling, both of which are live in production at once; the surname Storey; and the surviving centre in that regex, because it matches inbound email where Conference Centre is a real venue name.
- [x] Team members, not Team Members. The Settings menu read Title, Title, sentence, Title, sentence in reading order and this was the one generic outlier, Command Center and Layout Lab being locked proper nouns. Moved in all three places at once so the nav cannot contradict the page: the nav entry plus both h1 headings on the users page. Confirmed first that nav labels are display-only, since every access gate keys off item id and href, and the only other reader passes the label straight through for display.
- [x] The compliments budget page no longer shows two money formats in adjacent rows. Projected annual spend was the only cents-free value in a list whose other four rows all show cents. The cents-free MetricCards at the top and the monthly bar list are unchanged, where dropping cents is deliberate.
- [ ] A user-visible British spelling the copy audit's own safe list missed: the Team members page flashes Invite cancelled. as a success toast. It fell between two buckets in that sweep, which treated lowercase unquoted cancelled as prose and reserved quoted lowercase cancelled for the eight Google Calendar wire values. It is display-only and nothing compares against it, so it is a safe one-word fix, but it sat outside tonight's assigned list and was left for a decision rather than changed unreviewed.
- [ ] NOT VERIFIED, needs a person: none of tonight's copy changes were read back off a served page. The dev server was saturated by six parallel agents and degraded while verification was running, returning 500 on two Handbook chapters nobody had edited and then timing out entirely. The edits are confirmed on disk in both directions, with the British tokens gone and the American ones present, and the Handbook, Team members and Budget pages each returned 200 after being edited. Someone should open Data then Handbook chapters 0, 1, 3 and 4, plus Settings then Team members, once the machine is quiet.
- [ ] Layout Lab still calls that page Team Members in two places in its own catalog, so it now disagrees with the nav and both page headings. Different owner; needs either a matching change or one casing decision covering all four places.

verified: lint PASS (0 errors, 8 warnings - identical to the pre-change baseline),
  tsc PASS (0 errors), and all 39 affected page routes re-requested by the lead after all
  six domains finished: every one 200 with real HTML and zero error-boundary markers.
```

```
[Performance: serial awaits and a misleading diagnostic - from the 2026-09-11 thirteen-role audit]

claim: .claude/claims/r2-perf-afdc0817.md

paths:
  app/candidates/[id]/page.tsx
  app/page.tsx
  app/people/[id]/classic/page.tsx
  app/people/[id]/page.tsx
  app/reports/page.tsx
  app/scheduling/page.tsx
  lib/data/candidates.ts

do NOT stage:
  scripts/_answers/  scripts/_current_jobs.md  scripts/_decisions.json
  scripts/_dayten-3546d84d.ts  scripts/_ebco-3546d84d.ts  scripts/_final.json
  scripts/_jobs.json  scripts/_normalized-title-repair.md  scripts/_tmp_build.ts
  scripts/_unmatched_roles.csv  scripts/_unmatched_roles.md
  scripts/_paycom_intake_output/  scripts/_preflight_output/  scripts/_reclassify_output/
    (all his own scratch, untracked for weeks - never stage)
  .env.local  (gitignored; I corrected its stale comment block at his request)

message:
  Performance: serial awaits and a misleading diagnostic, from the overnight audit

  7 fixes across 7 files, each re-confirmed against the current code
  before editing. 0 findings skipped and 7 referred, both listed in
  docs/audit-2026-09-11/.

ROADMAP: Platform & Infrastructure
- [x] Six pages stopped awaiting independent data in series - /reports, /people/<id>, /people/<id>/classic, /candidates/<id>, /scheduling and the / landing route each merged their independent reads into one Promise.all. Every call argument was re-read to prove independence before merging. No visual change; the pages just start rendering a round trip sooner.
- [x] The heaviest page in the app (/people/<id>) no longer serializes its detail fetch ahead of nine other reads - getNewHireDetail joined the group, which matters more than it sounds because that function is itself several sequential queries. Verified first that the write hidden inside getEmployeeJourney (ensureInitialRole, which creates a RoleAssignment row) returns early on an unknown id, so the new 404 path cannot write junk to the live database.
- [x] The misleading [perf] timer on the candidates page is fixed at the root, not just relabelled - its start moved above the bucket-rail query it used to exclude, and the label now names every stage it spans. The logged number previously left out the one query that reads a row per candidate in scope, so the gap against the page-level log sent diagnosis looking outside the queries.
- [ ] Still open and the most valuable item in the performance audit: the bucket-rail query in lib/data/candidates.ts reads every candidate row in scope on every candidates-page load - measured at 8,682 rows and 1.89 MB of JSON, 244-538ms. Buckets are derived and cannot be expressed in SQL, so this needs a decision on approach rather than a patch.
- [ ] The pdf.js worker for the candidate document viewer is still fetched from unpkg.com at runtime - about 1 MB from a third party, and the viewer hangs if unpkg is unreachable. The self-host fix must pin the version: the copy already in public/vendor is 5.6.205 while react-pdf bundles 5.4.296, and mismatched versions throw.
- [ ] The app has no Suspense boundaries, which is why remaining server-side latency shows as a blank screen instead of a progressive render.

verified: lint PASS (0 errors, 8 warnings - identical to the pre-change baseline),
  tsc PASS (0 errors), and all 39 affected page routes re-requested by the lead after all
  six domains finished: every one 200 with real HTML and zero error-boundary markers.
  NOT VERIFIED: The three heavy dynamic routes were NOT confirmed over HTTP, because the shared dev server died mid-check. Sequence, so nobody mistakes this for my edits breaking something: with all seven edits already in place, /, /reports and /scheduling each returned 200. 
  NOT VERIFIED: The 200s I did get on / , /reports and /scheduling are status codes only - I captured the code, not the HTML body, so I cannot rule out a 200 that is actually an error boundary. CLAUDE.md's own guidance is to grep the served HTML; the server died before I coul
  NOT VERIFIED: I did not run lint or tsc, per the instruction that the lead runs both once over the combined tree. Instead I syntax-parsed all seven edited files with the repo's own esbuild (tsx/ts loaders): all 7 parse clean. That proves no brace or paren damage; it does NO
  NOT VERIFIED: The one place where the combined typecheck is the real check is app/page.tsx:22. The narrowing isRoleName(session?.user?.role) ? session.user.role : VIEWER relies on a type guard reaching back through an optional chain, and session is now a destructured tuple 
```
```
[The audit itself, the typecheck fix, and the open-items file - lead session]

claim: .claude/claims/site-deepdive-afdc0817.md

paths:
  docs/audit-2026-09-11/            (new directory, 15 files, ~16,000 lines)
  docs/needs-a-person.md            (appended open items 6-10)
  lib/data/onboarding.ts            (ONE LINE, 472: officeDayKey(now) was being passed a
                                     number. Now officeDayKey(new Date(now)). This was the
                                     only type error in the whole batch and it was mine to
                                     fix - r2-timedate had finished and released the file.)

do NOT stage:
  scripts/_answers/  scripts/_current_jobs.md  scripts/_decisions.json
  scripts/_dayten-3546d84d.ts  scripts/_ebco-3546d84d.ts  scripts/_final.json
  scripts/_jobs.json  scripts/_normalized-title-repair.md  scripts/_tmp_build.ts
  scripts/_unmatched_roles.csv  scripts/_unmatched_roles.md
  scripts/_paycom_intake_output/  scripts/_preflight_output/  scripts/_reclassify_output/
    (all his own scratch, untracked for weeks - never stage)
  .env.local  (gitignored, cannot be staged; I corrected its stale comment block, which
               claimed files save to local disk directly above an uncommented
               FILE_STORAGE_PROVIDER=s3)

message:
  The 2026-09-11 full-site audit, and the one type error the fix batch introduced

  Thirteen read-only auditors over the whole app, one file each. Then six fix agents over
  disjoint file sets. Nothing was written to the database, no file was uploaded and no
  email was sent in any round.

  lib/data/onboarding.ts:472 is a one-line type fix: officeDayKey takes string or Date and
  was being handed the millisecond timestamp that function carries as now.

ROADMAP: Bugs & UX Fixes
- [x] Full-site deep dive, thirteen read-only passes, output in docs/audit-2026-09-11 - UX and click depth, visual design, front-end performance, accessibility, copy, QA wiring, time and date integrity, recruiting operations, security and permissions, product strategy, a live Chrome rendering pass, and two passes over the recruiting workbook. 79 fixes applied the same night across 78 files, 18 findings skipped with reasons and 52 referred. Every finding carries a file, a line and a measured count rather than an adjective.
- [ ] THE 29 SEP ORIENTATION WILL NOT SEND ITS REMINDER, and nobody has been invited - verified twice, in the data and in the code. The orientation reminder-armed setting holds exactly one session id and it is the 4 Aug session, whose status is COMPLETE. sessionsDueForReminder filters id IN armed AND status UPCOMING, so the live 29 Sep session is unreachable by the cron and the 28 Sep run will find nothing. All four attendees - Auggie Quintero, Flynn McFarland, Ryan Christensen, Robert Patrick - carry an empty sentTemplateKeys. Positive control from the same query: the 1 Sep session's four attendees all carry invite, supervisors and reminder, so sends do get recorded. The prep default puts invitations at 14 days before, which is 15 Sep. Arm the 29 Sep session and clear the stale 4 Aug entry.
- [ ] The reminder health check cannot report this class of failure, which is why it went unseen - it loads only sessions that are already armed, so an UPCOMING session that was never armed is invisible to it. It does warn about the opposite case, an armed session whose status is not UPCOMING. Worth making it also list upcoming sessions that are NOT armed.
- [ ] The 1 Sep orientation session is still marked UPCOMING eleven days after it happened, while its attendees all show invite, supervisors and reminder sent. Status hygiene, not a send problem.
- [ ] The public report share link names every pilot and exports them to CSV, with no sign-in - app/r/[token]/page.tsx renders the same progressions component as the signed-in app, including a per-pilot why-no-move verdict and a Download CSV button whose header carries Name, Start date, Left on and Why no move. One link is live and not revoked, created 7 Jul. Rock 5's own roadmap line records that the pilots asked for the aggregate half only. Not changed - revoking a link the team may be using is the user's call.
- [ ] The I-9 appears nowhere in the codebase - zero matches across app, lib, components and prisma/schema.prisma, with drug_screen returning four hits on the same sweep as the positive control. It is a federal three-business-day deadline and three hires start on 14 Sep, 21 Sep and 1 Oct. The fix is two additive lines in lib/onboarding/tasks.ts and needs no migration.
- [ ] Five new entries in docs/needs-a-person.md, items 6 to 10, covering what the overnight batch could not verify: nothing was seen in dark mode, no interaction was clicked, two code paths only run in production because local dev bypasses auth, no screen reader was used, and one residual about non-Mountain interview timezones. The Monday check-in reads that file.
- [ ] CLAUDE.md overstates a browser limitation and it is costing sessions real verification - it says this app's rendered content cannot be read and that screenshots time out everywhere. That is true of the in-app Browser pane and false for Chrome, which this audit used to walk 21 routes, measure computed colours in both themes and take the screenshots that confirmed three dark-mode findings. Worth narrowing the note to the pane it actually describes.

RECORD: No git was to be run by any agent, in any round - his explicit instruction for the
  whole night, which is why these paths come from the agents rather than from git status.
RECORD: Round 1 was to be read-only against both the live database and the live S3 bucket;
  editing the working tree was expected and encouraged.
RECORD: Exactly one agent was permitted to drive Chrome MCP; everyone else read code.
RECORD: Anything an agent was unsure about was to go in the findings file for morning
  review rather than into the code.

verified: lint PASS (0 errors, 8 warnings, identical to the pre-change baseline measured on
  the clean tree before any edit), tsc PASS (0 errors).
  All 39 affected page routes re-requested after every domain finished: all 200, all with
  real HTML bodies, zero error-boundary markers, checked with a positive control that the
  app shell was present.
  The Celebrations fix was proved twice. In the served page on 12 Sep it shows Ricky Lee
  with his 2-year anniversary and correctly omits the three 11 Sep people. At the boundary
  on a simulated UTC host, officeDayKey returns 2026-09-11 for every instant from
  2026-09-12T00:00Z to 05:59Z - the whole 6pm-to-midnight Mountain window - and agrees with
  the old UTC method on both sides of it.
  Live data behind the named people, queried read-only with controls on both sides:
    Sep 10: 0 anniversaries. Sep 11: Braydan Bengtzen (since 2023-09-11), Olivia Vincent
    (2023-09-11), JD Bumgarner (2024-09-11). Sep 12: Ricky Lee (2024-09-12). Sep 13: 0.
  NOT VERIFIED: nothing in the batch was seen in dark mode, no interaction was clicked, no
  permission path was exercised and no screen reader was used. See docs/needs-a-person.md
  items 6 to 10.
```

---

## Notes for the commit agent

1. **Run git status first and reconcile against these paths.** I was instructed not to run
   git at all, so every path above is what an agent reported editing, not what the index
   says. Expect 80 modified files plus the new docs/audit-2026-09-11/ directory.
2. **One commit per block, in the order above.** The time/date block first: it carries the
   two fixes that were wrong on the live site.
3. **Several ROADMAP lines are open items, not shipped work.** Two of them change what
   somebody does on Monday: the unarmed 29 Sep orientation and the public share link.
   Re-check both against the live source before writing them in, as CLAUDE.md requires for
   load-bearing claims. The queries are in the verified block above.
4. **No backticks appear in any ROADMAP line.** Checked mechanically: 51 lines, 0 with one.
5. **The dark-mode block contains a deliberate correction to the audit**, not an omission:
   one of the four CSS variables was left without a dark override on purpose, because the
   override would have halved a contrast ratio rather than fixing one.
6. **.env.local is gitignored and cannot be staged.** Mentioned only so nobody hunts for
   the comment change.
