# UX and interaction design audit — 2026-09-11

Role key `ux`. Read-only: no git, no browser tools, no DB writes, no sends. Evidence is
source code plus HTTP status against the dev server already running on :3000, plus
read-only SELECTs against the live Neon database.

---

## Headline

**Cross-group navigation now costs two clicks and a wasted page render, and that is the
tax on nearly every task in the app.** Clicking a rail tile is a `<Link>` to
`firstHref(group)` (`components/layout/Sidebar.tsx:100-113`), so going from Candidates to
Travel loads `/people` — which runs `getOnboardingCounts()` + `getActiveDashboard()` —
purely so the items panel will show you the Travel link you actually wanted. 31 of an
admin's 37 nav destinations are not their group's first item, so 31 of 37 pay this.
The hover flyout that used to collapse it to one hover + one click was removed from the
expanded rail **today** at Aimee's explicit request, and that decision is not up for
re-litigation — the fix is to stop the rail tile navigating at all, not to bring the
flyout back.

Second, smaller but sharper: **`components/people/NewHireDetailWorkspace.tsx:335` sends
you to `/people?stage=post` after you click "Mark onboarded", and `/people` does not read
a `stage` param** (`app/people/page.tsx:19-34` reads `tab`). So the single most important
state transition in onboarding silently dumps you on the Dashboard tab instead of the
Post-onboard tab you were expecting. Same bug at
`components/people/NewHireDetailWorkspaceClassic.tsx:254`.

Third: **the daily worklist is not on anybody's home page except one person's, and only
because she changed it herself.** `DEFAULT_HOME` is `/settings/command-center`
(`lib/data/user-home.ts:20`), whose "Needs action" panel is three data-hygiene counters —
pilot-requirement reviews, import warnings, duplicate reviews
(`lib/data/command-center.ts:98-115`). No offers awaiting onboarding, no debrief queue, no
hires starting this week. Exactly one `user-pref` row exists in the live database and it
belongs to `aschaedig@skyshare.com`, pointing at `/people`.

---

## What I checked, and how

### 1. The navigation tree, from code

`components/layout/Sidebar.tsx` (26,018 bytes, modified Sep 11 11:14) renders a 70px icon
rail plus a 224px items panel. The tree itself is `lib/navigation/modules.ts`
`navigationGroups` (lines 110-269). Six groups, 37 items:

| Group | `firstHref` (where the rail tile lands you) | Items |
|---|---|---|
| Recruiting | `/candidates` | Candidates, Jobs (`/recruiting-jobs`), Pilot Requirements, Matchboard, Offers · Events, Supplies · Calendar, Debrief Queue, Scheduling, Question Bank · Job Post Builder (`/jobs`), Final Review (`/review`), Content Blocks (`/blocks`) — **14** |
| Onboarding | `/people` | New hires (`/people`), Orientation, Travel, Business cards — **4** |
| People | `/employees` | Employees, Compliments — **2** |
| Fleet | `/fleet/crew` | Crew Org Chart, Maintenance Org Chart, Fleet positions — **3** |
| Data | `/imports` | Imports / Uploads, Duplicate Review, Reports, Historical Archive, Handbook — **5** |
| Admin | `/settings` | General, Command Center, Team Members, Activity, Feedback, Templates, Block management, Layout Lab, New hire contacts — **9** |

Rail tile mechanics, verbatim:

```
components/layout/Sidebar.tsx:100
  function firstHref(group: VisibleNavigationGroup) {
    return group.sections[0]?.items[0]?.href ?? homeHref;
  }
...
components/layout/Sidebar.tsx:110
        <Link
          href={firstHref(group)}
          prefetch={false}
```

and the items panel is gated on the ACTIVE group only:

```
components/layout/Sidebar.tsx:403
        {!collapsed && activeGroup && (
```

`activeGroup` is derived from `usePathname()` (lines 96-97). Therefore: you cannot see
another group's items without first navigating into that group. The expanded-mode flyout
that used to sidestep this is now `{collapsed && (...)}` only — lines 158-187, with a
long comment recording why (Aimee: *"that left window doesn't need to have a pop-up for
any of the sections"*).

### 2. Where each account actually lands

`lib/data/user-home.ts:20` — `export const DEFAULT_HOME = "/settings/command-center";`
`lib/data/user-home.ts:86-89` — if `DEFAULT_HOME` is not in your visible choices, you get
`choices[0]`, i.e. your first visible nav item.

Live read-only query. My **first** attempt asked for `scope: "module-access"` and got zero
rows — that was a **wrong query, not an absent row**; the real address is
`scope: "workspace"` / `key: "module-access"` (`lib/data/module-access.ts:19-20`). Positive
control: every scope in the table, with counts.

```
$ npx tsx scripts/_r1-ux-probe.ts
ALL WorkspaceSetting scopes (positive control):
  calendar  1 row(s)
  candidate-scoring  1 row(s)
  candidate-scoring-feedback  5 row(s)
  candidate-scoring-position-skip  4 row(s)
  candidate-scoring-tier-override  4 row(s)
  candidate-view  3 row(s)
  candidate-vocab  3 row(s)
  compliments  1 row(s)
  employees  1 row(s)
  fleet  2 row(s)
  front  7 row(s)
  interviews  1 row(s)
  new-hire-contacts  2 row(s)
  orientation  4 row(s)
  page-layout  4 row(s)
  pilotapp  1 row(s)
  travel  1 row(s)
  user-pref  1 row(s)
  workspace  9 row(s)

workspace/module-access row: PRESENT updated 2026-07-30T13:55:54.710Z
All keys under scope 'workspace': auth-blocklist, branding, dashboard-hidden,
  module-access, onboarding-custom-milestones, onboarding-grid-overrides,
  onboarding-milestones, onboarding-task-emails, orientation-email-templates
```

And the accounts:

```
USERS (all rows, positive control):
  cmq87g5mc000004jyf3qnhsx7  ADMIN           hbyers@skyshare.com      moduleAccessJson=null
  cmq4vi7sk000004l823d27z40  ADMIN           aschaedig@skyshare.com   moduleAccessJson=null
  cmrtuaafv000104jzlm2r9vuc  HIRING_MANAGER  rpaden@skyshare.com      moduleAccessJson=null
  cmqjtsprj000004lbdwd5672b  RECRUITER       ksherman@skyshare.com    moduleAccessJson=null
  cmrs1xiui000004l3lso590ug  HIRING_MANAGER  jonathan@skyshare.com    moduleAccessJson=null

user-pref WorkspaceSetting rows (whole scope, positive control): 1
  home:cmq4vi7sk000004l823d27z40 = "/people"
```

Resolving those against the stored policy (`settings` is `HIDDEN` for RECRUITER,
HIRING_MANAGER and VIEWER; `candidates` is visible for all three working roles):

| Account | Role | Lands on | Why |
|---|---|---|---|
| hbyers@ | ADMIN | `/settings/command-center` | `DEFAULT_HOME`, no preference set |
| aschaedig@ | ADMIN | `/people` | the one saved `user-pref` row |
| ksherman@ | RECRUITER | `/candidates` | `settings` hidden → `choices[0]` |
| jonathan@ | HIRING_MANAGER | `/candidates` | same |
| rpaden@ | HIRING_MANAGER | `/candidates` | same |

Confirmed over HTTP that `/` renders the Command Center in this (auth-bypassed) dev
environment:

```
$ curl -s http://localhost:3000/ | grep -o "Command Center\|Candidate operations\|New hires\|redirect" | sort | uniq -c
      1 Command Center
      3 redirect
```

Caveat on the status sweep below: a Next redirect route also answers 200 with an HTML
document here (`/command-center` and `/` both do), so a 200 proves the route serves, not
which page rendered.

```
$ for r in ...; do curl -s -o /dev/null -w "%{http_code}  $r\n" http://localhost:3000$r; done
200  /                              200  /candidates                   200  /candidates/manage
200  /candidates/compare            200  /candidates/views             200  /candidates/departments
200  /candidates/recent-interviews  200  /matching                     200  /recruiting-jobs
200  /offers                        200  /interviews/debrief           200  /scheduling
200  /orientation                   200  /travel                       200  /people
200  /employees                     200  /events                       200  /business-cards
200  /compliments                   200  /reports                      200  /command-center
200  /settings/command-center       200  /imports                      200  /duplicate-review
200  /review                        200  /handbook                     200  /account
200  /archive
```

28 of 28 requested page routes serve 200.

### 3. Is there a global search? No — and here is the positive control

```
$ grep -rln "commandPalette\|CommandPalette\|cmdk\|GlobalSearch\|global-search\|Ctrl+K\|cmd+k\|metaKey.*k\|key === \"k\"" app components lib
(no output)

$ grep -c "<input" components/layout/Sidebar.tsx components/layout/AppShell.tsx
components/layout/Sidebar.tsx:0
components/layout/AppShell.tsx:0
```

Positive control — 26 per-page search inputs DO exist, in 22 files:

```
$ grep -rn 'placeholder="[^"]*[Ss]earch' components app | wc -l
26
```
business-cards/BusinessCardsWorkspace · candidates/AddJobToCandidate ·
candidates/CandidateDocuments · candidates/CandidateProfileWorkspace ·
compliments/PersonPicker · content-blocks/BlockLibrary · employees/EmployeesWorkspace ·
events/EventDetailWorkspace · final-review/FinalReviewWorkspace ·
fleet/orgchart/LinkPicker · fleet/orgchart/TrainingTab ·
interview-questions/InterviewQuestionsWorkspace · job-editor/JobBlockAssembly ·
job-editor/JobDataEditor · job-editor/JobsSandboxWorkspace (×2) ·
new-hire-contacts/ContactPicker · orientation/OrientationCalendarPanel ·
people/PostOnboardTab · people/SupervisorPicker ·
pilot-requirements/PilotRequirementsWorkspace · recruiting-jobs/AddCandidateToJob ·
recruiting-jobs/RecruitingJobsWorkspace · settings/BlockManagementWorkspace ·
travel/TravelHubWorkspace (×2)

So search exists 26 times and is mounted in the app chrome zero times. The candidate
search box — the one that reaches resume text — is mounted on exactly two pages
(`/candidates` and `/candidates/[id]`), per `components/candidates/CandidateSearchBox.tsx`
and its two call sites.

### 4. `router.push` for content navigation — the rule is being followed

```
$ grep -rn "router\.push(" app components | wc -l
19
```

All 19, classified:

- **Filter rewrite on the same page (4)** — `CandidateDepartmentFilter:45`,
  `CandidatePageSize:38`, `CandidateStatusFilter:44`, `CandidateTagFilter:98`. Same page,
  one search param rewritten. Not content navigation.
- **Post-mutation navigation (13)** — `DeleteCandidateButton:51`,
  `MoveToPreOnboardingPanel:84`, `SavedViewHeader:54`, `SavedViewWorkspace:192`,
  `SelectableCandidateTable:222`, `GiveRecognitionForm:69`, `EventFromEmailModal:207`,
  `EventsOverview:166`, `OrientationOverview:228` and `:250`,
  `PreOnboardingWorkspace:89`, `NewRequirementButton:57`, `NewJobButton:74`. Each follows
  a successful POST. Correct.
- **Post-mutation but with a dead param (2)** — `NewHireDetailWorkspace:335`,
  `NewHireDetailWorkspaceClassic:254`. See CERTAIN #1.

**Zero violations of "anything that navigates must be a real link."** The Matchboard is
worth naming as a positive example: its role/candidate list items are
`<button onClick={() => select(...)}>` because they swap a detail pane, and it keeps
`mode`/`id` in the URL via `window.history.replaceState` so refresh and new-tab still work
(`components/matchboard/MatchboardWorkspace.tsx:112-121`). That is the rule applied
correctly in both directions.

### 5. Tab state and the URL

Link-based (addressable, ctrl-clickable, survives reload):
`components/compliments/ComplimentsTabs.tsx` (6-7 tabs), `PreOnboardingWorkspace.tsx:135`
(`/people?tab=...`), `CandidateViewTabs.tsx` (3 separate pages).

State-based (not addressable), 11 files:

```
$ grep -rln "useState<.*[Tt]ab\|setActiveTab\|setTab(\|setView(" components
components/business-cards/BusinessCardsWorkspace.tsx
components/calendar/CalendarWorkspace.tsx
components/candidates/CandidateProfileWorkspace.tsx
components/content-blocks/BlockLibrary.tsx
components/events/EventFromEmailModal.tsx
components/events/EventsOverview.tsx
components/fleet/orgchart/CrewOrgChart.tsx
components/job-preview/JobPreview.tsx
components/orientation/OrientationOverview.tsx
components/recruiting-jobs/JobScreeningPanel.tsx
components/reports/ReportsWorkspace.tsx
```

Two of those are the app's most-used detail views, and both are **half-wired**: they read
`?tab=` on mount but never write it back.

```
components/candidates/CandidateProfileWorkspace.tsx:160
  const [activeTab, setActiveTab] = useState<ProfileTab>(() => tabFromQuery(searchParams.get("tab")) ?? "documents");

components/people/NewHireBottomTabs.tsx:39
  const [active, setActive] = useState(() => {
    const requested = searchParams.get("tab");
```

So a link INTO a tab works (the debrief queue and the travel hub both rely on it), but you
cannot copy the URL of the tab you are looking at, and F5 throws you back to Documents /
Checklist.

### 6. Dead ends and missing doors

`/interviews/[id]` holds the interview scorecards. Live counts:

```
Interview rows: 350
Interview rows with notes (a write-up): 330
InterviewScorecard rows: 282
```

Every reader of that table:

```
$ grep -rn "interviewScorecard" lib app components
app/api/interview-scorecards/route.ts:49
app/api/interview-scorecards/[id]/route.ts:31, :61, :91
```
and the only UI that renders one is `components/interviews/InterviewDetailWorkspace.tsx`,
reached from exactly one link in the whole app:

```
$ grep -rn "interviews/\${" app components --include=*.tsx | grep href
components/calendar/EditInterviewModal.tsx:142:  <Link href={`/interviews/${interview.id}`} ...>  Scorecards
```

So 282 scorecards sit behind Calendar → click an event (modal) → Scorecards. Meanwhile the
candidate profile's Interviews tab lists the very same rows — verified the same table:
`lib/data/candidates.ts:1655` includes `interviews: { orderBy: ... }` off the Candidate,
and `lib/data/interview-detail.ts:68` does `prisma.interview.findUnique`. The profile never
links to the scorecard.

`/orientation` from a hire's record — there is no door at all:

```
$ grep -rn "href=\"/orientation\|href={\`/orientation" components/people/ components/travel/
(no output)
```
Positive control: the reverse direction exists —
`components/orientation/OrientationOverview.tsx:305` links to `/people/${h.id}`, and
`components/orientation/OrientationSessionDetail.tsx:570` links to
`/people/${a.newHireId}?tab=checklist`. The SOP itself documents the round trip:
*"then open Onboarding → Orientation ... then come back to Onboarding → Orientation and
use the dropdown"* (`docs/sops/01-pre-onboarding.html`, step 7, item 6).

`components/recruiting-jobs/RecruitingJobsWorkspace.tsx:185` links a job's linked
candidate to a SEARCH, not to the person, even though the candidate id is in hand
(`key={candidate.id}` on the same element, and `lib/data/recruiting-jobs.ts:243` sets
`id: application.candidate.id`):

```
$ grep -rn 'candidates?q=' app components --include=*.tsx
components/interviews/DebriefQueue.tsx:302   ← correct: that row has NO candidate record
components/recruiting-jobs/RecruitingJobsWorkspace.tsx:185   ← has the id, still searches
```
Positive control — 9 other places link straight to `/candidates/<id>`: `app/archive/page.tsx:267`,
`app/candidates/recent-interviews/page.tsx:109`,
`components/calendar/UpcomingInterviews.tsx:123`,
`components/candidates/CandidateComparison.tsx:418`,
`components/candidates/CandidateRow.tsx:145`,
`components/candidates/DepartmentReviewWorkspace.tsx:156`,
`components/command-center/CommandCenterWorkspace.tsx:87`,
`components/offers/OffersWorkspace.tsx:54` and `:105`.

### 7. Routes with no nav door

37 nav hrefs + `/account` (rail icon) + `/command-center` (the logo tile's `homeHref` when
role is null) out of 67 `page.tsx` routes. Reachable only from inside a page:

| Route | Only door |
|---|---|
| `/candidates/manage` | `CandidateSegmentTiles.tsx:178` — dashed "Manage tags & reasons" chip |
| `/candidates/recent-interviews` | `CandidateSegmentTiles.tsx:172` |
| `/candidates/departments` | `CandidateDepartmentFilter.tsx:128` — inside the Department filter popover (3 clicks) |
| `/candidates/compare`, `/candidates/views` | `CandidateViewTabs.tsx` (a real tab strip — fine) |
| `/interviews/[id]` | `EditInterviewModal.tsx:142` only |
| `/compliments/{feed,give,celebrations,rewards,analytics,budget}` | `app/compliments/layout.tsx` + `ComplimentsTabs` (fine) |
| `/archive/reports`, `/jobs/duplicates`, `/pilot-requirements/scoring`, `/interview-questions/guide`, `/people/[id]/classic` | in-page links / parked |
| `/account` | unlabelled person icon in the 70px rail, `Sidebar.tsx:370-380` |

`app/compliments/layout.tsx` is the **only** sub-layout in the app:

```
$ find app -name "layout.tsx"
app/compliments/layout.tsx
app/layout.tsx
```

### 8. Loading / pending feedback

One root `app/loading.tsx` (a shaped skeleton) covers every route by inheritance — so
"no loading states" would be false. But pending feedback on individual links is mounted
twice in 194 `<Link>` occurrences across 88 files:

```
$ grep -rn "<LinkPendingIndicator" app components
components/candidates/CandidateProfileWorkspace.tsx:398
components/layout/Sidebar.tsx:530

$ grep -rn "<Link" app components | wc -l
194
```

The candidate-name link in a table row — the most-clicked link in the app — carries
`prefetch={false}` (`CandidateRow.tsx:145`) and no indicator, so a cold fetch gives zero
signal. The component's own doc says that silence is precisely what made navigation "look
broken."

### 9. Hover-only actions

```
$ grep -rn "group-hover:opacity-100" components app --include=*.tsx | grep -v "focus-within"
components/candidates/CandidateNotes.tsx:360
components/candidates/FlightProfilePanel.tsx:207
components/candidates/InterviewWriteUp.tsx:530
components/handbook/SopBookmark.tsx:28          ← label reveal only, the link works
components/layout/Sidebar.tsx:159               ← the deliberate collapsed-rail flyout
```
Positive control — the correct pattern already exists in this codebase:
`components/people/EmployeeJourney.tsx:460` → `opacity-0 transition focus-within:opacity-100 group-hover:opacity-100`.

So three real action clusters (edit/delete a note, edit a flight metric, edit/delete an
interview write-up) are invisible to keyboard focus.

### 10. Bulk operations — what exists and what does not

```
$ find app/api -path "*bulk*" -name "route.ts"
app/api/jobs/bulk-status/route.ts
app/api/new-hires/bulk-delete/route.ts
app/api/new-hires/bulk/route.ts
app/api/onboarding-tasks/bulk/route.ts
```
Plus `app/api/candidate-applications/batch/route.ts` (paste a list of names, link many to
one job — preview then apply).

Positive control on the absence: every candidate route.

```
$ find app/api -path "*candidate*" -name "route.ts"
.../candidate-applications/[id] · .../candidate-applications/batch · .../candidate-applications
.../candidate-files/[id] · .../candidate-files/unassigned · .../candidate-metrics/[id]
.../candidate-stages · .../candidate-views/[id] · .../candidate-views
.../candidates/[id]/ai-summary · /employee · /extract-metrics · /files/link · /files
  · /interviews/[interviewId] · /interviews · /metrics · /notes/[noteId] · /notes
  · /route.ts · /tags
.../candidates/department · .../candidates/route.ts
.../duplicate-review/candidates/{reopen,resolve,scan} · .../imports/candidates
```
`tags` is `[id]/tags` — per candidate. There is **no bulk candidate tag or bulk stage
route**, and the only bulk control on the candidates table is "Save as view"
(`SelectableCandidateTable.tsx:246-260`).

### 11. List lengths, measured (so "you must scroll" claims are honest)

```
Candidate total 8682, ACTIVE 5537
CandidateApplication with an offer (offerStatus != NONE) 27
NewHire ACTIVE 6, POST_ONBOARD 27, ARCHIVED 428, all 461
Job 131
Event 2

OFFER STATUS SPREAD (positive control — every value present):
  NOT_SENT  1
  DECLINED  2
  NONE      12861
  SIGNED    24
```

This kills one finding I expected to make: `/offers` renders every row with no paging
(`components/offers/OffersWorkspace.tsx:124-200`, no `take` in `lib/data/offers.ts`), but
27 rows is not a scrolling problem. It also confirms the opposite for candidates — the
default list is 100 rows (`lib/candidates/list-config.ts:17`) out of 5,537 active, so
finding a candidate is **always** type-and-submit, never scan.

### 12. Misleading label in the Admin nav

`lib/navigation/modules.ts:261` labels `/settings/templates` "Templates". The page renders
`components/template-tokens/TemplateTokensPanel.tsx` — a **locked, read-only colour /
typography / layout token reference** ("Locked template and design system",
`LockedBadge`). Front email templates are chosen somewhere else entirely:

```
$ grep -rln "front/templates\|listTemplates" app components lib
app/api/front/templates/route.ts
components/people/ChecklistManagePanel.tsx        ← /people?tab=grid → "Manage tasks"
components/people/SendSupervisorContactButton.tsx
components/people/SendTaskEmailButton.tsx
components/travel/SendReimbursementEmailButton.tsx
lib/front/{contacts-email,onboarding-email,orientation-email,templates}.ts
```

### 13. Single-axis overflow (the CSS spec trap), counted

25 real `overflow-x-auto` with no paired `overflow-y-*`. Positive control: 4 that DO pair
them, all carrying a comment explaining why — `ReportsWorkspace.tsx:228, :491, :1439` and
`TravelSpendYear.tsx:93`. The list is in CERTAIN #9; the design/layout auditor owns the
table cases, I am claiming only the one that is an interaction affordance (the 11-tab
candidate profile strip).

### 14. Things I verified are NOT broken

- `components/interviews/DebriefQueue.tsx:449` uses `row.candidate?.id ?? ""`, which looks
  like it could emit `/candidates/?tab=interviews`. It cannot: `lib/interviews/debrief.ts:453`
  pushes to `pending` only `else if (candidate)`, and `unmatched` rows render a different
  branch. Defensive, not a bug.
- `/blocks` ("Content Blocks") vs `/settings/content-blocks` ("Block management") is a
  deliberate documented split — editing vs destructive — and the Settings page says so in
  its own subtitle. Not a duplicate control.
- "Manage tasks" (the onboarding checklist vocabulary) is **in** the workflow at
  `/people?tab=grid`, not in Settings. Correct placement.
- The SOP bookmark (`components/handbook/SopBookmark.tsx`) is route-aware and mounted once
  in the shell; it appears on 7 route prefixes (`/people`, `/offers`, `/business-cards`,
  `/fleet/crew`, `/fleet/maintenance`, `/orientation`, `/travel` — `lib/handbook/chapters.ts`).
  The other 25 chapters are `status: "planned"` with `file: null`, so their absence is
  queued work, not a defect.
- Changing a candidate's stage from the list is already a 2-click native select that writes
  on change and rolls back on failure (`components/candidates/CandidateStageCell.tsx`).

---

## THE CLICK-DEPTH TABLE

Counting rules, stated so the numbers are checkable:

- Starting point is **any page in the app**, desktop, sidebar expanded, signed in as ADMIN
  or RECRUITER.
- A click = one press that changes what is on screen. **Opening a dropdown and choosing
  from it = 2.**
- **Cross-group nav = 2** (rail tile, which loads that group's first page, then the item in
  the panel). **Within the group you are already in = 1.** Rows below assume you are coming
  from a different group, which is the normal case.
- `+type` = you must type before you can proceed. `+scan` = you must read or scroll a list
  to find your row. Both are usually worse than a click.

| Task | Current click path (every click named) | Clicks | Proposed path | Clicks | Where the shortcut goes |
|---|---|---|---|---|---|
| Find a person by name, from anywhere | rail **Recruiting** (lands /candidates) → *type* name → **Search** → **their name** in results | 3 +type +scan | *type* in a search field in the app chrome → **their name** in the results dropdown | 1 +type | A search input in `components/layout/Sidebar.tsx`, above the rail's group tiles, posting to `/candidates` (GET) — the `CandidateSearchBox` already works unmounted from its page |
| Reach any nav item that is not its group's first | rail tile (**loads the group's first page**) → the item | 2 + a wasted page render | rail tile opens the items panel in place → the item | 2, no wasted render | `Sidebar.tsx:105-126` `railTile()` — make the tile a `<button>` that sets an `openGroup` state, and keep a separate explicit link for the group's own landing page. Not the flyout; she removed that on purpose |
| Open a candidate's documents | Recruiting (2 for the group hop is 1 here: /candidates IS the first item) → *type*+Search → **name** → Documents tab is the default | 3 +type | unchanged | 3 | No change needed — this is the app's best path |
| See which interviews still need a write-up | rail **Recruiting** → **Debrief Queue** in the panel | 2 | from home | 1 | A "Debrief queue · N" card in `components/command-center/CommandCenterWorkspace.tsx` `attentionItems`, and in `OnboardingDashboardTab`'s metric row |
| Write up one interview from the queue | Recruiting → Debrief Queue → **Write up** on the row | 3 | unchanged; see next row | 3 | Already correct: `DebriefQueue.tsx:449` deep-links `?tab=interviews` |
| Write up the **next** interview after finishing one | browser **Back** → **Write up** on the next row (or Recruiting → Debrief Queue → row) | 2–3 **per interview** | **Next in queue →** on the profile | 1 per interview | `components/candidates/InterviewWriteUp.tsx`, in the header row beside "Save". Pass `?queue=debrief&next=<eventId>` from `DebriefQueue.tsx:449` so the profile knows who is after this one |
| Open an interview's scorecards (282 rows exist) | rail **Recruiting** → **Calendar** → *find the date* → **the event** (modal) → **Scorecards** | 4 +scan | Recruiting → /candidates → name → Interviews tab → **Scorecards** on the row | 4, but from where you already are | `components/candidates/InterviewWriteUp.tsx:528` — add `<Link href={\`/interviews/${interview.id}\`}>Scorecards</Link>` to the header row of each logged interview |
| Move a signed offer into onboarding | rail **Recruiting** → **Offers** → **Move them in** → **Move to onboarding** (opens form) → *fill* → **Move to onboarding** (submits) | 5 +type | Offers → **Move them in** (opens the same form inline on the card) → *fill* → **Create** | 3 +type | Mount `components/candidates/MoveToPreOnboardingPanel.tsx` inside the `needsOnboarding` block of `components/offers/OffersWorkspace.tsx:100-112`, replacing the link |
| Put a new hire on an orientation session | rail **Onboarding** (lands /people) → **the hire** → set Orientation date → **Save** → rail **Onboarding** → **Orientation** → *find their amber row* → **Add to…** dropdown → **the session** | 8 +scan | on the hire's record: **Add to a session** → **the session** | 2 | `components/people/NewHireDetailWorkspace.tsx` — add a session picker beside the Orientation date field (`field("Orientation", "orientationDate", "date")`, line 631) or as `renderTaskExtra` for `t.key === "attended_orientation"` (the chain at line 712-748 ends `: null`). It POSTs the same `/api/orientation/sessions/<id>/attendees` the overview already uses |
| Book a new hire's orientation travel | Onboarding → **the hire** → **Travel** tab → **New trip** → **Orientation** | 5 | Onboarding → hire → Travel tab → **Book orientation trip** | 4 | `components/travel/TravelPanel.tsx:272` `NewTripButton` — when `subjectType === "newHire"` and the hire has an orientation date, render one primary button that creates the ORIENTATION trip directly, keeping the dropdown as secondary |
| Book travel starting from the Travel hub | Onboarding → **Travel** → **New trip** (dropdown) → *type* → **the person** → **New trip** (dropdown again) → **purpose** | 6 +type | Travel → New trip → *type* → **the person** (arriving with the trip already created) | 4 +type | `components/travel/TravelHubWorkspace.tsx:120-138` — add a purpose selector to that popover and carry it: `travelTabHref(t.href)` becomes `?tab=travel&newTrip=ORIENTATION`, which `TravelPanel` reads the way it already reads `?trip=` |
| Send the "Start Your Onboarding Journey" email | Onboarding → **the hire** → (Checklist is the default tab) → **Send email** on the row → **Send to …** | 4 | unchanged | 4 | Already correct — inline on the checklist row, with the body editable per the standing rule |
| Work an active hire's checklist | rail **Onboarding** → **the hire** on the dashboard worklist | 2 | from home | 1 | The "In onboarding" worklist from `OnboardingDashboardTab.tsx:346-377` rendered on the Command Center, or make `/people?tab=dashboard` the default home for admins |
| Mark a hire onboarded | Onboarding → **the hire** → **Mark onboarded** | 3 | unchanged (but fix where it lands — CERTAIN #1) | 3 | `components/people/NewHireDetailWorkspace.tsx:335` |
| Mark several hires onboarded | Onboarding → **Checklist** tab → *tick each column header* → **Mark onboarded** | 3 + 1 per person | unchanged | — | Already correct (`components/people/BulkActionBar.tsx`) |
| Change a candidate's pipeline stage | Recruiting → /candidates → *type*+Search → **stage select** → **the stage** | 4 +type | unchanged | 4 | Already the fixed path (`CandidateStageCell.tsx`). **But the Stage column is `max-[760px]:hidden`** (`CandidateRow.tsx:272`) so this is impossible on a phone |
| Tag 10 candidates with one tag | for EACH: /candidates → *type*+Search → **name** → tag editor → *type* tag → **add** → **Back** | **~7 × 10 = 70** +type | tick 10 rows → **Tag selected** → pick the tag | 3 | `components/candidates/SelectableCandidateTable.tsx:232` — add a "Tag selected" control beside "Save as view"; needs a new `POST /api/candidates/tags/bulk` (no bulk tag route exists today, see §10) |
| See signed offers not yet in onboarding | rail **Recruiting** → **Offers** → read the banner (`board.awaitingOnboarding`) | 2 | from home | 1 | `lib/data/command-center.ts:98` `attentionItems` — add `{ label: "Signed offers not in onboarding", href: "/offers" }` |
| Look up a current employee | rail **People** (lands /employees) → *type* name → **their name** | 2 +type | 1, via the chrome search above | 1 +type | Same sidebar search; `EmployeesWorkspace` filters live so no submit is needed |
| Open a job's applicant and view them | Recruiting → **Jobs** → **the job** → **Linked candidates** panel → **the name** → *lands on a SEARCH* → **the name again** | 5–6 +scan | … → **the name** → their profile | 4 | `components/recruiting-jobs/RecruitingJobsWorkspace.tsx:185` — see CERTAIN #2 |
| Add a candidate to a job | Recruiting → **Jobs** → **the job** → **Add candidate** → *type* → **the name** | 5 +type | unchanged | 5 | Already has the batch escape hatch (`BatchAddCandidatesToJob`) for the 30-applicant case |
| Link a candidate to a job from their profile | /candidates → name → **Applied to** tab → **Link to a job** → *type* → **the job** | 5 +type | unchanged | 5 | Correct — no detour to Jobs, as documented |
| Place unassigned candidates into departments | Recruiting → /candidates → **Department filter** (opens popover) → **Place the unassigned** | 3 | Recruiting → /candidates → **N unassigned →** chip | 2 | `components/candidates/CandidateSegmentTiles.tsx` — put the `/candidates/departments` link beside the existing "Manage tags & reasons" chip, with the live unassigned count |
| Rename a pipeline stage / merge a tag | Recruiting → /candidates → **Manage tags & reasons** | 2 | unchanged | 2 | Fine — a dashed chip on the segment row is the right weight for admin-ish work |
| See my recent interviews | Recruiting → /candidates → **Recent interviews →** | 2 | unchanged | 2 | Fine |
| Point a checklist step at an email template | Onboarding → /people → **Checklist** tab → **Manage tasks** → *scroll to the task* → the email control | 4 +scan | unchanged | 4 | Fine, but the Admin nav's "Templates" item is a decoy — CERTAIN #6 |
| Read the SOP for the page you are on | **SOP** tab, right edge | 1 | unchanged | 1 | Best affordance in the app; it just only covers 7 route prefixes |
| Give recognition | rail **People** (lands /employees) → **Compliments** → **Give recognition** | 3 | rail **People** → **Compliments** | 2 | `/compliments/give` is already in `ComplimentsTabs`; the extra cost is the rail-tile hop. Fixed by the rail-tile change above |
| Change your landing page | find the **unlabelled person icon** in the 70px rail → **Default home** select → **the page** → **Save** | 4 +scan | a "Make this my home page" control on the page itself | 1 | `components/account/AccountPreferences.tsx` is correct; the discovery problem is the rail icon. Add a labelled "My preferences" row to the items panel footer in `Sidebar.tsx` (the mobile drawer already has one, line 265-271) |

### Tasks that are 3–4 clicks and should be 1–2 (the flagged set)

1. **See which interviews need a write-up** — 2 → 1. `CommandCenterWorkspace` + `OnboardingDashboardTab` metric card.
2. **See signed offers not in onboarding** — 2 → 1. `lib/data/command-center.ts:98`.
3. **Work an active hire's checklist** — 2 → 1. Worklist on home.
4. **Put a hire on an orientation session** — 8 → 2. `NewHireDetailWorkspace`, beside the Orientation date field.
5. **Move a signed offer into onboarding** — 5 → 3. `MoveToPreOnboardingPanel` inline on the offer card.
6. **Tag several candidates** — ~7 per person → 3 for all of them. `SelectableCandidateTable` + a new bulk route.
7. **Find a person by name** — 3 + typing → 1 + typing. Search in the app chrome.
8. **Open a job's applicant** — 5–6 → 4. One-line href fix.
9. **Open an interview's scorecards** — 4 and behind a modal → reachable from the profile.
10. **Give recognition** — 3 → 2, as a side effect of the rail-tile change.

### Repeated navigation (return-to-list-and-re-find), counted

| Loop | Cost per item | Fix |
|---|---|---|
| Debrief queue → write up → back → next | 2–3 clicks per interview, 20 interviews with no write-up today (350 − 330) | Next/previous on the profile, carried from the queue |
| Candidate tagging | ~7 clicks per candidate | Bulk tag |
| Orientation: add each unscheduled hire | the amber list's `Add to…` select is already per-row on one page — **this one is already right** (`OrientationOverview.tsx:318-325`) | none |
| Cohort: "Add N to session" | already one click for the whole cohort (`OrientationOverview.tsx:134`) | none |
| `addMissing()` fires one POST per hire in a `for` loop (`OrientationOverview.tsx:257-269`) | N sequential round trips behind one click | A batch attendees endpoint; low priority, cohorts are small |

---

## CERTAIN — safe for a later agent to fix without re-deriving

1. **`components/people/NewHireDetailWorkspace.tsx:335` — post-stage-change redirect uses a
   param `/people` does not read, so "Mark onboarded" lands on the wrong tab.**
   Positive control: `app/people/page.tsx:19-34` reads `sp.tab` through `tabFromParam`, and
   `grep -rn "?stage=" app components` finds no reader anywhere.
   Before:
   ```ts
   router.push(stage === "ACTIVE" ? "/people?stage=active" : stage === "POST_ONBOARD" ? "/people?stage=post" : "/people?stage=archived");
   ```
   After:
   ```ts
   router.push(stage === "ACTIVE" ? "/people?tab=grid" : stage === "POST_ONBOARD" ? "/people?tab=post" : "/people?tab=archived");
   ```
   **Apply the identical change at `components/people/NewHireDetailWorkspaceClassic.tsx:254`**
   (byte-identical line). Severity: medium.

2. **`components/recruiting-jobs/RecruitingJobsWorkspace.tsx:185` — a job's linked candidate
   links to a name SEARCH instead of to the person, though the candidate id is in hand.**
   `lib/data/recruiting-jobs.ts:243` sets `id: application.candidate.id`; the same element
   already uses it as `key`. Costs one extra click and is ambiguous for duplicate names
   (the codebase documents "two Matt Smiths kept appearing in search",
   `CandidateRow.tsx:189-197`).
   Before: `href={\`/candidates?q=${encodeURIComponent(candidate.displayName)}\`}`
   After: `href={\`/candidates/${candidate.id}\`}`
   Severity: medium.

3. **`components/candidates/CandidateProfileWorkspace.tsx:573` — the 11-tab strip sets one
   overflow axis, which per the CSS spec makes the other compute to `auto`.** CLAUDE.md
   names this exact trap. Positive control: `components/reports/ReportsWorkspace.tsx:228`
   pairs them and says why.
   Before: `className="flex gap-1 overflow-x-auto border-b border-brand-lea/15 dark:border-white/10"`
   After: `className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-brand-lea/15 dark:border-white/10"`
   Severity: low.

4. **`components/candidates/CandidateNotes.tsx:360` — note edit/privacy/delete controls are
   invisible to keyboard focus.** Positive control:
   `components/people/EmployeeJourney.tsx:460` already uses the right pattern.
   Before: `className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100"`
   After: `className="flex shrink-0 items-center gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100"`
   Severity: low.

5. **`components/candidates/InterviewWriteUp.tsx:530` — same defect on the interview
   write-up's edit/delete cluster.**
   Before: `className="ml-auto flex items-center gap-1 opacity-0 transition group-hover:opacity-100"`
   After: `className="ml-auto flex items-center gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100"`
   Severity: low.

6. **`components/candidates/FlightProfilePanel.tsx:207` — same defect, but it is the button
   itself, so it needs `focus:`, not `focus-within:`.**
   Before: `className="text-brand-grey opacity-0 transition group-hover:opacity-100 dark:text-slate-400"`
   After: `className="text-brand-grey opacity-0 transition focus:opacity-100 group-hover:opacity-100 dark:text-slate-400"`
   Severity: low.

7. **`lib/navigation/modules.ts:261` — the Admin nav item labelled "Templates" is a locked,
   read-only design-token reference, not email templates.** Anyone hunting an email template
   clicks it first and finds colour swatches; the real template picker is
   `components/people/ChecklistManagePanel.tsx` behind /people → Checklist → Manage tasks.
   Before: `{ id: "settings", href: "/settings/templates", label: "Templates", icon: FileText },`
   After: `{ id: "settings", href: "/settings/templates", label: "Design tokens", icon: FileText },`
   (The page's own `<h1>` at `app/settings/templates/page.tsx:14` should change to match:
   `Templates` → `Design tokens`.) Severity: low, but it is a pure-win discoverability fix.

8. **`app/account/page.tsx:23` builds the home-page choices without the per-user module
   overrides, while `components/layout/AppShell.tsx:53` resolves the home WITH them** — so a
   restricted account could pick a home it cannot open, and be bounced to the fallback.
   Not live today: all five users have `moduleAccessJson = null` (measured above), so no
   override exists. Fix now so it cannot bite when one is set.
   Before:
   ```ts
   const choices = visibleHomeChoices(policy, role);
   ```
   After (mirroring AppShell, and `resolveViewerScope` is React-cached so this costs nothing):
   ```ts
   const viewer = await resolveViewerScope(role, session?.user?.id ?? null, session?.user?.email ?? null);
   const choices = visibleHomeChoices(policy, role, viewer?.moduleOverrides ?? null);
   ```
   plus `import { resolveViewerScope } from "@/lib/auth/viewer-scope";`. Severity: low.

9. **25 containers set `overflow-x-auto` with no paired `overflow-y-*`.** Each should gain
   `overflow-y-hidden` (these are all horizontally-scrolling tables and chip rows; none is
   meant to scroll vertically). Flagged as one item because the fix is mechanical and
   identical; the design/layout auditor may already own the table cases, so **co-ordinate
   before editing** rather than both of us touching these files.
   `components/calendar/TimeGridCalendar.tsx:203` ·
   `components/candidates/CandidateComparison.tsx:378` ·
   `components/candidates/CandidateDocuments.tsx:388` ·
   `components/candidates/CandidateProfileWorkspace.tsx:573` (= #3) ·
   `components/candidates/DepartmentReviewWorkspace.tsx:139` ·
   `components/candidates/SavedViewWorkspace.tsx:272` ·
   `components/candidates/SelectableCandidateTable.tsx:299` ·
   `components/compliments/RewardCatalogAdmin.tsx:121` ·
   `components/compliments/RewardsWorkspace.tsx:105` ·
   `components/employees/EmployeesWorkspace.tsx:424` ·
   `components/events/EventDetailWorkspace.tsx:319, :640` ·
   `components/events/SuppliesWorkspace.tsx:136` ·
   `components/orientation/OrientationEmailPanel.tsx:257, :1305` ·
   `components/orientation/OrientationSessionDetail.tsx:537` ·
   `components/people/EmployeeJourney.tsx:245` ·
   `components/people/OnboardingArchivedTab.tsx:163` ·
   `components/people/OnboardingGridTab.tsx:250` ·
   `components/people/PostOnboardTab.tsx:260` ·
   `components/settings/UsersManagementWorkspace.tsx:276` ·
   `components/travel/TravelHubCalendar.tsx:185` ·
   `components/travel/TravelHubWorkspace.tsx:422` ·
   `app/archive/page.tsx:251` ·
   `app/candidates/recent-interviews/page.tsx:92`.
   Severity: low each.

10. **`components/candidates/InterviewWriteUp.tsx:528` — add the missing door to the
    interview scorecards.** 282 `InterviewScorecard` rows are reachable from exactly one
    link in the app (`components/calendar/EditInterviewModal.tsx:142`), and the candidate
    profile lists the very same `Interview` rows. Insert into the header row of the
    read-only `LoggedInterview` block, after the rating stars and before the `canEdit`
    action span:
    ```tsx
    <Link
      href={`/interviews/${interview.id}`}
      className="rounded border border-brand-lea/20 px-2 py-0.5 text-[10px] font-semibold text-brand-eden transition hover:border-brand-gold hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-300"
    >
      Scorecards
    </Link>
    ```
    (`InterviewWriteUp.tsx` does not import `Link` today — add
    `import Link from "next/link";`.) Severity: medium — this is real data with no door.

---

## UNCERTAIN — needs a human in the morning

1. **Should the rail tile stop navigating?** The two-click + wasted-render cost is
   measured and certain; the remedy is a design decision I must not make. Making the tile a
   `<button>` that only opens the items panel removes the surprise landing and the wasted
   `getActiveDashboard()` query, but it means the tile no longer takes you anywhere in one
   click, which some people will read as a regression. It also interacts with a decision
   Aimee made *today* about this exact component. **What would close it:** ask her directly —
   "when you click the Onboarding icon, do you want to land on New hires, or just see the
   Onboarding menu?"

2. **How many of the candidate profile's 11 tabs are actually off-screen?** The strip is
   `flex … overflow-x-auto` with 11 items at `px-2.5` and two stacked lines of text each. I
   cannot measure rendered width — CLAUDE.md records that this app's content is unreadable
   from the in-app browser pane, and I am forbidden browser tools tonight. **What would
   close it:** the agent driving Chrome measuring `scrollWidth` vs `clientWidth` on that div
   at 1536×695 (Aimee's laptop) and at 1280.

3. **Do the three hover-only action clusters work on her phone?** Mobile Safari/Chrome
   emulate `:hover` on first tap, so they are probably degraded rather than impossible —
   but Aimee reported using the app from her phone on Sep 10, and "tap once to reveal, tap
   again to act" on a **delete** button is its own hazard. **What would close it:** one tap
   on a candidate note on her phone.

4. **Is `/people/[id]/classic` still wanted?** It is a 707-line second copy of the hire
   detail view that carries the same `?stage=` defect (CERTAIN #1). Memory says it was
   "parked" Aug 24. **What would close it:** him saying whether anyone still opens it; if
   not, delete rather than maintain two.

5. **The `"command-center"` module id is dead config.** It is in `moduleIds`
   (`lib/navigation/modules.ts:51`) and carries a full per-role rule in the stored policy,
   but no nav item uses it — the Command Center item is deliberately keyed `"settings"`
   (documented at lines 103-109). So the Module Visibility panel shows an admin a toggle
   for "command-center" that changes nothing. **What would close it:** confirming nothing
   else gates on that id before removing the row, which is a settings change against live
   data and not mine to make.

6. **Who should land where.** I can state the current landing pages as fact (measured). I
   cannot decide whether `DEFAULT_HOME` should become `/people?tab=dashboard` for admins,
   or whether the Command Center should grow the worklist instead. The Command Center page
   comment itself argues against making it the team's landing page ("carries candidate
   contact details and internal engineering prose"). **What would close it:** one answer
   from him — "for an admin, the first thing on screen should be ___".

7. **Are the two HIRING_MANAGER accounts landing somewhere useful?** Both resolve to
   `/candidates` because `settings` is hidden for them and `candidates` is the first visible
   item. But their policy gives them `candidates: EDIT` and `people: VIEW_ONLY`, and the
   candidate list they see is narrowed by the allowlist. A hiring manager landing on a
   candidate list that may legitimately be empty for them would look broken. **What would
   close it:** checking the allowlist contents for `jonathan@` and `rpaden@` and whether
   either has ever signed in — I did not query `CandidateAccessGrant`/allowlist tables
   because that is the security auditor's scope tonight and I did not want two agents
   writing contradictory readings of the same rows.

8. **`/offers` has no search box and no paging.** 27 rows today so it does not matter. It
   would matter at 200. **What would close it:** nothing to do now; worth a roadmap line so
   it is a known ceiling rather than a surprise.

---

## Counts

| Measure | Value |
|---|---|
| `app/**/page.tsx` routes | 67 |
| Nav groups / nav items | 6 / 37 |
| Nav items that are NOT their group's first (so cost 2 clicks cross-group) | 31 |
| `layout.tsx` files in `app/` (sub-navigation) | 2 (`app/layout.tsx`, `app/compliments/layout.tsx`) |
| `loading.tsx` / `error.tsx` / `not-found.tsx` | 1 / 1 / 2 |
| Per-page search inputs | 26, in 22 files |
| Global search / command palette | 0 |
| `<input>` in the app chrome (Sidebar + AppShell) | 0 |
| `router.push` call sites | 19 — 4 filter rewrites, 13 correct post-mutation, 2 with a dead param |
| Content-navigation `router.push` violations | 0 |
| `<Link>` occurrences / files containing them | 194 / 88 |
| `<LinkPendingIndicator>` mount sites | 2 |
| Tab strips that are real Links (addressable) | 3 (`ComplimentsTabs`, `/people?tab=`, `CandidateViewTabs`) |
| Tab strips held in component state (not addressable) | 11 files |
| Tab strips that READ `?tab=` but never WRITE it | 2 (`CandidateProfileWorkspace:160`, `NewHireBottomTabs:39`) |
| Tabs on the candidate profile | 11 |
| Hover-only action clusters missing focus parity | 3 (+1 correct example at `EmployeeJourney.tsx:460`) |
| `overflow-x-auto` with no paired axis / correctly paired | 25 / 4 |
| SOP bookmark route prefixes covered / chapters still `file: null` | 7 / 25 |
| Bulk API routes | 4 + 1 batch; **0** for candidate tags or stages |
| Users / ADMIN / RECRUITER / HIRING_MANAGER | 5 / 2 / 1 / 2 |
| Accounts whose home shows the daily worklist | 1 of 5 (and only by her own preference) |
| `user-pref` home rows in the live DB | 1 |
| `page-layout` rows (pages anyone has arranged) | 4 — candidates, calendar, recruiting-jobs, candidate-profile |
| Candidate rows / ACTIVE / default page size | 8,682 / 5,537 / 100 |
| Applications with an offer / SIGNED / DECLINED / NOT_SENT | 27 / 24 / 2 / 1 |
| NewHire ACTIVE / POST_ONBOARD / ARCHIVED / all | 6 / 27 / 428 / 461 |
| Interview rows / with a write-up / scorecards | 350 / 330 / 282 |
| Doors to the 282 scorecards | 1 (`EditInterviewModal.tsx:142`) |
| Jobs / Events | 131 / 2 |
| Tasks measured in the click-depth table | 27 |
| Tasks flagged as 3–4 clicks that should be 1–2 | 10 |
| Worst measured path | put a new hire on an orientation session — 8 clicks + a scan, across two pages, with a documented "come back to" round trip |

---

*Scratch probe `scripts/_r1-ux-probe.ts` was deleted after the last run. No app code, no
`lib/roadmap/roadmap.ts`, and no database rows were modified by this audit.*
