# QA audit (wiring: links, back buttons, send buttons) — 2026-09-11

Read-only. No database writes, no git, no browser tools, no send path invoked.
Verification was code reading plus `curl` GETs against the dev server already
running on http://localhost:3000 (page routes only, never `/api/`).

---

## Headline

**Two live mis-wirings, both provable in one command each.** (1) Changing a new
hire's stage from their profile redirects to `/people?stage=post` /
`?stage=archived` — a parameter `app/people/page.tsx` **never reads**; it reads
`?tab=`. So "move to post-onboard" lands the user on the Dashboard tab rather
than the tab holding the person they just moved, and the only two producers of
`?stage=` in the whole codebase are those two redirects. (2) The orientation grid's
send button says **"Resend…"** whenever the cell is ticked, including a tick a
human made by hand — the exact bug that was found Sep 09 and fixed Sep 11 for all
four people-side buttons. The roadmap entry for that fix states "The orientation
panel already did this correctly and is untouched"; the tick rendering is correct,
but the button label at `OrientationEmailPanel.tsx:358` reads the hand-toggleable
flag, so it is not. That is the word that made somebody certain a PRD Access email
had gone to a pilot when it had not.

Beyond those: exactly **one dead internal href in 199** (`/jobs/<id>`, a route that
does not exist — it should be `/recruiting-jobs?id=<id>`), **zero** `router.push`
violations of the real-link rule in 19 call sites, and **nine UI send paths** that
are in unusually good shape — eight of nine have a preview, an editable body, a
double-send warning and an in-flight disable. The weakest spots on the mutation
side are two one-click irreversible deletes with no confirmation at all
(feedback items, travel receipts).

---

## What I checked, and how

### 1. `router.push` / `router.replace` / `useRouter`

```
$ grep -rno "router\.[a-zA-Z]*" app components lib --include=*.tsx --include=*.ts \
    | sed 's/.*:\(router\.[a-zA-Z]*\)/\1/' | sort | uniq -c | sort -rn
    163 router.refresh
     31 router.push
```

`router.replace` — **zero**. `router.back` / `window.history.back` — **zero**:

```
$ grep -rn "router\.back\|window\.history\|history\.back" app components lib --include=*.tsx --include=*.ts
components/matchboard/MatchboardWorkspace.tsx:120:    window.history.replaceState(null, "", url.toString());
components/pilot-requirements/PilotRequirementsWorkspace.tsx:321:    window.history.replaceState(null, "", url.toString());
components/recruiting-jobs/RecruitingJobsWorkspace.tsx:259:    window.history.replaceState(null, "", url.toString());
```

Of the 31 `router.push` occurrences, 6 are inside comments (4 of them in
`lib/roadmap/roadmap.ts`, which I only read) and **19 are real call sites**, every
one of them in `components/`. Positive control that `app/` genuinely has none —
both greps come back empty, so the pages are server components that delegate:

```
$ grep -rn "router\.push" app --include=*.tsx --include=*.ts ; echo "exit=$?"
exit=1
$ grep -rn "useRouter" app --include=*.tsx --include=*.ts
(no output)
```

I read the surrounding code at all 19. Classification: **19 CORRECT, 0 VIOLATION.**

| # | Site | Why it is correct |
|---|------|-------------------|
| 1 | `components/candidates/CandidateDepartmentFilter.tsx:45` | `?depts=` re-query of the page you are on |
| 2 | `components/candidates/CandidatePageSize.tsx:38` | `?size=` re-query |
| 3 | `components/candidates/CandidateStatusFilter.tsx:44` | `?stages=` re-query |
| 4 | `components/candidates/CandidateTagFilter.tsx:98` | `?tags=` re-query |
| 5 | `components/candidates/DeleteCandidateButton.tsx:51` | after `await` DELETE — record is gone, list is the only place left |
| 6 | `components/candidates/MoveToPreOnboardingPanel.tsx:84` | after `await` POST `/api/new-hires` — lands on the record just created |
| 7 | `components/candidates/SavedViewHeader.tsx:54` | after `await` DELETE of the view |
| 8 | `components/candidates/SavedViewWorkspace.tsx:192` | after `await` DELETE of the view |
| 9 | `components/candidates/SelectableCandidateTable.tsx:222` | after `await` POST `/api/candidate-views` |
| 10 | `components/compliments/GiveRecognitionForm.tsx:69` | after `await createRecognition` |
| 11 | `components/events/EventFromEmailModal.tsx:207` | after `await` POST events/leads/import |
| 12 | `components/events/EventsOverview.tsx:166` | after `await` POST `/api/events` |
| 13 | `components/orientation/OrientationOverview.tsx:228` | after `await` POST orientation/sessions |
| 14 | `components/orientation/OrientationOverview.tsx:250` | after `await` POST (from-cohort) |
| 15 | `components/people/NewHireDetailWorkspace.tsx:335` | after `await` PATCH stage — **legitimate as a redirect, but the URL it builds is wrong; see CERTAIN #1** |
| 16 | `components/people/NewHireDetailWorkspaceClassic.tsx:254` | same, same bug |
| 17 | `components/people/PreOnboardingWorkspace.tsx:89` | after `await` POST `/api/new-hires` |
| 18 | `components/pilot-requirements/NewRequirementButton.tsx:57` | after `await` POST pilot-requirements |
| 19 | `components/recruiting-jobs/NewJobButton.tsx:74` | after `await` POST `/api/jobs` |

Nothing to pad here. The four filter pushes carry their own in-file justification
(e.g. `CandidateTagFilter.tsx:62-64`: "this is not moving to another page, it is
re-querying the one you are on"), and the other fifteen all sit after an `await`
on a mutation, which the rule explicitly does not cover. The two Links that the
roadmap records as the last conversions are still Links
(`GiveRecognitionForm.tsx:148` Cancel → `/compliments`, `NewJobButton.tsx:151` →
`/recruiting-jobs?id=<clash>`).

Imperative navigation outside the router — only two, both legitimate:

```
$ grep -rn "window\.location\.href\s*=\|location\.href\s*=\|window\.location\.assign\|window\.open(" app components lib --include=*.tsx --include=*.ts
components/job-preview/JobExportMenu.tsx:151:    const printWindow = window.open("", "_blank", "width=960,height=1100");
components/new-hire-contacts/NewHireContactsView.tsx:28:  window.location.assign(`/api/contacts/vcard?${params.toString()}`);
```
(a print window, and a file download — the rule's own exceptions.)

The three `history.replaceState` sites are master-detail pages keeping `?id=`
addressable without pushing a history entry per selection. Each carries a comment
saying so, and all three destinations are read server-side, so a refresh or a
pasted URL works. See UNCERTAIN #3 for the one thing left open there.

### 2. Link integrity, mechanically, against the real route list

67 `page.tsx` files, dynamic segments expanded to `[^/]+`, checked against every
internal `href` in `app/`, `components/` and `lib/` (`lib/roadmap/roadmap.ts`
excluded — prose, not code). Script:
`<scratchpad>/links.js` (deleted after the run; logic reproduced in this file's git-free form below).

```
page.tsx routes found: 67
internal href occurrences scanned: 207
  /api/ (file downloads, not page routes): 8
  resolve to a real route: 198
  DO NOT resolve: 1
   BROKEN components/candidates/CandidateApplicationsPanel.tsx:156  -> /jobs/${app.jobId}
distinct resolving page paths: 63
```

Positive control — the 63 distinct resolving paths, with occurrence counts, so an
empty result cannot be mistaken for a clean one:

```
   2x /account          4x /archive            1x /archive/reports     1x /blocks
   2x /business-cards   2x /calendar          15x /candidates         32x /candidates/X
   2x /candidates/compare  1x /candidates/departments  1x /candidates/manage
   1x /candidates/recent-interviews  3x /candidates/views  3x /candidates/views/X
   2x /command-center   3x /compliments        1x /compliments/analytics
   1x /compliments/budget  2x /compliments/celebrations  1x /compliments/feed
   6x /compliments/give 1x /compliments/rewards 2x /duplicate-review  2x /employees
   3x /events           6x /events/X           4x /events/supplies    3x /fleet/crew
   2x /fleet/maintenance 2x /fleet/positions   2x /handbook           3x /handbook/X
   2x /imports          2x /interview-questions 1x /interview-questions/guide
   1x /interviews/X     1x /interviews/debrief 1x /jobs               1x /jobs/duplicates
   1x /matching         1x /offers             2x /orientation        3x /orientation/X
   2x /people          30x /people/X           1x /people/X/classic   6x /pilot-requirements
   2x /pilot-requirements/scoring  9x /recruiting-jobs  1x /reports   1x /review
   1x /scheduling       1x /settings           1x /settings/activity
   1x /settings/command-center  2x /settings/content-blocks  1x /settings/feedback
   1x /settings/layout-lab 1x /settings/new-hire-contacts 1x /settings/templates
   1x /settings/users   2x /travel
```
(One row prints as `/candidates/${row.candidate` — a regex artifact from
`${row.candidate?.id ?? ""}` at `DebriefQueue.tsx:451`. It resolves; that row is
only ever rendered for the `pending` queue, where `candidate` is non-null by
construction — `lib/interviews/debrief.ts:452-456` pushes to `unmatched` when it
is null.)

Confirmed over HTTP, with controls either side:

```
$ for p in / /jobs /jobs/duplicates /jobs/cmabc123 /recruiting-jobs /candidates /people; do
    printf "%s  %s\n" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$p)" "$p"; done
200  /
200  /jobs
200  /jobs/duplicates
404  /jobs/cmabc123
200  /recruiting-jobs
200  /candidates
200  /people
```

`/jobs` is the Job Post **sandbox** (`app/jobs/page.tsx` → `JobsSandboxWorkspace`).
The requisition a `CandidateApplication.jobId` points at (schema `model Job`,
`prisma/schema.prisma:1067`) is rendered at `/recruiting-jobs?id=<jobId>` —
which is what the candidate profile itself uses twice for the same data
(`CandidateProfileWorkspace.tsx:631` and `:733`).

### 3. Raw `<a>` to internal routes, and `target="_blank"` hygiene

40 `<a` opening tags across `app/` + `components/`. Three point at an internal
**page** route rather than using `next/link`:

```
components/content-blocks/BlockLibrary.tsx:851   href="/settings/content-blocks"          (no target)
components/events/EventFromEmailModal.tsx:264    href={`/events/${...id}`}   target=_blank
components/events/EventFromEmailModal.tsx:547    href={`/events/${...id}`}   target=_blank
```
Positive control — the other `<a href="/...">` are all `/api/` file downloads
(`CandidateDocuments.tsx:128,520,582`, `OrientationSessionDetail.tsx:496`,
`MakeContactButton.tsx:32`, `TravelPanel.tsx:1201`), plus `mailto:`/`tel:` and
external `https:` links.

All 24 `target="_blank"` occurrences were read with 3 lines of context either
side. Every `<a target="_blank">` carries `rel="noreferrer"` or
`rel="noopener noreferrer"` — and `noreferrer` implies `noopener` per the HTML
spec, so **there is no missing-noopener vulnerability anywhere**. The only two
`target="_blank"` with no `rel` at all are `next/link` `<Link>`s to **same-origin**
internal routes, where `window.opener` confers nothing:

```
components/jobs/JobDuplicateClusters.tsx:406-409   <Link href={`/recruiting-jobs?id=${job.id}`} target="_blank">
components/jobs/JobMergedHistory.tsx:124-127       <Link href={`/recruiting-jobs?id=${job.mergedInto.id}`} target="_blank">
```

### 4. Text that should be a link

Measured rather than eyeballed. For every render of `{x.displayName}` /
`{x.candidateName}` / `{x.hireName}` / `{x.name}` in `components/**/*.tsx`
(excluding `aria-label`, `title=`, `placeholder`, comments, template strings and
`confirm()`/`setError()` bodies), I checked whether a `<Link` or `href=` appears
within the 7 lines above:

```
WITH a Link/href within 7 lines above: 44
WITHOUT: 169
```

The 169 are mostly not defects — pickers (`PersonPicker`, `SupervisorPicker`,
`ContactPicker`, `InterviewerPicker`, `LinkPicker`, `PeopleIndex`), `<option>`
elements, uploaded file names, content-block names, core-value names, page `<h1>`s
for the record you are already on, props being passed down, and same-page
detail-pane buttons (which the rule **requires** to be buttons). Triaging to
"an entity that has a detail page, rendered as dead text, where the id is in
hand": **four**, all in CERTAIN below, plus four judgement calls in UNCERTAIN.

Positive controls that the convention is otherwise followed — the main candidate
row (`CandidateRow.tsx:145`), the offers board (`OffersWorkspace.tsx:52`), the
document-currency **report** table (`ReportsWorkspace.tsx:1455`), the unverified
queue (`UnverifiedQueuePanel.tsx:150`), the duplicate scan card
(`CandidateDuplicateScanCard.tsx:112`), the comparison table
(`CandidateComparison.tsx:418`), the department review
(`DepartmentReviewWorkspace.tsx:161`), all four People tabs
(`OnboardingDashboardTab.tsx:90,218,300,326,463,487`, `OnboardingGridTab.tsx:269`,
`PostOnboardTab.tsx:284`, `OnboardingArchivedTab.tsx:141,186`),
`EmployeesWorkspace.tsx:410,447`, `BusinessCardsWorkspace.tsx:257,335,412`,
the events list and calendar (`EventsOverview.tsx:64`, `EventsCalendar.tsx:198,236`),
orientation (`OrientationOverview.tsx:45,108,132,305`) and the travel hub
(`travelTabHref` Links throughout `TravelHubWorkspace.tsx` / `TravelHubCalendar.tsx`).

Two deliberate non-links are documented in place and are **correct** under the
rule: `SavedViewWorkspace.tsx:344-349` ("A BUTTON, not a link: this swaps a detail
pane on the same page") and `MatchCard.tsx:277-286`, which is a button when
`onSelectName` is supplied (pane swap) and a `<Link href={/candidates/<id>}`
when it is not.

### 5. Email send paths — read only; nothing was ever clicked

Why this matters for how I worked: `lib/front/send-guard.ts:155-162` redirects to
`FRONT_TEST_INBOX` outside production and only **refuses** when that variable is
unset. `FRONT_TEST_INBOX` is set in this tree, so a click here would have put a
real message in a real mailbox and written a real `guardDecision` record. I read
instead.

Every send funnels through two functions:

```
$ grep -rn "sendEmail\|sendReply\|draftEmail\|draftReply" app lib --include=*.ts --include=*.tsx | grep -v "^lib/front/messages.ts"
app/orientation/actions.ts:164,408,626      app/people/actions.ts:127,242,446,713
app/travel/actions.ts:597                   lib/notifications/mentions.ts:259
lib/orientation/reminder.ts:280             lib/pilotapp/daily-email.ts:91
lib/front/index.ts:18-21                    (re-exports only)
```

`draftEmail` / `draftReply` exist and are re-exported but have **zero callers** —
worth knowing, because `lib/front/messages.ts:6-9` describes drafting as "the
exported default". Nothing drafts; everything sends.

**Nine UI-triggered send paths**, plus three non-button sends. `lib/front/messages.ts`
routes all of them through `payload()` → `guardRecipients()`, so a new caller
cannot skip the guard.

| # | Button / trigger | Action | Confirm before it fires | Editable body | Double-send guard | "Resend" only if really sent | Disabled in flight | On failure |
|---|---|---|---|---|---|---|---|---|
| 1 | `SendOnboardingEmailButton.tsx:88` | `sendOnboardingEmail` | preview dialog | yes (`EmailBodyEditor:167`) | amber "Already sent … a second copy" from the **send log** | yes — `sentAt` from `getHireSendStatus` | `disabled={sending}` :180 | red banner, dialog stays |
| 2 | `SendContactsEmailButton.tsx:86` | `sendContactsEmail` | preview dialog | yes :185 | yes, from send log | yes :87 | :199 | red banner + amber warnings |
| 3 | `SendTaskEmailButton.tsx:193/202` | `sendTaskEmail` | preview dialog + per-send template picker | yes :359 | yes, from send log | yes :202 | :385/:387, also held while a template reloads | red banner; a **test** send shows blue, ticks nothing |
| 4 | `SendSupervisorContactButton.tsx:165` | `sendSupervisorContactEmail` | preview dialog | yes :354 | yes :225 | yes :165 | :370 | red banner |
| 5 | `SendReimbursementEmailButton.tsx` → `TemplateEmailDialog` | `sendReimbursementEmail` | preview dialog | yes (`TemplateEmailDialog:303`) | yes :258, plus a warning when the earlier send ran outside production | n/a — never says Resend; shows "Asked `<date>`" beside it | :333 | red banner; `sendDisabled` until a template is picked |
| 6 | `OrientationEmailPanel.tsx:357` (per attendee) | `sendOrientationEmail` | **native `confirm()`** naming the recipient, and saying so when the body was edited (:1013) | yes :1123 | the grid shows a three-state tick + send date | **NO — see CERTAIN #2** | :1139 | red box, dialog stays |
| 7 | `OrientationEmailPanel.tsx:921` (batch, per template) | `sendOrientationEmailBatch` | `confirm()` listing every recipient (:782) | yes :897 | already-sent rows skipped by default, re-send is an opt-in checkbox (:853) | n/a | :921 | per-row failures listed by name |
| 8 | `OrientationEmailPanel.tsx:706` (supervisor digest) | `sendOrientationSupervisorBatch` | `confirm()` listing supervisor → hires (:563) | yes :682 | `allAlreadySent` rows skipped, opt-in to include | n/a | :706 | per-supervisor failures listed |
| 9 | `OrientationEmailPanel.tsx:1203` (internal summary) | `sendOrientationSummary` | `confirm()` naming the list (:1181) | **no** — read-only "Show what it says" preview | "Send again" label + sent date + a "list has changed since" staleness note | label is "Send again", driven by a real send record | :1203 | message line under the panel |

On #9's missing editor, the honest reading: `lib/front/orientation-summary.ts:9-19`
says this body is written in code precisely because "there is no Front template for
it", and it is an internal email to a watcher list. The standing rule is *every
**Front-template** email gets an editable body*, so this is not a violation of it —
but it is the one send in the app whose wording cannot be changed before it goes.
A person should decide whether that is intended. Same file accepts a `testTo`
override that no action ever passes, so the summary has no test-send path.

Not buttons, but they send:

- `lib/notifications/mentions.ts:259` — **saving a candidate note or an interview
  write-up that @-mentions somebody emails them**, with no dialog and no preview.
  It is guarded in the two ways that matter: only addresses with a real `User` row
  and permission to see that candidate are mailed (`mentions.ts:163-180`), and on
  an edit only **newly** added mentions are notified
  (`app/api/candidates/[id]/notes/[noteId]/route.ts:92-101` diffs against the
  stored `mentionsJson`), so re-saving cannot re-send. `CandidateNotes.tsx:257-263`
  warns inline when a mentioned person is not on the HR team.
- `lib/orientation/reminder.ts:280` — the only unattended send to a new hire.
  Armed **per session** behind a `confirm()` (`OrientationEmailPanel.tsx:1495-1501`)
  and disabled once the send day has passed. `POST /api/orientation/sessions/[id]/reminder`
  only flips the armed flag; `GET /api/orientation/reminder-health` is read-only by
  construction and documented as such. I did not call either.
- `lib/pilotapp/daily-email.ts:91` — the internal daily report, which is why
  `hrotasks@skyshare.com` is on `INTERNAL_AUTOMATION_RECIPIENTS`
  (`send-guard.ts:70-72`).

One factual note on the guard: in `redirected` mode it rebuilds the payload as
`{to: [testInbox], subject: "[TEST → …] …"}` and **drops `cc`/`bcc`**
(`send-guard.ts:157-164`). A test send therefore does not reproduce the real cc
list. Deliberate-looking, but it means "I tested it" does not cover the cc path.

### 6. Back buttons and return paths

Every in-app Back affordance, found by sweeping `ArrowLeft|ChevronLeft|← |Back to |Go back`:

| File:line | Affordance | Destination | Verdict |
|---|---|---|---|
| `app/archive/reports/page.tsx:55` | "← Back to search" | `/archive` | fine — one parent |
| `app/candidates/manage/page.tsx:98` | "Back to candidates" | `/candidates` | fine — one parent |
| `app/candidates/views/[id]/page.tsx:71` | "All saved views" | `/candidates/views` | fine |
| `app/handbook/[slug]/page.tsx:22` | ArrowLeft "Handbook" | `/handbook` | fine |
| `app/pilot-requirements/scoring/page.tsx:16` | "Back to pilot requirements" | `/pilot-requirements` | fine |
| `components/orientation/OrientationSessionDetail.tsx:330` | "← Orientation" | `/orientation` | fine |
| `components/events/EventDetailWorkspace.tsx:250` | "← Events & Outreach" | `/events` | fine |
| `components/interviews/InterviewDetailWorkspace.tsx:231` | "← Calendar" | `/calendar` | fine — and verified it has exactly one inbound link, `EditInterviewModal.tsx:142`, which is on `/calendar` |
| `components/people/NewHireDetailWorkspace.tsx:801` | "← New hires" / "← Employees" | `/people` or `/employees`, by `hire.stage` | stage-aware; see UNCERTAIN #2 |
| `components/people/NewHireDetailWorkspaceClassic.tsx:288` | same | same | same |
| `components/people/NewHireDetailWorkspaceClassic.tsx:281` | "Back to the current page" | `/people/<id>` | fine |
| `components/candidates/CandidateProfileWorkspace.tsx:392` | "← Back to candidates" | hardcoded `/candidates` | **the classic mismatch — UNCERTAIN #1** |

**Nothing uses history.** There is no `router.back()` and no `history.back()`
anywhere, so every Back in the app is a destination, not a return.

Detail pages with **no** back affordance: none of the authenticated ones. I
checked each dynamic route individually; `/people/[id]` looked like one until I
read past my own grep — it builds the href from an expression
(`href={hire.stage === "ACTIVE" ? "/people" : "/employees"}`), which a
`href="/people` pattern misses. The public pages (`/book/[slug]`, `/r/[token]`,
`/welcome`) have no app chrome by design. There is no `Breadcrumb` component in
the codebase (`find components -iname "*readcrumb*"` → empty;
`grep -rn "Breadcrumb"` → empty), so the per-page link is the whole mechanism.

### 7. Form and mutation hygiene

All 24 client-side `DELETE` fetches read with context. Most are properly guarded —
`window.confirm` with a count or a named consequence
(`ManageTagList.tsx:105`, `InterviewQuestionsWorkspace.tsx:212`,
`InterviewDetailWorkspace.tsx:217`, `BusinessCardPanel.tsx:218`,
`EmployeeJourney.tsx:153`, `ReportShareButton.tsx:68`,
`LinkedHistoricalPanel.tsx:85`), a two-click arm
(`CandidateNotes.tsx:197`, `CandidateProfileWorkspace.tsx:175`,
`CandidateDocuments.tsx:265`, `InterviewWriteUp.tsx:535`,
`EditInterviewModal.tsx:303-325`, `TravelPanel.tsx:519` for a whole trip), or a
typed confirmation (`DeleteCandidateButton.tsx:30` types the candidate's name;
`UsersManagementWorkspace.tsx:99` types the user's email). Two have nothing at
all — CERTAIN #5 and #6.

Components that do a mutating fetch and never render a `disabled=` anywhere:

```
components/calendar/CalendarWorkspace.tsx      components/candidates/CandidateReasonCell.tsx
components/people/OnboardingDashboardTab.tsx   components/people/OnboardingGridTab.tsx
components/people/PaycomScanButton.tsx         components/people/PostOnboardTab.tsx
components/settings/FeedbackWorkspace.tsx
```
Read individually, six of the seven are fine: optimistic state transitions with
rollback (`OnboardingGridTab.tsx:150-167` reverts on a non-OK response), or a
trigger that a modal overlay immediately covers. `PaycomScanButton.tsx:154` is the
interesting one — its button is not disabled while the sweep runs and it POSTs
`/api/front/scan-paycom?apply=1` and `/api/front/scan-pilot-apps?apply=1&createMissing=1`,
which tick checklist items, file PDFs and **create candidates**. The file's own
header (`:23-26`) says both handlers are idempotent — an already-ticked step is
left alone, an already-filed PDF is skipped by Front message id — and the `Modal`
that opens covers the trigger, so this is not a live bug. Recording it because a
future non-idempotent sweep added here would have no guard. (I did not click it.)

Forms: 20 `<form>` elements. Two are bare — no `action`, no `onSubmit`, no
`method` — so they submit GET to whatever route they happen to be rendered on:
`components/recruiting-jobs/RecruitingJobsWorkspace.tsx:63` and
`components/pilot-requirements/PilotRequirementsWorkspace.tsx:339`. Both are
page-local search boxes and both work today because their own page reads `?q=`.
`CandidateSearchBox.tsx:14-17` documents exactly why that is fragile
("A bare `<form>` posts to whatever route it is rendered on"). See UNCERTAIN #5.

No form was found that clears its inputs on a failed submit — every create path I
read (`NewJobButton.tsx:72-80`, `PreOnboardingWorkspace.tsx:72-94`,
`EventsOverview.tsx:153-170`, `OrientationOverview.tsx:207-233`,
`MoveToPreOnboardingPanel.tsx:60-88`, `EventFromEmailModal.tsx:181-211`) calls
`reset()`/`setOpen(false)` only **after** the response is confirmed OK, and sets an
error and re-enables on failure. `InterviewWriteUp.tsx:390` even says so in the
error text: "Your edits are still here — try again."

---

## CERTAIN — safe for a later agent to fix without re-deriving

### 1. `?stage=` is a dead parameter: a stage change always lands on the Dashboard tab
`components/people/NewHireDetailWorkspace.tsx:335`
`components/people/NewHireDetailWorkspaceClassic.tsx:254`

Both push `/people?stage=active|post|archived`. `app/people/page.tsx` reads only
`?tab=` (`page.tsx:17-23,33-34`) and `tabFromParam(undefined)` returns
`"dashboard"`. So moving somebody to Post-onboard or Archived navigates to a tab
that does not contain them.

Proof that nothing reads `stage`, with the control for `tab`:
```
$ grep -rn "stage\b" app/people components/people/PreOnboardingWorkspace.tsx --include=*.tsx | grep -iE "searchParams|sp\.|params\?\.|params\."
exit=1
$ grep -rn "searchParams" app/people/page.tsx
25:export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
33:  const sp = await searchParams;
$ grep -rn "stage=active\|stage=post\|stage=archived" app components --include=*.tsx
components/people/NewHireDetailWorkspace.tsx:335
components/people/NewHireDetailWorkspaceClassic.tsx:254
```
Proof over HTTP that `?stage=post` selects Dashboard and `?tab=post` selects
Post-onboard (the match is on the active-tab class from
`PreOnboardingWorkspace.tsx:140`):
```
$ curl -s "http://localhost:3000/people"             | grep -o 'border-brand-lea text-brand-lea[^"]*"[^>]*>[A-Za-z-]*'
border-brand-lea text-brand-lea dark:border-slate-100 dark:text-slate-100" href="/people?tab=dashboard">Dashboard
$ curl -s "http://localhost:3000/people?stage=post"  | grep -o 'border-brand-lea text-brand-lea[^"]*"[^>]*>[A-Za-z-]*'
border-brand-lea text-brand-lea dark:border-slate-100 dark:text-slate-100" href="/people?tab=dashboard">Dashboard
$ curl -s "http://localhost:3000/people?tab=post"    | grep -o 'border-brand-lea text-brand-lea[^"]*"[^>]*>[A-Za-z-]*'
border-brand-lea text-brand-lea dark:border-slate-100 dark:text-slate-100" href="/people?tab=post">Post-onboard
```

**Fix** (identical line in both files).
Before:
```tsx
router.push(stage === "ACTIVE" ? "/people?stage=active" : stage === "POST_ONBOARD" ? "/people?stage=post" : "/people?stage=archived");
```
After:
```tsx
router.push(stage === "ACTIVE" ? "/people?tab=grid" : stage === "POST_ONBOARD" ? "/people?tab=post" : "/people?tab=archived");
```
The valid values are exactly `dashboard | grid | post | archived`
(`app/people/page.tsx:17`). `post` and `archived` are unambiguous. For `ACTIVE`,
`grid` is the tab whose badge is `counts.active`
(`PreOnboardingWorkspace.tsx:58`); if anyone prefers the current landing spot,
use `?tab=dashboard` — but do not leave `?stage=`.

*Severity: medium.* Nothing is corrupted; the user is put on the wrong tab after
every stage change and has to find the person again.

### 2. The orientation grid says "Resend…" for a hand-ticked step
`components/orientation/OrientationEmailPanel.tsx:358`

The cell has two independent facts and the file knows it: `sent` comes from
`a.sentTemplateKeys` — hand-toggleable, documented at `:57` as
*"templateKey -> what the APP sent. Absent = ticked by hand"* — and `record`
comes from `a.sends[t.key]`, which only exists when this app really sent it. The
tick, the date chip and the tooltip all branch on `record` first (`:330-345`,
`:366-371`), including the tooltip that reads *"Marked by hand — the app has no
record of sending this"* (`:324`). Only the button label branches on `sent`:

```tsx
358:                            {sent ? "Resend…" : "Send…"}
```

This is the Sep 09 bug. `lib/roadmap/roadmap.ts:584` records the fix for the four
people-side buttons and states *"The orientation panel already did this correctly
and is untouched"* — true of the tick, not of the label. The four fixed buttons all
read a send-log timestamp instead (`SendOnboardingEmailButton.tsx:89`,
`SendContactsEmailButton.tsx:87`, `SendTaskEmailButton.tsx:202`,
`SendSupervisorContactButton.tsx:165`), and `grep -rn "Resend\|Send again"` shows
`:358` is the only remaining label driven by a hand-tickable flag.

**Fix**, one word:
```tsx
-                            {sent ? "Resend…" : "Send…"}
+                            {record ? "Resend…" : "Send…"}
```
Do **not** change the `aria-label` at `:319` or the `title` at `:320-326`; those use
`sent` correctly, because marking/un-marking is exactly what the tick button does.

*Severity: high.* It is the class of wrong that already caused somebody to believe a
real email had gone out when it had not.

### 3. A job-title link on the applications panel points at a route that does not exist
`components/candidates/CandidateApplicationsPanel.tsx:156`

```tsx
154:                    {app.jobId ? (
155:                      <Link
156:                        href={`/jobs/${app.jobId}`}
```
`app.jobId` is `CandidateApplication.jobId` → `model Job`
(`prisma/schema.prisma:1258`, `:1067`), and `lib/data/candidates.ts:1218` maps it
straight through. There is no `app/jobs/[id]/page.tsx` (`find app/jobs -type f`
returns only `app/jobs/page.tsx` and `app/jobs/duplicates/page.tsx`), and
`curl` returns 404 for `/jobs/<id>` while `/jobs` and `/jobs/duplicates` return
200. `/jobs` is the Job Post sandbox, a different entity.

**Fix:**
```tsx
-                        href={`/jobs/${app.jobId}`}
+                        href={`/recruiting-jobs?id=${app.jobId}`}
```
That is the href the candidate profile already uses for the same field, twice:
`CandidateProfileWorkspace.tsx:631` and `:733`.

*Severity: high.* Every job title on the candidate-list applications panel is a
404 — and that panel is a 2026-09-11 feature, so it is fresh.

### 4. "Linked candidates" on a job links to a name search, not to the person
`components/recruiting-jobs/RecruitingJobsWorkspace.tsx:185`

```tsx
182:          job.linkedCandidates.map((candidate) => (
183:            <Link
184:              key={candidate.id}
185:              href={`/candidates?q=${encodeURIComponent(candidate.displayName)}`}
```
The id is right there in `key`. `lib/data/recruiting-jobs.ts:242-247` sets it from
`application.candidate.id`, and `/candidates/[id]` is the profile route. So
clicking a linked candidate opens a filtered list instead of the person, and two
people who share a name both come back. (`DebriefQueue.tsx:302` uses the same
`?q=` shape **correctly** — it is in the "No candidate record for these" block,
where there is no id to link to.)

**Fix:**
```tsx
-              href={`/candidates?q=${encodeURIComponent(candidate.displayName)}`}
+              href={`/candidates/${candidate.id}`}
```

*Severity: medium.*

### 5. The document-currency dashboard widget renders candidate names as dead text
`components/widgets/registry.tsx:269`

```tsx
269:                  <span className="truncate text-brand-black/80 dark:text-slate-300">{it.candidateName} · {it.documentType ?? "Doc"}</span>
```
`it` is a `DocCurrencyItem`, which carries `candidateId`
(`lib/data/document-currency.ts:14-16`) — and that file's own header at `:8` says
it *"returns candidateId + candidateName as linked names"*. The Reports version of
the same list **is** a Link (`ReportsWorkspace.tsx:1455`). The widget is the
version an admin puts on a page, and from it an expiring document names a person
you cannot click.

**Fix.** Add the import at the top of the file (it currently has none for `next/link`
— `grep -n "next/link" components/widgets/registry.tsx` → empty):
```tsx
import Link from "next/link";
```
Then:
```tsx
-                  <span className="truncate text-brand-black/80 dark:text-slate-300">{it.candidateName} · {it.documentType ?? "Doc"}</span>
+                  <Link href={`/candidates/${it.candidateId}`} className="truncate text-brand-black/80 transition hover:text-brand-eden dark:text-slate-300">
+                    {it.candidateName} · {it.documentType ?? "Doc"}
+                  </Link>
```

*Severity: low.*

### 6. The Paycom sweep names every filed candidate and links none of them
`components/people/PaycomScanButton.tsx:354-356`

```tsx
318:  const filed = pilot.results.filter((r) => r.outcome === "attached" && r.candidateId);
...
355:              <li key={i}>
356:                {r.candidateName}
```
`filed` is **already filtered to rows that have `candidateId`**, so no conditional
is needed. The paragraph right below (`:367-369`) says *"Each PDF is on the
candidate's Documents tab"* and then gives no way to get there. `lib/pilotapp/scan.ts`
sets `candidateId` at `:243` (matched) and `:374` (created).

**Fix.** Add `import Link from "next/link";` (not currently imported), then:
```tsx
-                {r.candidateName}
+                <Link href={`/candidates/${r.candidateId}`} className="underline-offset-2 hover:underline">
+                  {r.candidateName}
+                </Link>
```

*Severity: low.*

### 7. Deleting a feedback item: one click, no confirmation, no rollback
`components/settings/FeedbackWorkspace.tsx:111-115` and the button at `:326-330`

```tsx
111:  async function remove(id: string) {
112:    setItems((prev) => prev.filter((i) => i.id !== id));
113:    await fetch(`/api/feedback/${id}`, { method: "DELETE" });
114:  }
...
326:            <button
327:              onClick={() => remove(item.id)}
```
`app/api/feedback/[id]/route.ts:45` is `prisma.feedback.delete` — irreversible, and
`FeedbackImage` hangs off it. Three problems in four lines: no confirm, no
in-flight disable, and the row is removed from the list **before** the request,
with no rollback — so a 403 or a 500 leaves the UI claiming it is gone while the
record survives. Every other delete in the app confirms somehow (see §7 above).

**Fix:**
```tsx
  async function remove(id: string) {
    if (!window.confirm("Delete this feedback? The note and any screenshots go with it. This cannot be undone.")) return;
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== id));
    const res = await fetch(`/api/feedback/${id}`, { method: "DELETE" });
    if (!res.ok) setItems(prev);
  }
```

*Severity: medium.*

### 8. Deleting a travel receipt: one click, no confirmation, silent on failure
`components/travel/TravelPanel.tsx:1166-1169` and the button at `:1209-1215`

```tsx
1166:  async function handleDelete(id: string) {
1167:    const res = await fetch(`/api/travel/receipts/${id}`, { method: "DELETE" });
1168:    if (res.ok) onChange(receipts.filter((r) => r.id !== id));
1169:  }
```
`app/api/travel/receipts/[id]/route.ts:50` does `prisma.travelReceipt.delete` and
its own comment notes the stored blob is left behind — so the row is gone
irreversibly and the S3 object is orphaned with no pointer. A failure shows the
user nothing at all. The **same file** already uses the two-click arm for deleting
a whole trip (`:519`: `confirmDelete ? handleDelete() : setConfirmDelete(true)`),
so the pattern is right there.

**Fix** (matching the house `window.confirm` style used in `BusinessCardPanel.tsx:218`):
```tsx
  async function handleDelete(id: string) {
    if (!window.confirm("Delete this receipt? The record is removed for good.")) return;
    const res = await fetch(`/api/travel/receipts/${id}`, { method: "DELETE" });
    if (res.ok) onChange(receipts.filter((r) => r.id !== id));
    else setError("Could not delete that receipt.");
  }
```
(`setError` already exists in this component — it is used by the upload handler at
`:1162`.)

*Severity: medium.*

### 9. A raw `<a>` does a full page reload out of an unsaved block editor
`components/content-blocks/BlockLibrary.tsx:849-856`

```tsx
849:                  {mode !== "create" && selectedBlock ? (
850:                    <a
851:                      href="/settings/content-blocks"
...
855:                    </a>
```
A click changes the whole screen, so by the house rule it must be a `Link` — and
because this is a raw anchor it is a full document navigation out of an editor
with unsaved state, with no client-side transition and no warning.
`next/link` is not imported in this file.

**Fix.** Add `import Link from "next/link";`, then `<a` → `<Link` and `</a>` → `</Link>`
(the `href` and `className` are unchanged).

*Severity: low.*

### 10. Two internal `<a target="_blank">` that should be `Link`
`components/events/EventFromEmailModal.tsx:263-268` and `:546-551`

```tsx
264:                href={`/events/${reviewing.possibleDuplicate.id}`}
547:                                  href={`/events/${lead.possibleDuplicate.id}`}
```
`Link` **is** imported in this file (it is used elsewhere in it), so this is a
two-token change each: `<a` → `<Link`, `</a>` → `</Link>`, keeping
`target="_blank" rel="noreferrer"`. Functionally these work today — consistency
and prefetch only.

*Severity: low.*

---

## UNCERTAIN — needs a human in the morning

### 1. The candidate profile's Back goes to `/candidates` from 27 different origins
`components/candidates/CandidateProfileWorkspace.tsx:392` is a hardcoded
`href="/candidates"`. Measured inbound links to `/candidates/<id>`:

```
$ grep -rln 'href={`/candidates/\${' app components --include=*.tsx | wc -l
27
$ grep -rn  'href={`/candidates/\${' app components --include=*.tsx | wc -l
31
```
…from Offers, Reports, the Matchboard, the Debrief Queue, Duplicate Review, saved
views, the fleet org charts, the archive, Command Center, `/people/<id>`,
`/interviews/<id>` and more. Back always returns to the unfiltered candidate list —
`CandidateSearchBox.tsx:10-12` already describes the cost in its own words:
*"it is a bare href="/candidates" with no query string, so it discards the search
that got you there."*

**Why I cannot close it:** the fix is a product decision, not a line edit.
`router.back()` is out (it breaks the real-link rule). A `?from=` / `?back=`
convention would work and the codebase has no such convention yet — the one
`from=` in the tree (`PreOnboardingWorkspace.tsx:111` → `/candidates?from=onboarding`)
means something else entirely (`app/candidates/page.tsx:110` reads it as
`onboardingIntent`). Picking a param name, deciding whether to validate it
against a route allowlist, and threading it through 31 call sites is a change
somebody should agree to first.

**The one thing that would close it:** the user saying which mechanism he wants —
a `?back=` param the profile renders as "← Back to <label>", or leaving it and
relying on the browser's own Back.

### 2. A post-onboard hire's Back goes to `/employees`, not to the tab they came from
`NewHireDetailWorkspace.tsx:801-806` (and the same block at
`NewHireDetailWorkspaceClassic.tsx:288-293`) chooses
`hire.stage === "ACTIVE" ? "/people" : "/employees"`. A POST_ONBOARD hire is
listed on `/people?tab=post`, so opening one from that tab and pressing Back
leaves the People page entirely. The label is honest ("← Employees") and the
person *is* findable at `/employees`, so this may be intentional — post-onboard
people are arguably employees now.

**Why I cannot close it:** whether POST_ONBOARD belongs to People or to Employees
is a product call, and it interacts with CERTAIN #1 (if the stage-change redirect
starts honouring `?tab=post`, the Back link pointing at `/employees` becomes
visibly inconsistent with it).
**What would close it:** one sentence from the user — should a post-onboard hire's
Back read "New hires" and go to `/people?tab=post`, or stay "Employees"?

### 3. The Matchboard's list cards are buttons; the roadmap says they were made Links
`components/matchboard/MatchboardWorkspace.tsx:263` and `:274` are
`<button onClick={() => select("role"|"candidate", id)}>`. `select()` (`:81-110`)
sets state and loads the detail with a server action — a same-page pane swap,
which the house rule says **should** be a button. The mode tabs (`:164`, `:174`,
`:184`) are the same. But `lib/roadmap/roadmap.ts:694` records
*"Fixed the Matchboard role + candidate list cards (were button + router.push ->
now Link href=/matching?mode=..&id=..)"* as shipped, and `app/matching/page.tsx`
does read both `mode` and `id` server-side, so Links would work.

**Why I cannot close it:** I cannot tell whether the Link version was deliberately
refactored back to a pane swap (which is the better UX and what the rule prefers)
or whether the roadmap entry is simply stale. Both readings are defensible and I
will not guess at intent.
**What would close it:** `git log -p` on that file — which I am not allowed to run
tonight. A 30-second look by the commit agent settles it, and the roadmap line
should then either be corrected or the cards converted.

### 4. Four entity names that cannot be linked without restructuring the markup
Each is a real name with a real detail page, rendered as plain text, where the
obvious fix would nest an interactive element inside another one:

- `components/duplicate-review/DuplicateReviewQueue.tsx:29` — the candidate name
  on each side of a merge, inside a `<button>` that selects which record survives.
  There **is** an "Open profile" `<Link>` at `:41-47` using
  `onClick={(e) => e.stopPropagation()}`, i.e. an `<a>` nested in a `<button>` —
  invalid HTML that happens to work. Making the name itself a link would add a
  second one.
- `components/employees/EmployeesWorkspace.tsx:477` — the employee name in the
  merge modal, inside a `<label>` wrapping the "keep this record" radio. You are
  about to permanently delete one of two people and cannot open either to check.
  Also worth a human's eye: this merge has **no typed confirmation**, unlike
  `DeleteCandidateButton`, and its own copy promises *"its roles, dates, travel,
  business cards and recognition all move over"*.
- `components/interviews/DebriefQueue.tsx:382-384` — the matched candidate's name,
  inside a `<label>` wrapping the selection checkbox. Mitigated: the row already
  has a "Write up" `<Link>` to `/candidates/<id>?tab=interviews` at `:451`.
- `components/people/PaycomScanButton.tsx:197` and `:222` — the hire names on the
  offer-accepted and background-check results. Unlike the `filed` list (CERTAIN
  #6) these rows carry **no id at all**: `ScanRow` (`:29-38`) has `personName`,
  `hireName`, `position` and `outcome`. Linking them needs `lib/paycom/scan.ts` to
  return a `hireId`.

**What would close them:** a decision on the nesting (move the checkbox/radio out
of the `<label>` so the name can be a sibling link, which is also the a11y-clean
shape) and, for the last one, whether adding `hireId` to the scan result is worth it.

### 5. Two bare `<form>` elements relying on the current route
`components/recruiting-jobs/RecruitingJobsWorkspace.tsx:63` and
`components/pilot-requirements/PilotRequirementsWorkspace.tsx:339` have no
`action`, no `method` and no `onSubmit`. They work on their own pages today. The
hardening is exact — `action="/recruiting-jobs" method="get"` and
`action="/pilot-requirements" method="get"`, which is what
`CandidateSearchBox.tsx:76` does and documents at `:14-17`.

**Why not certain:** a GET submit replaces the whole query string, so adding an
explicit `action` would also drop the `?id=` that `history.replaceState` put
there — and on `/recruiting-jobs` and `/pilot-requirements` that `?id=` is the
selected record. Whether a search should clear the selection is a behaviour
choice, and I am not going to make it silently.
**What would close it:** deciding whether searching should keep the selected
job/requirement. If not, add the `action` as above. If so, add a hidden
`<input type="hidden" name="id" value={selectedId ?? ""} />` at the same time.

### 6. The orientation internal summary has no editable body and no test send
`sendOrientationSummary` (`app/orientation/actions.ts:400`) is the only send
action with no `bodyOverride` parameter, and the preview at
`OrientationEmailPanel.tsx:1247-1256` is read-only. `lib/front/orientation-summary.ts:9-19`
explains that there is no Front template for it, which means the standing rule
("every **Front-template** email gets an editable body") does not literally bite.
The builder also accepts `testTo` (`orientation-summary.ts:56`) which no action
ever passes, so there is no way to send this one to yourself first.

**Why I cannot close it:** it is the user's rule and his call whether "every
template email" was meant to include a code-built internal one. The file itself
names the clean path — *"the right move is to create a Front template for it and
switch this to fetchTemplate"*.
**What would close it:** him saying whether this email should be editable.

### 7. A stale memory/roadmap claim worth correcting, not a code bug
The memory index carries *"Business card order lifecycle — OPEN BUG: merging two
employees silently detaches their card orders."* That is fixed.
`app/api/new-hires/merge/route.ts:48` moves `businessCardOrderLine` with a comment
explaining the `onDelete: SetNull` trap it was written to close, and
`prisma/schema.prisma:497-514` confirms `BusinessCardOrderLine.newHireId` is the
only employee pointer those two tables have (`BusinessCardOrder` itself has none).
I am listing this as uncertain only because correcting a memory note is not mine
to do, and because I verified the merge route rather than the full card-order
feature.

---

## Counts

| Measure | Number |
|---|---|
| `page.tsx` routes | 67 |
| `router.push` call sites (real, excluding comments) | 19 |
| └ classified VIOLATION of the real-link rule | **0** |
| └ CORRECT — same-page filter re-query | 4 |
| └ CORRECT — post-mutation redirect (after an `await`) | 15 |
| `router.replace` call sites | 0 |
| `router.refresh` calls | 163 |
| `router.back()` / `history.back()` | 0 |
| `history.replaceState` (documented pane-swap URL sync) | 3 |
| `useRouter` importers | 85 files |
| Internal `href` occurrences scanned (app + components + lib) | 207 |
| └ `/api/` file downloads | 8 |
| └ resolve to a real route | 198 |
| └ **broken** | **1** (`/jobs/${app.jobId}`) |
| Distinct resolving page paths (positive control) | 63 |
| `<a` opening tags | 40 |
| └ `<a>` to an internal **page** route (should be `Link`) | 3 |
| `target="_blank"` occurrences | 24 |
| └ missing `rel` entirely | 2 (both same-origin `<Link>`; no opener risk) |
| └ missing `noopener` in a way that matters | **0** (`noreferrer` implies it) |
| Name renders with a Link/href within 7 lines above | 44 |
| Name renders without | 169 (triaged: 4 certain defects, 4 uncertain, rest correct) |
| UI-triggered email send paths | 9 |
| └ with a confirm or preview-then-confirm step | 9 / 9 |
| └ with an editable body (`EmailBodyEditor`) | 8 / 9 |
| └ disabled while in flight | 9 / 9 |
| └ warn or skip on an already-sent record | 9 / 9 |
| └ "Resend"-style label driven by a real send record | 8 / 9 |
| Non-button send paths (mention notifier, reminder cron, daily report) | 3 |
| `draftEmail` / `draftReply` callers | 0 |
| In-app Back affordances | 12 |
| └ hardcoded destination | 12 |
| └ history-based | 0 |
| └ mismatched with where the user came from | 2 (UNCERTAIN #1, #2) |
| Authenticated detail pages with no back affordance | 0 |
| Client-side `DELETE` call sites | 24 |
| └ with confirm / two-click arm / typed confirmation | 22 |
| └ with **no** confirmation at all | 2 (CERTAIN #7, #8) + 1 low-stakes (`OrientationSessionDetail.tsx:118`, a re-uploadable lunch file; it does disable while busy and surfaces errors) |
| `<form>` elements | 20 |
| └ bare (no `action`, no `onSubmit`, no `method`) | 2 |
| Mutating components with no `disabled=` anywhere | 7 (6 benign; `PaycomScanButton` documented idempotent + modal-covered) |
| Forms found to lose data on a validation error | 0 |

### Adjacent, not mine — handed to the UX/visual auditors
`OrientationEmailPanel.tsx:1249` uses `max-h-64 overflow-y-auto` with no
`overflow-x-hidden`, which per the CSS overflow spec silently enables horizontal
scrolling. `RecruitingJobsWorkspace.tsx:180` has `overflow-y-auto` with the same
omission. I did not sweep for this pattern — the vertical-space audit owns it —
but these two crossed my path while tracing send paths and links.
