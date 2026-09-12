# Recruiting operations audit — 2026-09-11

Role key: `recruiting-ops`. Read-only against the live Neon database. No git, no browser,
no writes, no sends. One scratch probe script (`scripts/_r1-recruiting-ops-probe.ts`) was
used and deleted; every query it ran is pasted below with its raw output.

---

## Headline

**The /calendar page shows the recruiter a year that ended in November 2024.**
`getCalendarData()` (`lib/data/calendar.ts:110-113`) asks for `take: 200` ordered
`startDateTime: "asc"` against a table that now holds 350 rows. The oldest 200 are all
JazzHR-imported history from 2023-10-09 to 2024-11-13, so the 150 newest rows are dropped
— **including every single one of the 48 interview write-ups the team has typed by hand**,
and all 14 rows whose status is SCHEDULED. Both the month calendar and the "All
interviews" manifest are fed from that same array, so the one screen in the app called
Calendar cannot show this year's interviews at all. Alongside it, the "Interview
statistics" panel reads **Scheduled 14** from a separate un-capped count while the
"Upcoming interviews" panel next to it renders `null` and disappears, because **zero** of
those 14 are in the future. Three numbers on one screen, none of them the recruiter's
actual week. The fix is one word: `"desc"`.

Second, and costlier in daily minutes: **on the 730 candidates a recruiter actually opens,
941 of their 1,727 applications (54%) show the note "not one of the house wordings. Pick
an outcome above to replace it."** The single largest cause is a case-only mismatch —
`WORDING_TO_STAGE` is keyed `"Knocked out"` while the live Paycom pipeline stores
`"Knocked Out"` on 1,627 rows — and the control's only three buttons are Hired / Rejected
/ Saved For Later, so a recruiter who follows that instruction overwrites a correct
knock-out reason with "Rejected". The loose-key helper that would fix it
(`toHouseWording`) already exists in the same file and already returns the right answer.

Third, a quiet one that will cost somebody a Monday: `docs/needs-a-person.md` item 2 asks
a person to open "a candidate who has a private note on them". **There are zero private
notes in the database** — 0 of 1,410 `CandidateNote` rows have `hrOnly = true`. That check
cannot be performed as written, and the Monday check-in will keep asking for it.

---

## What I checked, and how

### Row counts behind every screen in scope

```
$ npx tsx scripts/_r1-recruiting-ops-probe.ts      # SELECT/count only
=== ROW COUNTS ===
AvailabilityRule                 59
Booking                          0
BookingHost                      8
BookingType                      10
BusinessCardOrder                9
BusinessCardOrderLine            71
Candidate                        8682
CandidateAiSummary               6
CandidateApplication             12888
CandidateCommunication           11577
CandidateContact                 725
CandidateFile                    6558
CandidateMetric                  14702
CandidateNote                    1410
CandidateQuestionnaireAnswer     20939
CandidateTag                     5450
DuplicateReviewItem              44
Event                            2
Feedback                         74
ImportBatch                      30
ImportRow                        5917
Interview                        350
InterviewQuestion                0
InterviewScorecard               282
Job                              131
JobPost                          79
NewHire                          461
OnboardingArchive                1
OnboardingTask                   5191
OrientationAttendee              28
OrientationPrepTask              69
OrientationSession               6
PilotRequirement                 65
Recognition                      0
Tag                              19
Template                         1
TimelineEvent                    4191
TravelItem                       23
TravelReceipt                    18
TravelTrip                       8
User                             5
WorkspaceSetting                 55
```

Splits that matter for affordances:

```
=== Candidate by status ===        ACTIVE 5537 · ARCHIVED 3114 · MERGED 31
=== Candidate by origin ===        PAYCOM 5194 · JAZZ 3159 · MANUAL 329
=== Candidate archive split ===
archivedAt null: 730
archivedAt not null: 7952
origin PAYCOM & archivedAt null: 376
origin JAZZ  & archivedAt null: 26
origin MANUAL & archivedAt null: 328

=== NewHire by stage ===           ACTIVE 6 · POST_ONBOARD 27 · ARCHIVED 428
=== NewHire by employmentStatus == ACTIVE 180 · TERMINATED 264 · CONTRACT 17
=== Job by status ===              OPEN 10 · MERGED 67 · RETIRED 54
=== Interview by source ===        JAZZ 282 · manual-writeup 48 · seed-demo 18 · local-calendar 2
=== Interview by status ===        COMPLETED 334 · SCHEDULED 14 · CANCELLED 2
=== Interview FUTURE (startDateTime > now) === count: 0
=== CandidateApplication offerStatus ===
  NONE 12861 · SIGNED 24 · DECLINED 2 · NOT_SENT 1
=== OnboardingTask by status ===   DONE 4484 · NA 405 · TODO 302
=== DuplicateReviewItem by status == RESOLVED 42 · DISMISSED 2   (0 pending)
```

So: **/candidates** defaults to the 730 un-archived candidates (page size 100, no
pagination — `lib/candidates/list-config.ts`). **/people** holds 6 ACTIVE + 27
POST_ONBOARD. **/orientation** holds 6 sessions ever. **/travel** holds 8 trips ever.
**/recruiting-jobs** holds 64 non-merged jobs and 4,507 applications. Those last two
numbers are the ones where the affordances and the volume disagree.

---

### The /calendar truncation — raw output

`lib/data/calendar.ts:110-113`:

```ts
prisma.interview.findMany({
  take: 200,
  orderBy: { startDateTime: "asc" },
```

Ran exactly that query, then the same query with no `take` as the positive control:

```
=== getCalendarData() take:200 orderBy startDateTime asc ===
rows returned: 200
oldest in page: 2023-10-09T23:30:00.000Z JAZZ
newest in page: 2024-11-13T01:00:00.000Z JAZZ
sources inside the page: {"JAZZ":200}
statuses inside the page: {"COMPLETED":200}

=== total rows (no take) === 350
rows DROPPED by take:200 = 150
sources DROPPED:  {"JAZZ":82,"manual-writeup":48,"seed-demo":18,"local-calendar":2}
statuses DROPPED: {"COMPLETED":134,"SCHEDULED":14,"CANCELLED":2}
first dropped row: {"source":"JAZZ","status":"COMPLETED","startDateTime":"2024-11-13T03:00:00.000Z","title":"Pilot Detailed Interview (30mins/phone)"}
last dropped row:  {"source":"manual-writeup","status":"COMPLETED","startDateTime":"2026-09-09T12:00:00.000Z","title":"Recruiter Screen"}
dropped rows dated after 2026-06-13: 53

sample of the 10 most recent dropped rows:
 2026-08-20 manual-writeup COMPLETED "Hiring manager"
 2026-08-25 manual-writeup COMPLETED "Recruiter screen"
 2026-08-28 manual-writeup COMPLETED "Recruiter screen"   (x3 that day)
 2026-08-28 manual-writeup COMPLETED "Hiring manager"
 2026-08-31 manual-writeup COMPLETED "Recruiter Screen"
 2026-09-02 manual-writeup COMPLETED "Hiring Team"
 2026-09-09 manual-writeup COMPLETED "Recruiter Screen"
```

Every write-up the team has made is in the dropped set. `sources inside the page` being
`{"JAZZ":200}` is the positive control: it is not that the query returns nothing, it is
that it returns only the archive.

Consumers confirmed to receive that array unchanged and unsorted
(`components/calendar/CalendarWorkspace.tsx:207-219` — `filteredInterviews` filters by
department only, no re-sort, no date window), then feeds it to `MonthCalendar`,
`TimeGridCalendar`, `UpcomingInterviews` and `CompactInterviewList`.

### The three numbers that disagree on /calendar

```
=== stats panel numbers, recomputed ===
scheduled (all time, what the panel shows): 14
scheduled AND in the future: 0
scheduled AND in the past: 14
completed: 334

POSITIVE CONTROL, all 14 SCHEDULED rows (newest first):
 2026-06-26  Gulfstream G200 First Officer interview      seed-demo
 2026-06-25  Citation 560XL Captain interview             seed-demo
 2026-06-25  Pilatus PC-12 NG Lead Captain interview      seed-demo
 2026-06-24  Citation 560XL First Officer interview       seed-demo
 2026-06-23  Gulfstream G450 Captain interview            seed-demo
 2026-06-19  Gulfstream G450 Lead Captain interview       seed-demo
 2026-06-19  Pilot interview                              local-calendar
 2026-06-18  Citation M2 First Officer interview          seed-demo
 2026-06-17  Pilatus PC-12 Captain interview              seed-demo
 2026-06-16  PC-12 NGX Lead Captain interview             seed-demo
 2026-06-16  Citation CE525 Captain interview             seed-demo
 2026-06-12  Pilatus PC-12 First Officer interview        seed-demo
 2026-06-10  Citation CJ2 First Officer interview         seed-demo
 2026-06-09  Citation 560XL First Officer interview       seed-demo
```

13 of the 14 are `seed-demo`. The stat panel (`statLabels` at
`components/calendar/CalendarWorkspace.tsx:64-68`) therefore reads
**Scheduled 14 · This week 0 · Completed 334** while
`UpcomingInterviews` (`components/calendar/UpcomingInterviews.tsx:30-38`) computes
`upcoming = interviews.filter(status === "SCHEDULED" && startDateTime >= now).slice(0,5)`
→ length 0 → `return null`. The grid panel titled "Upcoming interviews"
(`CalendarWorkspace.tsx:505`) stays in the panel set and renders empty chrome.

### Interview write-ups: what the form does and does not record

`components/candidates/InterviewWriteUp.tsx` fields: Date interviewed, Interviewer
(select), Type (select), "Also interviewing", Notes (paste), Next step, Outcome, Rating.
**There is no job field.** Measured:

```
manual-writeup total: 48
  with interviewerEmail set: 48
  with outcome set:          44
  with rating set:            7
  with nextStep set:          6
  with jobId set:             0     <-- never attributable to a requisition
```

Positive control on the same table: `jobId` IS set on 19 interviews overall (the
seed-demo and local-calendar rows), so the column works — it is the write-up form that
never fills it.

`nextStep` set on 6 of 48 while the prose plainly carries it. From the actual stored
`notes` of the most recent write-up (2026-09-09, read read-only):

> "Next Steps / Reject the application / Did the candidate pass to the next step? / No, …"

and from 2026-08-31:

> "Next Steps / Confirm the availability with the CPO (David, Devon, Harry, or some
> combination based on availability), then schedule it and let Jeff know the time. …
> Flag October 10–18 PTO to Joe and CPO so it can be noted before an offer is made."

That is the recruiter's actual to-do list, living inside a free-text blob that nothing
queries, surfaces, or reminds anyone about.

Scorecards:

```
interviews WITH a scorecard, by source:    [{"JAZZ":282}]
interviews WITHOUT a scorecard, by source: [{"local-calendar":2},{"seed-demo":18},{"manual-writeup":48}]
```

All 282 `InterviewScorecard` rows belong to JazzHR-imported interviews. The live team has
never used the scorecard.

### The Debrief Queue sends you to a form defaulted to the wrong date

`components/interviews/DebriefQueue.tsx:449`:

```tsx
<Link href={`/candidates/${row.candidate?.id ?? ""}?tab=interviews`} className={SOLID_BUTTON}>
  Write up
```

`components/candidates/InterviewWriteUp.tsx:125`:

```ts
const [form, setForm] = useState({
  interviewedAt: todayInputValue(),
```

The queue knows `row.startsAt` exactly — it is the basis of the whole queue, and the card
prints it two lines above the button. The form then defaults to **today**. And
`lib/interviews/debrief.ts:48`:

```ts
const WRITE_UP_MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;
```

So a write-up left on today's date for an interview that happened five days ago does not
match, the queue row does not clear, and it nags until it falls out of the 21-day window
(`DEBRIEF_WINDOW_DAYS = 21`, `lib/interviews/debrief.ts:32`) — at which point it vanishes
with no record that it was ever owed.

### Disposition wordings: 54% of live applications read as "unrecognised"

Ran the app's own `stageForWording()` from
`lib/candidates/disposition-vocabulary.ts` over every distinct
`CandidateApplication.status`:

```
HOUSE_WORDINGS (26): ["Prescreen Disqualification","Does Not Meet Mins","Not Best Qualified",
"Future Consideration","Knocked out","Closed / On Hold","Filled","No Response","Other",
"Comp & Benefits","Location","Salary","Schedule","No Longer Interested","Failed Interview",
"No Show","Contract Only","Ineligible - Passport","Ineligible - PRD","Moved Application",
"Hired","Declined Offer","Rescind Offer","New","Saved For Later","Rejected"]

--- stageForWording() returns NULL for these ---
  4329 "Denied"                                      toHouseWording -> "Denied"
  1627 "Knocked Out"                                 toHouseWording -> "Knocked out"
   309 "In Hiring Process"                            toHouseWording -> "In Hiring Process"
    10 "Archived"                                     toHouseWording -> "Archived"
     8 (null)                                         toHouseWording -> null
     5 "In Hiring Process - Scheduled to be Denied"    toHouseWording -> (unchanged)
     4 "Offered"                                       toHouseWording -> "Offered"
TOTAL rows with an unrecognised status: 6292

--- POSITIVE CONTROL: statuses stageForWording() DOES recognise ---
  2399 "Saved For Later" -> Saved For Later
  1214 "Prescreen Disqualification" -> Rejected
   624 "Future Consideration" -> Saved For Later
   457 "Does Not Meet Mins" -> Rejected
   455 "Knocked out" -> Knocked Out
   283 "Closed / On Hold" -> Rejected
   251 "Hired" -> Hired
   175 "New" -> New
   137 "Moved Application" -> Rejected
   111 "Failed Interview" -> Rejected
   104 "Not Best Qualified" -> Rejected
    88 "No Response" -> Withdrew
    65 "Contract Only" -> Withdrew
    49 "Location" -> Withdrew
    34 "Other" -> Withdrew
    26 "No Longer Interested" -> Withdrew
    25 "Ineligible - Passport" -> Rejected
    20 "Salary" -> Withdrew
    19 "Declined Offer" -> Offer
    16 "Rejected" -> Rejected
    16 "Comp & Benefits" -> Withdrew
    11 "Filled" -> Rejected
     7 "Ineligible - PRD" -> Rejected
     5 "Rescind Offer" -> Offer
     4 "Schedule" -> Withdrew
     1 "No Show" -> Rejected
TOTAL rows recognised: 6596

--- the case-only miss, spelled out ---
stageForWording("Knocked out") = Knocked Out
stageForWording("Knocked Out") = null
toHouseWording("Knocked Out")  = Knocked out
rows holding "Knocked Out": 1627   origin split: [{"PAYCOM":1627}]
rows holding "Knocked out":  455   origin split: [{"JAZZ":453},{"PAYCOM":2}]

--- unrecognised statuses on LIVE (not archived, not merged) candidates ---
unrecognised on live candidates: 941 of 1727 applications on live candidates
```

Two things follow. (1) The spelling that fails is the one the **live Paycom pipeline**
writes — all 1,627 `"Knocked Out"` rows are `origin: PAYCOM`, while the 455 rows spelled
the way the map expects are 453 JazzHR. (2) `toHouseWording("Knocked Out")` already
returns `"Knocked out"`, which proves the loose key works; only `stageForWording` uses the
exact one:

```ts
// lib/candidates/disposition-vocabulary.ts:186-190
export function stageForWording(wording: string | null | undefined): string | null {
  const raw = (wording ?? "").trim();
  if (!raw) return null;
  return WORDING_TO_STAGE[raw] ?? null;
}
```

What the recruiter sees, from `components/candidates/ApplicationStatusPicker.tsx:171-176`:

> "Currently reads **Knocked Out**, which is not one of the house wordings. Pick an
> outcome above to replace it."

The three buttons offered are Hired, Rejected, Saved For Later
(`ApplicationStatusPicker.tsx:43`). Following that instruction on a knocked-out
application destroys the real reason.

### Private HR notes: the thing needs-a-person.md asks to test does not exist

```
CandidateNote hrOnly: 0 of 1410
```

Positive control: the table holds 1,410 notes, so the count is not an empty-table
artefact — no note has ever been marked private. `docs/needs-a-person.md` item 2 says
"have somebody with a non-HR login … open a candidate who has a private note on them".
There is no such candidate.

### /recruiting-jobs ships the whole pipeline on first paint

`lib/data/recruiting-jobs.ts:161-198` — `prisma.job.findMany({ where: { mergedIntoJobId:
null }, include: { applications: { include: { candidate: … } } } })`, **no `take`** on
either level, and then `lib/data/recruiting-jobs.ts:225-250` builds a full
`RecruitingJobDetail` for **every** job and hands them all to the client.

```
non-merged jobs loaded: 64
applications loaded with them (each joined to its candidate): 4507
top jobs by application count:
  488 RETIRED  Pilatus PC-12 Captain
  386 RETIRED  Flight Coordinator
  322 RETIRED  Lead Corporate Cabin Attendant
  313 RETIRED  CJ2 Captain
  289 RETIRED  Corporate Cabin Attendant
  279 OPEN     Aircraft Maintenance Technician
  223 RETIRED  (old) Gulfstream G450 First Officer
  211 RETIRED  Citation 560XL First Officer
  180 RETIRED  Gulfstream G450 Captain
  136 RETIRED  AR / AP Specialist
jobs with > 100 applications: 16
jobs with 0 applications: 5
```

And the panel that renders them, `components/recruiting-jobs/RecruitingJobsWorkspace.tsx:165-200`:
no count badge, no search, no filter, no cap — 279 rows in a scroll box for the one OPEN
requisition that matters most. Each row is:

```tsx
<Link href={`/candidates?q=${encodeURIComponent(candidate.displayName)}`}>
```

a **name search**, even though `candidate.id` is right there on the same object (it is
used as the React `key` on the line above). On a repeat-applicant name that lands on a
list, not a person — the exact "Matt Smith returned two rows" problem
`lib/data/candidates.ts:773-785` documents.

Open-requisition shape, for context on whether the screen's affordances match:

```
=== Jobs: applications / interviews per OPEN job ===
   1 apps /  0 ivs  Challenger 350 Captain
   0 apps /  0 ivs  Vice President of Aircraft Sales (Brokerage)
   0 apps /  0 ivs  Sr. Staff Accountant
   2 apps /  0 ivs  CJ Captain (Part 91, Georgia)
  28 apps /  0 ivs  Customer Service Representative | Part-Time
   2 apps /  0 ivs  Challenger 350 First Officer
   1 apps /  0 ivs  M2 Captain & PC-12 Captain
  34 apps /  0 ivs  Gulfstream G450 & GV Captain (Home-Based)
  36 apps /  2 ivs  Gulfstream G200 First Officer
 279 apps /  0 ivs  Aircraft Maintenance Technician
```

Nine of ten OPEN requisitions show zero interviews, which is the `jobId: 0 of 48`
write-up gap seen from the other end.

### Orientation: the address goes out unchecked, and it is silent

`lib/front/orientation-email.ts:171-219`, `applySessionOverrides`. The TIME branch has an
`else` that warns when it cannot check:

```ts
} else {
  // NO END TIME ON THE SESSION — and this used to degrade in silence.
  …
  warnings.push(`This session has no end time recorded, so the hours in this email (…)
    came straight from the Front template and were NOT checked against the session.`);
}
```

The ADDRESS branch has no `else` at all:

```ts
const address = session.address?.trim();
if (address) {
  text = text.replace(/(Location:\s*(?:<[^>]+>\s*)*)([^<\n]+)/gi, …);
}
return { text, changes, warnings };
```

Live session data:

```
=== OrientationSession address / endsAt completeness ===
 2026-06-15 COMPLETE  address "180 2400 W, Salt Lake City, UT 84116"  endsAt null  8 attendees
 2026-06-29 COMPLETE  address null                                    endsAt null  1 attendee
 2026-07-07 COMPLETE  address "180 2400 W, Salt Lake City, UT 84116"  endsAt null  4 attendees
 2026-08-04 COMPLETE  address null                                    endsAt set   7 attendees
 2026-09-01 UPCOMING  address null                                    endsAt set   4 attendees
 2026-09-29 UPCOMING  address "180 2400 W, Salt Lake City, UT 84116"  endsAt set   4 attendees
```

3 of 6 sessions have no address. The 2026-09-01 session has `endsAt` set (so the time was
rewritten and reported) and `address` null (so the template's location went out with no
rewrite and **no warning**), and its four attendees all carry
`sentTemplateKeys: ["supervisors","invite","reminder"]` — the invite and the reminder both
went out on that session. Whether the address in the template happened to be right is
unknowable from here; the point is the app said nothing either way, on the one field a new
hire drives to.

Also: the new-session form (`components/orientation/OrientationOverview.tsx:204`) defaults
`location` to `"SkyShare HQ, Salt Lake City"` but leaves `address: ""`:

```ts
const [form, setForm] = useState({ date: "", time: "09:30", endTime: "15:00",
  location: "SkyShare HQ, Salt Lake City", address: "", meetLink: "" });
```

— so the HQ street address, which is the same literal string on 3 of 6 rows, is retyped or
forgotten each time. The 2026-09-01 session is the "forgotten" case.

One more: that Sep 1 session is still `status: UPCOMING` ten days after it happened.
`lib/data/orientation.ts:105` moves it into `past` by date, so it is not stranded in the
upcoming list — but nothing asks anybody to close it, so "UPCOMING" is now wrong on the
record and `getSessionDetail`'s other-session list (`orientation.ts:279`,
`where: { status: "UPCOMING" }`) still offers it as a "move to" target.

### Orientation → travel → hire: the orientation date is typed three times

Three independent columns hold it: `OrientationSession.date`,
`NewHire.orientationDate` (synced from the session by
`setOrientationDateFromSession`, `lib/data/orientation.ts:398-401`), and
`TravelTrip.orientationDate` (hand-typed; `components/travel/TravelPanel.tsx:700-706` is a
bare `<input type="date">` with `defaultValue={toDateInput(trip.orientationDate)}`).
`createTrip` (`app/travel/actions.ts:109-143`) sets only `newHireId`/`candidateId`,
`purpose`, `bookedBy` and the three loyalty numbers — it does **not** prefill
`orientationDate`, `indocStart`, `indocEnd`, or `destinationAirport`. The live rows show
the retyping:

```
ORIENTATION trip (Dayten Schureman, PHX→SLC): orientationDate 2026-09-01,
  indocStart 2026-09-02, indocEnd 2026-09-04, destinationAirport "SLC"
ORIENTATION trip (Erik, MKE→SLC):             orientationDate 2026-09-01,
  indocStart 2026-09-02, indocEnd 2026-09-04, destinationAirport "SLC"
OrientationSession cms544132:                 date 2026-09-01T17:00Z, location "SkyShare HQ, Salt Lake City"
```

Same date, typed three times, on the same week of work. Loyalty numbers, to be fair, ARE
auto-pulled — `app/travel/actions.ts:121-124` — and that is the shape the dates should
follow.

### Candidate CSV import writes straight to the live shared database

`components/imports/CandidateCsvImportCard.tsx`: a file input and one button, "Import
candidate CSV", POSTing to `/api/imports/candidates`. That route (340 lines) contains
`prisma.candidate.create`, `prisma.candidate.update`,
`prisma.candidateApplication.create/update`, `importRow.create`, `importBatch.create`. Zero
occurrences of any dry-run path:

```
$ for d in app/api/imports/*/; do echo "--- $d"; grep -c "dryRun" $d/route.ts; done
--- app/api/imports/candidates/   0
--- app/api/imports/files/        0
--- app/api/imports/job-pdfs/     0
--- app/api/imports/jobs/         0
--- app/api/imports/requirements/ 0
```

POSITIVE CONTROL — the routes in this app that DO have a preview:

```
$ grep -rln "dryRun\|dry-run\|preflight" app/api/
app/api/candidate-applications/batch/route.ts
app/api/disposition-reasons/route.ts
app/api/orientation/reminder-health/route.ts
app/api/resume-intake/route.ts
```

and `app/api/candidate-applications/batch/route.ts:16-24` states the pattern outright:

```
 *   { mode: "preview", jobId, text }         resolves, WRITES NOTHING
 *   { mode: "apply",   jobId, candidateIds } links exactly those ids
 * Apply deliberately takes IDS, not the text again
```

So the shape exists and is documented in this repo; the candidate importer — the one that
creates people — is the one without it. Related: the /imports page still shows a badge
reading **"Local-first foundation"** (`components/imports/ImportsWorkspace.tsx:43-44`),
which is the exact belief CLAUDE.md records as the cause of 411 bad document rows reaching
live.

### Candidate list and profile volumes

```
live candidates: 730 | with >=1 application: 696 | with >=1 metric: 431
live candidates with NO application at all: 34
live candidates with NO file at all: 264
candidates with >=1 file: 3566   max files on one candidate: 51
```

299 of 730 live candidates have zero `CandidateMetric` rows, so the Matchboard cannot rank
them — which matches the known "missing from the matchboard is usually zero metrics" note.
264 have no file at all, so there is nothing to extract from.

The list is capped at 100 (`CANDIDATE_LIST_LIMIT`), offers 100/250/500
(`CANDIDATE_PAGE_SIZES`) and is **not paged** — so at 730 rows there is no way to walk the
whole working list; the 500 setting still leaves 230 unreachable except by search. It does
say so honestly (`CandidatesWorkspace.tsx:137-140`: "Showing the first N of M — search to
narrow it down"), which is better than most. Server order is fixed
(`lib/data/candidates.ts:1073`: `orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }]`)
and the only sortable column is Department, client-side, within the visible page
(`SelectableCandidateTable.tsx:82-87` says so in a comment).

Heaviest live candidate profiles (everything on one page, 11 tabs):

```
{"files":15,"notes":3,"applications":17,"communications":14,"interviews":1,"metrics":12,"questionnaireAnswers":48} Michael Klotz
{"files":15,"notes":4,"applications":7,"communications":22,"interviews":1,"metrics":22,"questionnaireAnswers":13} Derek Dickmann
{"files":15,"notes":1,"applications":18,"communications":9,"interviews":1,"metrics":13,"questionnaireAnswers":8}  Joseph Frascone
```

17 applications on one candidate is the realistic upper bound for the applications panel —
workable.

### New-hire record: which fields are actually carried vs typed

`POST /api/new-hires` accepts `name, position, department, phone, ssEmail, personalEmail,
offerSentDate, offerSignedDate, startDate, orientationDate, candidateId` (read at
`app/api/new-hires/route.ts:137-154`). It does **not** accept `location`, and
`MoveToPreOnboardingPanel` does not collect it. Field population:

```
NewHire total: 461 | ACTIVE+POST_ONBOARD: 33
location null                                        all:  277  live:   1
supervisorHireId set                                 all:  187  live:  32
supervisorName set                                   all:  180  live:  26
no supervisor at all (no link, no name, no email)    all:  274  live:   1
ssEmail null                                         all:  270  live:   0
personalEmail null                                   all:  286  live:   0
phone null                                           all:  274  live:   0
startDate null                                       all:    3  live:   1
orientationDate null                                 all:  416  live:   7
seniorityNumber null                                 all:  461  live:  33
```

`seniorityNumber` is null on **all 461 rows** — the field is on the form and has never
been filled once. `location` and the supervisor are filled for live hires, just later and
by hand; the job they applied to already carries `baseLocation` (e.g. "GA" on "CJ Captain
(Part 91, Georgia)", "Ogden, UT" on "Sr. Staff Accountant"), which is the prefill nobody
is getting.

### Pre-onboarding checklist: document steps are ticks, not checks

`lib/onboarding/tasks.ts:27-34`:

```ts
{ key: "pilot_app",  label: "Confirm Pilot App on file (request if missing)", group: "PILOT_DOCS" },
{ key: "ebco_form",  label: "Confirm Insurance form on file (request if missing)", group: "PILOT_DOCS" },
```

Both are plain three-state buttons (`components/people/OnboardingChecklist.tsx`,
`STATUS_BTN` DONE/TODO/NA). Grep across the whole app for anything that cross-checks them
against a real file:

```
$ grep -rn "pilot_app\|ebco_form" lib/ app/ components/
lib/onboarding/tasks.ts:27,33,95,96,150-155     (definitions + importer aliases)
lib/roadmap/roadmap.ts:359,366                  (roadmap prose)
scripts/doc-request-template/wire.ts:5
scripts/ebco-to-insurance/relabel.ts:11,30
scripts/front-templates-sept11/wire.ts:51,59    (Front template ids)
```

Nothing reads `CandidateFile`. POSITIVE CONTROL that the check is cheap and already
written: `components/candidates/DocumentChecklist.tsx` does exactly this on the CANDIDATE
profile, deriving presence from `files[].documentType` with a nine-item list that includes
"Pilot Application" and "Insurance". The hire record already links back
(`NewHireDetailWorkspace.tsx:830-841`, a real `<Link href={/candidates/${hire.candidateId}}>`),
and 6 of 6 ACTIVE hires have `candidateId` set:

```
=== NewHire candidateId linkage ===
withCandidateId: 171   withoutCandidateId: 290
ACTIVE stage withCandidateId: 6 (of 6)
POST_ONBOARD withCandidateId: 20 (of 27)
```

So the coordinator opens a second tab, reads a checklist that already knows the answer,
comes back, and ticks a box by hand. That is the 411-row failure class with the mechanism
still in place: nothing prevents `pilot_app = DONE` on a hire whose candidate has no Pilot
Application file.

### Employee merge: two relations still detach silently

`app/api/new-hires/merge/route.ts` moves roleAssignment, employmentStint, travelTrip,
redemption, businessCardVariant, **businessCardOrderLine** (the bug recorded in project
memory is FIXED — line 47, with a comment explaining exactly the failure mode), recognition
(both directions), onboardingTask and orientationAttendee. It does **not** touch:

- `NewHire.supervisorHireId` / `supervisor2HireId` — `onDelete: SetNull`
  (`prisma/schema.prisma:285,293`). Anyone reporting to the secondary record loses their
  supervisor link with no error. Exposure: **187 hires point at a supervisor, 122 at a
  second supervisor.** The orientation supervisors email reads that link first
  (`lib/front/orientation-email.ts:296-316`, "the LINKED record wins"), so this breaks a
  send path.
- `OnboardingArchive` — `onDelete: Cascade` (`prisma/schema.prisma:656`). The secondary's
  frozen previous checklist is deleted. Exposure today: 1 row.
- `EventAttendee` — `onDelete: Cascade` (`schema.prisma:2092`). Exposure today: 1 row.
- `Event.ownerId` — `onDelete: SetNull` (`schema.prisma:2054`). Exposure today: 0 rows.

### Reporting: there is no recruiting report

`lib/data/reports.ts:26-40` returns exactly `documentCurrency, travelSpend,
travelSpendByMonth, pilotUpgrades, fleetStaffing`, and the tabs are
(`components/reports/ReportsWorkspace.tsx:1479-1482`):

```ts
const REPORT_TABS = [
  { id: "progression", label: "Fleet Progression" },
  { id: "travel",      label: "Travel Spend" },
  { id: "documents",   label: "Document Currency" }
];
```

Three tabs, none of them recruiting. No time-to-fill, no requisition aging, no
applications-by-stage, no interviews-per-week, no offer accept rate, no source
effectiveness. That is the positive control for the absence: the page exists and has
content, it just has none of the recruiter's numbers. `/command-center` is a redirect to
`/settings/command-center` (`app/command-center/page.tsx`), which is admin-only —
confirmed by `lib/data/user-home.ts:17-21` ("it … is now ADMIN-ONLY, which is why the
landing page below can no longer be a single hardcoded href"). So the recruiter's Monday
rhythm has no home screen of its own; `resolveUserHome` sends them to whatever they picked.

### The Question Bank is empty

```
InterviewQuestion 0
```

`/interview-questions` and `/interview-questions/guide` both call
`getInterviewQuestions()` (`lib/data/interview-questions.ts:26`), which is a plain
`findMany` with no seed and no built-in bank. The workspace renders "No questions yet"
(`InterviewQuestionsWorkspace.tsx:307`) and the Guide builder renders nothing. It is a
top-level nav item (`lib/navigation/modules.ts:148`, label "Question Bank").
`Recognition 0` and `Booking 0` are the same shape: `/compliments` (nav item under People)
and the whole `/book/[slug]` booking stack have never been used once, while 59
`AvailabilityRule` rows, 10 `BookingType` rows and 8 `BookingHost` rows have been
configured for them.

### Intake: the live daily path is a CLI script, not a screen

The roadmap's "Candidate Intake Automation" section lists the shipped work as a **Paycom
Hiring Metrics export** reconciled by `scripts/paycom-stage-reconcile` (118 stage changes
applied Sep 11), and lists as still open: "Paycom new-applicant email", "Recruiting intake
Google account + Drive folder", "Daily intake script", "Job-board sourcing integration".
The most recent `ImportBatch` row in the database is **2026-06-27** (the JazzHR folder
import, 3,162 rows); every later one is from 2026-06-15 or earlier. So /imports is a
historical log, and the daily arrival of a new candidate happens either through that
script or by hand.

```
=== ImportBatch, newest first ===
2026-06-27 JAZZ_FOLDER COMPLETED 3162 rows {"created":3159,"merged":3,"apps":3816,"ivs":282,"files":5710,"metrics":109,"events":4098,"jobs":56}
2026-06-15 UNASSIGNED_FILE_UPLOAD COMPLETED 2
2026-06-15 UNASSIGNED_FILE_UPLOAD FAILED    2
2026-06-15 UNASSIGNED_FILE_UPLOAD COMPLETED 4
2026-06-15 UNASSIGNED_FILE_UPLOAD FAILED    4
…
```

---

## Workflow walks

### A. A new candidate arrives → screened → interviewed

**Five doors, none of them a feed.**

| Door | Route / component | Steps | Manual |
|---|---|---|---|
| Paycom export reconcile | `scripts/paycom-stage-reconcile` | download export in Paycom → run dry-run → read review.md → run apply | all of it, outside the app |
| Candidate CSV | `/imports` → `CandidateCsvImportCard` → `POST /api/imports/candidates` | pick file → press Import | **no preview, no undo** |
| One candidate by hand | `/candidates` → `NewCandidateButton` | first, last, email, phone, current title, stage (free text), tags | 7 fields |
| Bulk resumes | `ResumeIntake` / `DocumentIntake` (also on the job detail, with `jobId`) | drop files → upload | has a pre-flight script, not in-UI |
| Batch link to a job | `BatchAddCandidatesToJob` → `/api/candidate-applications/batch` | paste list → **preview** → apply | matches only, never creates |

- **RE-ENTRY.** `NewCandidateButton` asks for **Stage** as a free-text `<input>`
  (`NewCandidateButton.tsx:123`) while the curated vocabulary lives in
  `WorkspaceSetting candidate-vocab/stages` and is already loaded on that page as
  `stageList`. 11 values today, all matching — so nothing is broken yet, but a typo
  creates a 12th stage the filter does not offer.
- **MEMORY TAX.** `paycomPersonId` is set on 79 of 8,682 candidates and `paycomLink` on
  38. For everyone else, "open this person in Paycom" means searching Paycom by name in
  another tab. The schema comment says plainly there is no derivable URL, so this is by
  design — but it means the Paycom tab is open all day.
- **DEAD END.** 264 of 730 live candidates have no file, and 299 have no metric, so the
  Matchboard cannot score them. Nothing on the candidate row says "there is nothing to
  read here" — the batch-add preview does say it (`hasMetrics` / `hasDocumentText`), and
  that signal should be on the row too.
- **EXPENSIVE ERROR, UNGUARDED.** The CSV import. It creates and updates candidates and
  applications on the live shared database with one click and no preview. The pattern to
  copy is in the same app.

### B. Interview scheduling and the debrief

**The app cannot know anything about a future interview, and says so honestly in
`lib/interviews/debrief.ts:10-16`.** An `Interview` row is created *by* the act of writing
up. Measured: 0 rows with `startDateTime > now`, out of 350.

Steps to record one interview: /interviews/debrief → read the row → click **Write up** →
land on the profile Interviews tab → click **Log an interview** → **change the date from
today back to the real date** → pick interviewer → pick type → paste notes from Paycom →
optionally outcome, rating, next step → Save. **Nine steps, two of which are re-entry.**

- **RE-ENTRY.** The date (the queue knows it). The interviewer (pre-selected from the
  signed-in user — credit where due, `app/candidates/[id]/page.tsx:35`). The role, parsed
  from the calendar title (`row.parsedRole`) and then thrown away.
- **MEMORY TAX.** Which requisition this interview was for — the form has no job field,
  so it lives in the recruiter's head and in the Paycom tab. The next step, which lands
  in a prose blob nothing reads.
- **DEAD END.** Past 21 days a row silently leaves the debrief queue. Nothing records that
  a write-up was owed and never done.
- **EXPENSIVE ERROR, GUARDED WRONGLY.** Defaulting the date to today means the write-up
  fails the queue's ±36h match, so the row nags forever and the interview is filed on the
  wrong day. That is the default actively fighting the feature that sent you there.
- **Scorecards:** 0 of 48 live write-ups has one. Either retire the feature or wire it
  into the write-up form; leaving it reachable and unused is worse than either.

### C. Offer, then the move to pre-onboarding

This is the best-built stretch in the app, and it shows.

`OfferControl` / `lib/offers` own the six offer steps on the **application**, not on a
NewHire — the schema comment explains that requiring a NewHire first is what produced 448
disconnected records. `MoveToPreOnboardingPanel` then has three correct states (already
linked / name matches an unlinked hire → **offer to link, not duplicate** / create), the
create form prefills position, department, start date and company email, `POST
/api/new-hires` re-guards the duplicate at 409 with a `force` escape, carries the ticked
offer steps across so the Offer group lands complete, and converts `offerSentAt` to a
Mountain calendar day rather than copying the raw instant.

- **RE-ENTRY, the one gap.** `location` is not in the form and not accepted by the route,
  although the job the offer was made against carries `baseLocation`. 277 of 461 rows are
  null on it; for the 33 live ones somebody went back and typed it.
- **MEMORY TAX.** Supervisor. 274 of 461 hires have no supervisor of any kind; for the 33
  live ones it is filled, later, on the profile — and the orientation supervisors email
  refuses to send without it (`lib/front/orientation-email.ts:386-390`). Capturing it at
  move-in, where the hiring decision is fresh, would remove a later blocker.
- **Offers volume:** 27 applications have a non-NONE `offerStatus`, so the board is small
  and legible. Note the parallel count: 251 applications carry the Paycom status "Hired"
  and 19 "Declined Offer", which the Offers board does not show. Two ways to answer "how
  many offers this year" (see UNCERTAIN 1).

### D. Pre-onboarding: documents, the checklist, what blocks a start date

33 live hires, 22 built-in checklist items across four groups, 5,191 `OnboardingTask` rows
(DONE 4,484 / NA 405 / TODO 302). The dashboard
(`lib/data/onboarding.ts:375-500`, `buildDashboard`) is genuinely good: alerts ranked
blocked → urgent → ready → missing, a self-clearing "background check cleared Nd ago —
hire in Paycom" row, reimbursements-owed appended outside the else-if chain so a debt is
never hidden behind an unrelated flag, starts-by-week, a funnel.

- **What blocks a start date:** `bg_check_complete` → `paycom_hire` is the real gate and
  the dashboard surfaces it. `candidate_signed` is the other. Both are explicit.
- **RE-ENTRY / MEMORY TAX, the real cost.** The Pilot documents group. Two steps that say
  "Confirm … on file" with nothing that looks, while the candidate profile one click away
  already computes exactly that from the real files. Open the other tab, read, come back,
  tick.
- **EXPENSIVE ERROR, UNGUARDED.** A ticked `pilot_app` on a hire whose candidate has no
  Pilot Application. This is the same failure mode as the 411 rows in CLAUDE.md — a
  checklist satisfied, a document not producible — and the data to prevent it is already
  joined on the other side of one link.
- **Dead field:** `seniorityNumber`, on the form, null on all 461 rows.

### E. Orientation

6 sessions, 28 attendees, 69 prep tasks. The email panel
(`components/orientation/OrientationEmailPanel.tsx`, 1,814 lines) is careful in the ways
that matter — nothing sends without an approved preview, a test send goes to one address
with no cc and never ticks the grid, the audience ("→ new hire" / "→ supervisor") is a
chip on every column rather than hover-only, and per-send body edits never write back to
the template.

Steps to run one session: + New session → date, start, end, location, **address**,
meet link → add attendees from the suggested list → prep tasks → lunch vendor/arrival/
contact → preview invite → send → preview supervisors → send → preview reminder → send →
mark attended on each hire. Roughly **13 steps** for a 4-person cohort, most of them real
work.

- **RE-ENTRY.** The HQ street address, identical on every session that has one, blank by
  default. The orientation date, again on each travel trip.
- **DEAD END.** Nothing closes a session. The 2026-09-01 one is still `UPCOMING`.
- **EXPENSIVE ERROR, HALF-GUARDED.** The time is rewritten-or-warned; the address is
  rewritten-or-silent. Location is the field a new hire drives to.

### F. Travel

8 trips ever (2 ORIENTATION, 3 RECRUITING_VISIT, 1 CREW, 1 CANCELED, 1 other), 23 items,
18 receipts. At this volume the page's affordances are fine. Loyalty numbers auto-pull.
One trip was created from a Front email (`sourceConversationId: cnv_1hmd023e`,
`sourceEmailUrl` to Front) — the phase-2 path works.

- **RE-ENTRY.** `orientationDate`, `indocStart`, `indocEnd`, `destinationAirport` — all
  blank on a new trip, all derivable from the hire's orientation session and location.
- **MEMORY TAX.** Indoc dates live on the trip by default and on the hire only as an
  override (`prisma/schema.prisma:329-336` explains why), which is a defensible choice but
  means "when is indoc" has two possible homes.

### G. Day one onward

- **Business cards:** 9 orders, 71 lines, a min-batch target that is explicitly "a target,
  not a limit", `defaultCardTitle` derives PILOT for flight crew, and `buildBusinessCard`
  returns a `missing: ["mobile","email"]` array so an incomplete card is visible before it
  is printed. Good.
- **New hire contacts:** the checklist button injects the **current** share token rather
  than a pasted copy, so a rotation cannot strand the template
  (`lib/onboarding/tasks.ts:73-78`). Good, and `needs-a-person.md` item 3 is the right
  caveat.
- **Compliments:** `Recognition 0`. A nav item under People, a dashboard with
  "Recognitions this month", and nothing has ever been given.

### H. Reporting and the Monday rhythm

Three report tabs, none recruiting (raw output above). `/command-center` redirects to an
admin-only page. The Monday check-in reads `docs/needs-a-person.md`, whose item 2 asks for
a private note that does not exist.

---

## CERTAIN — safe for a later agent to fix without re-deriving

1. **`lib/data/calendar.ts:111-112` — the calendar loads the oldest 200 interviews, so
   this year is invisible.**
   Before:
   ```ts
   prisma.interview.findMany({
     take: 200,
     orderBy: { startDateTime: "asc" },
   ```
   After:
   ```ts
   prisma.interview.findMany({
     take: 200,
     orderBy: { startDateTime: "desc" },
   ```
   Measured: `asc` returns 2023-10-09 → 2024-11-13, all 200 `source: "JAZZ"`, and drops all
   48 `manual-writeup` rows and all 14 `SCHEDULED` rows. No consumer re-sorts
   (`CalendarWorkspace.tsx:207-219` filters by department only; `MonthCalendar.tsx:68-76`
   buckets by day key), so flipping the direction is safe — the "All interviews" manifest
   simply reads newest-first, which is the better order for it anyway. Severity: high.

2. **`components/calendar/UpcomingInterviews.tsx:36-38` — the panel vanishes instead of
   explaining itself.**
   Before:
   ```ts
   if (upcoming.length === 0) {
     return null;
   }
   ```
   After: render the section shell with an explanatory empty state, e.g.
   ```tsx
   if (upcoming.length === 0) {
     return (
       <section className="rounded bg-gradient-to-br from-brand-lea to-brand-eden p-5 shadow-panel">
         <div className="flex items-center gap-2 text-white">
           <CalendarClock className="h-5 w-5 text-brand-gold" />
           <h2 className="text-base font-semibold">Upcoming Interviews</h2>
         </div>
         <p className="mt-3 text-sm text-white/75">
           Nothing here yet. Interviews are booked in Paycom and only appear in Journey
           once somebody writes one up, so this stays empty by design — see the Debrief
           Queue for interviews that still need a write-up.
         </p>
       </section>
     );
   }
   ```
   Measured: 0 of 350 interviews have `startDateTime > now`, so this panel renders `null`
   100% of the time today while its grid slot (`CalendarWorkspace.tsx:505`) keeps the
   title. Severity: medium.

3. **`lib/candidates/disposition-vocabulary.ts:186-190` — `stageForWording` uses an exact
   key, so the live Paycom spelling of "Knocked Out" is unrecognised on 1,627
   applications.**
   Before:
   ```ts
   export function stageForWording(wording: string | null | undefined): string | null {
     const raw = (wording ?? "").trim();
     if (!raw) return null;
     return WORDING_TO_STAGE[raw] ?? null;
   }
   ```
   After:
   ```ts
   export function stageForWording(wording: string | null | undefined): string | null {
     // Go through the loose key first: the live Paycom pipeline stores "Knocked Out"
     // while the house wording is "Knocked out", and an exact lookup missed 1,627 rows.
     const house = toHouseWording(wording);
     if (!house) return null;
     return WORDING_TO_STAGE[house] ?? null;
   }
   ```
   Measured: `stageForWording("Knocked Out") = null`, `stageForWording("Knocked out") =
   "Knocked Out"`, `toHouseWording("Knocked Out") = "Knocked out"`. 1,627 rows hold
   "Knocked Out", all `origin: PAYCOM`. This is purely additive — every currently
   recognised wording is returned unchanged by `toHouseWording`, which is already the
   importer's own normaliser in the same file. It does **not** fix "Denied" (4,329) or
   "In Hiring Process" (309); those need a human decision — see UNCERTAIN 2.
   Severity: high.

4. **`components/recruiting-jobs/RecruitingJobsWorkspace.tsx:185` — a linked candidate
   links to a name search instead of to the person.**
   Before:
   ```tsx
   href={`/candidates?q=${encodeURIComponent(candidate.displayName)}`}
   ```
   After:
   ```tsx
   href={`/candidates/${candidate.id}`}
   ```
   `candidate.id` is on the same object (it is the `key` on line 184) and
   `lib/data/recruiting-jobs.ts:242-248` already selects it. Saves one page load on every
   click and removes the two-rows-for-one-name landing that
   `lib/data/candidates.ts:773-785` documents. Severity: medium.

5. **`lib/front/orientation-email.ts:208-215` — the address is rewritten or silently
   skipped; unlike the time, it never warns.**
   Before:
   ```ts
   const address = session.address?.trim();
   if (address) {
     text = text.replace(/(Location:\s*(?:<[^>]+>\s*)*)([^<\n]+)/gi, (full, label: string, current: string) => {
       const shown = current.trim();
       if (!shown || shown === address) return full;
       changes.push(`the location now reads ${address} (the template said ${shown})`);
       return label + address;
     });
   }
   ```
   After — add the mirror of the `endsAt` else-branch directly above it:
   ```ts
   const address = session.address?.trim();
   if (address) {
     … unchanged …
   } else {
     // NO ADDRESS ON THE SESSION. Mirrors the endsAt branch above: there is nothing to
     // check against, so name what is about to be sent rather than going quiet. Measured
     // 2026-09-11: 3 of 6 sessions have no address, and the Sep 1 session sent an invite
     // and a reminder to four attendees with this branch silent.
     const found = [...html.matchAll(/(?:Location:\s*(?:<[^>]+>\s*)*)([^<\n]+)/gi)].map((m) => m[1].trim());
     const unique = [...new Set(found)].filter(Boolean);
     if (unique.length) {
       warnings.push(
         `This session has no address recorded, so the location in this email (${unique.join(", ")}) came straight from the Front template and was NOT checked against the session. Set an address on the session if that is wrong.`
       );
     }
   }
   ```
   Severity: high (it is the field a new hire drives to, and the send is irreversible).

6. **`components/orientation/OrientationOverview.tsx:204` — the new-session form defaults
   `location` but leaves `address` blank, so the one constant string is retyped or
   forgotten.**
   Before:
   ```ts
   const [form, setForm] = useState({ date: "", time: "09:30", endTime: "15:00", location: "SkyShare HQ, Salt Lake City", address: "", meetLink: "" });
   ```
   After:
   ```ts
   const [form, setForm] = useState({ date: "", time: "09:30", endTime: "15:00", location: "SkyShare HQ, Salt Lake City", address: "180 2400 W, Salt Lake City, UT 84116", meetLink: "" });
   ```
   That exact string is what all three sessions that have an address hold, byte for byte.
   Editable as before. Severity: medium.

7. **`components/interviews/DebriefQueue.tsx:449` — the Write up link does not carry the
   interview date the queue already knows, and the form defaults to today.**
   Before:
   ```tsx
   <Link href={`/candidates/${row.candidate?.id ?? ""}?tab=interviews`} className={SOLID_BUTTON}>
   ```
   After:
   ```tsx
   <Link
     href={`/candidates/${row.candidate?.id ?? ""}?tab=interviews&interviewedAt=${row.startsAt.slice(0, 10)}`}
     className={SOLID_BUTTON}
   >
   ```
   Then in `components/candidates/CandidateProfileWorkspace.tsx` (which already reads the
   query string — `useSearchParams()` at line 159, `searchParams.get("tab")` at line 160)
   pass `initialInterviewedAt={searchParams.get("interviewedAt") ?? undefined}` down to
   `<InterviewWriteUp …>`, and in
   `components/candidates/InterviewWriteUp.tsx:125` change
   ```ts
   interviewedAt: todayInputValue(),
   ```
   to
   ```ts
   interviewedAt: initialInterviewedAt ?? todayInputValue(),
   ```
   adding `initialInterviewedAt?: string` to the props type at line 112-118.
   Why it matters, measured: `WRITE_UP_MATCH_WINDOW_MS = 36h`
   (`lib/interviews/debrief.ts:48`), so a write-up left on today's date for an older
   interview does not clear the queue row it came from. Severity: high.

8. **`components/candidates/NewCandidateButton.tsx:123` — Stage is a free-text input while
   a curated 11-value vocabulary exists.**
   Before:
   ```tsx
   <input className={FIELD} placeholder="Stage" value={form.stage} onChange={(e) => set("stage", e.target.value)} />
   ```
   After: a `<select>` over the live list. The page that renders this button already loads
   it — `app/candidates/page.tsx:86` calls `getStageList()` and passes `stageList` into
   `CandidatesWorkspace` — so thread it to `NewCandidateButton` and render
   `<option>` per entry with a blank default. The stored vocabulary today is
   `New, Applied, Screening, Interviewing, Offer, Hired, Saved For Later, Withdrew,
   Rejected, Knocked Out, Archived` (from `WorkspaceSetting candidate-vocab/stages`), and
   the live distribution uses exactly those 11 and no others — so nothing is broken yet
   and this is closing the door. Severity: low.

9. **`app/api/new-hires/merge/route.ts` — merging an employee silently detaches everyone
   who reported to the record being merged away.**
   After the `businessCardOrderLine` line (line 47), add:
   ```ts
   // Supervisees, beside the card order lines above, and silent for the same reason:
   // supervisorHireId is onDelete SetNull, so leaving it out does not fail the merge -
   // it nulls the link on everybody who reported to the secondary. The orientation
   // supervisors email reads the LINK first (lib/front/orientation-email.ts), so a
   // nulled one quietly breaks a send path. Measured 2026-09-11: 187 hires hold a
   // supervisor link and 122 a second one.
   await tx.newHire.updateMany({ where: { supervisorHireId: secondaryId }, data: { supervisorHireId: primaryId } });
   await tx.newHire.updateMany({ where: { supervisor2HireId: secondaryId }, data: { supervisor2HireId: primaryId } });
   // OnboardingArchive is onDelete Cascade, so the secondary's frozen previous
   // checklist would be deleted rather than moved. Unique on (newHireId, sequence),
   // so move only the sequences the primary does not already hold.
   const primarySequences = new Set(
     (await tx.onboardingArchive.findMany({ where: { newHireId: primaryId }, select: { sequence: true } })).map((a) => a.sequence)
   );
   const secArchives = await tx.onboardingArchive.findMany({ where: { newHireId: secondaryId }, select: { id: true, sequence: true } });
   const moveArchiveIds = secArchives.filter((a) => !primarySequences.has(a.sequence)).map((a) => a.id);
   if (moveArchiveIds.length) await tx.onboardingArchive.updateMany({ where: { id: { in: moveArchiveIds } }, data: { newHireId: primaryId } });
   ```
   Relations verified at `prisma/schema.prisma:285` (`supervisorHire … onDelete: SetNull`),
   `:293` (`supervisor2Hire … onDelete: SetNull`) and `:656` (`OnboardingArchive.newHire …
   onDelete: Cascade`). `EventAttendee` (`:2092`, Cascade, 1 row today) and `Event.ownerId`
   (`:2054`, SetNull, 0 rows today) have the same shape and are worth the same treatment,
   but the exposure is 1 row and 0 rows so I have left them out of the exact patch.
   Severity: medium.

10. **`components/imports/ImportsWorkspace.tsx:43-44` — the page badge says "Local-first
    foundation", which is the exact belief that produced 411 bad rows.**
    Before:
    ```tsx
    <div className="rounded bg-brand-cloudDancer px-3 py-1 text-xs font-semibold text-brand-eden dark:bg-white/5 dark:text-[#8fb3d6]">
      Local-first foundation
    </div>
    ```
    After:
    ```tsx
    <div className="rounded bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
      Writes to the live database and the live S3 bucket
    </div>
    ```
    CLAUDE.md records that `.env.local` sets `FILE_STORAGE_PROVIDER=s3` against the
    production bucket and that there is one shared Neon database, so the current badge is
    false on both axes. Severity: medium.

---

## UNCERTAIN — needs a human in the morning

1. **Two incompatible answers to "how many offers did we make".**
   `CandidateApplication.offerStatus` (the app's own workflow field) is non-NONE on 27
   rows: SIGNED 24, DECLINED 2, NOT_SENT 1. `CandidateApplication.status` (the imported
   Paycom vocabulary) holds Hired 251, Declined Offer 19, Offered 4, Rescind Offer 5.
   `/offers` shows the 27. I could not close which is meant to be authoritative for
   reporting, because both are deliberate per their schema comments.
   **What would close it:** Aimee saying which number she would quote in a weekly update —
   and whether the Offers board should show the Paycom-hired ones at all.

2. **"Denied" (4,329 rows) and "In Hiring Process" (309 rows) are not in the house
   vocabulary at all, and both are live Paycom statuses.**
   `origin` split confirms it: both are 100% `PAYCOM`. So a live application can read
   "Denied" and the picker tells the recruiter it is not a house wording. Unlike "Knocked
   Out" this is not a case slip — there is no house wording that means "Denied", and
   "In Hiring Process" / "Offered" are not dispositions at all, they are open states.
   Mapping them is a vocabulary decision with a real blast radius (the bucket rail, the
   reasons page, the importer), and `lib/candidates/disposition-vocabulary.ts:113-119`
   says an unrecognised wording is deliberately kept rather than flattened.
   **What would close it:** one line from the user per status — does "Denied" mean
   "Rejected", and should "In Hiring Process" / "Offered" be added to `WORDING_TO_STAGE`
   as open stages or deliberately left unmapped.

3. **`docs/needs-a-person.md` item 2 cannot be performed as written.** 0 of 1,410
   `CandidateNote` rows have `hrOnly = true`. The non-HR viewer has nothing to fail to
   see.
   **What would close it:** somebody marking one real note private (a write, so not mine
   to do), then running the check. Or rewording the item so the first step is "mark a note
   private".

4. **The 2026-09-01 orientation session is still `status: UPCOMING` ten days later, and I
   could not tell whether that is neglect or meaningful.** It sorts into `past` by date, so
   it is not stranded on the page, but `getSessionDetail`'s "move to another session" list
   (`lib/data/orientation.ts:279`) filters on `status: "UPCOMING"` and therefore still
   offers it as a destination. Whether those four attendees' `attended_orientation` tasks
   were ticked is a per-hire question I did not open one by one.
   **What would close it:** asking Hannah whether that session ran, and whether a past
   session should auto-close or should nag.

5. **I cannot say whether the 2026-09-01 invite and reminder went out with the right
   address.** The session has `address: null`, `applySessionOverrides` therefore did not
   touch the body's "Location:" line, and the four attendees' `sentTemplateKeys` show
   `invite` and `reminder` both sent. Whether the Front template's own location line is
   correct is only answerable by reading the live Front template, which I would not do
   tonight (read-only against Front is safe but it is the send path's surface and another
   agent owns Chrome).
   **What would close it:** opening the three orientation templates in Front and reading
   the "Location:" line in each.

6. **Interview scorecards: retire or wire?** All 282 belong to JazzHR-imported interviews;
   0 of the 48 live write-ups has one. The write-up form has Outcome and Rating, which
   overlap a scorecard's purpose. I cannot tell whether the team abandoned scorecards or
   never found them.
   **What would close it:** asking whether the 4-point rubric is still wanted; if yes it
   belongs inside the write-up form, if no the reader on the profile should say so.

7. **`InterviewQuestion` is 0 rows and the Question Bank is a top-level nav item.** Whether
   the bank was meant to be seeded from an existing document, or is simply not started,
   is not answerable from the code — `getInterviewQuestions()` is a bare `findMany` and
   there is no seed file.
   **What would close it:** asking whether there is an existing question list (a Sheet, a
   doc) to import, or whether the item should come out of the nav until there is.

8. **`Recognition` is 0 and `Booking` is 0, while 59 `AvailabilityRule`, 10 `BookingType`
   and 8 `BookingHost` rows are configured.** Somebody set the booking system up and it has
   never taken a booking. I could not tell whether /book links were ever sent out (that
   would be in Front, not here).
   **What would close it:** asking whether Calendly is still the live booking tool.

9. **`/recruiting-jobs` first-paint weight.** 64 jobs × 4,507 applications with the
   candidate joined, and a full detail object built for every job. That is a real payload,
   but I did not measure the served HTML size or the TTFB — measuring it properly needs a
   request against the running dev server with timing, and the perf agent is better placed.
   **What would close it:** one timed request to `/recruiting-jobs` and the response size,
   against the dev server already running on :3000.

10. **I did not verify any client-side interaction.** CLAUDE.md records that the Browser
    pane cannot read this app's rendered content, and tonight's rules assign Chrome to
    exactly one other agent. Everything above is read from code and from the live database.
    In particular: that the Upcoming-interviews panel renders visible empty chrome rather
    than collapsing entirely is inferred from `EditableGrid` keeping the panel in its set,
    not observed.
    **What would close it:** the Chrome agent loading `/calendar` and saying what that
    panel looks like.

---

## Counts

| Thing | Measured |
|---|---|
| Candidates, total / un-archived / merged | 8,682 / 730 / 31 |
| Candidate list page size / pagination | 100 default, 100·250·500 options, **no paging** |
| Live candidates with no file / no metric | 264 / 299 (of 730) |
| CandidateApplication, total | 12,888 |
| …with a status `stageForWording()` rejects | **6,292 (49%)** |
| …on live candidates, rejected / total | **941 / 1,727 (54%)** |
| …`"Knocked Out"` (PAYCOM) vs `"Knocked out"` (JAZZ) | 1,627 vs 455 |
| …with a non-NONE `offerStatus` | 27 (SIGNED 24, DECLINED 2, NOT_SENT 1) |
| …with `statusNote` set | 0 |
| Jobs, total / non-merged / OPEN | 131 / 64 / 10 |
| Applications shipped in /recruiting-jobs first paint | **4,507** |
| Jobs with >100 applications | 16 (largest 488, RETIRED) |
| Biggest OPEN requisition | Aircraft Maintenance Technician, 279 applications, 0 interviews |
| Interviews, total | 350 (JAZZ 282, manual-writeup 48, seed 18, local 2) |
| …loaded by /calendar | oldest **200**, all JAZZ, 2023-10-09 → 2024-11-13 |
| …dropped by that `take` | **150**, incl. all 48 write-ups and all 14 SCHEDULED |
| …with `startDateTime > now` | **0** |
| …write-ups with `jobId` / `nextStep` / `rating` set | 0 / 6 / 7 (of 48) |
| InterviewScorecard rows / on live write-ups | 282 / **0** |
| InterviewQuestion rows | **0** |
| CandidateNote rows / `hrOnly = true` | 1,410 / **0** |
| NewHire, total / ACTIVE / POST_ONBOARD | 461 / 6 / 27 |
| …linked to a candidate (ACTIVE) | 6 of 6 |
| …`seniorityNumber` set | **0 of 461** |
| …with any supervisor (live) | 32 of 33 |
| OnboardingTask DONE / NA / TODO | 4,484 / 405 / 302 |
| OrientationSession, total / with no address | 6 / **3** |
| OrientationAttendee | 28 |
| TravelTrip / items / receipts | 8 / 23 / 18 |
| Report tabs on /reports | 3, none recruiting |
| Recognition / Booking rows | 0 / 0 |
| Most recent ImportBatch | 2026-06-27 (JazzHR folder, 3,162 rows) |
| Import routes with a dry run | 0 of 5 (positive control: 4 other routes have one) |
| DuplicateReviewItem pending | 0 (42 resolved, 2 dismissed) |

---

## The five changes that would most reduce a daily user's keystrokes and waiting

**1. Flip the calendar's order so it shows this year.**
`lib/data/calendar.ts:112` — `orderBy: { startDateTime: "asc" }` → `"desc"`. One word. It
turns the Calendar page from a 2023–24 archive viewer into the recruiter's actual
interview history, and it fixes the month grid, the manifest, and the department counts at
once. While in there, give `UpcomingInterviews` an empty state
(`components/calendar/UpcomingInterviews.tsx:36-38`) so the panel explains why it is empty
instead of disappearing, and make the "Scheduled" stat mean what it says. **Start here in
the morning.**

**2. Make `stageForWording` use the loose key, so 941 live applications stop claiming the
recruiter's own data is unrecognised.**
`lib/candidates/disposition-vocabulary.ts:186-190` — route through `toHouseWording()` as
in CERTAIN 3. Changes nothing that already works (verified against all 26 recognised
wordings) and recovers 1,627 rows of the spelling the live Paycom pipeline actually writes.
The component that benefits is `components/candidates/ApplicationStatusPicker.tsx`; the
panel is `components/candidates/CandidateApplicationsPanel.tsx`. Then take the "Denied" and
"In Hiring Process" decision to the user (UNCERTAIN 2) and finish the job.

**3. Put the real document state on the pre-onboarding checklist instead of a box to tick.**
`components/people/OnboardingChecklist.tsx` (the `PILOT_DOCS` group) +
`app/people/[id]/page.tsx` — load the linked candidate's files the way
`app/candidates/[id]/page.tsx` does, and render
`components/candidates/DocumentChecklist.tsx`'s presence signal beside `pilot_app` and
`ebco_form`. 6 of 6 ACTIVE hires already carry `candidateId`, and the component that
computes this already exists. It removes a tab-switch per hire per document, and it closes
the 411-row failure mode — a "Confirm on file" step that nothing confirms.

**4. Carry the date from the Debrief Queue into the write-up form, and add the job field.**
`components/interviews/DebriefQueue.tsx:449` →
`components/candidates/CandidateProfileWorkspace.tsx:159-160` →
`components/candidates/InterviewWriteUp.tsx:125` for the date (CERTAIN 7), and add a job
`<select>` populated from `candidate.applications` (already on the profile payload) to the
same form, posting `jobId` through `POST /api/candidates/[id]/interviews`. The date fix
stops the queue nagging about work that is done; the job field is what makes
"interviews for the AMT req" answerable at all — today 9 of 10 OPEN requisitions show zero
interviews because 0 of 48 write-ups carries a `jobId`.

**5. Give the candidate CSV import a preview, and prefill the travel trip from the hire.**
Two small pieces of the same principle — do not make somebody type what the app knows, and
do not let them write the shared live database blind. For the import: add
`{ mode: "preview" | "apply" }` to `app/api/imports/candidates/route.ts` copying
`app/api/candidate-applications/batch/route.ts:16-24` exactly, and surface it in
`components/imports/CandidateCsvImportCard.tsx`. For travel: in
`app/travel/actions.ts:109-143`, prefill `orientationDate` from the hire's
`orientationDate`, `indocStart`/`indocEnd` from the hire's overrides, and
`destinationAirport` from the hire's `location`, the same way the three loyalty numbers are
already pulled at lines 121-124. The two live ORIENTATION trips prove the retyping: both
carry `2026-09-01 / 09-02 / 09-04 / SLC`, all four of which the orientation session and the
hire record already held.
