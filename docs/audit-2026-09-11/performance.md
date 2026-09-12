# Front-end performance audit - 2026-09-11

Role key: `performance`. Written 2026-09-12 ~00:05-01:4x Mountain; this is the
**re-run** after a session usage cap killed the first attempt before it wrote
anything. The audit and its directory stay named 2026-09-11, matching the eight
sibling files already on disk.

---

## Headline

**The page the recruiting team lives on loads all 8,682 candidate rows and all
12,888 of their applications - 1.89 MB of JSON - on every single request, to draw
a row of segment counts.** That is `lib/data/candidates.ts:962`, measured against
the live Neon database at **244-538 ms** across three runs, versus **148-354 ms**
for the paginated query that actually produces the 100 rows you see. The page is
`force-dynamic` with no caching anywhere in the app, so it happens every time.
Worse, the `[perf]` diagnostic left in the code specifically to find this
bottleneck (`lib/data/candidates.ts:1144`) starts its timer at line 1059 -
**after** the expensive query - while calling itself "getCandidateListData query
time", so anyone reading those logs concludes the queries are fast and the time
is going somewhere else.

The second-order cost is the one a user actually feels. **73 list-row links still
prefetch by default**, and 30 of them point at `/people/${id}` or
`/candidates/${id}` - the two heaviest detail pages in the app (`/people/[id]`
fans out to 10 queries). The Jul 29 prefetch-storm fix reached 6 links; the
roadmap entry for it is still `[~]` and says in its own words "LIKELY NOT THE
LAST ONE: /people, /jobs, /fleet and others were not audited this pass." They
were not. `/employees` renders its table with **no pagination at all**, so
scrolling 272 employees fires a prefetch of a 10-query page per row.

And there is **no `<Suspense>` boundary anywhere in the app** (zero, across
`app/` and `components/`), so every page is all-or-nothing: `/people/[id]` shows
the generic route skeleton until the slowest of its 10 queries returns, then
everything appears at once.

The one genuinely good news, and it inverts the question I was asked: **every one
of the 67 routes IS covered by an App Router loading state.** There is exactly
one `loading.tsx`, at `app/loading.tsx`, it is a real three-section skeleton, and
because all 67 pages are `async` server components they all suspend and all show
it. The "no skeleton and no spinner" list the user asked for is **empty at the
route level** - the gap is one level down, inside the pages, and in click
feedback.

---

## What I checked, and how

### Environment: I could not take the route timings, and here is the proof

The brief said a dev server was already running on `http://localhost:3000`. It
was not running by the time I started.

```
$ curl -s -o /dev/null -w "root: %{http_code} %{time_total}s\n" --max-time 120 http://localhost:3000/
root: 000 2.251054s
exit code 7
```

Exit 7 is `CURLE_COULDNT_CONNECT`. I swept every plausible port:

```
$ for p in 3000 3001 ... 3010 4000 8080; do curl -s -o /dev/null -w "%{http_code}" --max-time 6 "http://localhost:$p/"; done
port 3000 -> 000      port 3005 -> 000      port 3010 -> 000
port 3001 -> 000      port 3006 -> 000      port 4000 -> 000
port 3002 -> 000      port 3007 -> 000      port 8080 -> 000
port 3003 -> 000      port 3008 -> 000
port 3004 -> 000      port 3009 -> 000
```

**Positive control that the method works** - curl against a port that IS
listening behaves differently:

```
$ curl -s -o /dev/null -w "19292 -> %{http_code} (%{time_total}s)\n" --max-time 6 http://127.0.0.1:19292/
19292 -> 000 (0.114192s)
exit=52
```

Exit **52** (`CURLE_GOT_NOTHING` - connected, no HTTP reply) vs exit **7** (never
connected). The distinction is real, so "nothing is listening on 3000" is a
measurement, not a guess.

Listening sockets below port 30000, and the node process count:

```
$ Get-NetTCPConnection -State Listen | Where LocalPort -lt 30000
LocalPort 135, 139, 445, 5040, 7679, 7680, 15100, 15101, 19292, 22551, 22552

$ (Get-Process | Where ProcessName -match 'node').Count
0
```

Zero node processes. I did **not** start one - the brief forbade it and ports
belong to other sessions.

**Corroboration from a sibling:** `docs/audit-2026-09-11/chrome-live.md` (also
killed mid-flight, 37 lines) shows the server *was* up at 23:36-23:37 on
`:3000`, and records 13 Fast Refresh rebuilds in a 90-second window. Its own
warning is worth repeating because it bears directly on my subject: mid-rebuild
it measured `/candidates` at `main innerText = 106 chars, table height = 0,
readyState = "complete"` and nearly wrote that up as a permanent skeleton; a
screenshot seconds later showed the page fully painted. So even if I had the
server, dev numbers here would have been upper bounds only.

**Consequence: deliverable (c), the per-route curl timing table, is NOT in this
file.** I did not fabricate it and I did not start a server to get it. What I did
instead was time the actual queries those routes run, directly against live Neon,
read-only - which is a better number anyway because it has no HMR in it. See
below. I also left real ids in the probe output so whoever has a server can
finish (c) in ten minutes.

### (a) Filesystem: every page.tsx and every loading.tsx

```
$ find app -name "page.tsx" | wc -l
67
```

(Full 67-path listing omitted here only because it is the same list every sibling
file has; it is reproducible with the command above.)

```
$ find app -name "loading.tsx"
app/loading.tsx
$ find app -name "loading.tsx" | wc -l
1
```

**Positive control that the glob is right** - the same `find` over other App
Router special files returns results, so the pattern and path are not wrong:

```
$ find app -name "error.tsx" -o -name "layout.tsx"
app/compliments/layout.tsx
app/error.tsx
app/layout.tsx
$ find app -name "not-found.tsx" -o -name "template.tsx"
app/not-found.tsx
app/welcome/not-found.tsx
```

So: one `loading.tsx`, and it sits at `app/` - the root. Walking the parent chain
for each of the 67 routes, `app/loading.tsx` is an ancestor of **all 67**. There
is one nested layout (`app/compliments/layout.tsx`); it is an `async` server
layout, and a suspending nested layout is caught by the nearest ancestor
boundary, which is `app/loading.tsx`. Nothing is uncovered.

`app/loading.tsx` is a real skeleton, not a placeholder - header card, 4 stat
cards, 6 list rows, `aria-busy="true"`, styled for both themes.

That only helps if pages actually suspend. They do - all 67 are server
components, 66 of them `async`:

```
$ for f in $(find app -name "page.tsx"); do ... head -3 | grep '"use client"' ... done
CLIENT: 0 of 67
server async: 66 of 67
server sync:   1 of 67   (app/command-center/page.tsx - a 17-line redirect() stub)
```

Not one page is a client component. So the route-level answer to "which routes
show nothing while you wait" is: **none of them.**

### (b) In-component: Suspense, Skeleton, spinners

```
$ grep -rn "Suspense" app components --include=*.tsx
(no output)
$ grep -rn "<Suspense" app components --include=*.tsx | wc -l
0
```

**Positive control for that empty result** - the identical grep shape over the
same paths finds `Skeleton`, so the command, paths and file filter are right:

```
$ grep -rln "Skeleton" app components --include=*.tsx
app/loading.tsx
components/ui/Skeleton.tsx
```

Two files. `components/ui/Skeleton.tsx:6` is the definition; `app/loading.tsx` is
its only consumer. **No component in the app renders a skeleton.**

Pending-indicator inventory (file counts, `app/` + `components/`, `*.tsx`):

| signal | files |
|---|---|
| `animate-spin` | 25 |
| `useTransition` | 18 |
| `Loader` | 17 |
| `animate-pulse` | 3 |
| `isPending` | 3 |
| `Loading…` | 5 |
| `isLoading` | **0** |
| `useLinkStatus` | **1** |

The spinners that exist are overwhelmingly *mutation* spinners - "Saving" appears
in 57 files, `busy` in 78. I spot-checked the busiest one:
`components/candidates/CandidateProfileWorkspace.tsx:174` (DELETE an application)
and `:218` (PATCH the candidate) both set `setRemovingApplication` /
`setIsSaving` around the fetch. Mutations are well covered.

Navigation is not:

```
$ grep -rn "useLinkStatus\|LinkPendingIndicator" app components --include=*.tsx
components/candidates/CandidateProfileWorkspace.tsx:39   (import)
components/candidates/CandidateProfileWorkspace.tsx:398  (<LinkPendingIndicator />)
components/layout/Sidebar.tsx:12                         (import)
components/layout/Sidebar.tsx:530                        (<LinkPendingIndicator ...>)
components/navigation/LinkPendingIndicator.tsx:3,19,26,27 (the component itself)
```

**Two mount sites.** The sidebar rail, and the "Back to candidates" link. This
corroborates `ux.md` (its section 8 and its counts table both report 2 mount
sites) - I reached it independently and agree.

I also reconciled the Link totals with `ux.md`, which reports 194. Both are
right, measuring different things:

```
$ grep -rn "<Link" app components --include=*.tsx | wc -l          # LINES containing the substring
194
$ grep -rn "<LinkPendingIndicator" app components --include=*.tsx | wc -l
2
$ grep -rnoE "<Link([^A-Za-z]|$)" app components --include=*.tsx | wc -l   # occurrences, excluding <LinkX
187
```

My own parser (brace-tracking JSX opening tags, so multi-line `<Link\n  href=`
forms are caught) fully parsed **174** `<Link>` elements of those 187. The 13 it
could not close-parse are excluded, so **treat 174 as a floor, not an exact
total.** Classification below is over the 174.

### Route classification - the deliverable

| class | routes | notes |
|---|---|---|
| App Router loading state | **67 / 67** | all covered by `app/loading.tsx` |
| in-component skeleton | **0** | `Skeleton` imported by `app/loading.tsx` only |
| in-component spinner on *navigation* | **2 links**, not routes | `Sidebar.tsx:530`, `CandidateProfileWorkspace.tsx:398` |
| in-component spinner on *mutation* | 25 files w/ `animate-spin` | well covered |
| **NOTHING at route level** | **0** | this is the honest answer |
| **NOTHING for in-page async sections** | **67 / 67** | zero `<Suspense>`: no page can paint partially |

The NOTHING list the user asked for is empty at the route level and universal at
the sub-route level. The real finding is the second row: because there are no
Suspense boundaries, a page with 10 queries shows the generic skeleton until the
*slowest* one returns, and a page with a fast header and a slow panel cannot
paint the header first.

### (c) Timings - queries instead of routes

Could not time routes (no server, above). Timed the queries directly against live
Neon, read-only, via `scripts/_r1-performance-probe.ts` (since deleted),
connection pre-warmed with `SELECT 1` so the first number is not TLS handshake:

```
LABEL                            TIME     ROWS
bucketQuery_run1                 538ms    rows=8682
bucketQuery_run2                 283ms    rows=8682
bucketQuery_run3                 244ms    rows=8682

pageQuery_take100_run1           354ms    rows=100
pageQuery_take100_run2           158ms    rows=100
pageQuery_take100_run3           148ms    rows=100

bucketQuery payload: 8682 candidates, 12888 nested applications, 1.89 MB of JSON

groupBy_origin_as_SQL_alternative                34ms    rows=3
employees_roleAssignment_findMany_noTake        122ms    rows=498
employees_newHire_findMany_noTake                46ms    rows=461
onboardingTask_findMany_all                      82ms    rows=5191
candidateQuestionnaireAnswer_count               28ms    rows=1
```

These are from this machine to Neon, so they carry this machine's network
latency; the **row counts and the 1.89 MB payload are facts regardless of where
you run it.** The `groupBy` line is there to show the same population can be
aggregated server-side in 34 ms instead of shipped.

Live row counts I measured (read-only `count()`, full table list):

```
CandidateQuestionnaireAnswer 20939   CandidateApplication 12888   Candidate      8682
CandidateMetric              14702   CandidateCommunication 11577 CandidateFile  6558
ImportRow                     5917   CandidateTag            5450 OnboardingTask 5191
TimelineEvent                 4191   CandidateNote           1410 AuditEvent     1378
ActivityLog                    914   CandidateContact         725 RoleAssignment  498
NewHire                        461   Interview                350 EmploymentStint 284
InterviewScorecard             282   Job                      131 JobPost          79

Candidate.status:  ACTIVE 5537   ARCHIVED 3114   MERGED 31
NewHire.stage:     ARCHIVED 428  POST_ONBOARD 27  ACTIVE 6
EmploymentStint distinct newHireId: 272
candidate archivedAt null (the default /candidates population): 730
candidate total (what the bucket query spans):                  8682
```

**The 730 vs 8682 is the whole story of finding 1.** The default list shows a
filtered view of 730 un-archived candidates, capped at 100 per page - but the
segment-rail query deliberately strips the `archivedAt` filter and spans all
8,682, which is **11.9x** the population.

### Caching and dynamic rendering

```
$ grep -rn "unstable_cache" lib app --include=*.ts --include=*.tsx
(no output)
$ grep -rn "export const revalidate" app lib --include=*.ts --include=*.tsx
(no output)
```

Positive control that those greps work on this tree - the same shape finds the
sibling directive, 54 times:

```
$ grep -rln "export const dynamic" app --include=*.tsx | wc -l
54
```

All 54 are `= "force-dynamic"`. None are `force-static`. The 13 pages with no
`dynamic` export are `app/archive`, `app/candidates` (+`[id]`, `compare`,
`departments`, `views`, `views/[id]`), `app/fleet/positions`, `app/login`,
`app/matching`, `app/pilot-requirements` (+`scoring`), `app/recruiting-jobs` -
and every one of them reads `cookies()`, `params` or `searchParams`, so they are
dynamic anyway. **Net: no page in the app is cached, ever.** That is defensible
for an internal tool on shared live data, but it means every cost below is paid
on every request.

React's `cache()` (per-request dedupe) is used in 4 files, and the reasoning is
sound and documented:

```
$ grep -rn 'from "react"' lib app --include=*.ts --include=*.tsx | grep '\bcache\b'
lib/auth/viewer-scope.ts:1
lib/data/branding.ts:1
lib/data/module-access.ts:1
lib/data/user-home.ts:1
```

### The auth gate every route pays before any data query

`lib/data/module-access.ts:89-114`, `requireModulePageAccess`, runs on 64 of 67
pages and is awaited **first**, serially, before the page's own queries:

```
91:   const session = authRequired ? await getServerSession(authOptions) : null;
100:  if (authRequired && (await isEmailBlocked(session?.user?.email))) {
104:  const policy = await getWorkspaceModuleAccessPolicy();
114:  const viewer = await resolveViewerScope(resolvedRole, userId, email);
```

`isEmailBlocked` (100) and `getWorkspaceModuleAccessPolicy` (104) are independent
of each other. `getWorkspaceModuleAccessPolicy` is `cache()`-wrapped and its own
comment says it is read at least twice per page (AppShell + the page), so the
second read is free - but the first still serializes behind `isEmailBlocked`.

**Important local-vs-prod trap:** line 100 is guarded by `authRequired &&`, and
local dev bypasses auth, so **locally `isEmailBlocked` never runs at all**. Any
timing taken on localhost under-measures the production auth cost by one Neon
round trip. I am flagging this rather than claiming a number, because I could not
measure production.

### N+1 / await-inside-a-loop

I wrote a brace-tracking detector rather than using `grep -A`, because a fixed
`-A12` window leaks past the loop's closing brace and produces false positives (I
tried it first and it did exactly that).

```
TOTAL unique awaits inside a for/while body: 98 across 30 files
```

**Not one of them is in `lib/data/` - the page render layer.** All 98 are in API
route handlers (`app/api/document-intake/route.ts` has 13 in one loop),
import/sync/merge/reminder write paths (`lib/imports/job-import.ts` has 10,
`lib/google/interview-sync.ts` 3, `lib/orientation/reminder.ts` 3), or client
upload loops (`ResumeIntake`, `DocumentIntake`, `CandidateFileUploadButton`).

The positive control is the detector finding 98 real hits across 30 files - it is
not silently broken - and `lib/data/*` appearing nowhere in its output. **Page
render paths are clean of N+1.** That is a genuinely good result and I want it on
the record so nobody spends a morning looking for one.

### Unbounded findMany, filtered by measured table size

Parsed every `prisma.<model>.findMany({...})` in `lib/` with brace tracking, and
checked for a **top-level** `take:` (a `take` nested inside an `include` does not
bound the outer query):

```
TOTAL findMany parsed in lib/: 173   (top-level take: 18, unbounded: 155)
```

34 of the unbounded ones sit on a table with >1,000 live rows. But a big table
with a narrow `where` is not a big query, so I **measured what each one actually
returns** rather than inferring from the table size:

```
LABEL                                      ROWS        TIME
department-review.ts:31  candidate          252 rows   316ms
document-currency.ts:33  candidateFile        0 rows    55ms
offers.ts:48             candidateApplication 27 rows    62ms
candidates.ts:973        candidateMetric     118 rows    30ms   (its comment says "~116" - honest)
candidates.ts:642        tag                  19 rows   185ms
candidates.ts:962        bucket query       8682 rows   353ms   <-- the only real one
matchboard scope (candidate archivedAt null) 730 rows
```

I also read the `where` on the rest: `candidates.ts:175`, `:1161`, `:1365`,
`:1388` are all scoped by `id: { in: scoped }` or by the current page's ids;
`:658` is `source: "MANUAL"` + `distinct: ["tagId"]` so it is bounded by Tag = 19.
All fine. **`lib/data/candidates.ts:962` is the only genuinely unbounded
page-path query in the app.** The other 33 are either write/background paths or
narrow in practice.

**Positive control for the 0-row `document-currency` result** (an absence claim,
so it needs one):

```
candidateFile TOTAL                 : 6558
candidateFile expiresAt NOT null    : 0
candidateFile expiresAt IS null     : 6558
candidateFile candidateId NOT null  : 6507
candidateFile documentType NOT null : 6528

documentType distribution: Other 3843, Resume 2128, Pilot Application 494,
                           Paycom Application 60, null 30, Insurance 2,
                           Pilot's Certificate 1
```

The table is populated and my column names are right - `expiresAt` is simply set
on **0 of 6,558** rows. So `getDocumentCurrency` returns nothing, always. See
UNCERTAIN 1.

### Heavy client-bundle imports - mostly done right

```
$ for lib in mermaid pdfjs-dist sharp xlsx pdf-lib recharts chart.js d3 exceljs jspdf html2canvas papaparse; do grep -rn "'$lib\|\"$lib" app components lib; done
xlsx -> lib/paycom/hiring-metrics.ts:15   (only hit)
```

That one grep returning almost nothing made me distrust it, so I checked
`package.json` - and `mermaid ^11.16.0` and `react-pdf ^10.4.1` ARE production
dependencies. The grep was right; the libraries are genuinely not imported by app
code:

- **mermaid** is vendored to `public/vendor/mermaid.min.js` (3,565,102 bytes) and
  injected as a `<script src="/vendor/mermaid.min.js">` into an isolated
  `<iframe srcdoc>` (`lib/handbook/render.ts:22-23`). Never bundled. **Correct,
  and the best pattern in the repo.**
- **pdfjs** for the imports page is `await import(/* webpackIgnore: true */
  "/vendor/pdfjs/pdf.min.mjs")` (`components/imports/ImportActionCards.tsx:374`).
  Correct.
- **react-pdf** is statically imported in `components/candidates/PdfViewer.tsx:4`,
  but that component is only reached through `next/dynamic` with `ssr: false`
  **and** a loading fallback (`components/candidates/CandidateDocuments.tsx:30-33`).
  Correct - and it is one of the few real in-component loading states in the app.
- **xlsx** is reachable only from `scripts/` (and imports `node:fs`), so it cannot
  reach a browser bundle.
- **react-grid-layout** is statically imported by 3 client components
  (`components/shared/EditableGrid.tsx:4`, `components/job-editor/LayoutLab.tsx:4`,
  `components/settings/SettingsLayoutLab.tsx:4`) plus its CSS. EditableGrid is
  used on 3 pages, so RGL ships to those pages. That is the layout engine doing
  its job - not a finding.

**The one real problem here is the pdf worker** - see CERTAIN 8.

### EditableGrid - the locked rule is being followed

```
$ grep -rn "<EditableGrid" components app --include=*.tsx
components/calendar/CalendarWorkspace.tsx:514
components/candidates/CandidateProfileWorkspace.tsx:598
components/recruiting-jobs/RecruitingJobsWorkspace.tsx:328
```

All three memoize the panels array (`useMemo` at `:501`, `:282`, `:296`
respectively) and all three render a **stable panel id set** - detail panels show
`<NoJobPanel />` / `<EmptyDetail />` placeholders instead of being conditionally
added or removed. `RecruitingJobsWorkspace.tsx:290-295` even carries the comment
explaining why. **No violation found.** Reported as a clean pass, not skipped.

### Link prefetch - the current state, measured

Classification over the 174 parsed `<Link>` elements:

```
TOTAL <Link> elements parsed: 174
  prefetch={false}:      11
  prefetch default (on): 163
  other prefetch value:   0
```

**Positive control - the 6 links inside a `.map` that DO opt out** (the Jul 29 /
Aug 3 fix, so the detector is finding real opt-outs):

```
components/candidates/CandidateRow.tsx:145        /candidates/${candidate.id}
components/candidates/DepartmentReviewWorkspace.tsx:155  /candidates/${row.id}
components/events/EventsCalendar.tsx:234          /events/${event.id}
components/layout/Sidebar.tsx:169                 item.href
components/orientation/OrientationOverview.tsx:108  /orientation/${m.sessionId}
components/orientation/OrientationOverview.tsx:132  /orientation/${c.sessionId}
```

**73 links with a dynamic href, inside a `.map`, still on default prefetch.** The
subset that points at the two heaviest detail pages - the ones worth fixing first:

`/people/${id}` (14):
```
components/business-cards/BusinessCardsWorkspace.tsx:257, 335, 412
components/employees/EmployeesWorkspace.tsx:410, 447
components/events/EventDetailWorkspace.tsx:340
components/orientation/OrientationOverview.tsx:305
components/orientation/OrientationSessionDetail.tsx:569
components/people/OnboardingArchivedTab.tsx:141, 186
components/people/OnboardingDashboardTab.tsx:90, 218, 300, 326, 463, 487
components/people/OnboardingGridTab.tsx:269
components/people/PostOnboardTab.tsx:284
components/reports/ReportsWorkspace.tsx:1123, 1186
```

`/candidates/${id}` (10):
```
app/archive/page.tsx:267
components/candidates/CandidateComparison.tsx:418
components/candidates/SavedViewWorkspace.tsx:434
components/command-center/CommandCenterWorkspace.tsx:87
components/fleet/orgchart/BackupPlan.tsx:281, 373
components/fleet/orgchart/MaintenanceOrgChart.tsx:197
components/fleet/orgchart/TrainingTab.tsx:412
components/matchboard/MatchboardWorkspace.tsx:505
components/people/NewHireDetailWorkspace.tsx:831
components/people/NewHireDetailWorkspaceClassic.tsx:319
components/pilot-requirements/UnverifiedQueuePanel.tsx:147
components/recruiting-jobs/CandidatePreview.tsx:168
components/reports/ReportsWorkspace.tsx:1455
```

(Remaining 49 of the 73 point at lighter destinations - `/compliments/*`,
`/handbook/${slug}`, `/events/${id}`, `/recruiting-jobs?id=`, paginator hrefs -
and matter less.)

This is the roadmap's own open `[~]` item. `lib/roadmap/roadmap.ts:1105`:
"LIKELY NOT THE LAST ONE: any page listing many records that each link to a
heavier detail view has the same shape - /people, /jobs, /fleet and others were
not audited this pass". **Confirmed: they were not, and they have it.**

`/employees` is the worst case because it does not paginate:

```
$ grep -nE "slice\(|PAGE_SIZE|pageSize|rows.map" components/employees/EmployeesWorkspace.tsx
407:  {rows.map((e) => (     <- mobile card list, sm:hidden
441:  {rows.map((e) => (     <- desktop table, hidden sm:block
```

No `take`, no `slice`, no pagination, no virtualization - every matching employee
renders. Both `.map`s contain a `<Link href={`/people/${e.id}`}>` on default
prefetch. Only one of the two is visible at a time (`sm:hidden` /
`hidden sm:block`, and a `display:none` element does not trigger
IntersectionObserver), so it is **one prefetch per row, not two** - I checked that
before claiming it. With `EmploymentStint distinct newHireId = 272`, scrolling the
full table walks ~272 rows, each firing a prefetch of a page that runs 10 queries.

### The click-feedback gap on the links that were "fixed"

```
$ grep -n "LinkPendingIndicator\|useLinkStatus\|animate-spin\|Loader" components/candidates/CandidateRow.tsx
   NONE
$ for f in DepartmentReviewWorkspace.tsx EventsCalendar.tsx OrientationOverview.tsx; do grep -c "LinkPendingIndicator" $f; done
0
0
0
```

All 6 links that received `prefetch={false}` have **no** pending indicator. So
the most-clicked link in the app - a candidate's name on `/candidates` - now has
neither a warm payload nor any sign the click registered. The roadmap's own
diagnosis of the original complaint ("Back to candidates loads slowly, I don't
know if it worked") was: "with zero visual feedback, a few hundred ms of real
backend latency reads as broken." The indicator was added to *Back to
candidates*; the forward click never got one. `ux.md` reached the same
conclusion from the other direction and I am corroborating, not duplicating.

### Server-component waterfalls

Extracted every `await` line from all 67 pages and read each one. Most multi-await
pages are correctly shaped - the `await requireModulePageAccess(...)` gate and
`await params` / `await searchParams` genuinely must come first, and 20 pages use
`Promise.all` properly. The genuine independent-sequential cases are CERTAIN 1-6
below. Cases I checked and am **not** reporting, because they are correctly
dependent:

- `app/compliments/budget/page.tsx:34-35` - `getBudgetData(settings)` consumes
  `settings`. Correct.
- `app/interviews/debrief/page.tsx:22-23` - `buildDebriefQueue` takes the session
  email. Correct.
- `app/candidates/[id]/page.tsx:42-44` - `travelRollup` needs `travelTrips` and
  `candidate.displayName`, and is skipped entirely when there is no travel. The
  comment says so. Correct.
- `app/candidates/views/page.tsx:15,35` - `visibleCandidateIdsFor` consumes
  `savedViews`. Correct.
- `app/book/[slug]/page.tsx:7-8`, `app/events/[id]/page.tsx:10-11`,
  `app/orientation/[id]/page.tsx:10-11` - all `await params` then use the id.
  Correct.

### Client-side fetch waterfalls

32 client components fetch inside a `useEffect`. I checked the ones on the daily
pages. `components/recruiting-jobs/RecruitingJobsWorkspace.tsx` fetches screening
data keyed on `selectedId` (`:288`) - that is a same-page detail-pane swap, which
is the correct pattern, and it **does** render a loading state
(`:318` "Loading candidate fit…"). `CandidateProfileWorkspace`'s two fetches are
mutations with pending state. I did not find a two-stage client waterfall where
both requests could have started together; `OrientationEmailPanel.tsx`
(6 fetches / 9 useEffects) is the most likely place for one and is the biggest
thing I ran out of time to read - see UNCERTAIN 5.

---

## CERTAIN - safe for a later agent to fix without re-deriving

### 1. `lib/data/candidates.ts:1144` - the `[perf]` timer is named for work it does not measure

The label says `getCandidateListData query time` but `listQueryStart` is assigned
at **line 1059**, after the bucket query at line 962 has already run and returned
8,682 rows. Anyone comparing this log line against the page-level log in
`app/candidates/page.tsx:92-94` ("data+layout Nms") sees an unexplained gap and
concludes the time is going somewhere other than queries. It is going to a query,
inside this very function, above the timer.

Before (`:1144`):
```ts
console.log(`[perf] getCandidateListData query time: ${Date.now() - listQueryStart}ms (query="${query}")`);
```
After:
```ts
console.log(`[perf] getCandidateListData list+counts query time: ${Date.now() - listQueryStart}ms (EXCLUDES the bucket-rail query above, which spans every candidate row) (query="${query}")`);
```

The real fix is to move `listQueryStart` up to just before line 962 so it covers
both groups, but the rename alone removes the wrong conclusion and cannot break
anything. *Severity: medium - it is actively misleading a future diagnosis.*

### 2. `app/reports/page.tsx:12-13` - two independent awaits run in series

```ts
12:  const data = await getReportsData(viewer);
13:  const branding = await getWorkspaceBranding();
```
`getWorkspaceBranding()` takes no arguments and does not touch `data`. **The
in-repo positive control is conclusive**: `app/r/[token]/page.tsx:28` already runs
exactly these two in parallel -
`const [data, branding] = await Promise.all([getReportsData(), getWorkspaceBranding()]);`

After:
```ts
const [data, branding] = await Promise.all([getReportsData(viewer), getWorkspaceBranding()]);
```
Keep the `viewer` argument - `/reports` must pass it (see the comment at `:10-11`);
the `/r/[token]` public share route deliberately does not. *Saves one Neon round
trip. Severity: low-medium.*

### 3. `app/people/[id]/page.tsx:23` + `:27` - the heaviest page serializes 1 query before 9

```ts
23:  const hire = await getNewHireDetail(id);
24:  if (!hire) { notFound(); }
27:  const [travelTrips, travelLoyalty, journey, onboardingArchives, cardOrders,
         sections, checklistRows, taskEmails, sendStatus] = await Promise.all([...]);
```
I checked every one of the 9: six take only `id`, and three
(`getChecklistSections()`, `buildChecklistRows()`, `getTaskEmailMap()`) take no
arguments. **None reads `hire`.** `id` is available from line 22. So this is 2
serial round trips where 1 would do - on the page that 14 list-row links prefetch.

After:
```ts
const [hire, travelTrips, travelLoyalty, journey, onboardingArchives, cardOrders,
       sections, checklistRows, taskEmails, sendStatus] = await Promise.all([
  getNewHireDetail(id),
  getTravelTripsForNewHire(id),
  getNewHireLoyalty(id),
  getEmployeeJourney(id),
  getOnboardingArchives(id),
  getCardOrdersForHire(id),
  getChecklistSections(),
  buildChecklistRows(),
  getTaskEmailMap(),
  getHireSendStatus(id)
]);
if (!hire) { notFound(); }
```
Trade-off, stated so nobody is surprised: a request for a non-existent id now
pays for 9 id-scoped queries before 404ing. They all return empty and a 404 here
is rare. *Severity: medium - heaviest detail page in the app.*

### 4. `app/people/[id]/classic/page.tsx:28` - identical shape, 7 instead of 9

Same fix as 3. `getNewHireDetail(id)` at `:28` (the `const hire = await` line)
joins the `Promise.all`; none of the 7 members reads `hire`. *Severity: low - the
parked legacy layout, less traffic.*

### 5. `app/candidates/[id]/page.tsx:19` + `:28` - two Promise.all groups that do not depend on each other

```ts
19:  const [candidate, layout] = await Promise.all([getCandidateProfileData(id, viewer), getPageLayout("candidate-profile")]);
28:  const [travelTrips, travelLoyalty, team, interviewers] = await Promise.all([
       getTravelTripsForCandidate(id), getCandidateLoyalty(id), getTeamMembers(), getInterviewers() ]);
```
Group 28 uses only `id` (available at `:17`) and two no-argument calls. It does
not read `candidate` or `layout`. Merge into one `Promise.all` of 6, keep the
`if (!candidate) notFound()` after it, and leave `travelRollup` at `:42` where it
is - that one genuinely depends on `travelTrips` and `candidate.displayName`.

After:
```ts
const [candidate, layout, travelTrips, travelLoyalty, team, interviewers] = await Promise.all([
  getCandidateProfileData(id, viewer),
  getPageLayout("candidate-profile"),
  getTravelTripsForCandidate(id),
  getCandidateLoyalty(id),
  getTeamMembers(),
  getInterviewers()
]);
if (!candidate) { notFound(); }
```
*Severity: medium - 10 list-row links prefetch this page.*

### 6. `app/scheduling/page.tsx:20` + `:27` - two independent findMany in series

```ts
20:  const hosts = await prisma.bookingHost.findMany({ orderBy: { name: "asc" }, include: {...} });
27:  const overrides = await prisma.availabilityOverride.findMany({ orderBy: { startDate: "asc" } });
```
Fully independent. After:
```ts
const [hosts, overrides] = await Promise.all([
  prisma.bookingHost.findMany({ orderBy: { name: "asc" }, include: { weeklyRules: { orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }] }, bookingTypes: { orderBy: { sortOrder: "asc" } } } }),
  prisma.availabilityOverride.findMany({ orderBy: { startDate: "asc" } })
]);
```
Honest sizing: BookingHost = 8 rows, AvailabilityOverride = 4. The win is one
round trip of latency, not data volume. *Severity: low.*

### 7. `app/page.tsx:17` + `:19` - the landing route costs 2 serial round trips before it redirects

```ts
17:  const session = await getServerSession(authOptions);
18:  const role: RoleName = isRoleName(session?.user?.role) ? session.user.role : "VIEWER";
19:  const policy = await getWorkspaceModuleAccessPolicy();
20:  redirect(await resolveUserHome(session?.user?.id, policy, role));
```
`getWorkspaceModuleAccessPolicy()` takes no arguments and does not read `session`.
After:
```ts
const [session, policy] = await Promise.all([
  getServerSession(authOptions),
  getWorkspaceModuleAccessPolicy()
]);
const role: RoleName = isRoleName(session?.user?.role) ? session.user.role : "VIEWER";
redirect(await resolveUserHome(session?.user?.id, policy, role));
```
This is `/` - the first thing every user hits every morning, and it renders
nothing but a redirect. *Severity: low-medium by impact, trivial by effort.*

### 8. `components/candidates/PdfViewer.tsx:10` - the 1 MB pdf worker is fetched from unpkg.com at runtime

```ts
10:  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
```
This is the only external runtime CDN reference in the app:
```
$ grep -rnE "https://(unpkg|cdn|cdnjs|jsdelivr)" app components lib public
components/candidates/PdfViewer.tsx:10   (the only hit)
```
Every use of the document highlight viewer makes a ~1 MB cross-origin request to
a third party. If unpkg is slow or blocked, the viewer hangs.

**The trap, and why you must not take the obvious shortcut.** A worker already
sits in the repo at `public/vendor/pdfjs/pdf.worker.min.mjs` (1,244,253 bytes) -
but it is a **different version**, and the file's own comment at `:9` says
"Worker must match the bundled pdfjs version exactly":
```
$ grep -aoE 'const [a-zA-Z]+="[0-9]+\.[0-9]+\.[0-9]+"' public/vendor/pdfjs/pdf.min.mjs
const Lt="5.6.205"
$ grep -aoE 'pdfjsVersion = [0-9.]+' public/vendor/pdfjs/pdf.worker.min.mjs
pdfjsVersion = 5.6.205

$ grep -m1 '"version"' node_modules/react-pdf/package.json     -> 10.4.1
$ grep -m1 '"version"' node_modules/pdfjs-dist/package.json    -> 5.4.296
$ grep -aoE 'const [a-zA-Z]+="[0-9]+\.[0-9]+\.[0-9]+"' node_modules/pdfjs-dist/build/pdf.min.mjs
const Ft="5.4.296"
$ ls node_modules/react-pdf/node_modules    -> (none, so no nested copy)
```
Pointing `workerSrc` at the existing `/vendor/pdfjs/pdf.worker.min.mjs` ships
**5.6.205 against 5.4.296** and the viewer will throw a version-mismatch error.

Exact fix - copy the matching worker in under a version-pinned name, alongside the
5.6.205 pair the imports page uses:
```
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs \
   public/vendor/pdfjs/pdf.worker.5.4.296.min.mjs          # 1,046,214 bytes
```
then `components/candidates/PdfViewer.tsx:10`:
```ts
// Self-hosted so the viewer does not depend on unpkg being reachable. The
// filename pins the version because it MUST match react-pdf's bundled
// pdfjs-dist (5.4.296) - the 5.6.205 pair in this folder belongs to the
// imports page and is NOT interchangeable. Bump both together.
pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.5.4.296.min.mjs";
```
There is a vendoring precedent to follow for the copy step:
`scripts/vendor-mermaid.mjs`. *Severity: medium - a third-party runtime
dependency on a candidate-document feature.*

### 9. `lib/data/candidates.ts:966` - `origin: true` in the bucket select is dead

`isHistoricalRecord` ignores its first parameter:
```ts
lib/candidates/buckets.ts:393-398
export function isHistoricalRecord(
  _origin: string | null | undefined,     // <- underscore: deliberately unused
  archivedAt: Date | null | undefined
): boolean {
  return archivedAt !== null && archivedAt !== undefined;
}
```
And `origin` appears exactly twice in the whole bucket section - the select, and
the call that discards it:
```
$ sed -n '940,1050p' lib/data/candidates.ts | grep -n origin
27:        origin: true,
62:    const bucket = bucketOf(apps, isHistoricalRecord(row.origin, row.archivedAt));
```
Before: `select: { id: true, origin: true, archivedAt: true, applications: {...} }`
After:  `select: { id: true, archivedAt: true, applications: {...} }`
and at the call site: `bucketOf(apps, isHistoricalRecord(null, row.archivedAt))`.

Honest sizing: one varchar across 8,682 rows. Small. I am listing it because it is
provably safe and it is inside the query that matters. *Severity: low.*

### 10. Add `prefetch={false}` to the 24 list-row links that point at `/people/${id}` or `/candidates/${id}`

The full 24 line references are in the "Link prefetch" section above. This is not
a new judgement call - it is the already-decided pattern from
`lib/roadmap/roadmap.ts:1104-1105`, applied to the pages that entry explicitly
says were never audited. Each change is one attribute:

Before: `<Link href={`/people/${e.id}`} className="...">`
After:  `<Link href={`/people/${e.id}`} prefetch={false} className="...">`

Start with `components/employees/EmployeesWorkspace.tsx:410` and `:447`, because
that table has no pagination at all and is therefore the largest single storm
(~272 rows, each prefetching a 10-query page).

**Do not stop there - pair it with an indicator.** `prefetch={false}` without
click feedback is what produced the current state on `CandidateRow.tsx:145`:
cold fetch, no signal. The component exists and takes no props:
`<LinkPendingIndicator />` from `@/components/navigation/LinkPendingIndicator`,
rendered as a child of the `<Link>`. *Severity: high in aggregate - this is real,
repeated load on the one shared production database.*

---

## UNCERTAIN - needs a human in the morning

### 1. The unbounded bucket query is the biggest cost in the app, and I cannot give you a safe one-line fix

`lib/data/candidates.ts:962`. Measured: 8,682 candidate rows, 12,888 nested
applications, **1.89 MB of JSON**, 244-538 ms, on every load of `/candidates`,
with no caching. The displayed list is 100 rows out of a 730-row un-archived
population - so this query spans **11.9x** what the page shows.

**Why I could not close it.** The obvious fix - skip the `applications` include
for archived rows, since `bucketOf` returns `"historical"` at line 415 before
ever reading `applications` - **does not work**, and I want to record that I
checked, because it looks correct and is not. The `across` axis consumes the same
`apps` array for every row regardless of bucket:

```
lib/data/candidates.ts (the bucket loop)
  // Cross-cutting, so counted over EVERY row regardless of which bucket it
  // landed in - that is the whole point of the axis.
  const failedInterview = apps.some((a) => a.group === "interview");
```

So dropping applications for the 7,952 archived candidates would silently change
the "Failed interview" count. The real fix is to express the rail as SQL
aggregation instead of shipping rows to Node (the same population groups in
**34 ms** by `groupBy`, measured) - but `bucketOf` and `dispositionGroup` are a
13-value meaning-based ladder over ~53 unstable Paycom strings, deliberately pure
and deliberately shared with the importer (`lib/candidates/buckets.ts:1-13`).
Porting it to SQL is a real piece of design work with a real chance of changing
counts, and the roadmap records that wrong counts on this exact rail have been
fixed three times already ("Failed interview 108 opening a list of 3").

**What would close it:** a decision from the user on whether the segment-rail
counts may be computed from a materialized/cached aggregate that is allowed to be
a few minutes stale, rather than exact-per-request. If yes, this becomes a
tractable job. If no, the honest answer is that ~300 ms and 1.89 MB per load is
the price of exact counts and should be documented rather than chased. **I did not
change anything here.**

### 2. No `<Suspense>` anywhere means no page can paint partially - is that deliberate?

Zero `<Suspense>` boundaries across `app/` and `components/` (positive control in
the method section). The effect is concrete on `/people/[id]`: 10 queries, and the
user sees the generic `app/loading.tsx` skeleton until the slowest returns, then
everything at once. A `<Suspense>` around each panel would let the header and the
journey band paint while travel and checklist data stream in.

**Why I could not close it.** Streaming changes perceived behaviour on every page
and interacts with the locked "don't make the vertical space shorter than it needs
to be" rule - panels that pop in at different times change layout height as they
arrive. That is a visual-design call, and the 2026-08-30 / 08-31 rules show the
user has strong opinions about exactly this kind of motion.

**What would close it:** the user saying whether progressive paint is wanted. If
yes, `/people/[id]` and `/candidates/[id]` are the two pages where it pays.

### 3. `expiresAt` is set on 0 of 6,558 `CandidateFile` rows, so the document-currency feature has no data

Measured with a positive control (method section): the table has 6,558 rows,
6,507 with `candidateId`, 6,528 with `documentType` - and **0** with `expiresAt`.
`lib/data/document-currency.ts:33` filters on `expiresAt: { not: null }`, so
`getDocumentCurrency` returns an empty array on every call, on `/reports`,
`/calendar` and `/recruiting-jobs`.

**Why I could not close it.** I cannot tell from the code whether `expiresAt` is
meant to be populated by an extraction path that is not running, or whether the
feature shipped ahead of the data. It is cheap (55 ms) so it is barely a
performance issue - I am reporting it because I measured it and it is load-bearing
for two sibling findings: `qa.md` section 5 and `visual.md` section 3 both
describe the *rendering* of this list, and **neither appears to know the list is
always empty**, which changes how urgent their fixes are.

**What would close it:** one question to the user - is document expiry tracking
live, or not yet wired? (Also worth a cross-check with whoever owns
`lib/extraction/`.)

### 4. Production auth cost is one Neon round trip higher than anything measurable locally

`lib/data/module-access.ts:100` is guarded by `authRequired &&`, and local dev
bypasses auth, so `isEmailBlocked` **never runs locally**. Lines 100 and 104 are
independent and could be a `Promise.all`, which would remove that round trip from
all 64 gated routes.

**Why I could not close it.** Parallelizing them means `getWorkspaceModuleAccessPolicy()`
is read for an email that is about to be redirected as blocked. I believe that is
harmless - the policy is a single workspace-scoped `WorkspaceSetting` row, not
user data, and the redirect still fires - but "harmless" on an auth path is a
security judgement, not a performance one, and `security.md` is 1,762 lines long
for a reason. I am not making that call at 1 a.m.

**What would close it:** a reviewer confirming that reading the workspace module
policy before the blocklist redirect leaks nothing. Then:
`const [blocked, policy] = await Promise.all([isEmailBlocked(...), getWorkspaceModuleAccessPolicy()]); if (authRequired && blocked) redirect(...)`.

### 5. The per-route timing table (deliverable c) is missing, and `OrientationEmailPanel` is unread

No dev server existed (evidence in the method section) and I did not start one.

**What would close it:** start the dev server and run, twice per route, reporting
the second number:
```
curl -s -o /dev/null -w "%{http_code} %{time_total}\n" http://localhost:3000/<route>
```
Real ids for the dynamic routes, pulled read-only tonight so nobody has to guess:
```
/people/cmtng8phz000h04joum1rkhv0          (newHireId)
/candidates/cmtw3jx6e00awk4rmaezbmwma      (candidateId, un-archived)
/events/cms3mlqk7000704lc2gvfi8ez          (eventId)
/orientation/cmqb58xmp000005jyg1gal7h1     (orientationSessionId)
/interviews/cms6sc10i000004k3yquxcsnr      (interviewId)
/book/devon-carter                         (bookingHost slug)
```
`/r/[token]` I am deliberately not giving - a share token exists but it is a live
unauthenticated credential and `security.md:1473` is already discussing it.
`/handbook/[slug]` needs a slug from the SOP set.

Also unread: `components/orientation/OrientationEmailPanel.tsx` (6 `fetch`, 9
`useEffect` - the most likely place in the app for a genuine two-stage client
waterfall) and `components/fleet/orgchart/CrewOrgChart.tsx` (7 `fetch`, 4
`useEffect`, and a fetch inside a loop at `:1397`).

### 6. `lib/data/candidates.ts:1144` logs the raw search query into production logs

```ts
console.log(`[perf] getCandidateListData query time: ...ms (query="${query}")`);
```
`query` is whatever a recruiter typed into the candidate search - frequently a
person's name or email. Two temporary `[perf]` diagnostics are in the code
(`lib/data/candidates.ts:1144`, `app/candidates/page.tsx:92-94`), both labelled
TEMPORARY in their own comments.

**Why I could not close it.** Whether candidate names in application logs are
acceptable is a privacy call, not a performance one, and it belongs to
`security.md`'s lane. Flagging it here because I found it while reading the
instrumentation and it should not evaporate. *If it stays, the interpolation of
`query` should probably go even if the timer does not.*

---

## Counts

| measurement | value |
|---|---|
| `app/**/page.tsx` routes | 67 |
| of those, client components | **0** |
| of those, `async` server components | 66 (+1 sync redirect stub) |
| `app/**/loading.tsx` files | **1** (`app/loading.tsx`, root) |
| routes covered by an App Router loading state | **67 / 67** |
| routes with NOTHING at route level | **0** |
| `<Suspense>` boundaries in `app/` + `components/` | **0** |
| files importing `Skeleton` | **2** (its definition + `app/loading.tsx`) |
| `<LinkPendingIndicator>` mount sites | **2** of 174 Links |
| `<Link>` elements fully parsed | 174 (of 187 `<Link` occurrences; 13 unparsed, so 174 is a floor) |
| `prefetch={false}` | **11** |
| default prefetch (on) | **163** |
| dynamic href + inside `.map` + default prefetch | **73** |
| of those, pointing at `/people/${id}` or `/candidates/${id}` | **24** |
| `export const dynamic = "force-dynamic"` pages | 54 of 67 (other 13 dynamic anyway) |
| `export const revalidate` / `unstable_cache` | **0 / 0** |
| React `cache()` wrapped modules | 4 |
| `findMany` parsed in `lib/` | 173 (18 with a top-level `take:`, 155 without) |
| unbounded `findMany` on a >1,000-row table | 34 |
| of those, genuinely unbounded on a **page render** path | **1** (`lib/data/candidates.ts:962`) |
| `await` inside a `for`/`while` body | 98 across 30 files |
| of those, in `lib/data/` (page render layer) | **0** |
| `<EditableGrid>` call sites / compliant with the locked rule | 3 / 3 |
| external runtime CDN references | **1** (`PdfViewer.tsx:10`, unpkg.com) |
| **bucket query**: rows / nested apps / payload | **8,682 / 12,888 / 1.89 MB** |
| bucket query time (3 runs, live Neon, warmed) | 538 / 283 / **244** ms |
| page query `take: 100` (3 runs) | 354 / 158 / **148** ms |
| same population via SQL `groupBy` | **34 ms** |
| `/candidates` default population vs bucket span | **730 vs 8,682** (11.9x) |
| `/employees` pagination | **none** (`rows.map`, no `take`/`slice`) |
| `/people/[id]` queries per load | 10 (1 serial + 9 parallel) |
| `CandidateFile` rows / with `expiresAt` set | 6,558 / **0** |
| dev-server route timings taken | **0** - no server was running (exit 7; 0 node processes) |

### Ranked by what a real user would actually feel

1. **The 73 prefetching list rows** - repeated invisible load on the one shared
   production database, on the pages people scroll. Aggregate cost, cheap fix,
   already a decided pattern.
2. **No click feedback on 172 of 174 links** - this is the one that reads as
   "broken" rather than "slow", which the roadmap already learned the hard way.
3. **The 1.89 MB bucket query on `/candidates`** - ~300 ms of every load of the
   busiest page, invisible to the instrumentation meant to find it.
4. **`/people/[id]` and `/candidates/[id]` serialization** (CERTAIN 3, 5) - the
   two heaviest detail pages, each paying an avoidable round trip.
5. **No Suspense anywhere** - the reason a slow page is *entirely* blank rather
   than partially useful.

**Which page the team sits on all day: `/candidates`.** Stating the basis rather
than asserting it - this is an inference from three things, not a measurement I
took: the app is a recruiting workspace; `lib/roadmap/roadmap.ts:638` calls
candidates "the page recruiters use most" and `:1104` describes it as the page
whose slowness drove three separate investigations; and it is the only page in the
repo carrying permanent `[perf]` instrumentation, which is what somebody does to
the page they are being asked about. **I could not confirm it with usage data** -
there is no analytics table in the 81-table schema and `ActivityLog` (914 rows)
records writes, not page views.

---

## Notes on method, for whoever reads this next

- **Read-only throughout.** Every database call was `count`, `groupBy`,
  `findMany` or `findFirst`. No writes, no uploads, no email paths, no `/api/`
  curl, no git, no browser tools, no `npm run build`.
- The probe script lived at `scripts/_r1-performance-probe.ts` and **has been
  deleted**. Two analysis scripts lived in the session scratchpad, not the repo.
- I read four sibling files to avoid duplicating work and said so at each point:
  `chrome-live.md` (the dev-server environment and its Fast Refresh warning),
  `ux.md` (LinkPendingIndicator - I corroborate, and reconciled our differing
  Link counts above), `qa.md` and `visual.md` (document-currency rendering, which
  UNCERTAIN 3 bears on). I edited none of them.
- Where a grep returned nothing I ran a positive control over the same scope with
  the same command shape, and the controls are in the text - the `find` for
  `loading.tsx` (controlled with `error.tsx`/`layout.tsx`), the `Suspense` grep
  (controlled with `Skeleton`), the caching greps (controlled with `export const
  dynamic`, 54 hits), the 0-row `document-currency` query (controlled with the
  full `CandidateFile` column census), and the `curl` sweep (controlled against a
  port that was genuinely listening).
- Two places where the obvious fix is wrong and I checked before writing:
  the pdf worker version mismatch (CERTAIN 8) and dropping `applications` for
  archived candidates (UNCERTAIN 1). Both would have shipped as plausible-looking
  breakage.
