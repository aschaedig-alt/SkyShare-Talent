# Time and date integrity audit — 2026-09-11

Auditor: r1-time-date-afdc0817. Read-only all night. No git, no writes, no sends, no
browser tools. Probe scripts were run with `npx tsx` against the live database
(SELECT only) and deleted afterwards.

---

## Headline

**The project's date helpers are excellent and most of the app uses them correctly — but
three "today" computations still resolve in the server's zone, and two of them are
rendering the wrong thing on the live site right now, at 23:40 Mountain.** The worst is
`lib/data/compliments.ts:102`: `today0` is built with local-midnight getters, so on
Vercel (proven UTC below) the Celebrations page's "Today" panel rolled over to Sep 12 at
18:00 Mountain. Right now **Braydan Bengtzen (3 years), JD Bumgarner (2 years) and Olivia
Vincent (3 years) have their work anniversary today and have disappeared from the page
entirely** — they are not in "Today" and not in "Coming up" — while Ricky Lee is being
announced as today's anniversary a day early. 162 of the 365 days in the year carry at
least one celebration, so this is wrong for six hours on 162 evenings a year. Second:
`components/travel/TravelPersonCalendar.tsx:25` computes `todayKey()` from
`toISOString()`, so every person's travel calendar is highlighting tomorrow's square as
today — and its sibling `TravelHubCalendar.tsx:97` calls `officeDayKey(new Date())`
correctly on the same screen, which is the positive control that this is a miss and not a
convention.

Separately, I can **close the roadmap's open item "INTERVIEW TIMES MAY BE STORED SIX TO
SEVEN HOURS OFF IN PRODUCTION"**, which has been blocking a decision since Aug 3. The
mechanism is real and still live in `lib/validation/interview.ts:28`, but the 49 rows at
exactly `12:00:00.000Z` that were read as the damage are **not damage** — 48 of 49 are
`source=manual-writeup`, and `components/candidates/InterviewWriteUp.tsx:151` deliberately
appends `T12:00:00` to a date-only write-up as a noon sentinel. Their calendar day is
correct in Mountain. The real damaged population is **at most one row**, so fix-forward is
now clearly safe and no migration is needed.

---

## What I checked, and how

### 1. The canonical helpers (read in full)

`lib/dates/display.ts` (311 lines), `lib/dates/ordinal.ts`, `lib/dates/parse-pasted-date.ts`,
`lib/calendar/format.ts`, `lib/calendar/timezones.ts`, `lib/booking/timezone.ts`.

The project's model is explicit and correct, documented in the header of
`lib/dates/display.ts`: there are **two kinds of date**, and they must be rendered
differently.

| Kind | Stored as | Render in | Helper |
|---|---|---|---|
| MOMENT (`offerSignedAt`, a flight's `startsAt`) | real instant | `America/Denver` | `formatMomentDate`, `formatMomentTime`, `formatMomentDateTime`, `officeDayKey` |
| CALENDAR DAY (`startDate`, `orientationDate`) | midnight UTC | `UTC` | `formatCalendarDay`, `formatCalendarDayShort` |
| MIXED column (`Event.startsAt`, `TravelTrip` start) | either | per value | `zoneForValue`, `formatMixedDay`, `dayKeyOf` |

`OFFICE_TZ = DEFAULT_TIMEZONE = "America/Denver"` (`lib/calendar/timezones.ts:25`). Every
formatter in both modules pins a `timeZone`. Wall-clock → instant conversion goes through
`zonedWallClockToUtc` (`lib/booking/timezone.ts:42`), which reads the offset from
`Intl.DateTimeFormat` and **refines once across a DST transition** — so there is no fixed
offset anywhere in the sound path.

Two functions in `lib/calendar/format.ts` deliberately use local getters and are the entry
points for the bugs in section 4: `toDateTimeLocal` (line 110) and `dateAtHour` (line 117).

### 2. Positive control — the 31 `America/Denver` occurrences

```
$ grep -rn "America/Denver" --include=*.ts --include=*.tsx lib app components | wc -l
31
```

All 31, with what each governs (5 are prose inside `roadmap.ts`, leaving 26 live):

| File:line | Governs |
|---|---|
| `lib/calendar/timezones.ts:11` | the MT entry in the US timezone picker |
| `lib/calendar/timezones.ts:25` | `DEFAULT_TIMEZONE` — the root of the whole scheme |
| `lib/calendar/timezones.ts:32` | legacy label "Mountain" → IANA |
| `lib/dates/display.ts:24` | `OFFICE_TZ`, used by all 11 moment formatters |
| `lib/dates/ordinal.ts:29` | default zone for `ordinalDayLabel` ("Tuesday, August 4th") |
| `lib/extraction/travel-email-llm.ts:45,46` | airport→zone map (SLC/PVU/DEN/JAC/BZN) |
| `lib/front/orientation-summary.ts:78` | the orientation summary email's date |
| `lib/google/calendar.ts:68` | default zone on a created Google event |
| `lib/interviews/debrief.ts:51` | `TIMEZONE` for the debrief queue + `denverDayKey` |
| `lib/interviews/schedule-marker.ts:101,102` | the SCHEDULE marker event's start/end zone |
| `lib/orientation/calendar-event.ts:29` | `ORIENTATION_NORMAL.timeZone` |
| `lib/orientation/reminder.ts:23` | `ZONE` for `mountainDayKey` — the reminder's due test |
| `lib/pilotapp/runs.ts:23` | `ZONE` for the pilot-app run log's day key |
| `lib/validation/booking.ts:33` | default booking timezone |
| `lib/validation/interview.ts:45,95` | default interview timezone |
| `components/interviews/DebriefQueue.tsx:24,31` | `denverDate` / `denverTime` formatters |
| `components/orientation/OrientationCalendarPanel.tsx:365` | "last pushed" timestamp |
| `components/orientation/OrientationEmailPanel.tsx:65,84,1216,1324,1583` | send dates, health panel's last-run |
| `lib/roadmap/roadmap.ts:647,666,953,1075` | prose (not code) |

This proves the codebase knows about Denver, which is what makes a date site *without* it a
finding rather than a guess.

### 3. Every formatting site, classified

I wrote a balanced-paren scanner (not a line grep — the options object usually spans lines)
over all 759 `.ts`/`.tsx` files in `lib`, `app`, `components`, excluding `roadmap.ts`:

```
files scanned: 759
all token hits: 154
DATE/TIME formatting sites: 153
  with timeZone: 69
  WITHOUT timeZone: 84
```

84 looked bad, but 71 of those are `Number.prototype.toLocaleString()` — counts, flight
hours, points. I printed and eyeballed all 71; **zero are dates**. Examples:
`components/widgets/registry.tsx:116` `{cur.toLocaleString()} hrs`,
`components/candidates/ManageTagList.tsx:225` `{tag.live.toLocaleString()} live`.

That leaves **82 genuine date/time formatting sites, 69 with a `timeZone`, 13 without**.
My `timeZone\s*:` regex also missed the ES shorthand `{ timeZone, ...opts }`, so of the 13:

| Site | Verdict |
|---|---|
| `lib/booking/timezone.ts:11`, `:60` | FALSE POSITIVE — `timeZone` shorthand property |
| `lib/dates/ordinal.ts:31` | FALSE POSITIVE — a type annotation, not a call |
| `lib/dates/ordinal.ts:32` | FALSE POSITIVE — `{ timeZone, ...opts }` shorthand |
| `components/orientation/OrientationCalendarPanel.tsx:52`, `:53` | FALSE POSITIVE — `{ timeZone, ... }` shorthand, zone passed in |
| `components/booking/PublicBooking.tsx:64` | CORRECT — `Intl.DateTimeFormat().resolvedOptions().timeZone` deliberately detects the *invitee's* zone |
| `components/events/EventDetailWorkspace.tsx:41` | FALSE POSITIVE — line 42 passes `timeZone: zoneForValue(iso)` |
| `components/compliments/CelebrationsWorkspace.tsx:12`, `:13` | **SAFE, explained below** |
| `lib/data/compliments-budget.ts:151` | REAL, finding C9 |
| `components/events/EventDetailWorkspace.tsx:120` (x2) | REAL but theoretical, finding U6 |

`CelebrationsWorkspace.tsx:11-13` deserves the explanation because it looks wrong and is
not. It does `new Date(\`${dateYmd}T00:00:00\`)` — a date-*time* string with no zone
designator, which per spec parses as **local**, not UTC — then formats with no `timeZone`,
i.e. also local. Parse-local and format-local cancel, so the weekday is correct in any
runtime zone. The file has no `"use client"` and
`app/compliments/celebrations/page.tsx` is an async server component, so there is no
hydration surface either. Not a bug. (It is fragile: adding a `timeZone` to only one half
would break it.)

**Classification of the 69 correct ones:** `timeZone: "UTC"` appears on calendar-day
renders (`components/people/NewHireDetailWorkspace.tsx:44`,
`components/employees/EmployeesWorkspace.tsx:41,44`,
`components/people/OnboardingGridTab.tsx:38`, `lib/formatting/text.ts:106`,
`lib/onboarding/hire-email-copy.ts:27`, `lib/data/onboarding.ts:473`, and 12 more) and
`America/Denver` on moment renders. Both are correct per the table in section 1 — I
verified the column shapes against live data in section 5 rather than trusting the names.

### 4. The UTC "today" bug — the one that bites

```
$ grep -rn "toISOString()\.slice(0, *10)\|toISOString()\.split(\"T\")\[0\]" ... | wc -l
19
$ grep -rn "setHours(" ... | wc -l        -> 9
$ grep -rn "setUTCHours" ... | wc -l      -> 2
$ grep -rn "new Date()\.toISOString()" ... | wc -l -> 36
```

Adjudicated one by one. **Correct and deliberate** (not findings):

- `lib/data/orientation.ts:17` `calendarDayKey` — documented: a calendar day's day *is* its
  UTC day. Correct.
- `lib/formatting/text.ts:89`, `lib/travel/match-traveler.ts:121`,
  `app/scheduling/page.tsx:67,68`, `app/api/candidate-files/[id]/route.ts:176` — all read
  calendar-day columns. Correct. (`app/scheduling` reads `AvailabilityOverride`, the only
  two `@db.Date` columns in the schema — confirmed all 4 live rows at exact UTC midnight.)
- `lib/travel/hub-calendar.ts:172,185`, `lib/travel/schedule.ts:297` — pure day-key string
  arithmetic anchored with an explicit `T00:00:00Z`. Correct, and `hub-calendar.ts:180`
  comments that `todayKey` is *passed in* "so the server and the client cannot disagree".
- `lib/orientation/calendar-event.ts:150` `setUTCHours(+5, +30)` — adds a 5h30m **duration**,
  which is DST-safe. Not a wall-clock operation. Correct.
- 34 of the 36 `new Date().toISOString()` hits are audit timestamps (`sentAt`, `syncedAt`,
  `mergedAt`) stored as full instants. Correct.

**Real findings:** see CERTAIN 1, 2, 3, 7, 8, 9, 10 below.

### 5. Live data — read-only probes

Three scratch scripts in `scripts/` run with `npx tsx`, all SELECT-only, all deleted after.
Raw output, trimmed:

```
### PROBE RUN AT (utc): 2026-09-12T05:32:14.920Z  (MT): 2026-09-11, 23:32
### runtime local zone = America/Denver
### new Date().toISOString().slice(0,10) = 2026-09-12      <-- this machine, right now
### officeDayKey equivalent (en-CA Denver) = 2026-09-11
```

That one pair is the whole audit in miniature: the two expressions disagree *right now*.

**OrientationSession.date — all 6 rows. The reminder's correctness depends on this:**

```
cmt0atkzd...  UPCOMING  date.utc=2026-09-29T15:30:00.000Z  MT=2026-09-29 09:30  utcMidnight=false
cms54413...   UPCOMING  date.utc=2026-09-01T17:00:00.000Z  MT=2026-09-01 11:00  utcMidnight=false
cmrwrtm8z...  COMPLETE  date.utc=2026-08-04T15:30:00.000Z  MT=2026-08-04 09:30  utcMidnight=false
cmr114fii...  COMPLETE  date.utc=2026-07-07T15:30:00.000Z  MT=2026-07-07 09:30  utcMidnight=false
cmqgs1nnd...  COMPLETE  date.utc=2026-06-29T15:30:00.000Z  MT=2026-06-29 09:30  utcMidnight=false
cmqb58xmp...  COMPLETE  date.utc=2026-06-15T15:30:00.000Z  MT=2026-06-15 09:30  utcMidnight=false
>>> 0 of 6 OrientationSession.date values sit at exact UTC midnight
```

Positive control that this test discriminates, from the same probe on `Event`:

```
startsAt at UTC midnight: 1/2;  createdAt (known moments) at UTC midnight: 0/2
```

**NewHire date-column shape census, all 461 rows:**

```
startDate        nonNull= 458  atUtcMidnight= 440  other=18
orientationDate  nonNull=  45  atUtcMidnight=  42  other= 3
terminationDate  nonNull= 272  atUtcMidnight= 272  other= 0
seniorityDate    nonNull= 158  atUtcMidnight= 158  other= 0
```

The 18 "other" rows are at `06:00:00Z` / `07:00:00Z` — Mountain midnight, DST-correct
(`2024-04-08T06:00:00Z` in MDT, `2025-01-13T07:00:00Z` in MST). I checked both render
paths: read in UTC they give the right day, and read in Mountain they also give the right
day. So this mixture is harmless, and the many `timeZone: "UTC"` renders of `startDate`
are right for all 458.

**Proof that production parses a naive datetime string as UTC.** This matters because every
severity call below rests on it, and I could not read Vercel's env from here.
`components/candidates/InterviewWriteUp.tsx:151` sends the client-built string
`"2026-09-09T12:00:00"` with no offset. The stored row is:

```
id=cmtujj519...  startDateTime=2026-09-09T12:00:00.000Z  createdAt=2026-09-09T20:18:08.829Z
```

Had the server resolved that naive string in Mountain it would be `18:00:00Z`. It is
`12:00:00.000Z` exactly, 48 times over. **Production is UTC, demonstrated from live data
rather than assumed.**

**Interview hour histogram by source — this is what overturns the Aug 3 conclusion:**

```
--- source=JAZZ  n=282 ---
    MOUNTAIN-hour histogram: 01h:3 15h:9 16h:28 17h:51 18h:44 19h:36 20h:43 21h:44 22h:16 23h:8
    displayed OUTSIDE 07:00-18:00 Mountain: 194/282
    at exactly 12:00Z: 0        stored timezone values: [null]
--- source=manual-writeup  n=48 ---
    MOUNTAIN-hour histogram: 06h:48
    displayed OUTSIDE 07:00-18:00 Mountain: 48/48
    at exactly 12:00Z: 48       stored timezone values: [null]
--- source=seed-demo  n=18 ---
    MOUNTAIN-hour histogram: 09h:4 10h:3 11h:4 13h:3 14h:2 15h:2
    displayed OUTSIDE 07:00-18:00 Mountain: 0/18
    at exactly 12:00Z: 0        stored timezone values: ["America/Denver"]
--- source=local-calendar  n=2 ---
    MOUNTAIN-hour histogram: 03h:1  06h:1
    at exactly 12:00Z: 1        stored timezone values: ["America/Denver"]
```

And every interview the scheduling form could have written:

```
=== status=SCHEDULED only — what the datetime-local form produced ===
  n = 14   -> 13 are source=seed-demo, 1 is source=local-calendar
```

So: **zero production interviews were created through the `datetime-local` scheduling
form.** The 49-at-noon cluster is the write-up sentinel (48) plus one `local-calendar` row.

**TravelTrip / TravelItem:**

```
TravelTrip (8 rows): requestedArrival nonNull=3 atUtcMidnight=0
   2026-08-04T14:22:00.000Z -> MT 2026-08-04 08:22
   2026-09-01T10:00:00.000Z -> MT 2026-09-01 04:00     <-- 4am requested arrival
   2026-08-09T15:18:00.000Z -> MT 2026-08-09 09:18
 orientationDate nonNull=3 atUtcMidnight=3            (calendar days, correct)

TravelItem (23 rows, 15 with startsAt, 0 at UTC midnight):
   HOTEL   2026-09-05T06:00:00.000Z -> MT 2026-09-05 00:00   (Mountain midnight = day-only, correct)
   FLIGHT  2026-08-14T05:50:00.000Z -> MT 2026-08-13 23:50   (see UNCERTAIN 2)
```

**Recognition table is EMPTY (0 rows)**, which is why findings C3 and C9 have no present
user impact.

### 6. Scheduled behaviour (read only — I did not curl any cron)

`vercel.json`:

```json
"crons": [
  { "path": "/api/cron/calendar-sync",        "schedule": "0 8 * * *"  },
  { "path": "/api/cron/paycom-scan",          "schedule": "0 13 * * *" },
  { "path": "/api/cron/pilot-app-scan",       "schedule": "30 13 * * *"},
  { "path": "/api/cron/orientation-reminder", "schedule": "0 15 * * *" }
]
```

Vercel cron schedules are always UTC, so in Mountain these run at 02:00/01:00,
07:00/06:00, 07:30/06:30 and **09:00 MDT / 08:00 MST** respectively — each shifts by an
hour across a DST boundary. For all four that is cosmetic, because none of them keys off
the hour; what matters is that each fires exactly once per *Mountain* day, and
`15:00Z → 09:00 MDT / 08:00 MST` is the same Mountain calendar day in both halves of the
year. I checked `lib/paycom/scan.ts` and `lib/pilotapp/scan.ts` for day boundaries:

```
$ grep -n "setHours\|toISOString().slice\|startOf\|midnight" lib/paycom/scan.ts lib/pilotapp/scan.ts
(no output)
```

Both use rolling windows (`SCAN_WINDOW_DAYS = 30` in `lib/pilotapp/scan.ts:98`), which are
zone-independent.

**The orientation reminder is CORRECT.** I am stating this affirmatively because the
opposite claim cost trust in August, so here is the path line by line:

- `app/api/cron/orientation-reminder/route.ts:38` → `runDueReminders()`
- `lib/orientation/reminder.ts:209` → `sessionsDueForReminder()`
- `:333-345`: loads armed sessions with `status: "UPCOMING"`, then
  `const target = dayKey ?? mountainDayKey(new Date());`
  `return sessions.filter((s) => mountainDayKey(dayBefore(s.date)) === target);`
- `:26-34` `mountainDayKey` formats `en-CA` with `timeZone: "America/Denver"`.
- `:46-50` `dayBefore` does `d.setUTCDate(d.getUTCDate() - 1)` — subtract exactly one day
  from the instant.

Because `OrientationSession.date` is a real moment in all 6 live rows (15:30Z / 17:00Z,
never UTC midnight — measured above), `dayBefore` lands 24h earlier at the same Mountain
wall clock, and `mountainDayKey` reads the correct Mountain day. Worked example on the
live Sep 29 session: `2026-09-29T15:30Z` → `2026-09-28T15:30Z` → `mountainDayKey` =
`2026-09-28`. The reminder would go on Sep 28, the calendar day before. Correct.

*(Had `date` been stored at UTC midnight, `dayBefore` would give `00:00Z` and
`mountainDayKey` would read 18:00 the day before that — firing two days early. It is not,
so it does not.)*

The run log confirms the cron is alive, 20 records kept, one per Mountain day:

```
at=2026-09-11T15:36:18.762Z dayKey=2026-09-11 outcome=nothing-due checked=0
at=2026-09-10T15:36:17.977Z dayKey=2026-09-10 outcome=nothing-due checked=0
at=2026-09-09T15:36:19.371Z dayKey=2026-09-09 outcome=nothing-due checked=0
... (daily, unbroken, back to 2026-09-04 in the window I printed)
```

Positive control for the absence check — I listed **every** key in the scope rather than
asking whether one existed:

```
=== WorkspaceSetting scope='orientation' — EVERY key ===
rows in scope 'orientation': 4
  key=prep-defaults     updatedAt=2026-07-23T01:22:25.741Z  len=928
  key=reminder-armed    updatedAt=2026-09-01T14:16:40.256Z  len=34
     valueJson = {"cmrwrtm8z000064rmn5trtizi":true}
  key=calendar-events   updatedAt=2026-09-02T18:06:26.300Z  len=1188
  key=reminder-runs     updatedAt=2026-09-11T15:36:18.837Z  len=2701
```

See UNCERTAIN 4: the single armed id is the **COMPLETE Aug 4** session, so nothing upcoming
is armed. That is an operational observation, not a code defect.

### 7. DST

```
$ grep -rn -- "-07:00\|-06:00\|\bMST\b\|\bMDT\b" --include=*.ts --include=*.tsx lib app components | grep -v roadmap
lib/calendar/timezones.ts:12:  { value: "America/Phoenix", label: "Arizona (MST, no DST)", abbr: "MST" },
lib/interviews/schedule-marker.ts:81:  // drift by an hour twice a year the way a hard-coded -06:00 would.
app/api/auth/[...nextauth]/route.ts:7:// Auth redeploy trigger at Tue Jun  9 15:14:56 MDT 2026
$ grep -rn "getTimezoneOffset\|21600000\|25200000\|6 \* 60 \* 60 \* 1000\|7 \* 60 \* 60 \* 1000" ... lib app components
lib/interviews/debrief.ts:49:const WRITE_UP_MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;   (a 36h window, not an offset)
```

**Zero hardcoded Mountain offsets in live code.** The only three hits are a Phoenix label,
a comment explaining why an offset was *avoided*, and a deploy-trigger comment.
`getTimezoneOffset` is never called. This is genuinely clean, and
`zonedWallClockToUtc`'s second-pass refinement means the wall-clock conversions are correct
across both transitions. Nothing in this audit breaks on 2026-11-01.

### 8. HTTP spot check (read-only GETs against the dev server already on :3000)

```
GET /compliments/celebrations -> HTTP 200
GET /travel                   -> HTTP 200
GET /events                   -> HTTP 200
```

Renders without an error boundary. Per CLAUDE.md the Browser pane cannot read this app's
rendered content, and I was barred from browser tools tonight, so **I did not visually
confirm any of these screens** — the findings below are derived from the code path plus the
stored values, which for the day-boundary bugs is the stronger evidence anyway.

---

## CERTAIN — safe for a later agent to fix without re-deriving

### C1. `lib/data/compliments.ts:102` — "today" is the server's UTC day, so today's anniversaries vanish after 6pm Mountain

**This is wrong on a real screen right now.** Severity: high.

```ts
// line 101-102, inside getUpcomingCelebrations()
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
```

`getFullYear/getMonth/getDate` are local getters. Production is UTC (proven in section 5),
so from 18:00 Mountain (MDT) onward `today0` is already tomorrow. `daysUntil` for a
celebration that is genuinely today becomes `-1`, and
`:165` filters `today: daysUntil === 0` and `upcoming: daysUntil > 0` — so **-1 matches
neither and the person disappears from the page altogether.**

Measured against live data, reproducing the function exactly with the real
`CURRENT_EMPLOYEE_WHERE` (`employmentStatus: "ACTIVE", canceled: false`, 179 rows):

```
Mountain-host today0: 2026-09-11    UTC-host today0: 2026-09-12

--- 'Today' panel as a MOUNTAIN host would render it (correct) ---
   Braydan Bengtzen — anniversary 3y (2026-09-11)
   JD Bumgarner — anniversary 2y (2026-09-11)
   Olivia Vincent — anniversary 3y (2026-09-11)
--- 'Today' panel as the UTC PRODUCTION host renders it right now ---
   Ricky Lee — anniversary 2y (2026-09-12)

  DISAPPEARS from the celebrations page entirely on the UTC host:
     ✗ Braydan Bengtzen|anniversary
     ✗ JD Bumgarner|anniversary
     ✗ Olivia Vincent|anniversary

  distinct calendar days in the year that carry at least one celebration: 162
```

Affects two pages: `app/compliments/celebrations/page.tsx:7` and
`app/compliments/page.tsx:15` (the dashboard's "Celebrate this week" card, `windowDays=14`).
Both are `force-dynamic`, so every request re-renders on the server.

**Fix** — build `today0` from the Mountain calendar day. Add to the imports at the top of
`lib/data/compliments.ts`:

```ts
import { officeDayKey } from "@/lib/dates/display";
```

then replace lines 101-102:

```ts
// BEFORE
  const now = new Date();
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());

// AFTER
  // Midnight of TODAY IN MOUNTAIN, as a local-midnight Date so it lines up with
  // nextOccurrence's new Date(y, m, d) arithmetic below. Built from the Mountain
  // day key rather than the host's local getters: production runs UTC, where
  // getDate() is already tomorrow from 6pm Mountain — which dropped today's
  // anniversaries out of BOTH the today and upcoming buckets (daysUntil === -1).
  const [ty, tm, td] = officeDayKey(new Date()).split("-").map(Number);
  const today0 = new Date(ty, tm - 1, td);
```

`nextOccurrence` (`:135`), `ymd` (`:94`) and the `daysUntil` subtraction all stay as they
are — they are self-consistent local-midnight arithmetic, and the only broken input was the
anchor. No other line needs to change.

### C2. `components/travel/TravelPersonCalendar.tsx:25` — the travel calendar highlights tomorrow as today

**This is wrong on a real screen right now.** Severity: high.

```ts
const todayKey = () => new Date().toISOString().slice(0, 10);
```

Used at `:91` (`const today = todayKey()`) → `:143` (`const isToday = day === today`), which
drives the highlighted cell, and at `:52` as the fallback month to open on.
`toISOString()` is always UTC, so from 18:00 Mountain onward this returns tomorrow. At the
moment of writing (23:40 MDT) it returns `2026-09-12`; the correct answer is `2026-09-11`.

**Positive control, same feature, same screen:** `components/travel/TravelHubCalendar.tsx:97`
does it correctly — `const today = useMemo(() => officeDayKey(new Date()), []);` — so the
hub calendar highlights Sep 11 while the person calendar highlights Sep 12.

**Fix** — the file already imports from `@/lib/dates/display` on line 9:

```ts
// BEFORE (line 9)
import { clockTimeOf } from "@/lib/dates/display";
// AFTER
import { clockTimeOf, officeDayKey } from "@/lib/dates/display";

// BEFORE (line 25)
const todayKey = () => new Date().toISOString().slice(0, 10);
// AFTER
const todayKey = () => officeDayKey(new Date());
```

### C3. `lib/data/compliments.ts:224` — the recognition streak is bucketed by the server's day

Severity: low (the `Recognition` table is empty — 0 rows — so no present effect).

```ts
// :217-219
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
// :224, inside computeStreak
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
```

Both sides use the same local getters so the streak is internally consistent, but it is
anchored to the UTC day: a recognition given at 7pm Mountain counts toward the next day, so
a streak can read one day long when it should be two, or break a day early.

**Fix** — same anchor change as C1, reusing the import added there:

```ts
// BEFORE (line 224)
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
// AFTER
  const [cy, cm, cd] = officeDayKey(now).split("-").map(Number);
  const cursor = new Date(cy, cm - 1, cd);
```

and make the bucket key agree, at line 218:

```ts
// BEFORE
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
// AFTER
  return officeDayKey(d);
```

### C4. `lib/validation/interview.ts:28` and `:75` — a naive `datetime-local` string is parsed in the server's zone

Severity: high as code, **near-zero as present data damage** — which is the decision the
roadmap was waiting on.

```ts
// :28  (interviewCreateSchema)
    const start = new Date(value.startDateTime);
// :75  (interviewUpdateSchema)
      const start = new Date(value.startDateTime);
```

`startDateTime` arrives from `<input type="datetime-local">` as `"2026-09-15T14:30"` with no
offset (`components/calendar/ScheduleInterviewForm.tsx:286-289` →
`:101 String(formData.get("startDateTime") ?? "")`; edit path
`components/calendar/EditInterviewModal.tsx:227-230` → `:69`). `new Date(naive)` resolves in
the runtime zone: `14:30Z` on Vercel, `20:30Z` on a Mountain laptop. A 2:30pm interview is
stored as 2:30pm **UTC** and displays as 8:30am Mountain.

The edit path is worse than the create path, because
`EditInterviewModal.tsx:25 toDateTimeLocal` prefills from the stored instant using local
getters (browser = Mountain) and the save re-parses as UTC: **opening an interview and
saving it unchanged moves it 6 hours earlier, every time.**

The schema already carries the right zone — `:45` and `:95` default
`timezone` to `"America/Denver"` — it is simply not used for the parse.

**Fix** — use the helper that already exists. `lib/calendar/format.ts:150`
`mountainWallClockToIso(date, time)` wraps the DST-aware `zonedWallClockToUtc`. Add the
import and split the naive string:

```ts
// add at the top of lib/validation/interview.ts
import { zonedWallClockToUtc } from "@/lib/booking/timezone";
import { resolveTimezone } from "@/lib/calendar/timezones";

// a shared helper for both schemas
function wallClockToInstant(value: string, timezone?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(value.trim());
  // A string that already carries an offset or Z is unambiguous — keep it.
  if (!m || /[Zz]|[+-]\d{2}:?\d{2}$/.test(value.trim())) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return zonedWallClockToUtc(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]),
    resolveTimezone(timezone)
  );
}
```

then at line 28:

```ts
// BEFORE
    const start = new Date(value.startDateTime);
// AFTER
    const start = wallClockToInstant(value.startDateTime, value.timezone);
```

and at line 75 the same substitution. The two `Number.isNaN(start.getTime())` guards below
each become `!start ||` null checks.

**Why fix-forward is safe now.** The Aug 3 entry held this open because "making new writes
correct while old rows stay wrong could be worse than consistent". Measured tonight, there
are **no correct-path rows to become inconsistent with**: of 350 interviews, 282 are the
JAZZ import, 48 are write-ups at the noon sentinel, 18 are `seed-demo` (all stored
correctly, `tz=America/Denver`, 0/18 outside business hours), and 2 are `local-calendar`.
Zero were created by this form in production — all 14 `status=SCHEDULED` rows are
`seed-demo` (13) plus one `local-calendar`. So the only row this bug can plausibly have
written is UNCERTAIN 3.

### C5. `app/travel/actions.ts:68` — the same naive-string parse, and here it HAS hit a live row

Severity: medium-high.

```ts
// :66-70
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
```

Applied at `:204-206` to every field in `TRIP_DATE_FIELDS` (`:187-193`), which **mixes the
two kinds of date through one parser**:

- `orientationDate`, `indocStart`, `indocEnd` arrive from `toDateInput` — a date-only
  `"2026-09-15"`. `new Date("2026-09-15")` is UTC midnight by spec regardless of runtime.
  **Correct**, and confirmed: all 3 live `orientationDate` values are at exact UTC midnight.
- `requestedArrival`, `requestedReturn` arrive from `TravelPanel.tsx:726-727`, prefilled by
  its own local `toDateTimeLocal` (`TravelPanel.tsx:100-105`, local getters) and emitted by
  `DateTimeField` (`:1345-1352`) as a naive `"2026-09-01T10:00"`. **Parsed as UTC in
  production.**

Live evidence — 1 of the 3 non-null `requestedArrival` rows carries the fingerprint:

```
2026-08-04T14:22:00.000Z -> MT 2026-08-04 08:22     plausible
2026-09-01T10:00:00.000Z -> MT 2026-09-01 04:00     a 4am "requested arrival"
2026-08-09T15:18:00.000Z -> MT 2026-08-09 09:18     plausible
```

And as in C4, the prefill/save round trip shifts the value 6 hours earlier on every blur,
so simply tabbing through the field corrupts it.

**Fix** — do what the item-level field already does correctly.
`components/travel/TravelPanel.tsx:1255-1300` (`ItemWhen`) takes separate day and time
inputs and commits a real instant via `startOfOfficeDay` / `zonedWallClockToUtc`
(`:1300 void onSave(startOfOfficeDay(nextDay)?.toISOString() ?? null)`), which is why every
`TravelItem.startsAt` in the database is sane. Route the two trip fields the same way:
replace the `DateTimeField` usages at `TravelPanel.tsx:726-727` with `ItemWhen`, or at
minimum convert in the client before sending:

```ts
// components/travel/TravelPanel.tsx — replace the local toDateTimeLocal (lines 100-105)
// and the two DateTimeField call sites so the value leaving the browser is a
// full ISO instant rather than a naive wall clock.
import { mountainWallClockToIso } from "@/lib/calendar/format";

// BEFORE (line 726)
<DateTimeField label="Requested arrival" defaultValue={toDateTimeLocal(trip.requestedArrival)} onSave={(v) => onSave("requestedArrival", v)} />
// AFTER
<DateTimeField
  label="Requested arrival"
  defaultValue={trip.requestedArrival ? `${officeDayKey(trip.requestedArrival)}T${officeTimeValue(trip.requestedArrival)}` : ""}
  onSave={(v) => {
    const [day, time] = v.split("T");
    onSave("requestedArrival", day ? mountainWallClockToIso(day, time || "09:00") : null);
  }}
/>
```

(identically for `requestedReturn` on line 727; `officeDayKey` and `officeTimeValue` are
already imported in this file — see `TravelPanel.tsx:56`.) `parseDate` then receives a full
ISO with `Z` and is unambiguous, so `app/travel/actions.ts` needs no change.

### C6. `components/events/EventDetailWorkspace.tsx:585` — a task reads "overdue" from 6pm Mountain the day before it is due

Severity: medium.

```ts
const overdue = !t.done && t.dueAt && new Date(t.dueAt) < new Date();
```

`EventTask.dueAt` is written from `<Input type="date">` (`:623`) → POST `:223` →
`app/api/events/[id]/tasks/route.ts:23 new Date(body.dueAt)`. A date-only string is UTC
midnight by spec, so a task due Sep 19 is stored `2026-09-19T00:00:00Z`. Comparing that
calendar day against an instant makes it overdue as soon as the clock passes UTC midnight —
**18:00 Mountain on Sep 18** (MDT), 17:00 (MST). The same row's *label* is right, because
`:606` goes through `fmtDate` → `zoneForValue` → UTC.

**Fix** — compare calendar days, not instants:

```ts
// BEFORE (line 585)
                const overdue = !t.done && t.dueAt && new Date(t.dueAt) < new Date();
// AFTER
                // dueAt is a calendar day stored at midnight UTC; comparing it to an
                // instant made it overdue at 6pm Mountain the day before. Compare day
                // keys: its UTC day against today's MOUNTAIN day.
                const overdue = !t.done && t.dueAt && t.dueAt.slice(0, 10) < officeDayKey(new Date());
```

The file already imports from `@/lib/dates/display` at line 17 — extend it to
`import { officeDayKey, zoneForValue } from "@/lib/dates/display";`. (`YYYY-MM-DD` strings
compare correctly with `<`.)

### C7. `lib/data/events.ts:163`, `lib/data/events.ts:286`, `lib/events/front-event-scan.ts:263` — `setHours(0,0,0,0)` makes the day boundary depend on the host's zone

Severity: medium (code); no difference for the 2 live Event rows today, both future.

All three are the identical two lines:

```ts
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
```

- `lib/data/events.ts:163` → `:165 isPast` splits the Events page into Upcoming / Past.
- `lib/data/events.ts:286` → `:294 event: { ..., startsAt: { gte: cutoff } }` — a Prisma
  range filter built from a host-local midnight against a UTC column, which decides the
  "committed" counts in the stock room's reorder maths.
- `lib/events/front-event-scan.ts:263` → drops already-past event invitations.

On Vercel `cutoff` is UTC midnight; on a Mountain dev box it is 06:00Z/07:00Z. So a
calendar-day event at exactly `00:00Z` — which is the shape the event form writes, and
exactly what "Girls in Aviation day" (`2026-09-19T00:00:00.000Z`) is — is `gte: cutoff` in
production and **excluded locally**. The two environments disagree about whether today's
event counts. In production the practical effect is that a calendar-day event leaves
"Upcoming" at 18:00 Mountain on its own day.

I verified both branches against the live rows rather than asserting it:

```
  Girls in Aviation day    ref=2026-09-19T00:00:00.000Z status=CONFIRMED
      isPast with UTC-midnight cutoff (2026-09-12T00:00:00Z):      false
      isPast with Mountain-midnight cutoff (2026-09-11T06:00:00Z): false
  Utah State University... ref=2026-09-24T06:00:00.000Z status=PLANNED
      isPast with UTC-midnight cutoff:      false
      isPast with Mountain-midnight cutoff: false
```

Both future, so **no visible difference today** — this is a correctness fix, not a live
breakage.

**Fix** — in all three files, replace the two lines with the office-day helper:

```ts
// BEFORE
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
// AFTER
  // Midnight today in MOUNTAIN, not in whatever zone the host happens to run in.
  // setHours() made this UTC midnight on Vercel and 06:00Z on a dev box, so the
  // two disagreed about whether today's event counts.
  const cutoff = startOfOfficeDay(officeDayKey(new Date())) ?? new Date();
```

adding `import { officeDayKey, startOfOfficeDay } from "@/lib/dates/display";` to each of
the three files.

### C8. `lib/candidates/reactivate.ts:73` — a UTC day is written permanently into human-readable note text

Severity: low, but it is a wrong date a person reads, and it is persisted.

```ts
    const archivedOn = previousArchivedAt ? previousArchivedAt.toISOString().slice(0, 10) : "an earlier date";
```

`archivedAt` is a real moment. A candidate archived at 7pm Mountain on Sep 11 produces a
note saying "They were archived on 2026-09-12" (`:78-80`) — a date that never happened from
the team's point of view, baked into a `CandidateNote` row forever.

**Fix:**

```ts
// BEFORE (line 73)
    const archivedOn = previousArchivedAt ? previousArchivedAt.toISOString().slice(0, 10) : "an earlier date";
// AFTER
    const archivedOn = previousArchivedAt ? officeDayKey(previousArchivedAt) : "an earlier date";
```

with `import { officeDayKey } from "@/lib/dates/display";` added.

### C9. `lib/data/compliments-budget.ts:142-151` — month buckets are drawn on the host's month boundary, and the label has no zone

Severity: low (the `Recognition` table is empty, so the chart has nothing in it yet).

```ts
// :61-63
function startOfMonth(d: Date, monthsBack = 0): Date {
  return new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
}
// :142-151
    const start = startOfMonth(now, i);
    const end = startOfMonth(now, i - 1);
    const redeemed = redemptions.filter((r) => r.createdAt >= start && r.createdAt < end)...
    monthly.push({
      label: start.toLocaleDateString(undefined, { month: "short" }),
```

Two separate problems on these lines. (a) `startOfMonth` is local-midnight, so in production
the month boundary is `00:00Z` on the 1st rather than `06:00Z` — the first six hours of each
Mountain month are attributed to the previous month. (b) line 151 is the one genuine
date formatter in the codebase with **no `timeZone` at all**, and it also passes `undefined`
as the locale, so the month abbreviation depends on the host's ICU default.

**Fix:**

```ts
// BEFORE (:61-63)
function startOfMonth(d: Date, monthsBack = 0): Date {
  return new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
}
// AFTER
function startOfMonth(d: Date, monthsBack = 0): Date {
  // Anchored to the MOUNTAIN month, so the first six hours of each month are not
  // counted against the previous one on a UTC host.
  const [y, m] = officeDayKey(d).split("-").map(Number);
  return startOfOfficeDay(`${String(y).padStart(4, "0")}-${String(m - monthsBack).padStart(2, "0")}-01`)
    ?? new Date(Date.UTC(y, m - 1 - monthsBack, 1));
}

// BEFORE (:151)
      label: start.toLocaleDateString(undefined, { month: "short" }),
// AFTER
      label: new Intl.DateTimeFormat("en-US", { timeZone: OFFICE_TIMEZONE, month: "short" }).format(start),
```

(`startOfOfficeDay` needs a well-formed key, so normalise a month rollover — `m - monthsBack`
can go to 0 or negative — before formatting; the `?? Date.UTC` fallback above covers it.)
Import `officeDayKey`, `startOfOfficeDay` and `OFFICE_TIMEZONE` from `@/lib/dates/display`.

### C10. `lib/data/onboarding.ts:467-470` — the 6-week starts chart advances its window at 6pm Mountain on Sunday

Severity: low.

```ts
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const dow = (startOfToday.getUTCDay() + 6) % 7; // 0 = Monday
  const weekStart = startOfToday.getTime() - dow * DAY;
```

This one is *internally* consistent — `setUTCHours`, `getUTCDay`, and the bucket label at
`:473` (`timeZone: "UTC"`) are all UTC, which is right for `startDate`, a calendar day
stored at UTC midnight. The single flaw is the anchor: `now` is read in UTC, so between
18:00 and 24:00 Mountain on a **Sunday**, UTC is already Monday and the six-week window
slides forward one week early, dropping the current week's starts off the left edge.

**Fix** — anchor the day in Mountain and keep every other line as-is:

```ts
// BEFORE (lines 467-468)
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
// AFTER
  // The UTC midnight of TODAY IN MOUNTAIN. startDate is a calendar day at UTC
  // midnight so the rest of this block stays UTC; only the anchor was wrong,
  // which slid the window a week early on a Sunday evening.
  const startOfToday = new Date(`${officeDayKey(now)}T00:00:00.000Z`);
```

### C11. `lib/activity/logger.ts:132` — UTC day bucketing of a moment (no user impact today)

```ts
    const dateKey = activity.createdAt.toISOString().split("T")[0];
    byDate[dateKey] = (byDate[dateKey] || 0) + 1;
```

`createdAt` is a moment, so activity after 6pm Mountain lands on tomorrow's bucket.
I checked whether anything renders it:

```
$ grep -rn "byDate" --include=*.ts --include=*.tsx lib app components
lib/activity/logger.ts:125:  const byDate: Record<string, number> = {};
lib/activity/logger.ts:133:    byDate[dateKey] = (byDate[dateKey] || 0) + 1;
lib/activity/logger.ts:139:    byDate,
```

**No consumer outside the file** — the summary is built and never read. Fix it for
correctness (`officeDayKey(activity.createdAt)`) or delete the field; either way nothing
visible changes.

---

## UNCERTAIN — needs a human in the morning

### U1. 194 of the 282 JAZZ-imported interviews display outside business hours. I cannot tell whether that is wrong.

The Mountain-hour histogram for `source=JAZZ` clusters in the late afternoon and evening:

```
01h:3  15h:9  16h:28  17h:51  18h:44  19h:36  20h:43  21h:44  22h:16  23h:8
```

51 interviews reading as 5pm, 44 as 6pm, 43 as 8pm, 44 as 9pm Mountain. That is either (a)
correct — the JazzHR export carried real instants and these were genuinely late-day slots,
or (b) a uniform shift introduced by the import, or (c) a fabricated time attached to a
date-only source record. The shape argues against the `datetime-label`-parsed-as-UTC bug
specifically (that would put them at 03:00–11:00 Mountain, and only 3 rows sit before 07h),
but it does not distinguish (a) from (c). All 282 have `timezone = null`, which is itself a
hint that no zone was ever known for them.

**Why I could not close it:** there is no second source in the database to check against,
and the import script is not the authority on what the original CSV said.
**The one thing that would close it:** one known interview from the JazzHR export — a
candidate name and the time the original record showed — compared against that row's
`startDateTime`. A single example settles all 282.

Note this is the caveat the Aug 3 roadmap entry already flagged ("the plausibility window
used was 07:00-18:00 Mountain, which over-flags genuine evening interviews in the 2025
historical import"). I am confirming the over-flagging was real and quantifying it, not
resolving it. It is also **historical, completed interviews only** — nothing here changes
what anyone does tomorrow.

### U2. One TravelItem flight at 23:50 Mountain

```
FLIGHT  2026-08-14T05:50:00.000Z -> MT 2026-08-13 23:50
```

Either a genuine red-eye or a time that got shifted. Every other `TravelItem.startsAt` in
the table is plausible, and the item path is the *correct* one (`ItemWhen` →
`startOfOfficeDay`/`zonedWallClockToUtc`), which argues for "real". **What would close it:**
the booking confirmation for that trip, or asking whoever entered it.

### U3. One interview at 09:00Z (03:00 Mountain), `source=local-calendar`

```
id (local-calendar)  startDateTime=2026-06-19T09:00:00.000Z -> MT 2026-06-19 03:00
                     tz=America/Denver  status=SCHEDULED  created=2026-06-08T22:09:33.421Z
```

This is the only row in the database that carries the C4 fingerprint: a 09:00 wall clock
parsed as UTC. But it is a June record, `source=local-calendar` rather than the web form,
created during the period the calendar integration was being built, so it may equally be
test data or a hand-made row. **What would close it:** whether a real interview happened on
2026-06-19, and at what time. If it was a 9am interview, C4 has exactly one victim; if it
is test data, C4 has none.

### U4. Nothing upcoming is armed for the orientation reminder

Not a code defect — arming is a deliberate per-session choice, and CLAUDE.md is explicit
that opt-in is the design. But it is worth a human's eye, because the state looks unintended:

```
key=reminder-armed  updatedAt=2026-09-01T14:16:40.256Z
   valueJson = {"cmrwrtm8z000064rmn5trtizi":true}
```

That single id is the **Aug 4 session, status COMPLETE**. `sessionsDueForReminder`
(`lib/orientation/reminder.ts:338`) filters `status: "UPCOMING"`, so that entry can never
match, and the live **Sep 29 UPCOMING session is not armed**. Consistent with the run log,
which shows `outcome=nothing-due checked=0` every day since at least Sep 4.

I am **not** claiming a reminder will fail to send — no reminder is currently expected, so
there is nothing to fail. The question for the morning is whether the Sep 29 session is
*meant* to be armed, and whether the stale Aug 4 entry should be cleared. The in-app answer
is already built: `GET /api/orientation/reminder-health?runs=1` returns exactly this, and
`?preview=YYYY-MM-DD` dry-runs a day. I did not call it (it is authenticated, and my brief
barred curling anything matching `reminder`).

### U5. I proved production is UTC from data, but not from the deployment itself

Section 5 shows 48 rows at exactly `12:00:00.000Z` written from a client string of
`"…T12:00:00"`, which can only happen if the server resolved that naive string in UTC. That
is strong, and it is what every severity call above rests on. It is still inference from
one mechanism rather than a reading of the deployed runtime. **What would close it:** `TZ`
(or its absence) in the Vercel production environment, or one line of output from a
deployed route logging `Intl.DateTimeFormat().resolvedOptions().timeZone`. If production
were somehow Mountain, C1/C3/C7/C9/C10 would be latent rather than live — C2 and C6 would
be unaffected, because C2 runs in the browser and C6 compares two instants.

### U6. `components/events/EventDetailWorkspace.tsx:120` — a hydration-mismatch shape with no live trigger

```ts
    event.endsAt && new Date(event.endsAt).toDateString() !== new Date(event.startsAt).toDateString()
```

`toDateString()` takes no zone, and this file *is* `"use client"` — so it runs in UTC during
the server pass and in Mountain after hydration. Because the result chooses between a date
*range* and a single *long* date, a row where the two instants fall on the same UTC day but
different Mountain days would render different text on the server and the client, which is a
React hydration error. (This is the one pattern the Aug 31 sweep could not have caught: it
searched `Intl.DateTimeFormat` and `toLocale*`, and `toDateString` is neither.)

Both live Event rows are immune: "Girls in Aviation day" has `endsAt === startsAt`
(`2026-09-19T00:00:00.000Z`), so the comparison is false in every zone, and "Utah State
University" has `endsAt = null`, which short-circuits.

**Why it is uncertain rather than certain:** the fix depends on intent. For a mixed column
the right comparison is almost certainly `dayKeyOf(event.endsAt) !== dayKeyOf(event.startsAt)`
(`lib/dates/display.ts:228`, which picks the zone per value) — but whether a multi-day event
should be judged by Mountain days or by the stored calendar days is a product call, and with
two rows in the table I cannot infer it. **What would close it:** one sentence from the user
on whether a Sep 19→Sep 20 event should read as a range. Low stakes: it is cosmetic until a
two-day event with a real `endsAt` exists.

---

## Counts

| Measure | Value |
|---|---|
| Files scanned (`lib`, `app`, `components`, `.ts`/`.tsx`) | 759 |
| `America/Denver` occurrences (26 code + 5 roadmap prose) | 31 |
| Date/time formatting call sites found | 153 |
| …of which numeric `toLocaleString`, excluded after eyeballing all 71 | 71 |
| **Genuine date/time formatting sites** | **82** |
| …with an explicit `timeZone` | 69 |
| …without, before adjudication | 13 |
| …false positives (`timeZone` shorthand, type annotation, deliberate) | 11 |
| **…real formatting findings** | **2** (C9, U6) |
| Hardcoded Mountain offsets (`-07:00`/`-06:00`/`MST`/`MDT`) in live code | **0** |
| `getTimezoneOffset` calls | 0 |
| `toISOString().slice(0,10)` / `split("T")[0]` sites | 19 (17 correct, 2 findings) |
| `setHours(0,0,0,0)` sites | 9 (3 findings, 6 in client calendars) |
| `setUTCHours` sites | 2 (1 finding, 1 correct duration add) |
| Vercel crons, all scheduled in UTC | 4 |
| Crons whose day arithmetic is Mountain-correct | 4 of 4 |
| `@db.Date` columns in the schema | 2 (`AvailabilityOverride.startDate`/`endDate`) |
| **CERTAIN findings** | **11** |
| …wrong on a real screen right now | **2** (C1, C2) |
| **UNCERTAIN findings** | **6** |
| OrientationSession rows / at UTC midnight | 6 / **0** |
| Event rows / at UTC midnight (control: `createdAt` 0/2) | 2 / 1 |
| NewHire `startDate` non-null / at UTC midnight | 458 / 440 |
| Interview rows / at exactly `12:00:00Z` | 350 / 49 |
| …of those 49 explained as the write-up noon sentinel | 48 |
| Interviews created by the `datetime-local` form in production | **0** |
| TravelTrip `requestedArrival` rows / carrying the shift fingerprint | 3 / 1 |
| Named employees currently missing from Celebrations (C1) | 3 |
| Days per year C1 is wrong for ~6 hours | 162 |
