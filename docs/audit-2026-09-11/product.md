# Product strategy audit - 2026-09-11

Read-only. No writes, no sends, no git, no browser. One scratch probe
(`scripts/_r1-product-probe.ts`, SELECT only) was used and deleted.

---

## Headline

**The Sep 29 orientation will not send its automated reminder, and nobody has
emailed any of its four attendees yet.** The `orientation/reminder-armed` row
holds exactly one session id — `cmrwrtm8z000064rmn5trtizi`, the **Aug 4**
session, which is already `COMPLETE` — so `sessionsDueForReminder()` (which
filters `id IN (armed) AND status = "UPCOMING"`) returns nothing and will keep
returning nothing on Sep 28. All four Sep 29 attendees carry
`sentTemplateKeys: "[]"`: Auggie Quintero, Flynn McFarland, Ryan Christensen,
Robert Patrick. The session's own prep checklist puts "Send invitations to
attendees" at 14 days before, which for Sep 29 is **Sep 15 — four days from
today**. That is the one item in this file that changes what somebody does
tomorrow morning.

Underneath it, the structural story is simpler than the roadmap's 1,020 items
suggest: **the app is not short of features, it is short of people.** Five
`User` rows exist (2 ADMIN, 1 RECRUITER, 2 HIRING_MANAGER) against 180 ACTIVE
employees, and `UserInvite`, `UserPermission` and `UserCandidateAccess` all hold
**0 rows**. Four nav destinations point at features that have never held a single
row — Compliments (`Recognition` 0), Scheduling (`Booking` 0), Question Bank
(`InterviewQuestion` 0), Supplies (`SupplyItem` 0 / `EventSupply` 0). Three of
those four cannot work without logins the company does not have. Meanwhile the
roadmap that is meant to be "how the team sees what is done versus what is left"
is `ADMIN`-only since Aug 3, so three of the five users cannot see it at all.

The single highest-risk *live* artefact is `/r/[token]` — an unauthenticated page
that renders every pilot by name, with a "why they have no move" label beside
each name, and a **Download CSV** button. One non-revoked share link exists,
created by aschaedig@ on 2026-07-07. Rock 5's own roadmap line says the pilots
asked not to be named. It still names them.

---

## What I checked, and how

### Q3 rocks: the authoritative list and the real dates

`lib/roadmap/roadmap.ts` line 1035 (section `## Q3 Rocks — due Oct 1`) and line
1038 onward. The master list restated by the user on Sep 08 and declared
"authoritative over every rock line below":

```
1 Pre-boarding task tracking, DONE.
2 Orientation (Scheduling, Attendance Tracking, Coordination), DONE.
3 Historical Interview History, DONE.
4 Business Card Ordering Process, DONE.
5 PILOT UPGRADE / TRANSITION STORY - what shows at Data then Reports then the
  pilot or support journey, and he wants MORE OPTIONS added to that report;
  this took the place of the crew chart.
6 Travel Arrangements (Orientation/Indoc and Pilot Initial Training) -
  almost done, just looking for ways to improve it.
FOUR DONE, TWO OPEN, and neither open one is an unstarted build.
```

Dates counted from today, 2026-09-11, rather than taken from any prompt:

| Date | What | Days from 2026-09-11 |
|---|---|---|
| Sep 12 | Rock "Travel for Orientation / Indoc" finish-by (roadmap L1089) | **1 (tomorrow)** |
| Sep 14 | Flynn McFarland start date | 3 |
| Sep 15 | "Send invitations" due for the Sep 29 orientation (14 days before, per `orientation/prep-defaults`) | **4** |
| Sep 19 | Girls in Aviation day (Event, CONFIRMED) | 8 |
| Sep 24 | The section's own one-week buffer before Oct 1 | 13 |
| Sep 24 | USU 12th Annual Aviation Career Fair (Event, PLANNED) | 13 |
| Sep 28 | The day the Sep 29 reminder would fire | 17 |
| Sep 29 | Orientation session, 4 attendees, zero emails sent | 18 |
| Oct 1 | **Q3 rocks hard deadline** | **20** |
| Oct 1 | Auggie Quintero start date | 20 |
| Oct 1-13 | Aimee on PTO in Germany (roadmap L1036) | starts on the deadline |

The crew chart's Sep 24 finish-by is **void** — roadmap L1113 says so in its own
text ("THIS IS NOT A ROCK, corrected Sep08 by him... Its Sep 24 date is void"),
yet the line still opens "Crew chart — finish by Sep 24" and still sits in the
Q3 Rocks section marked `[~]`. Roadmap L1061 records that the scheduled Monday
check-in keeps its own `SKILL.md` **outside this tree**, so the Sep 14 check-in
will still report the old rock 6 name and the void date unless that file is
edited. Rock 5 (pilot upgrade / transition story) has **no finish-by date at
all** — it inherited the slot but not a date.

### The reminder claim, with the positive control

Whole scope of `WorkspaceSetting` where `scope = 'orientation'` — **all 4 rows**,
not a probe for one key:

```
rows: 4

--- orientation/calendar-events  updated=2026-09-02T18:06:26.300Z
{"cmrwrtm8z000064rmn5trtizi":{...},"cms544132000304l5z7z244q0":{...},
 "cmt0atkzd000004jl9hai1bbp":{"eventId":"vaqetebjs4ion68bac1huvkq60",...,
  "createdBy":"hbyers@skyshare.com","syncedFingerprint":
  "2026-09-29T15:30:00.000Z|2026-09-29T21:00:00.000Z|SkyShare HQ, Salt Lake City|"}}

--- orientation/prep-defaults  updated=2026-07-23T01:22:25.741Z
[{"label":"Send invitations to attendees","owner":"Recruiting","dueDaysBefore":14},
 ... {"label":"Send reminder to attendees","owner":"Recruiting","dueDaysBefore":2}]

--- orientation/reminder-armed  updated=2026-09-01T14:16:40.256Z
{"cmrwrtm8z000064rmn5trtizi":true}

--- orientation/reminder-runs  updated=2026-09-11T15:36:18.837Z
[{"at":"2026-09-11T15:36:18.762Z","dayKey":"2026-09-11","outcome":"nothing-due",
  "sessionsChecked":0,...}, ... daily back through 2026-09-01 ...]
```

The row **exists** (this is the opposite of the Aug 2 false alarm, which claimed
it did not). Its whole value is one key. That key is the Aug 4 session.

Whole scope of orientation sessions:

```
cmqb58xmp000005jyg1gal7h1  2026-06-15  COMPLETE   8 attendees
cmqgs1nnd000004k1g7injugt  2026-06-29  COMPLETE   1
cmr114fii000004lbvuxcsc6y  2026-07-07  COMPLETE   4
cmrwrtm8z000064rmn5trtizi  2026-08-04  COMPLETE   7   <-- the only armed id
cms544132000304l5z7z244q0  2026-09-01  UPCOMING   4   <-- 10 days PAST, still UPCOMING
cmt0atkzd000004jl9hai1bbp  2026-09-29  UPCOMING   4   <-- not armed
```

Attendee send state on the two UPCOMING sessions:

```
Sep 1  (cms544132000304l5z7z244q0)
  Erik Schwerman    ["supervisors","invite","reminder"]
  Hankyu Park       ["supervisors","invite","reminder"]
  Sabrina Krasnov   ["invite","supervisors","reminder"]
  Dayten Schureman  ["supervisors","invite","reminder"]
Sep 29 (cmt0atkzd000004jl9hai1bbp)
  Auggie Quintero   []     (starts 2026-10-01)
  Flynn McFarland   []     (starts 2026-09-14)
  Ryan Christensen  []     (starts 2026-09-21)
  Robert Patrick    []     (started 2026-08-24)
```

The code path, `lib/orientation/reminder.ts:333-344`:

```ts
export async function sessionsDueForReminder(dayKey?: string): Promise<{ id: string; date: Date }[]> {
  const armed = await readArmed();
  const ids = Object.keys(armed).filter((id) => armed[id]);
  if (!ids.length) return [];
  const sessions = await prisma.orientationSession.findMany({
    where: { id: { in: ids }, status: "UPCOMING" },
    select: { id: true, date: true }
  });
  const target = dayKey ?? mountainDayKey(new Date());
  return sessions.filter((s) => mountainDayKey(dayBefore(s.date)) === target);
}
```

`app/api/cron/orientation-reminder/route.ts` header states the rule explicitly:
"It only touches sessions somebody DELIBERATELY ARMED. An unarmed session is
invisible to it." The run log's eleven consecutive `nothing-due` /
`sessionsChecked: 0` entries are the positive control that the cron is alive and
firing daily — it is doing exactly what the armed map tells it to, which is
nothing.

### The public share link

`app/r/[token]/page.tsx` — no auth, token-gated only:

```ts
const link = await prisma.reportShareLink.findFirst({
  where: { token, revokedAt: null, report: "fleet-progression" },
  select: { id: true }
});
...
const [data, branding] = await Promise.all([getReportsData(), getWorkspaceBranding()]);
return <SharedFleetProgression upgrades={data.pilotUpgrades} logoDataUrl={logo} />;
```

`ReportShareLink`, whole table (1 row, not revoked):

```json
[{ "id": "cmrb0heyj000004ky6i6n5exj", "token": "xxPOzb4jgD1k-nKP",
   "report": "fleet-progression", "label": null,
   "createdBy": "aschaedig@skyshare.com",
   "createdAt": "2026-07-07T18:57:53.660Z", "revokedAt": null }]
```

`components/reports/SharedFleetProgression.tsx:33` renders
`<PilotProgressions upgrades={upgrades} />` — the **same** component the
authenticated app uses, with its own comment saying so ("Reuses the exact same
PilotProgressions component the app uses, so all the filters ... stay fully
interactive"). Inside `components/reports/ReportsWorkspace.tsx`:

- line 1127 and line 1190: `{p.name}` rendered as a `<Link href={/people/${p.hireId}}>`
- line 1134-ish: `{STAY_LABEL[reason]}` badge beside the name — the
  "why they have no move" verdict
- lines 1095-1103: a **Download CSV** button calling `downloadRoster`
- line 784, the CSV header it writes:
  `["Name","Current position","Seat","Aircraft","Full years (service)","Tenure (yr, from first role)","Start date","Left on","Upgrades","Transitions","Why no move","Possible next steps"]`

### Table census: 80 models, row counts against reading UI

Row counts from `prisma.<model>.count()` over every model in
`prisma/schema.prisma` (80 models, 0 enums):

```
CandidateQuestionnaireAnswer 20939   CandidateMetric 14702   CandidateApplication 12888
CandidateCommunication 11577   Candidate 8682   CandidateFile 6558   ImportRow 5917
CandidateTag 5450   OnboardingTask 5191   TimelineEvent 4191   PilotRequirementGate 2432
CandidateNote 1410   AuditEvent 1378   ActivityLog 914   CandidateContact 725
JobBlockInstance 539   RoleAssignment 498   NewHire 461   Interview 350
EmploymentStint 284   InterviewScorecard 282   Job 131   JobDuplicateDismissal 104
JobPost 79   Feedback 74   BusinessCardOrderLine 71   OrientationPrepTask 69
PilotRequirement 65   AvailabilityRule 59   WorkspaceSetting 55   DuplicateReviewItem 44
FeedbackImage 41   RequirementCatalogItem 38   JobMergeRecord 36   ContentBlockVersion 32
ImportBatch 30   OrientationAttendee 28   TravelItem 23   ManagedVariant 20
PilotRequirementChange 20   Tag 19   TravelReceipt 18   ContentBlock 14   TemplateToken 12
BookingType 10   BusinessCardOrder 9   BookingHost 8   PaycomConfig 8   Reward 8
TravelTrip 8   CandidateAiSummary 6   OrientationSession 6   Account 5   User 5
AvailabilityOverride 4   RecognitionValue 4   MentionNotification 3   Event 2
BusinessCardVariant 1   EventAttendee 1   GoogleCalendarConnection 1   HistoricalSource 1
OnboardingArchive 1   ReportShareLink 1   Template 1
Booking 0   EventLeadSkip 0   EventSupply 0   EventTask 0   InterviewQuestion 0
Recognition 0   RecognitionComment 0   RecognitionLike 0   Redemption 0   Session 0
SupplyItem 0   UserCandidateAccess 0   UserInvite 0   UserPermission 0   VerificationToken 0
```

Then, for every model with rows, whether anything in `app/`, `lib/` or
`components/` reads it — both `prisma.<delegate>` and the relation field name,
because a relation `include` would not match the first grep:

```
$ for m in candidateQuestionnaireAnswer candidateCommunication auditEvent timelineEvent \
  interviewScorecard businessCardOrder businessCardOrderLine travelReceipt \
  pilotRequirementChange jobMergeRecord onboardingArchive historicalSource ... ; do
    n=$(grep -rl "prisma\.$m\b" app lib components | wc -l); echo "$m files=$n"; done

candidateQuestionnaireAnswer  files_referencing=0
candidateCommunication        files_referencing=0
auditEvent                    files_referencing=6
timelineEvent                 files_referencing=1
interviewScorecard            files_referencing=2
businessCardOrder             files_referencing=0
pilotRequirementChange        files_referencing=0
historicalSource              files_referencing=0
```

Four of those are **false positives** once relations are checked, and I am
recording that because it is the trap:

- `candidateQuestionnaireAnswer` IS read — `lib/data/candidates.ts:1650`
  (`questionnaireAnswers: { ... }`) and rendered at `:1989`.
- `candidateCommunication` IS read — `lib/data/candidates.ts:1662`
  (`communications: { ... }`), `:1666` `_count`, rendered by
  `components/candidates/CandidateCommunications.tsx`.
- `interviewScorecard` IS read — `lib/data/interview-detail.ts:86`
  (`scorecards: { orderBy: { createdAt: "asc" } }`), on `/interviews/[id]`.
- `businessCardOrder` IS read, but only per person —
  `lib/data/business-cards.ts:91` `getCardOrdersForHire(newHireId)` reaches the
  order through the line's `order` relation.

Two survive as genuinely write-only:

**`TimelineEvent`, 4,191 rows, nothing reads it.**

```
$ grep -rn "timelineEvents" app lib components --include=*.ts --include=*.tsx | grep -v roadmap.ts
(end)
$ grep -rn "prisma.timelineEvent" app lib components | grep -v roadmap.ts
lib/offers/record-offer-status.ts:124:    await prisma.timelineEvent.create({
POSITIVE CONTROL, same grep shape on a relation that IS included:
lib/archive/ai-summary.ts:36:      notes: { orderBy: { createdAt: "asc" } },
lib/data/candidates.ts:1625:      notes: {
```

By origin and type: `JAZZ/APPLIED 3816`, `JAZZ/INTERVIEWED 282`,
`PAYCOM/OFFER 93`. The 93 OFFER rows are not from the Jazz importer
(`prisma/import-jazz.ts` writes only APPLIED at :298 and INTERVIEWED at :332) —
they come from `lib/offers/record-offer-status.ts:124`, so this table is still
**accruing** rows nothing will ever read. `lib/data/candidates.ts:1724` carries
the reason: "Unified timeline built from the real relations so everything links
together" — a second, derived timeline was built and this one was orphaned.

**`PilotRequirementChange`, 20 rows, written but never read.**

```
$ grep -rn "pilotRequirementChange\|PilotRequirementChange" app lib components scripts | grep -v roadmap.ts
app/api/pilot-requirements/[id]/route.ts:104:      await tx.pilotRequirementChange.create({
scripts/archive/consolidate-525-family.ts:79:  prisma.pilotRequirementChange.deleteMany({...})
```

Sample of the 20 rows:

```
changeNote "Updated pilot requirement profile."  changedBy "local-user"  2026-09-04T19:55:49Z
changeNote "Updated pilot requirement profile."  changedBy "local-user"  2026-09-04T19:53:45Z
changeNote "Updated pilot requirement profile."  changedBy "local-user"  2026-08-26T19:43:41Z
changeNote "Updated pilot requirement profile."  changedBy "local-user"  2026-08-26T19:34:58Z
changeNote "Updated pilot requirement profile."  changedBy "local-user"  2026-08-26T18:49:01Z
```

Roadmap L164 asks for exactly this feature ("History of WHY staffing numbers
changed ... keep a dated log of the reason"). The table is already being
written — but `changeNote` is a fixed string and `changedBy` is `"local-user"`
on every row, so the log that exists answers *when* and not *why* or *who*.

### Routes: 67 pages, 162 API routes, 37 nav destinations

```
$ find app -name page.tsx | wc -l      -> 67
$ find app/api -name route.ts | wc -l  -> 162
$ grep -oE 'href: "[^"]+"' lib/navigation/modules.ts | sort -u | wc -l -> 37
```

Nav destinations whose backing table has **never held a row**:

| Nav label | Route | Table | Rows |
|---|---|---|---|
| Compliments | `/compliments` | `Recognition` | 0 |
| Scheduling | `/scheduling` | `Booking` | 0 |
| Question Bank | `/interview-questions` | `InterviewQuestion` | 0 |
| Supplies | `/events/supplies` | `SupplyItem` / `EventSupply` | 0 / 0 |

Positive control that the same measurement finds populated siblings: `Events`
(`Event` 2), `Travel` (`TravelTrip` 8), `Business cards` (`BusinessCardOrder` 9).

`/compliments` alone owns **7 of the 67 page routes** (`/compliments`,
`/analytics`, `/budget`, `/celebrations`, `/feed`, `/give`, `/rewards`) with
`Recognition 0`, `Redemption 0`, `RecognitionComment 0`, `RecognitionLike 0`,
against `RecognitionValue 4` and `Reward 8` that were configured.

`/scheduling` is similar: `BookingType 10`, `BookingHost 8`,
`AvailabilityRule 59`, `AvailabilityOverride 4` all configured, `Booking 0`. And
roadmap L956 says the team still books through Calendly: "Interviews are booked
through CALENDLY, which shapes the data ... the interview event's description is
a Calendly block".

Pages with real data and no `[id]` detail route (each is one `page.tsx` only —
this is not a defect where a same-page detail pane is used, but it is where the
thin areas are):

```
$ ls app/recruiting-jobs app/pilot-requirements app/travel app/imports app/offers app/matching app/business-cards app/employees
recruiting-jobs:    page.tsx screening-actions.ts        (Job 131, 10 OPEN)
pilot-requirements: page.tsx scoring/ scoring-actions.ts (PilotRequirement 65)
travel:             page.tsx actions.ts                  (TravelTrip 8, TravelItem 23)
imports:            page.tsx                             (ImportBatch 30, ImportRow 5917)
offers:             page.tsx
matching:           page.tsx matchboard-actions.ts
business-cards:     page.tsx actions.ts                  (BusinessCardOrder 9, lines 71)
employees:          page.tsx                             (NewHire 461)
```

### Who can actually use this app

```
User, whole table:
  hbyers@skyshare.com     ADMIN
  aschaedig@skyshare.com  ADMIN
  rpaden@skyshare.com     HIRING_MANAGER
  ksherman@skyshare.com   RECRUITER
  jonathan@skyshare.com   HIRING_MANAGER
UserInvite 0   UserPermission 0   UserCandidateAccess 0
NewHire employmentStatus: ACTIVE 180, TERMINATED 264, CONTRACT 17  (461 total)
```

`workspace/module-access` (5,177 bytes, updated 2026-07-30) sets
`command-center` to `HIDDEN` for RECRUITER, HIRING_MANAGER and VIEWER, and
`app/settings/command-center/page.tsx` adds a second hard `role !== "ADMIN"`
check on top of it, with its own comment explaining why. So the roadmap is
visible to hbyers@ and aschaedig@ only.

`app/compliments/actions.ts:16` shows the recognition giver is a **form field**,
not the session:

```
giverId: z.string().min(1, "Choose who is giving the recognition."),
```

and `Recognition.giver`/`recipient` are both relations to `NewHire`, not `User`.
So peer recognition across 180 employees is, as built, a data-entry form that
only those 5 logins can reach.

### Compliance and process gaps, checked with positive controls

```
$ grep -rniE "\bi-?9\b" app lib components prisma/schema.prisma | grep -v roadmap.ts
(end)
$ grep -rniE "uniform" app lib components prisma/schema.prisma | grep -v roadmap.ts
lib/extraction/travel-email-llm.ts:190: ... a uniform fitting or a form to fill in ...
(end)
POSITIVE CONTROL, same grep shape on a task key that does exist:
$ grep -rn "drug_screen" app lib components | grep -v roadmap.ts
lib/onboarding/rounds.ts:70:    "drug_screen",
lib/onboarding/tasks.ts:67:  { key: "drug_screen", label: "Email docs to ITS ...", group: "SYSTEMS" },
lib/onboarding/tasks.ts:107:  { key: "drug_screen", short: "Drug screen sent to ITS" },
lib/onboarding/tasks.ts:167:  "email docs to its for pre-employement drug screen": "drug_screen",
```

So **I-9 is genuinely absent from the entire codebase** and uniforms have one
incidental mention inside an LLM prompt. Roadmap L476 records the I-9 item with
its legal basis ("federal rule is Section 2 within 3 business days"). Flynn
McFarland starts **Sep 14** — three days from today.

### The task-email path, restated with my own measurement

`docs/needs-a-person.md` item 1 says no task email has ever been sent. Whole
scope of `WorkspaceSetting` where `scope = 'front'` — 7 rows:

```
front/channels                       updated=2026-07-21T02:30:27.069Z  bytes=37
front/contacts-link-sends            updated=2026-09-03T14:47:22.557Z  bytes=1239
front/onboarding-sends               updated=2026-09-10T14:46:06.554Z  bytes=1717
front/orientation-sends              updated=2026-08-25T19:50:01.857Z  bytes=7043
front/orientation-summaries          updated=2026-07-28T15:50:07.381Z  bytes=387
front/supervisor-contact-template    updated=2026-09-11T19:59:09.513Z  bytes=81
front/travel-reimbursement-template  updated=2026-09-11T19:59:09.611Z  bytes=69
```

Three send logs are present and populated (`contacts-link-sends`,
`onboarding-sends`, `orientation-sends`); `front/task-email-sends` is absent.
That reproduces the `needs-a-person.md` claim independently. Meanwhile
`workspace/onboarding-task-emails` was written **tonight at
2026-09-11T23:16:51Z** and now maps five tasks to Front templates:

```json
{"custom_request_prd_access_600ce652":{"templateId":"rsp_r7mze","templateName":"1. PRD Request to Pilot",...},
 "checkin_30":{"templateId":"rsp_s32sa","templateName":"1 month employee checkin",...},
 "pilot_app":{"templateId":"rsp_s3c2i","templateName":"Pilot - Application Webform (Journey)",...},
 "ebco_form":{"templateId":"rsp_s3byy","templateName":"Pilot - Insurance Webform (Journey)",...},
 "pilot_doc_request":{"templateId":"rsp_s3bx6","templateName":"Pilot - Document Request (Journey)",...}}
```

So five templates are wired and the path has still never carried a message. The
one-minute test in `docs/needs-a-person.md` is the cheapest open item in this
whole audit.

### Live travel state, whole scope

```
TravelTrip (8):  RECRUITING_VISIT/COMPLETED 3, RECRUITING_VISIT/CANCELED 1,
                 TRAINING/COMPLETED 1, ORIENTATION/BOOKED 2, CREW/COMPLETED 1
                 INDOC: 0          INTERVIEW: 0        OTHER: 0
TravelItem (23): FLIGHT/NOT_NEEDED 12, HOTEL/NOT_NEEDED 4, CAR/NOT_NEEDED 3,
                 CAR/NEEDED 3, HOTEL/NEEDED 1
```

Rock 6's own name is "Travel Arrangements (Orientation/**Indoc** and Pilot
Initial Training)". There are still **zero INDOC trips** and exactly **one
TRAINING trip, already COMPLETED** — the same numbers the Aug 16 roadmap entry
recorded, two trips later. So both halves the rock is named after have never
been exercised, and the indoc checklist text filled in from the CPO's welcome
email has still never rendered on screen.

### The live feedback queue (5 NEW + 1 REVIEWING), four of them filed today

```
cmtx9ms2g /reports            2026-09-11T18:04:21Z  aschaedig (null user)  executive travel spend reporting: can't sort by department, tiles repeat the panel below
cmtx9lbbd /reports            2026-09-11T18:03:12Z  aschaedig (null user)  clicking a month should drive the four tiles; "Biggest month" doesn't work as a tile
cmtx9et7i /people/cmsnjbonr.. 2026-09-11T17:58:09Z  aschaedig@skyshare.com a new trip should start with NO items until added or parsed
cmtx9cvi4 /people/cmsnjbonr.. 2026-09-11T17:56:38Z  aschaedig@skyshare.com need an "indoc AND orientation" purpose; indoc cost is pilot-hiring, orientation is HR
cmthlyx3z /orientation/cms544 2026-08-31T19:05:23Z  aschaedig@skyshare.com change the email body and the time/location when a session isn't standard
cmtg6yl0f /recruiting-jobs    2026-08-30T19:17:27Z  aschaedig@skyshare.com REVIEWING - jobs page too much vertical scroll; should jobs + pilot requirements merge
```

Two of today's four are verifiable in the code right now.
`components/travel/TravelSpendYear.tsx` holds the four tiles (`Hired` :248,
`Not hired` :254, `Biggest month` :260) and a year selector
(`const [year, setYear] = useState(...)` :195) — and contains **zero** `<button>`
elements and no `onClick` anywhere:

```
$ grep -n "<button\|role=\"button\"\|cursor-pointer" components/travel/TravelSpendYear.tsx
(no output)
```

So clicking September does nothing, exactly as reported. Note also that the two
`/reports` rows carry `userEmail: null` — filed from local dev, where auth is
bypassed, so the author is not recorded. That is roadmap L882's bug showing up in
the feedback table.

### Roadmap shape

```
$ grep -c "^- \[" lib/roadmap/roadmap.ts      -> 1020
$ grep -c "^- \[x\]" lib/roadmap/roadmap.ts   ->  745
$ grep -c "^- \[~\]" lib/roadmap/roadmap.ts   ->   24
$ grep -c "^- \[ \]" lib/roadmap/roadmap.ts   ->  251
$ grep -n "^## " lib/roadmap/roadmap.ts | wc -l -> 25 sections
```

### Onboarding task catalog drift, exact

```
$ awk '/^export const ONBOARDING_TASKS/,/^\];/' lib/onboarding/tasks.ts | grep -oE 'key: "[a-z_0-9]+"' | sed 's/key: "//;s/"//' | sort > /tmp/ot.txt   # 22 keys
$ awk '/^export const MILESTONE_KEYS/,/^\];/'   lib/onboarding/tasks.ts | grep -oE 'key: "[a-z_0-9]+"' | sed 's/key: "//;s/"//' | sort > /tmp/mk.txt   # 21 keys
$ comm -23 /tmp/ot.txt /tmp/mk.txt
business_card
$ comm -13 /tmp/ot.txt /tmp/mk.txt
(empty — MILESTONE_KEYS is a strict subset)
```

I checked and rejected a wider version of this finding: `checkin_30/60/90`,
`benefits_enrolled` and `social_announcement` look missing from `MILESTONE_KEYS`
but carry their own `short` labels inside `MAINTENANCE_TASKS`
(`lib/onboarding/tasks.ts:131-139`), so they are fine. Exactly one key is short
of a label.

Live `OnboardingTask` rows hold **31 distinct keys** against those 22 + 5
maintenance + customs — the extras are user-added custom milestones
(e.g. `custom_request_prd_access_600ce652`, 6 rows).

### Candidate data, whole scope

```
Candidate 8682 total.  origin: PAYCOM 5194, JAZZ 3159, MANUAL 329
no primaryEmail             5046
no primaryPhone             5388
neither email nor phone     5043  = 58.1%
stage: null 4549, Rejected 1733, Knocked Out 1007, Saved For Later 730,
       Applied 388, Hired 120, New 97, Withdrew 37, Interviewing 9, Offer 9,
       Screening 2, Archived 1
CandidateApplication 12888. stage: null 7133, Rejected 2728, Knocked Out 1688,
       Saved For Later 1012, Applied 199, Withdrew 70, Hired 49, Offer 9
Job 131:  OPEN 10, MERGED 67, RETIRED 54
PilotRequirement 65: ACTIVE 7, INACTIVE 26, HISTORICAL 32
Interview 350: withJobId 19, withNotesHtml 48
```

The 58.1% figure the roadmap quotes at L826 is confirmed against the whole
scope, and it is now clear where it came from: 5,194 PAYCOM-origin rows.

### SOPs

`docs/sops/` holds 6 chapters plus a handbook. `docs/sops/README.md` lists five
chapters with published artifact URLs and chapter 6
(`06-travel-reimbursement.html`) as "*not published yet*" — matching roadmap
L1056. The README's own "Status (2026-07-22)" block says "All five files" were
rewritten, so the README has not been re-dated since chapter 6 was added on
Aug 16.

---

## CERTAIN - safe for a later agent to fix without re-deriving

1. **`lib/onboarding/tasks.ts:89-112` — `business_card` is the one onboarding
   task with no short label in the milestone grid.**
   `ONBOARDING_TASKS` holds 22 keys, `MILESTONE_KEYS` holds 21, and
   `comm -23` leaves exactly `business_card`.
   *Fix:* inside the `MILESTONE_KEYS` array, after the
   `{ key: "groups_drive", short: "Added to groups & drive" },` line and before
   `{ key: "drug_screen", short: "Drug screen sent to ITS" },`, insert
   `{ key: "business_card", short: "Business card ordered" },`.
   The source task is `lib/onboarding/tasks.ts:66`
   `{ key: "business_card", label: "Order business card", group: "SYSTEMS" }`,
   and placing it there keeps `MILESTONE_KEYS` in the same order as
   `ONBOARDING_TASKS`.

2. **`docs/sops/README.md:29-31` — the status block says "All five files" when
   there are six chapters.** Chapter 6 `06-travel-reimbursement.html` was added
   Aug 16 (it is listed at `README.md:25` as *not published yet*) and line 31
   still reads `All five files were rewritten in the Jul 22 accuracy audit`.
   *Fix:* change `## Status (2026-07-22)` to `## Status (2026-08-16)` and
   `All five files were rewritten in the Jul 22 accuracy audit and **republished
   to their existing URLs** the same day` to
   `Chapters 1-5 were rewritten in the Jul 22 accuracy audit and **republished
   to their existing URLs** the same day. Chapter 6 was written Aug 16 and is
   not published yet.`

3. **`components/travel/TravelSpendYear.tsx` — the month bars are not
   clickable, and the four tiles are year-level only.** The file contains no
   `<button>`, no `onClick`, and no month state; `useState` appears only at
   `:195` (`year`) and `:198` (`todayKey`). The four tiles are at `:248`
   (`Hired`), `:254` (`Not hired`), `:260` (`Biggest month`) plus the total.
   This is exactly what feedback `cmtx9lbbd` (filed 2026-09-11T18:03:12Z) asks
   to change. *Fix shape, not a one-liner:* add
   `const [month, setMonth] = useState<string | null>(null)`, make each month
   bar a `<button type="button" onClick={() => setMonth(m.key === month ? null : m.key)}>`,
   and derive the tile values from `month ? series.months.find(...) : series`.
   Per feedback, when a month is selected the `Biggest month` tile should read
   the month's rank instead ("biggest month", "2nd biggest month"). I am
   listing this as certain about **what is wrong and why**, not as a mechanical
   edit — the tile-rank wording is her requirement and is quoted above.

4. **`lib/roadmap/roadmap.ts:1113` carries a finish-by date its own text
   voids.** The line opens `Crew chart — finish by Sep 24` and later says
   `*** THIS IS NOT A ROCK, corrected Sep08 by him ... Its Sep 24 date is void.`
   It is `[~]` and sits inside `## Q3 Rocks`. This is the line the Monday
   check-in and any reader hits first. *Reported, not fixed — roadmap edits are
   the commit agent's.* The correct state per L1038-1039: rock 5 is the pilot
   upgrade / transition story, rock 6 is Travel Arrangements, and the crew chart
   is a feature with no rock date.

5. **17 of the 251 open roadmap items are not open work.** They are settled
   decisions, standing rules, or superseded status records carrying a `[ ]`
   checkbox, which inflates what the Command Center shows as remaining. Exact
   lines in `lib/roadmap/roadmap.ts`:
   - Settled decisions / standing rules: L96 (`ANSWERED, should Jobs and Pilot
     Requirements merge`), L150 (`SETTLED — Training stays ON the Crew page`),
     L152 (`STANDING CONSTRAINT — the Training tab must never scroll
     sideways`), L153 (`Training row layout is settled, do not redesign it`),
     L425 (`A CAVEAT ON THAT, worth knowing rather than fixing`), L442 (`The
     after-order steps stay in the SOP for now, by her decision`), L498
     (`SETTLED — the email safety net stays exactly as it is`), L654
     (`DROPPED, do not re-raise`), L665 (`STANDING BEHAVIOUR`), L945
     (`ANSWERED, where the interviewer list comes from`).
   - Superseded or already-fixed status records: L1041, L1046, L1068, L1069,
     L1073 (five `ADOPTION SCOREBOARD` entries, three of them labelled
     SUPERSEDED in their own text), L1049 (`THE MONDAY CHECK-IN HANGS ON A
     PERMISSION PROMPT ... FIXED the same day, see above`), L1085 (`THE ACTUAL
     Q3 WORK IS ADOPTION ... ITS TWO-ZEROES READING IS SUPERSEDED`).
   *Reported, not fixed.* The project's own rule is "Do not leave finished or
   abandoned work sitting as an open item."

6. **`TimelineEvent` is a write-only table and still growing.** 4,191 rows;
   `lib/offers/record-offer-status.ts:124` writes to it; nothing in `app/`,
   `lib/` or `components/` reads the delegate or the `timelineEvents` relation
   (grep output and positive control above). The 93 `PAYCOM/OFFER` rows post-date
   the Jazz import, so new rows accrue with no reader.
   *Fix, pick one deliberately:* either stop writing it (delete the `create` at
   `lib/offers/record-offer-status.ts:124`, since `lib/data/candidates.ts:1724`
   already derives a timeline from the real relations), or read it — the
   derived timeline at `lib/data/candidates.ts:1727` is where OFFER events
   would belong. Do not leave it half-wired.

7. **`PilotRequirementChange` is written but never read, and what it records
   cannot answer the question it was built for.** 20 rows; written at
   `app/api/pilot-requirements/[id]/route.ts:104`; no reader anywhere. Every row
   has `changeNote: "Updated pilot requirement profile."` and
   `changedBy: "local-user"`.
   *Fix:* roadmap L164 already specifies the feature. The two concrete changes
   are (a) pass the real editor instead of the literal `"local-user"` (which is
   the local-dev auth bypass leaking into stored data — same class as roadmap
   L882), and (b) capture a typed reason instead of a constant string. A reader
   UI is worthless until both land, so do them in that order.

8. **The public report share page exposes individual pilots by name, with a
   CSV export, against a recorded request not to.** `app/r/[token]/page.tsx`
   has no auth; `components/reports/SharedFleetProgression.tsx:33` renders the
   same `PilotProgressions` component as the signed-in app;
   `components/reports/ReportsWorkspace.tsx:1127` and `:1190` render `{p.name}`,
   `:1095-1103` render a `Download CSV` button, and `:784` writes a header
   including `"Name"`, `"Start date"`, `"Left on"` and `"Why no move"`. One
   non-revoked `ReportShareLink` exists (token `xxPOzb4jgD1k-nKP`, created by
   aschaedig@ on 2026-07-07). Roadmap L1038 records the pilots' request: show
   the aggregate half and not the named roster.
   *Fix, smallest correct version:* give `PilotProgressions` an
   `includeRoster` (or `anonymise`) prop defaulting to `true`, pass `false`
   from `SharedFleetProgression`, and gate both the roster list
   (`ReportsWorkspace.tsx` around `:1107-1200`) and the `downloadRoster`
   button (`:1095-1103`) on it. Leave the aggregate tiles and the filters
   alone — they are the half the pilots asked to see.
   **Whether to revoke the existing link in the meantime is his call, not
   mine** — see UNCERTAIN 1.

9. **`I-9` appears nowhere in the codebase.** Zero hits across `app/`, `lib/`,
   `components/` and `prisma/schema.prisma`, with `drug_screen` as the positive
   control returning four hits on the same grep. Roadmap L476 carries the legal
   basis. Flynn McFarland starts 2026-09-14, Ryan Christensen 2026-09-21,
   Auggie Quintero 2026-10-01.
   *Fix, the cheap version that fits the existing machinery:* add
   `{ key: "i9_section2", label: "Complete I-9 Section 2 (within 3 business days of start)", group: "SYSTEMS" }`
   to `ONBOARDING_TASKS` in `lib/onboarding/tasks.ts` and a matching
   `{ key: "i9_section2", short: "I-9 Section 2" }` in `MILESTONE_KEYS`. That
   puts it on every hire's checklist and in the grid without a migration,
   because `OnboardingTask` is keyed by string. A due-date reminder is a second,
   larger step — `MAINTENANCE_TASKS` already has the `dueDays` pattern
   (`lib/onboarding/tasks.ts:131`) if a reminder is wanted.

---

## UNCERTAIN - needs a human in the morning

1. **The Sep 29 orientation reminder will not fire, and the remedy is a live
   write I must not make.** Everything in the Headline and "What I checked" is
   measured: the armed map names only the completed Aug 4 session, the Sep 29
   session is absent from it, and `sessionsDueForReminder()` filters on that
   map. What I cannot close is **intent** — roadmap L1059 records the user
   deliberately instructing that the Sep 1 session not be armed ("too much
   changes between now and then"), so an unarmed Sep 29 session may be the same
   deliberate choice rather than an oversight. *The one thing that would close
   it:* the user (or Hannah) saying whether Sep 29 should be armed, then
   pressing the arm control on `/orientation/cmt0atkzd000004jl9hai1bbp`. The
   deadline for that is **Sep 28**, and the invitations are due Sep 15.

2. **The Sep 1 session is still `status: "UPCOMING"` ten days after it
   happened, and the Sep 29 session is its own reminder hazard because of
   that.** All four Sep 1 attendees already carry
   `["supervisors","invite","reminder"]`, so the cron's idempotency would skip
   them even if it matched — but a past session sitting as UPCOMING is wrong in
   every list that reads status, and I could not find an automatic
   status transition. *The one thing that would close it:* whoever ran Sep 1
   confirming the session completed and marking it COMPLETE, or telling us the
   transition is meant to be automatic (in which case it is a bug, not data).

3. **Brandon Edwards has `startDate 2026-09-28`, `employmentStatus ACTIVE`,
   `canceled false` — and `stage ARCHIVED`.** `stage ARCHIVED` means onboarding
   is filed away, so a person starting in 17 days is off the onboarding board.
   Roadmap (Jul 22) recorded him as having no signed offer and therefore no
   start date; he now has one. *Why I cannot close it:* I cannot tell whether
   the offer came through and the stage was never moved back, or the date was
   entered speculatively. Either way the fix is a write against a real person on
   the live database. *The one thing that would close it:* a person confirming
   his status, then setting `stage` accordingly.

4. **Whether the existing share link should be revoked tonight.** `revokedAt` is
   null and the link has been live since 2026-07-07. Revoking it is a live
   write, it breaks whatever the link was sent to, and roadmap L1038 explicitly
   calls the naming question "a policy call and his to make". *The one thing
   that would close it:* him saying revoke-now or fix-then-reissue.

5. **Rock 6 (Travel) has a finish-by of Sep 12 — tomorrow — and its remaining
   work is still unnamed.** Roadmap L1040 lists three named blockers
   (both ends of the reimbursement confirmation loop; the SOP not published;
   training travel content), and L1041 identifies "UNNAMED WORK IS THE RISK ON
   IT ... the action is getting Hannah's list written down". Four of the six
   open feedback rows are travel-shaped and were filed today, which suggests the
   list is arriving through feedback rather than as a list. *What I cannot
   close:* whether those four feedback items ARE Hannah's/Aimee's list, or
   whether more is coming. *The one thing that would close it:* asking Aimee
   and Hannah, in one message, whether the four Sep 11 feedback items are the
   whole remaining travel list.

6. **Rock 5 (pilot upgrade / transition story) has no finish-by date.** It took
   the crew chart's slot on Sep 08 but not its Sep 24 date, and the void Sep 24
   still sits on the crew-chart line. With Aimee away Oct 1-13 and her sign-off
   being the gate, an undated rock 20 days from a hard deadline is the riskiest
   scheduling fact in the section. *The one thing that would close it:* him
   naming a finish-by date for rock 5, which also tells the Monday check-in what
   to measure.

7. **The Monday check-in (Sep 14) will report the wrong rock list.** Roadmap
   L1061 says the scheduled check-in keeps its own `SKILL.md` **outside this
   tree**, so it still calls rock 6 "Crew chart" with the void Sep 24 date, and
   does not know rock 5 is now the pilot upgrade story. *Why I cannot close it:*
   that file is not in this repo and I cannot read or edit it. *The one thing
   that would close it:* editing the scheduled task's own instructions to the
   Sep 08 master list before Monday 08:35.

8. **"Jazz scorecards and evaluations were never imported" (roadmap L805) reads
   worse than the data, but the literal claim holds and I am not challenging
   it.** `InterviewScorecard` holds 282 rows with real content (interviewer
   "Aimee Schaedig", recommendation "Pass", `itemsJson` carrying 21 real
   question/rating pairs), and they ARE readable on `/interviews/[id]` via
   `lib/data/interview-detail.ts:86`. But `prisma/import-jazz.ts:326` creates
   them from `candidate_interviews.csv` question rows, and the CSV list it reads
   is `candidates, candidate_applications, candidate_documents,
   candidate_interviews, candidate_notes_and_comments, jobs, workflow_steps` —
   no `candidate_scorecards.csv` and no `candidate_evaluations.csv`. So the
   roadmap line is true about those two files. *The one thing that would close
   it:* somebody opening the Jazz export folder and saying whether
   `candidate_scorecards.csv` holds anything the 282 derived rows do not.

9. **`Interview.jobId` — a code comment says "in practice is ALWAYS null" and
   19 rows disagree.** `lib/calendar/departments.ts:161` reads "`Interview.jobId`
   is nullable and in practice is ALWAYS null", and roadmap L969 says it is
   "never populated: not by the scheduling form, not by the Google sync". Live:
   19 of 350 interviews have it. The API does accept it
   (`lib/validation/interview.ts` has `jobId`, and
   `app/api/interviews/route.ts:45` writes it), so the roadmap claim about the
   *form* and the *sync* may still be exactly right while the comment's
   "ALWAYS" is wrong. *Why I cannot close it:* I did not trace which writer
   produced those 19. *The one thing that would close it:* grouping those 19 by
   `source` — one query.

10. **`AuditEvent` has 1,378 rows and 6 writers, and I did not establish whether
    anything reads it.** `/settings/activity` reads `ActivityLog` (914 rows).
    The six `auditEvent` files are all write paths
    (`app/api/candidate-files/[id]`, `.../files/link`, `.../files`,
    `app/api/imports/files/complete`, `app/api/imports/files`,
    `app/api/interviews`, `lib/candidates/merge.ts`). If nothing reads it, it is
    a third write-only table — and a compliance-relevant one, since it tracks
    file access. *The one thing that would close it:* grepping the `AuditEvent`
    relation names and `/settings/activity`'s data loader for it, which I ran
    out of room to do.

11. **Whether the recognition programme's zero usage is the approval gate or the
    login gate.** Roadmap L1029 reads "Employee recognition: add the info and
    start building (still waiting on final approval, but can begin now)", which
    frames it as awaiting approval. But `Recognition.giverId` is a form field
    and only 5 people have logins, so even with approval it cannot be
    peer-to-peer as built. *The one thing that would close it:* him saying
    whether compliments are meant to be entered BY HR on people's behalf (in
    which case it is finished and just needs switching on) or BY employees (in
    which case it needs `UserInvite`, which has 0 rows).

---

## THE GAP LIST - what the app cannot answer that the team plainly needs it to

Each derived from evidence, with rough build size.

| # | Gap | Evidence | Size |
|---|---|---|---|
| 1 | **Nothing tracks the I-9.** A legal 3-business-day deadline with no record, no reminder, no checklist row. | Zero grep hits codebase-wide (positive control `drug_screen` = 4 hits). Roadmap L476. Three hires start in the next 20 days. | **Small** for the checklist row; medium for a due-date reminder |
| 2 | **No roster-wide view of business card orders.** 9 orders and 71 lines are imported and reachable only one person at a time. | `lib/data/business-cards.ts:91` is `getCardOrdersForHire(newHireId)` — the only reader. Roadmap L435 says the same. `cardTier` is null on all 9 (roadmap L441). | **Small** — one page over two tables that already exist |
| 3 | **No "why did this staffing number change" log, although the rows are being written.** | `PilotRequirementChange` 20 rows, write-only; every `changeNote` identical; `changedBy` = `"local-user"`. Roadmap L164 asks for exactly this. | **Small-medium** — needs a real reason field and a real author before a UI is worth building |
| 4 | **No per-person record of emails the app sent.** `CandidateCommunication` holds 11,577 rows, **all origin JAZZ** — zero app-origin rows — so "show me every email we sent Tara Ward" is still unanswerable. | `groupBy origin` returns only `JAZZ`. Roadmap L521 asked for it Jul 20. App sends live in `WorkspaceSetting` maps (`front/onboarding-sends` etc.) instead. | **Medium** — the table and `origin` field already exist; the work is writing to it at send time and one tab |
| 5 | **No list of the 449 open applications.** 359 live candidates have at least one. | Roadmap L839 ("a decisions queue and a multiple-open filter chip were both sketched and neither is built"). `CandidateApplication` 12,888 with `stage Applied 199`, `Offer 9`. | **Medium** |
| 6 | **Executive travel-spend reporting.** The tiles repeat the panel below them, nothing sorts by department, and clicking a month does nothing. | Feedback `cmtx9ms2g` + `cmtx9lbbd`, both 2026-09-11. `TravelSpendYear.tsx` has no `<button>`. Roadmap L372 calls it "a rebuild, not a tweak". | **Medium** — month interactivity is small; department sort needs a dimension travel does not carry |
| 7 | **Travel purposes cannot express "indoc AND orientation", and the billing split depends on it.** Indoc cost is pilot-hiring, orientation cost is HR; today one trip can only be one. | Feedback `cmtx9cvi4` (2026-09-11, her words). Roadmap L373. `TravelTrip.purpose` is a single string; whole scope shows `ORIENTATION 2, TRAINING 1, CREW 1, RECRUITING_VISIT 4, INDOC 0`. | **Small-medium** — one more purpose value plus the reporting split |
| 8 | **A new trip arrives pre-filled with items nobody needs.** | Feedback `cmtx9et7i` (2026-09-11) and roadmap L374. `TravelItem` 23 rows over 8 trips. | **Small** |
| 9 | **Orientation cannot say its own time and LOCATION and propagate it.** Orientation runs at multiple SkyShare sites. | Feedback `cmthlyx3z` (Aug 31, still NEW), roadmap L383 and L397 (changing the address does not change the parking directions). All 6 sessions store `SkyShare HQ, Salt Lake City`. | **Medium** — the propagation rule is a standing requirement, so it must reach email body, calendar title, description and location field |
| 10 | **Two recruiting events in the next 13 days and the module holds nothing.** | `Event` 2 (Girls in Aviation Sep 19 CONFIRMED; USU career fair Sep 24 PLANNED), `EventAttendee` 1, `EventSupply` 0, `EventTask` 0, `SupplyItem` 0. Roadmap L778 (link candidates met at an event) and L777 (cost/ROI). | **Medium** — but the *supplies* half is already built and just empty |
| 11 | **No employee logins, so anything peer-facing cannot work.** 5 users against 180 active employees; `UserInvite` 0. | Roadmap L217 (self-signup, not built), L465-471 (group access packet, parked). Gates compliments, and any future self-service. | **Large**, and partly a policy decision |
| 12 | **13 former pilots are invisible to every pilot report** because their records state no seat. | Roadmap L572 (found Sep08). `PilotRequirement ACTIVE 7` of 20 fleet positions (L92) compounds it. | **Medium** |
| 13 | **Nothing records whether a pilot was offered a move and declined.** A captain who turned down two moves looks identical to one never asked. | Roadmap L629 (found Sep08). This is rock 5's own data gap. | **Medium** |
| 14 | **No uniform tracking.** Nobody knows who needs one, what, or whether it arrived. | One incidental grep hit, inside an LLM prompt string. Roadmap L664. | **Small** |
| 15 | **No prev/next on any detail page, and the candidate back link discards the search.** Working a queue of five candidates costs ten navigations. | Roadmap L669 ("Still open from the navigation review, none of it done", Aug 3). | **Small-medium**, high frequency |

Cheapest big wins, from the rows-without-a-reader cross-reference: **#2
(business card orders)** and **#3 (requirement change history)** — both tables
are populated and both already have a roadmap entry asking for the page. **#4**
is the highest-value of the three because the table, the `origin` column and the
rendering component (`CandidateCommunications.tsx`) all already exist; only the
write at send time is missing.

---

## WHAT WOULD MOST IMPROVE THE DAY, ranked

Weighted by frequency x pain, not novelty.

1. **Arm the Sep 29 orientation and send its invitations.** *Helps:* Hannah and
   Aimee, and four new hires who currently have no idea where to go. *Replaces:*
   nothing — it is the process simply not having run. *First step:* ask whether
   Sep 29 should be armed, then press arm on
   `/orientation/cmt0atkzd000004jl9hai1bbp` and send the invite template to all
   four from the bulk bar. Invitations are due **Sep 15**.

2. **Send one task email, once, as a test.** *Helps:* everyone who will later
   rely on the checklist send path. *Replaces:* an untested path carrying five
   configured templates, two of them wired tonight. *First step:* the one-minute
   procedure already written in `docs/needs-a-person.md` item 1 — open any new
   hire, Checklist tab, **Send email**, then **Send as test to
   hrotasks@skyshare.com**. The test writes no record, so it is safe on a real
   person.

3. **Decide the pilot-name policy on the shared report, then close it.** *Helps:*
   the pilots who asked, and rock 5's remaining gate. *Replaces:* a live
   unauthenticated page naming every pilot with a CSV export. *First step:* one
   yes/no from him — revoke now, or ship the `includeRoster={false}` change
   (CERTAIN 8) and reissue.

4. **Write down what is left on travel, in one list.** *Helps:* rock 6, whose
   finish-by is tomorrow and whose risk the roadmap itself names as "unnamed
   work cannot be scoped, cut or finished". *Replaces:* requirements arriving
   one feedback row at a time — four arrived today. *First step:* one message to
   Aimee and Hannah asking whether feedback `cmtx9cvi4`, `cmtx9et7i`,
   `cmtx9lbbd` and `cmtx9ms2g` are the whole list.

5. **Put the I-9 on the onboarding checklist.** *Helps:* HR, legally. *Replaces:*
   memory. *First step:* the two-line edit in CERTAIN 9 — one
   `ONBOARDING_TASKS` entry and one `MILESTONE_KEYS` entry. Flynn McFarland
   starts Monday.

6. **Close out the Sep 1 session and fix whatever leaves a past session
   UPCOMING.** *Helps:* anyone reading an orientation list, and the reminder
   cron's own correctness surface. *Replaces:* a list that shows a session from
   ten days ago as upcoming. *First step:* mark it COMPLETE, then check whether
   a transition was meant to be automatic.

7. **Build the roster-wide business card view.** *Helps:* Aimee (she places the
   orders) and Morgan (hands them out). *Replaces:* opening people one at a time
   to reconstruct a batch. *First step:* one page over `BusinessCardOrder` +
   `BusinessCardOrderLine` listing the 9 batches with who was on each — the
   query is nearly `lib/data/business-cards.ts:91` with the `where` removed.

8. **Record app-sent emails on the person.** *Helps:* every recruiter answering
   "did we tell them?". *Replaces:* opening Front and searching. *First step:*
   write a `CandidateCommunication` row with `origin: "APP"` at the existing send
   sites (`lib/front/onboarding-email.ts` already has the recording hook for
   `WorkspaceSetting`), then stop filtering the existing
   `CandidateCommunications.tsx` panel to Jazz.

9. **Make the travel-spend month bars clickable.** *Helps:* Aimee, preparing
   anything executive-facing. *Replaces:* mental arithmetic off a bar chart.
   *First step:* CERTAIN 3.

10. **Give the 449 open applications a list.** *Helps:* whoever is meant to be
    deciding them. *Replaces:* nothing, which is the point — 359 live candidates
    have at least one open application and there is no screen that shows them
    together. *First step:* a filtered view on the candidates page rather than a
    new route, since `/candidates/views` already exists with 3 saved views.

Deliberately not on this list: the jobs/pilot-requirements merge (feedback
`cmtg6yl0f`, REVIEWING) — her standing rule is visuals before anything is
built, and roadmap L68 records it again on Sep 11. That work starts with
pictures, not code.

---

## WHAT TO STOP

Named plainly, because the project's own rule is not to leave finished or
abandoned work sitting as an open item.

1. **`/scheduling` and `/book/[slug]` — the Calendly replacement is dead.**
   `Booking` 0 rows, ever, while `BookingType` 10, `BookingHost` 8,
   `AvailabilityRule` 59 and `AvailabilityOverride` 4 sit configured. Roadmap
   L956 confirms the team books through Calendly today, and describes the
   Calendly block inside the interview event's own description. The
   `## Scheduling / Booking Links (Calendly replacement)` section carries **6
   open items** (L715-720: domain-wide delegation, confirmation emails, SMS
   reminders, reschedule links, round-robin, general meetings) for a feature
   nobody has used once. Either delete the nav item and close those six, or say
   out loud that it is parked. It is currently `FULL_ACCESS` and visible in the
   sidebar for ADMIN, RECRUITER and HIRING_MANAGER.

2. **`/interview-questions` — the Question Bank is an empty page with a nav
   item.** `InterviewQuestion` 0 rows. The page, two API routes,
   `lib/data/interview-questions.ts` and a read at
   `lib/data/interview-detail.ts:121` all exist and all read nothing. The
   irony worth acting on: the 282 `InterviewScorecard` rows contain the team's
   real question list in `itemsJson` ("To get started, can you tell me about
   yourself?", "Have you had any failed check rides or is there anything that
   could show up on your PRIA?", 21 questions per scorecard). Seed the bank from
   those, or remove the nav item.

3. **`/events/supplies` — Supplies is an empty page in front of two imminent
   events.** `SupplyItem` 0, `EventSupply` 0, `EventTask` 0. Roadmap L779
   (auto-deduct stock on completion) is queued behind a feature with no stock.
   With Girls in Aviation on Sep 19 and the USU fair on Sep 24, this either gets
   used this month or it should come off the nav.

4. **`/compliments` — 7 of 67 page routes for a programme with zero
   recognitions.** `Recognition` 0, `Redemption` 0, `RecognitionComment` 0,
   `RecognitionLike` 0 against `RecognitionValue` 4 and `Reward` 8. Do not
   delete it — the Aug 1 fix that took the roster from 28 to 173 people was real
   work and roadmap L1029 says approval is pending. But stop treating it as
   shipped, and settle UNCERTAIN 11 first: as built, the giver is a form field
   and only 5 people can reach the form, so "peer-to-peer" is not what exists.

5. **Five stale ADOPTION SCOREBOARD entries carrying `[ ]`.** L1041 (Aug 24),
   L1046 (Aug 17), L1068 (Aug 3), L1069 (Aug 2), L1073 (Jul 28). Three label
   themselves SUPERSEDED in their own text. Every one is a dated record, not
   work, and together they are the largest block of false open items in the
   rocks section — which is the section the user reads weekly.

6. **The crew chart's Sep 24 date.** Not the feature — the date. L1113 still
   opens with it while its own text voids it. A date that the line itself
   disproves is worse than no date, and the Monday check-in is still reporting
   against it.

7. **`/people/[id]/classic`.** Roadmap L448 keeps it "only until Hannah confirms
   she does not want anything off it". That was Aug 24, eighteen days ago. It is
   a whole second copy of the new-hire page, and roadmap L631 records the
   concrete cost: the gold service asterisks are now copy-pasted in three
   places, one of them `NewHireDetailWorkspaceClassic`. Ask Hannah, then delete
   it.

8. **The `prisma/schema.postgres.prisma` half-truth.** Roadmap L449 (Aug 24)
   verified it is stale — `seniorityNumber`, `orientationNotNeeded`,
   `coInterviewersJson` and `FeedbackImage` are in `schema.prisma` and not in it.
   A second schema file that is 95% right is a trap for exactly the kind of
   ad-hoc script this project runs against a live database.

---

## THE HONESTY PASS on the roadmap

Only contradictions I can evidence. Anything I could not disprove stays
unchallenged and sits in UNCERTAIN instead.

### Entries still open that the code or data shows as settled

**H1. L1049 is marked `[ ]` and its own text says it was fixed.**
> `- [ ] THE MONDAY CHECK-IN HANGS ON A PERMISSION PROMPT, and has probably never run unattended (diagnosed Aug 17, after two silent Mondays; FIXED the same day, see above)`

The entry it points at, L1047, is `[x]` ("THE MONDAY CHECK-IN'S SILENT FAILURE IS
FIXED"). One gap, two items, opposite states.

**H2. L1085 is marked `[ ]` and is labelled superseded in its first clause.**
> `- [ ] THE ACTUAL Q3 WORK IS ADOPTION, NOT BUILDING (added Jul 22) — ITS TWO-ZEROES READING IS SUPERSEDED (Aug 3)`

**H3. L1068, L1069 and L1073 are each marked `[ ]` and each says SUPERSEDED.**
> `- [ ] ADOPTION SCOREBOARD Aug 3 (SUPERSEDED by the Aug 17 entry at the top of this section, kept for the trend)`
> `- [ ] ADOPTION SCOREBOARD Aug 2 (SUPERSEDED by the Aug 3 entry above, kept for the trend)`
> `- [ ] ADOPTION SCOREBOARD Jul 28 (SUPERSEDED by the Aug 2 entry above, kept for the history)`

**H4. L431's specifics are out of date — 2 of its 3 named keys are fixed and the
counts have moved.**
> `- [ ] The milestone catalog has drifted from the task list (found Aug24) — the catalog holds 18 entries while ONBOARDING_TASKS has 21, so bg_check_info, business_card and contacts_link_sent have no short label in the grid.`

Code today: `MILESTONE_KEYS` has **21** entries and `ONBOARDING_TASKS` has
**22**. `bg_check_info` has a short label (`lib/onboarding/tasks.ts:105`,
`"BG info submitted"`) and so does `contacts_link_sent` (`:111`,
`"Contacts link sent"`). Only `business_card` is still missing. The finding is
real but one-third the size the line claims.

**H5. L826's 58 per cent is confirmed — recording it as verified rather than
contradicted.**
> `- [ ] 58 per cent of the candidate pool having no email or phone is a Paycom import problem (found Sep11)`

Measured: 5,043 of 8,682 = **58.1%** with neither `primaryEmail` nor
`primaryPhone`, and `origin PAYCOM` = 5,194. The claim holds exactly.

### Entries marked done whose supporting text the code weakens

**H6. L1113 is `[~]` with a live finish-by date its own text voids.** Quoted in
CERTAIN 4. The contradiction is internal to the line, which is why it survived.

**H7. A code comment, not the roadmap, is the wrong one on `Interview.jobId`.**
`lib/calendar/departments.ts:161`:
> `Interview.jobId` is nullable and in practice is ALWAYS null

Live: 19 of 350 rows have it set. Roadmap L969's narrower claim — that neither
the scheduling form nor the Google sync populates it — is **not** disproved by
that, so I am challenging the comment and not the roadmap entry. See
UNCERTAIN 9.

### Entries I checked and am deliberately NOT challenging

- **L805, "Jazz scorecards and evaluations were never imported."** 282
  `InterviewScorecard` rows exist and are readable, but they are built from
  `candidate_interviews.csv` at `prisma/import-jazz.ts:326`, and the importer
  reads no `candidate_scorecards.csv` or `candidate_evaluations.csv`. The literal
  claim stands. UNCERTAIN 8.
- **L1053, "there are ZERO INDOC trips in the system."** Still true — whole-scope
  purpose breakdown above, now reconciling to 8 trips rather than the 6 the entry
  recorded, with INDOC still 0.
- **L92, "Only 7 of 20 fleet positions have an ACTIVE hiring profile."**
  `PilotRequirement`: ACTIVE 7, INACTIVE 26, HISTORICAL 32. Confirmed.
- **L1038, "THERE IS NO FleetSeatTarget TABLE."** Confirmed —
  `grep -c FleetSeatTarget prisma/schema.prisma` = 0, with
  `grep -c ManagedVariant` = 2 as the positive control that the grep works.
- **Every `[x]` rock declaration.** Rocks 1-4 were declared done by the user
  himself, and the project's own STANDING PRINCIPLE (L1082, "DONE DOES NOT MEAN
  PERFECT") says a declared rock is not re-litigated. I found nothing that would
  justify reopening one, and I did not look for a reason to.

---

## THE ONE THING

**Get the Sep 29 orientation out the door this week: arm its reminder and send
its four invitations.**

Why this over the runners-up. It is the only item in this file where the cost of
inaction lands on a person outside the team — four new hires who have been told
nothing about a day they are expected to attend, one of whom (Flynn McFarland)
starts three days from now and two of whom start before the session itself. It is
measured rather than inferred: the armed map's entire contents are one completed
session, all four attendees read `sentTemplateKeys: "[]"`, and the session's own
prep checklist puts invitations at 14 days before, which was **Sep 15 — four
days away**. It costs an afternoon at most, because every piece of machinery it
needs has already run for a real cohort: the bulk send bar, the supervisors
grouping, the internal summary, the calendar event (already created for this
session, `vaqetebjs4ion68bac1huvkq60`, synced Sep 2 by hbyers@), and the
reminder cron, which fired correctly eleven days running.

It also buys the thing the rocks actually need. Orientation is a closed rock, and
a closed rock going quietly unrun three weeks before the deadline is the failure
mode this roadmap has documented twice — adoption stops the moment somebody stops
driving it. And it is the last orientation before **Oct 1**, the day the rocks are
due and the day Aimee leaves for two weeks.

The runners-up and why they lose. The pilot-name policy on the public share link
is more serious in principle, but it is **his** decision and not work anybody can
do tonight, and one more day of exposure on a link that has been live since July
changes little. The travel rock's finish-by is tomorrow, but its blocker is
genuinely unnamed work — no amount of building closes it until Aimee and Hannah
say what is left, and that request costs one message, which is why it sits at #4
on the day-improvement list rather than here. The I-9 is the highest-stakes
*missing* thing and its fix is two lines, but nobody is harmed by adding it on
Monday instead of tonight.

One sentence for him: **four people are booked into the Sep 29 orientation, none
of them has been emailed, and the automatic reminder is pointed at the Aug 4
session instead of theirs.**
