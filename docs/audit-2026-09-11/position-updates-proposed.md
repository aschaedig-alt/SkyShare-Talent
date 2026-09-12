# Proposed position updates from the recruiting workbook - 2026-09-11

## NOTHING HERE HAS BEEN WRITTEN TO THE DATABASE

This is a **proposal only**. I ran `SELECT` statements against the live Neon database and
nothing else: no insert, no update, no delete, no file, no email. The probe script I used
(`scripts/_r1-sheet-compare-probe.ts`) was deleted when I finished. Approve a row and a
later session can apply it; until then the app is exactly as it was.

Written 2026-09-12 ~01:45 MT as part of the audit the user asked to be filed under
2026-09-11.

---

## Headline

**An active G450 captain is missing from the workbook, and the seat he fills still reads as
OPEN.** Brock Tyler (legal name Joshua Brock Tyler) has been an ACTIVE SkyShare employee
since 2025-12-15 with an open `G450 Captain` role in the database. He is in the workbook's
Training Info tab (r103, "Joshua (Brock) Tyler / G450 Captain / start 12/15/2025 / CAE DFW /
Confirmed") and in Referral Bonus Info (r19, "Brock Tyler / Mickey Stateler / G450 PIC /
12/15/2025"). He is **not on the G450/G5 roster tab** - the tab that feeds the open-seat
count - which instead shows a vacant `CAPTAIN (PIC)` ordinal 4 (r9 [L359], status OPEN) and
a vacant N787JS PIC (r4 [L354]). The app holds **5** active G450 captains; the roster tab
names **4**. So whoever recruits off the G450 open-seat number is recruiting for a seat that
is already filled, and the Training Amount tab's "G450/G5 PIC 5 target / 3 open" makes it
look like three. Same failure one tab over, smaller: Devon Carter has held an open
`CJ2 Captain` role since 2026-02-21 and appears on the CJ2 roster tab nowhere (only as a
PC-12 dual-qual row, PC-12 r29).

Second, cheaper to fix and wrong in 9 places: **`NewHire.managedAircraft` is populated on 3
of 461 rows**, while the workbook names a tail for 11 people. Eight pilots who the sheet puts
on a specific managed aircraft have an empty tail in the app, and one of them (Jack
Matiasevich) cannot be filled in at all because the workbook gives two different tails for
his aeroplane.

Third, one real seat move the app has not recorded: **Matt Dahle**. Three independent tabs
say he is now a 560XL First Officer; the app still says PC-12 Captain. The roadmap already
names this exact person as the case that showed chart moves do not touch the journey.

Coverage limits, stated up front: the extraction covers 21 tabs and **cannot prove the
workbook has only 21**; `docs/audit-2026-09-11/_sheet-visible-tabs.md` **does not exist** -
I checked three times, last at 01:42 MT - so the hidden/visible question is still open and
every row below could in principle be contradicted by a tab nobody has read. The workbook
also contradicts itself on open seats in 12 of 19 comparable rows, so I have deliberately
proposed **no** change driven by a seat *count*; every row below is driven by a **named
person**. Ambiguity was low: 69 roster rows matched 68 distinct employees with **0** ambiguous
matches and 1 miss that turned out to be a sheet misspelling.

---

## Proposed changes

One row per person. Sorted most consequential first. Low-confidence rows are kept in the
table with their reason rather than dropped.

| Person | Current value in app | Proposed value | Field | Sheet tab | Sheet row | Confidence | Why |
|---|---|---|---|---|---|---|---|
| **Brock Tyler** | `G450 Captain`, ACTIVE since 2025-12-15, open role | no app change - **add his row to the SHEET** | *(sheet fix: G450/G5 roster tab)* | G450/G5 (absent); Training Info; Referral Bonus Info | G450/G5 r9 [L359] is the OPEN seat; Training Info r103 [L310]; Referral r19 [L648] | **high** | He is an active G450 captain in the app and in two other tabs of this same workbook, but not on the roster tab that produces the open-seat number. The tab shows a vacant PIC ordinal 4. Leaving it is a live recruiting error, not a tidiness issue. |
| **Matt Dahle** | `NewHire.position` = "PC-12 Captain"; only open role = `PC-12 Captain` (PIC, Pilatus PC-12, since 2025-01-13) | close `PC-12 Captain`; open `560XL First Officer` (seat SIC, aircraft Citation 560XL), effective his indoc/training date; sync `NewHire.position` | new `RoleAssignment` + `NewHire.position` | 560XL; Training Info; Training Events As Staffed | 560XL r6 [L469] (GREEN, Fractional); Training Info r140 [L347] ("XL SIC", indoc 08/13/2026 end 08/25/2026); Training Events SIC r7 [L716] (560XL) | **high** | Three tabs agree he is now a 560XL First Officer. The app still has him as a PC-12 Captain with no second role. He is also still carried as a PC-12 dual-qual (PC-12 r30), which is consistent with a transition, not with him being a PC-12 captain today. Note this is a captain→first-officer move, so it is a real downgrade in seat and must not be auto-derived as a promotion. |
| **Matt Smith** | `NewHire.position` = "PC-12 Captain", `employmentStatus` ACTIVE, `stage` ACTIVE, **`startDate` null, 0 RoleAssignment rows**; Candidate row "Matt Smith" stage **Offer**, status MERGED, PAYCOM, created 2026-06-18 | decide: either he has started (set a start date, which seeds his first role) or he has not (he should not be an ACTIVE employee yet) | `NewHire.startDate` / `employmentStatus` | Master | r139 [L140] col K: "Matt Smith PIC (Sending offer)" | **high** | The workbook says an offer is going out. The app already counts him as an ACTIVE employee with no start date and no role at all. An ACTIVE row with a null start date is invisible to the role journey and to tenure, and it inflates active headcount. This is the only ACTIVE pilot-titled row in the whole table with zero roles **and** a null start date. |
| **Sven Lepschy** | `managedAircraft` empty; open role `G450 Captain` (slug `g450-captain`) | `managedAircraft` = **N787JS**; and consider `G450 Lead Captain` | `NewHire.managedAircraft` (high) + `RoleAssignment.title` (medium) | G450/G5; Training Events As Staffed | G450/G5 r3 [L353] "Sven Lepschy (Lead)" on N787JS; Training Events r33 [L742] "Lepschy (Lead), Sven … N787JS" | **high** (tail) / **medium** (Lead) | Two tabs put him on N787JS and two write "(Lead)" into his name cell. Master r7 [L8] carries a distinct `Lead PIC` seat of 1 on N787JS, so "Lead" is a real seat here, not a nickname. `G450 Lead Captain` exists in the fleet registry (`lib/fleet/positions.ts`, status Archived). Training Info r80 [L287] says only "G450 Captain", which is why Lead is medium and not high. |
| **Carter Copeland** | `managedAircraft` empty; open role `G450 First Officer` | `managedAircraft` = **N787JS** | `NewHire.managedAircraft` | G450/G5; Training Events As Staffed | G450/G5 r3 [L353]; Training Events SIC r6 [L715] | **high** | Both tabs name the tail. `managedPilot` is already true on his record, so the app already believes he is a dedicated managed-aircraft pilot - it just does not say which aircraft. |
| **Jeff Gerrard** | `managedAircraft` empty; open role `PC-12 Captain` | `managedAircraft` = **N413UU** | `NewHire.managedAircraft` | PC-12; Training Events As Staffed | PC-12 r4 [L514]; Training Events r24 [L733] | **high** | Same pattern. `managedPilot` already true. Master r142 [L143] independently carries "PC-12 / N413UU / PIC 3 / Green 3", and the PC-12 tab names exactly three N413UU captains - Gerrard, Bohman, Francis - so the tail assignment is corroborated by the count. |
| **John Bohman** | `managedAircraft` empty; open role `PC-12 Captain` | `managedAircraft` = **N413UU** | `NewHire.managedAircraft` | PC-12; Training Events As Staffed | PC-12 r5 [L515]; Training Events r11 [L720] | **high** | As above. Training Info r93 [L300] also reads "PC-12 Captain UofU", consistent with the U-of-U managed account. |
| **Kaytlin Francis** | `managedAircraft` empty; open role `PC-12 Captain` | `managedAircraft` = **N413UU** | `NewHire.managedAircraft` | PC-12; Training Events As Staffed | PC-12 r6 [L516]; Training Events r20 [L729] | **high** | As above. |
| **Jonathan Siswick** | `managedAircraft` empty; open role `Phenom 100 Captain` with `startDate` **2026-06-11**, while `NewHire.startDate` and `seniorityDate` are both **2026-06-22** | `managedAircraft` = **N450JF**; and `RoleAssignment.startDate` 2026-06-11 → **2026-06-22** | `NewHire.managedAircraft` + `RoleAssignment.startDate` | Phenom 100; Training Info; Referral Bonus Info | Phenom 100 r3 [L578] "Jonathan Siswick (Start 06/22/2026)" on N450JF; Training Info r136 [L343] start 6/22/2026; Referral r28 [L657] start 6/22/2026 | **high** | Three tabs and his own two date columns all say 06/22/2026. His first role starts 11 days before he was hired, which makes his tenure and his journey timeline both wrong. One of only 7 non-terminated rows in the whole table whose first role predates their hire date. |
| **Truman Nelson** | `managedAircraft` empty; open role `Phenom 100 First Officer` | `managedAircraft` = **N450JF** | `NewHire.managedAircraft` | Phenom 100 | r3 [L578] "Truman Nelson (Start 05/11/2026)" on N450JF | **high** | Named tail; `managedPilot` already true. His 05/11/2026 start matches `NewHire.startDate` exactly, so this row needs no date work. |
| **Will Page** | `managedAircraft` empty; open role `Phenom 300 First Officer`, CONTRACT | `managedAircraft` = **N409KG** | `NewHire.managedAircraft` | Phenom 300e / Longitude; Training Events As Staffed | r3 [L605]; Training Events SIC r23 [L732] | **high** | His captain on the same aeroplane, Matt Garner, **already carries N409KG in the app** - one of the only 3 tails populated. So the correct value is proven by a sibling row, not just by the sheet. |
| **Hankyu Park** | open role title `Gulfstream G200 First Officer` (slug `g200-first-officer`, seat SIC) | `G200 First Officer` | `RoleAssignment.title` | G200; Training Info; Training Events As Staffed | G200 r6 [L443]; Training Info r3 [L210]; Training Events SIC r24 [L733] | **medium** | Cosmetic but it is the only non-canonical spelling of this title anywhere: 3 other open roles say `G200 First Officer` and his own `NewHire.position` already says `G200 First Officer`, so his profile and his journey disagree with each other. The fleet registry's canonical title is `G200 First Officer`. |
| **Alex Andrade** | **two** open roles: `PC-12 Captain` (2025-11-03, HIRE) and `Assistant Director of Training` (2026-04-29, PROMOTION). `NewHire.position` = "PC-12 Captain" | close one of them - almost certainly `PC-12 Captain` on 2026-04-29 - or record the dual role the way Devon Carter's is recorded | `RoleAssignment.endDate` | PC-12; Training Events As Staffed; Training Info | PC-12 r11 [L521] (GREEN); Training Events r6 [L715]; Training Info r98 [L305] | **medium** | One of only 2 people in the table with two open roles. Because the codebase resolves "current role" to the open role with the newest start date, the app currently reports him as `Assistant Director of Training` with **no pilot seat**, so he drops out of pilot reporting entirely - while the workbook still flies him as a PC-12 PIC. Which role is the real current one is his call, which is why this is medium, but the two-open-roles state is definitely wrong. |
| **Jack Matiasevich** | `managedAircraft` empty; open role `M2 Captain` (since 2026-04-16); `NewHire.position` = "M2 Captain & PC-12 Captain" | tail: **cannot be stated** - the workbook gives N782PD and N785PD for the same aeroplane. Title: consider `M2 Lead Captain` | `NewHire.managedAircraft` (low) + `RoleAssignment.title` (medium) | M2; Master; Training Info; Sign-on/Relo Bonus | M2 r3 [L568] = N782PD; Master r133 [L134] = N785PD; Training Info r128 [L335] "M2 Lead Captain"; Master r128 [L129] `Lead PIC` 1/1/0/0 | **low** (tail) / **medium** (Lead) | Do not guess the tail. Two tabs, one digit apart, each string appearing exactly once in the workbook. The Lead designation is better supported: Training Info calls him "M2 Lead Captain" and Master carries a dedicated `Lead PIC` seat on the M2 & PC-12 block. His `NewHire.position` already records the dual M2/PC-12 arrangement, which Master r134 [L135] dates ("As of 04/07: SIC for M2 and PIC for PC-12") - and note that note says **SIC** for the M2, which his app record and the M2 roster tab both contradict. |
| **Erik Schwerman** | open role `CJ3+ Captain` with `seat` **null**, `fleetPositionSlug` **null**, `aircraft` **null** | add a CJ3 position to `FLEET_POSITIONS.md` + `lib/fleet/positions.ts`, then set seat PIC | `RoleAssignment.seat` / fleet registry | CJ3? Utah; Training Info; Sign-on/Relo Bonus | CJ3? Utah r3 [L548] (IN-TRAINING); Training Info r141 [L348]; Sign-on/Relo r16 [L687] | **medium** | The fleet registry has no CJ3 entry, so his title resolves to nothing and his seat is null. He is a real, ACTIVE, managed pilot (`managedPilot` true) in training on a CJ3, and Master r106 [L107] carries a CJ3/+? PIC seat of 1. A null seat means he is invisible to every pilot report - the same class of exclusion `ExcludedPilots` in `lib/data/employee-journey.ts` was built to count. |
| **Devon Carter** | **two** open roles: `Assistant Chief Pilot` (2025-05-08) and `CJ2 Captain` (2026-02-21). `NewHire.position` = "CJ2 Captain \| Assistant Chief Pilot". Also **absent from the CJ2 roster tab** | confirm the two open roles are deliberate; and add his row to the CJ2 roster tab in the SHEET | `RoleAssignment.endDate` (low) + *(sheet fix: CJ2 tab)* | CJ2 (absent); Training Info; PC-12 | Training Info r108 [L315] "CJ2 Captain / Internal"; PC-12 r29 [L539] dual-qual | **low** (app) / **medium** (sheet) | Unlike Alex Andrade, his `NewHire.position` deliberately names both roles, so two open roles may be how a flying-plus-management person is meant to be modelled here - I am not proposing a close. The sheet side is the real gap: he is a CJ2 captain per Training Info and per the app, and the CJ2 roster tab does not list him, which is one of the two reasons the CJ2 PIC count in the app (10) exceeds the roster tab's named GREEN captains (6). |
| **Jeff Gerrard** *(second, separate item)* | open role `PC-12 Captain` | possibly `PC-12 Lead Captain` | `RoleAssignment.title` | Training Info | r49 [L256] "PC-12 Lead Capt" | **low** | Only one tab says Lead, it is his 2024 training row, and the PC-12 roster tab r4 [L514] lists him under plain `CAPTAIN (PIC)`. There is also **no** `PC-12 Lead Captain` in the fleet registry, so applying this would need a registry entry first. Kept in the table because Master r128 [L129] does carry a `Lead PIC` seat in the OGD PC-12 world and somebody holds it. |
| **Sven Lepschy** and **Carter Copeland** *(location only)* | `location` = **HND** for both | possibly SLC | `NewHire.location` | Master | r12 [L13] puts the G450/G5 block's base at SLC | **low** | HND is the only location either record carries and they are the only two G450 crew with it, so it looks deliberate (a managed-client crew based elsewhere) rather than a typo - the workbook simply never states a per-person base. Do not change this without asking; I am recording it only so nobody later "fixes" it off the aircraft block's base. |

### Not proposed, and why

I deliberately did **not** propose:

- **Any change driven by a seat count.** Master, Training Amount, the roster-tab headers and
  Staffing Change Notes r4 carry four different target sets and disagree on 12 of 19
  comparable seat rows. Every row above is driven by a named person on a named row.
- **`NewHire.location` from an aircraft's base.** The roster tabs carry no per-person base.
  Deriving one from the aircraft block would be my inference presented as the sheet's
  statement. 13 ACTIVE/CONTRACT rows have a null location and the sheet cannot fix them.
- **`managedPilot` flips.** 17 ACTIVE/CONTRACT rows have `managedPilot` true with no tail,
  and several of them are genuinely fractional/ONION rather than on a dedicated tail
  (Zach Davis, Jaren Smith). The flag is editable per pilot by design and the sheet does not
  cleanly say which pool a person is in.
- **Anything for a TERMINATED person.** Training Info's archive (104 rows below the ARCHIVED
  divider) carries historical seats for people who have left; correcting their last title
  changes nothing anybody will act on.

---

## Agrees already - no change needed

**57 of 69 roster rows agree**, matched to 57 distinct employees, on both airframe and seat.
This is the positive control: a short proposal list above is only meaningful next to this.

G450/G5 (7): Patrick Bauder PIC, Robbie Allen SIC, Aleksandar Kostic PIC *(matched via
legalName)*, Mark Harris SIC, Brett Moreland PIC, Nick Hastings SIC, Joel Garcia SIC.

Legacy 650 (2): Nick Carter PIC, Russ Hermian PIC *(matched via the alias map -
"hermian"→"herman")*.

G200 (10): Aman Lal PIC, Fabio Alves SIC, Eric Fowles PIC, Maka Bailey SIC, Shawn Schiele PIC,
Hanku Park SIC *(alias)*, Josh Thompson PIC, Dayten Schureman SIC, Richard Vance PIC, Kat
Larson PIC.

560XL (9): Zach Davis PIC (XLS+/ONION), Jaren Smith SIC (XLS+/ONION), David Gandolfi PIC,
Bailey Barcelon SIC, Kevin Smith PIC, Rob Bell PIC, Ben Fleckenstein PIC, Ian Marks PIC,
Carl Wiltse PIC.

CJ2 (10): Bryan Thomas PIC, Brooke Kirchner SIC, Jeremy McGraw PIC, Ben Pobanz SIC, Ben
Butler PIC, Luke Diederich SIC, Kyle Ferrin PIC, Parker Hale SIC, Kylee Madsen PIC, Landon
Roberts PIC.

PC-12 (17): Shad Guffey PIC **with N418T already in the app**, Daniel Blanc PIC, Karina
Wilson SIC, Chris Geradine PIC, Parker Potter SIC, Alvaro Martin PIC, Branigan Hughes SIC,
Michael Salvagnini SIC, Corby Alexander PIC, Nick Lembo SIC *(matched last+first-initial:
sheet "Nick Lembo" → app "Nicholas Lembo")*, Nick Beine PIC, Adrienne Vaughn PIC, Nicholas
Zehr PIC *(last+first-initial: → app "Nick Zehr")*, Ren Carter PIC, Elijah Hall PIC, Caleb
Green PIC, Jake Thacker PIC *(alias → app "Jacob Thacker")*.

Single-seat tabs (2): Erik Schwerman PIC (CJ3? Utah), Matt Garner PIC **with N409KG already
in the app** (Phenom 300e).

*(7 + 2 + 10 + 9 + 10 + 17 + 2 = 57.)*

Also agreeing outside the roster tabs, worth recording because they are the ones most often
re-asked:

- **Training Info**: 97 distinct people compared (its latest row per person). **83 agree**
  with the app's current role on both airframe and seat, 13 differ, 1 is the Wulderlich
  misspelling. Of the 13 that differ, 11 are explained by Training Info being an archive of
  what somebody trained *into* at the time (Kevin Smith's "XL First Officer" from 2025 vs his
  2026 captain upgrade; Will Page's "CJ2 FO" from 2024 vs his Phenom 300 seat; Alec Smith,
  Erik Holmgren, Craig Little, David Costa, Nick Carter, Russ Herman, Brett Moreland and Erik
  Schwerman whose position cells state no seat at all; Jacob Thacker, whose Training Info row
  is his PDP first-officer entry and whose app role is the captain upgrade effective
  2026-09-18). The remaining **2 are the real ones: Matt Dahle and Alex Andrade.**
- **Training Events As Staffed**: 70 rows compared, 62 distinct people. **52 rows agree**
  outright, 17 differ, 1 is the Wulderlich misspelling. Of the 17 that differ, **9 are a
  dual-qualified pilot's *second* aircraft** - Butler Benjamin (PC-12 as well as CJ2), Carter
  Devon (PC-12 as well as CJ2), Gandolfi David (CJ2 as well as 560XL), Harrington Jerry (CJ2
  as well as G200), Madsen Kylee (PC-12 as well as CJ2), Roberts Landon (PC-12 as well as
  CJ2), Shafer Dayne (PC-12 as well as CJ2), Thompson Josh (CJ2 as well as G200), Wiltse Carl
  (CJ2 as well as 560XL) - correct in both places and not a disagreement at all. **6 more are
  the tail-empty rows already in the table above** (Bohman, Copeland, Francis, Gerrard,
  Lepschy, Page). That leaves **Alex Andrade and Matt Dahle** again, by the same two causes.
  Two tabs, two independent passes, the same two names: that is the strongest evidence in this
  file that those two rows are real and the rest of the "differences" are not.
- **Sign-on/Relo Bonus + Referral Bonus Info**: 34 distinct names, **33 found** in the app.
  The single miss is Fred Saadat, explained below.

---

## In the sheet, not matched to any employee record

Three names out of the whole extraction. Each was then checked against the `Candidate` table
(8,682 rows), which closes all three.

1. **"Gavin Wulderlich"** - PC-12 r17 [L527] (PIC, GREEN) and Training Info r115 [L322]
   (PC-12 Captain, start 2/16/2026) and Training Events r56 [L765]. **This is a sheet
   misspelling of Gavin Wunderlich.** Positive control, same query in both directions:

   ```
   substring "Wulderlich" -> 0 row(s): NONE
   substring "Wunderlich" -> 1 row(s): "Gavin Wunderlich" [Gavin Isaiah Wunderlich] (ACTIVE, PC-12 Captain)
   Candidate.displayName contains "Wulderlich" -> 0 row(s)
   Candidate.displayName contains "Wunderlich" -> 1 row(s)
       "Gavin Wunderlich" | title=PC-12 Captain | stage=Hired status=ACTIVE origin=MANUAL | created 2026-07-22
   ```

   The app record's `startDate` is **2026-02-16**, which is the sheet's own start date for
   him, and his position is **PC-12 Captain**, which is the sheet's own position. Same person,
   three matching facts, one wrong letter. **Fix the sheet** - the app is right. The
   misspelling appears on three separate tabs, so it needs correcting three times.

2. **"Augustus Hickman"** - Master r142 [L143] col L, "(Cory Referral)", sitting on the
   N413UU PIC row. Not a NewHire. **He is a live candidate**:

   ```
   Candidate.displayName contains "Hickman" -> 2 row(s)
       "Ian Hickman" | stage=Rejected status=ACTIVE origin=PAYCOM | created 2026-09-10
       "Augustus Hickman" | stage=Saved For Later status=ACTIVE origin=MANUAL | created 2026-08-07
   ```

   Correctly absent from the employee table - he is at "Saved For Later". No change needed
   anywhere; recorded so nobody creates an employee row for him.

3. **"Fred Saadat"** - Sign-on/Relo Bonus r3 [L674], a $10,000 + $10,000 sign-on with both
   payments FALSE. Not a NewHire. **He withdrew:**

   ```
   Candidate.displayName contains "Saadat" -> 2 row(s)
       "Fariborz saadat" | stage=Applied status=ACTIVE origin=MANUAL | created 2026-07-27
       "Fred Saadat" | stage=Withdrew status=ACTIVE origin=MANUAL | created 2026-07-06
   ```

   So the bonus tab is carrying $20,000 of unpaid sign-on against somebody who withdrew. That
   is a **sheet** cleanup, not a database change, and it is the kind of row that makes a
   budget look wrong. (There is also a second, separate "Fariborz saadat" candidate created
   three weeks later - possibly the same human re-applying, which is his call, not mine.)

Also in the sheet and not an employee, found the same way: **"Cayden Christensen"**, Master
r143 [L144] col L on the PC-12 CAPTAIN/FIRST OFFICER header row.

```
Candidate.displayName contains "Cayden" -> 3 row(s)
    "Cayden Neimoyer"    | stage=Rejected       status=ACTIVE   origin=PAYCOM | created 2026-09-10
    "Cayden Christensen" | stage=Rejected       status=ACTIVE   origin=JAZZ   | created 2024-08-10
    "Cayden Thompson"    | stage=null           status=ARCHIVED origin=JAZZ   | created 2024-04-25
```

He was **rejected in 2024** and his name is still written into the live PC-12 block of the
Master tab. Another sheet cleanup.

### First-name-only people I did not try to resolve

Master col A r2 holds the bare word **"Evan"**, and Master r39 [L40] reads "Evan has the green
light for PIC (Not Lead)" against the Challenger 350. Staffing Change Notes names **David,
Tommy, Jerry, Hank, Harry, Cory** with no surnames. I did not guess. For the record, a
substring search for "Evan" in the employee table returns four people - Adam **Evan**s
(CONTRACT, terminated 2019), D**evan** Stewart (TERMINATED), **Evan** Futran (ACTIVE, SkyOps
Team Lead) and **Evan** Marshall (TERMINATED, 2018) - **none** of whom is a plausible
Challenger 350 captain candidate, so "Evan" is most likely someone not yet in the app at all.
The project's own `skyshare-email-to-name-map` note is explicit that guessing a surname here
has been a mistake before.

---

## In the app, not mentioned in the sheet

**81 ACTIVE or CONTRACT employees hold a pilot seat in their current role. 10 are not on any
roster tab. 5 are not named anywhere in the 21 tabs at all.** Raw output:

```
sheet-elsewhere(trainingInfo,bonus) | "Brock Tyler" [legal Joshua Brock Tyler] | pos="G450 & GV Captain" curRole="G450 Captain" seat=PIC loc="Home-Based" tail="" managedPilot=false ACTIVE/ARCHIVED start=2025-12-15
sheet-elsewhere(trainingInfo)       | "David Costa"      | pos="GV PIC (contract)"          curRole="NONE"                     seat=PIC loc=""    tail=""       managedPilot=true  CONTRACT/ARCHIVED start=null
NOT-IN-SHEET-AT-ALL                 | "David Ricks"      | pos="Chief Pilot / CJ2 Captain"  curRole="Chief Pilot / CJ2 Captain" seat=PIC loc="OGD" tail=""      managedPilot=false ACTIVE/ARCHIVED   start=2018-08-01
NOT-IN-SHEET-AT-ALL                 | "Gavin Wunderlich" [legal Gavin Isaiah Wunderlich] | pos="PC-12 Captain" curRole="PC-12 Captain" seat=PIC loc="OGD" tail="" managedPilot=false ACTIVE/ARCHIVED start=2026-02-16
NOT-IN-SHEET-AT-ALL                 | "Jon Murdoch"      | pos="PC-12 Captain"             curRole="NONE"                     seat=PIC loc=""    tail=""       managedPilot=false CONTRACT/ARCHIVED start=2019-01-01
sheet-elsewhere(masterNotes)        | "Matt Smith" [legal Matthew Kevin Smith] | pos="PC-12 Captain" curRole="NONE" seat=PIC loc="OGD" tail="" managedPilot=false ACTIVE/ACTIVE start=null
NOT-IN-SHEET-AT-ALL                 | "Morri Harames"    | pos="G200 Captain"              curRole="G200 Captain"             seat=PIC loc="SLC" tail="N366FB" managedPilot=true  CONTRACT/ARCHIVED start=2023-06-26
sheet-elsewhere(trainingInfo)       | "Rick Benik"       | pos="G200 Captain"              curRole="G200 Captain"             seat=PIC loc="SLC" tail=""       managedPilot=true  CONTRACT/ARCHIVED start=2023-12-01
sheet-elsewhere(trainingInfo,bonus) | "Teren Christensen"| pos="CE-525 Captain"            curRole="CJ2 Captain"              seat=PIC loc=""    tail=""       managedPilot=true  CONTRACT/ARCHIVED start=2021-10-25
NOT-IN-SHEET-AT-ALL                 | "Ward Holbrook"    | pos="PC12 PIC"                  curRole="NONE"                     seat=PIC loc=""    tail=""       managedPilot=false CONTRACT/ARCHIVED start=2019-02-02
### ACTIVE/CONTRACT pilot-seated: 81; NOT on a roster tab: 10; not named anywhere in the 21 tabs: 5
```

Reading that list honestly:

- **Brock Tyler** is the one that costs money - see the Headline. "sheet-elsewhere" means the
  workbook knows him (Training Info r103, Referral r19); only the roster tab that drives the
  open-seat count does not.
- **Gavin Wunderlich** reads as "NOT-IN-SHEET-AT-ALL" only because the sheet spells him
  Wulderlich. He is in the sheet three times. Not a gap.
- **David Ricks** (Chief Pilot / CJ2 Captain, since 2018) and **Morri Harames** (CONTRACT G200
  Captain on N366FB) are both already on the project's open list - the
  `pending-employee-date-corrections` note is waiting on the user for David Ricks's chief-pilot
  dates and Morri Harames's term date. Their absence from a hiring tracker is expected.
- **David Costa**, **Jon Murdoch**, **Ward Holbrook**, **Rick Benik**, **Teren Christensen**
  are CONTRACT pilots; the roster tabs count staffed seats, not contractors. Four of these
  five have **no open role at all** (`curRole="NONE"`), which is a separate app-side gap
  listed under Data problems.
- **Matt Smith** is in the table above.

Conversely, in the **other** direction: of the sheet's 69 primary roster rows, every single
one matched an employee except the Wulderlich misspelling. There is no roster-tab pilot the
app has never heard of.

---

## Ambiguous - needs a human to say which person is meant

**Zero ambiguous matches on the 69 primary roster rows**, and zero on the Training Info and
Training Events passes. That is better than this project's history would predict, so here is
why, and where the risk still sits.

The app's non-terminated roster carries **13 surnames shared by two or more people**:

```
bell:        "Joseph Bell" (Flight Coordinator) | "Rob Bell" (560XL Captain)
bengtzen:    "Braydan Bengtzen" | "Cory Bengtzen" (Founder & CEO) | "Jaxon Bengtzen"
carter:      "Devon Carter" (CJ2 Captain | Asst Chief Pilot) | "Nick Carter" (Legacy 650 Captain) | "Ren Carter" (PC-12 Captain)
christensen: "Ryan Christensen" (Maintenance Technician) | "Teren Christensen" (CE-525 Captain)
heinze:      "Benji Heinze" | "Ethan Heinze"
hughes:      "Branigan Hughes" (PC-12 First Officer) | "Chantil Hughes" (Customer Service Supervisor)
mitchel:     "Chip Mitchel" (Director of Fractional Sales) | "Harry Mitchel" (VP of Flight Operations | DO)
page:        "Jackson Page" (Line Service Technician) | "Will Page" (Phenom 300 First Officer)
schaedig:    "Aimee Schaedig" (Recruiting Manager) | "Jonathan Schaedig" (VP of Maintenance | DoM)
sherman:     "Kevin Sherman" (Director of HR) | "Kieran Sherman" (Aircraft Detailing Specialist)
smith:       "Jaren Smith" (560XLS+ FO) | "Kevin Smith" (560XL Captain) | "Matt Smith" (PC-12 Captain)
ward:        "Grace Ward" (Cabin Attendant) | "Tara Ward" (Lead Cabin Attendant)
wilson:      "Karina Wilson" (PC-12 First Officer) | "Lori Wilson" (Cabin Attendant)
### surnames shared by 2+ non-terminated employees: 13
```

Three of those collisions are live hazards for this exact job and they only stayed safe
because the sheet happens to write full first names:

1. **Carter** - three active Carters, two of them pilots on *different* aircraft
   (Nick Carter on the Legacy 650, Ren Carter on the PC-12, Devon Carter on the CJ2). The
   Training Events tab writes "Carter, Ren" and "Carter, Devon"; **a last-name-only key would
   put all three on one record.** Note also that the extraction's own alias map maps
   "ren stephani" → "ren carter", so Ren has two spellings as well as a colliding surname.
2. **Smith** - three active Smiths, two of them pilots (Jaren Smith 560XLS+ FO, Kevin Smith
   560XL Captain) **on the same aircraft family**, plus Matt Smith the PC-12 Captain with no
   start date. The 560XL tab writes "Jaren Smith" and "Kevin Smith" one row apart
   (r3 [L466] and r6 [L469]).
3. **Mitchel** - "Chip Mitchel" (Director of Fractional Sales) and "Harry Mitchel" (VP of
   Flight Operations) are **two different people**, and the Sign-on/Relo Bonus tab writes
   **"Harry (Chip) Mitchel"** (r11 [L682]) as one name for one of them. My matcher resolved
   that to Harry Mitchel via the parenthetical-stripping rule, and the Referral Bonus tab's
   bare "Harry Mitchel" (r13 [L642]) agrees - but if "Chip" in that cell is meant as
   Chip Mitchel's actual name then a $10,000 relocation is attributed to the wrong person.
   **This one needs a human.** It is also exactly the hazard the `skyshare-email-to-name-map`
   memory note records (hmitchel@ is Harry Mitchel, not Hannah Mitchell).

Two further items I resolved, and am flagging so the resolution is visible rather than
silent:

4. **Jake Thacker vs Jacob Thacker** - the extraction left this open (its UNCERTAIN #5). The
   app **closes it: they are one person.**
   ```
   "Jacob Thacker" legal="" id=cmr5dyzo400446grmdgqwe1wp pos="PC-12 Captain" ACTIVE/ARCHIVED start=2025-08-26 pdpGraduate=false
       PC-12 First Officer | 2025-08-26 -> 2026-09-18 | HIRE
       PC-12 Captain       | 2026-09-18 -> OPEN       | UPGRADE
   ```
   Exactly one Thacker in 461 rows. A PDP first officer who upgrades to captain effective
   **2026-09-18** - six days from now - which is precisely why the PC-12 tab shows him twice:
   "Jake Thacker" as IN-TRAINING captain ordinal 13 (r20 [L530]) and "Jacob Thacker" as
   TRANSISTION OUT in the SIC column (r33 [L543]). The sheet is right and the app is right;
   only the two spellings are a problem. **So the PC-12 captain count is right and nothing is
   double-counted.** (Note his `pdpGraduate` flag is **false** despite Training Info r90
   [L297] recording him as PDP - a small separate gap.)
5. **Ben Butler vs Benjamin Butler** - the extraction's UNCERTAIN #6. Also **one person**:
   ```
   "Ben Butler" legal="Benjamin Butler" id=cmr5dyqmv000g6grmf1e6pmh0 pos="CJ2 Captain" ACTIVE/ARCHIVED
       PC-12 Captain | 2024-05-20 -> 2026-03-04 | HIRE
       CJ2 Captain   | 2026-03-04 -> OPEN       | PROMOTION
   ```
   Exactly one Butler. "Butler, Ben" (CJ2) and "Butler, Benjamin" (PC-12) on Training Events
   r12/r13 are his current CJ2 seat and his PC-12 history - correctly two training rows for a
   dual-qualified pilot, wrongly two names. The repo's alias map already asserts
   `"ben butler": "benjamin butler"`, so somebody decided this before and was right.

And one the app does **not** close:

6. **Fahali Campbell's seat** (extraction UNCERTAIN #9: the cell literally reads "PC-12
   Captain SIC"). The app says **PC-12 First Officer**, but he is **TERMINATED** - start
   2026-03-23, term 2026-04-13, three weeks. So the app supplies an answer but it is an
   answer about somebody who left, which is weak evidence about what the cell meant. Nothing
   to act on either way.

---

## Data problems in the sheet itself

Things the user can act on in the workbook even if he approves no database change at all.
Items 1-6 are carried forward from `_sheet-raw-positions.md`; items 7-11 are new from this
pass.

1. **ACTION TODAY - Praetor 600's two open seats must not be recruited.** Staffing Change
   Notes r28-29 [L196-197] show PIC 1 open and SIC 1 open. The same tab's r7 [L175], dated
   **09/03/2026**, reads: "Pery Cory this morning, the Praetor deal is on hold until January.
   I paused both jobs." The note still sitting on r29 col L - "Green to hire per Cory text
   08/17/26" - is **superseded** by it. Praetor 600 appears on no other tab, so the paused
   status lives in one note cell and the open-seat number lives in another. Anyone reading the
   number alone recruits two pilots for an aircraft deal that is paused until January.
   Corroborating from the app side: **zero** RoleAssignment rows and **zero** NewHire
   positions mention Praetor anywhere (`/praetor/i -> 0 RoleAssignment row(s): NONE`), so
   nothing has been hired against it yet. The fix is to mark those two rows paused where the
   number is, not three rows away.

2. **Two date typos that will throw or produce an absurd date in any parser.**
   - Training Info r134 [L341], Chris Johnston, Basic Indoc Date reads **`5/26/0206`** - year
     0206 for 2026. (He is TERMINATED in the app, so no live process depends on it, but a
     parser does not know that.)
   - Sign-on/Relo Bonus r18 [L689], Robert Patrick, Start Date reads **`08/242026`** -
     missing separator. His other row (r17) has the correct 8/24/2026.

3. **Twelve non-person rows sitting inside person columns on Training Events As Staffed.**
   Four inverted column headers - "(PIC) 14, CAPTAIN" r3 [L712], "(PIC) 5, CAPTAIN" r4 [L713],
   "OFFICER (SIC) 4, FIRST" r21 [L730], "OFFICER (SIC) 6, FIRST" r22 [L731] - and eight
   "NOT READY TO HIRE), (Holding" placeholders (SIC r16-r20, PIC r40-r42). These are what a
   name column looks like after being sorted with its own header text in it. Any import must
   exclude them; I excluded them by never transcribing them. One of those rows also carries
   a `.297` cell reading **"N/A (MUST GET FORMULA)"** (r41 [L750]), which the team already
   knows is uncomputed.

4. **The M2's tail number is written two ways, one digit apart.** The M2 tab r3 [L568] gives
   Jack Matiasevich **N782PD**; Master r133 [L134] gives the M2 as **N785PD**. Each string
   occurs exactly once in the workbook. **Neither appears anywhere in the app** - the only
   three tails the database holds are N409KG, N366FB and N418T - so the app cannot break the
   tie. This is why his tail row above is low confidence. One of these two cells is wrong and
   somebody who can see the aeroplane should say which.

5. **The workbook contradicts itself on open seats in 12 of 19 comparable rows.** Master vs
   Training Amount: G450/G5 PIC 4/3/0/1 vs 5/0/2/3; CJ2 PIC 6/6/0/0 vs 7/5/0/2; PC-12 PIC
   13/12/1/0 vs 14/8/3/3; G200 SS PIC 7/6/0/1 vs 5/4/0/1; 560XL PIC 6/6/0/0 vs 5/4/1/0. A
   third number sits in each roster tab's own header and a fourth set in Staffing Change
   Notes r4 [L172]. **Two pieces of app-side evidence now bear on which is stale**, and both
   point the same way as the extraction did:
   - Training Amount shows **Green 0** for all three G450/G5 fractional seats (PIC, SIC, CA).
     The app holds **5 active G450 captains and 5 active G450 first officers** with open
     roles. Green 0 is not a defensible number for a seat with ten people in it.
   - Training Amount r88 [L1102] carries a PC-12 tail **N825NX** that appears nowhere else in
     the workbook. It appears nowhere in the app either - positive control, the complete list
     of tails the database holds is exactly three: `N409KG` (Matt Garner), `N366FB` (Morri
     Harames), `N418T` (Shad Guffey). So N825NX is corroborated by nothing on either side.

   I still am **not** declaring Training Amount dead - nothing says which tab the team reads,
   and that is a question for the user, not for me.

6. **Roster-tab headers disagree with their own rows.** 560XL says "CAPTAIN (PIC) 5"
   (r4 [L467]) and lists six GREEN fractional captains, ordinals 1-6. G200 says "CAPTAIN
   (PIC) 6" (r2 [L439]) and lists seven ordinals. The app's counts side with the rows, not
   the headers: six active 560XL captains, and G200 captains are nine in the app against six
   named GREEN on the tab.

7. **NEW - the G450/G5 roster tab is missing an active captain.** Brock Tyler, ACTIVE since
   2025-12-15, open `G450 Captain` role. In Training Info r103 [L310] and Referral Bonus
   r19 [L648], absent from the roster tab, which shows a vacant `CAPTAIN (PIC)` ordinal 4 at
   r9 [L359]. See the Headline. **This is the single most expensive row in this file.**

8. **NEW - the CJ2 roster tab is missing an active captain.** Devon Carter, open `CJ2 Captain`
   role since 2026-02-21, recorded as "CJ2 Captain / Internal" on Training Info r108 [L315],
   appears on the CJ2 tab nowhere - only as a PC-12 dual-qual row at PC-12 r29 [L539].

9. **NEW - "Gavin Wulderlich" is a misspelling of Gavin Wunderlich, on three tabs.** PC-12
   r17 [L527], Training Info r115 [L322], Training Events r56 [L765]. The app's record has
   the same start date (2026-02-16) and the same position (PC-12 Captain), and there is no
   "Wulderlich" in either the employee table or the 8,682-row candidate table. Three cells to
   correct.

10. **NEW - the Master tab names a candidate who was rejected in 2024.** "Cayden Christensen",
    Master r143 [L144] col L, on the live PC-12 block. Candidate row: stage **Rejected**,
    origin JAZZ, created 2024-08-10.

11. **NEW - the Sign-on/Relo Bonus tab carries $20,000 against somebody who withdrew.**
    Fred Saadat, r3 [L674], $10,000 at training completion plus $10,000 at six months, both
    marked FALSE. Candidate row: stage **Withdrew**, created 2026-07-06. Nothing is owed.

### And the app-side problems this pass turned up, for completeness

These are **not** sheet problems and no sheet row proposes them; they are defects the
comparison exposed. Recording them here so they are not lost, not because the workbook asks
for them.

- **Two people hold two open RoleAssignment rows at once** - Alex Andrade and Devon Carter
  (raw output in Method). Since the codebase defines the current role as the open one with the
  newest start date, Alex Andrade currently resolves to `Assistant Director of Training` with
  **no pilot seat**, so he silently drops out of every pilot report while the workbook still
  flies him as a PC-12 PIC.
- **13 ACTIVE or CONTRACT employees have no open role at all**, so the app can state no
  current role for them: Adam Evans, Chris Root, David Costa, Jon Murdoch, Josiah Clay, Kris
  Carley, Lambert McGrath, Mark Ompad, Matt Smith, Pete Zaccagnino, Raymond Proud, Tommy
  Ishii, Ward Holbrook. Eight of those are CONTRACT pilots; Matt Smith and Josiah Clay are
  ACTIVE.
- **One TERMINATED-flagged row holds an open role**: Matthew Biddulph, open `Maintenance
  Technician` from 2026-07-08 with **no termination date set**. The roadmap (`Jul 9`
  reconciliation) already flagged him as "looks accidentally terminated", and he is still in
  that state.
- **Seven non-terminated rows have a first role that starts before their hire date**: Adam
  Evans (213 days), Corby Alexander (6), Flynn McFarland (7), Jonathan Siswick (10), Nicholas
  Lembo (134 - legitimately, he was OGD Base Support from 2026-04-12 before becoming a PC-12
  FO on his 2026-08-24 hire date, so this one is the *stint* model, not an error), Scott
  Strahan (5), Ward Holbrook (32). 13 rows in total including terminated ones.
- **The fleet title vocabulary is split between archived and active registry titles in open
  roles**: `G450 Captain` 4 open vs `G450 & GV Captain` 1 open; `G450 First Officer` 5 open vs
  `G450 & GV First Officer` 0 open; `560XLS+ Captain` 1 vs `560XL Captain` 6. Per
  `lib/fleet/positions.ts` the G450-only titles are `status: "Archived"` and
  `G450 & GV` is Active, so 9 of the 10 G450 crew carry an archived title. The workbook calls
  the tab "G450/G5" and takes no position on this, so it is an app normalisation decision.
- **Three open roles hold a title that resolves to no fleet position**:
  `Gulfstream G200 First Officer` (Hankyu Park), `Chief Pilot / CJ2 Captain` (David Ricks -
  resolves a seat via the slug, so it works), `CJ3+ Captain` (Erik Schwerman - **seat null,
  slug null, aircraft null**, so he is invisible to pilot reporting).

---

## Method

### The queries

One scratch script, `scripts/_r1-sheet-compare-probe.ts`, run with `npx tsx`, **deleted when
I finished**. Two passes, both `SELECT` only.

Pass 1 - the full employee + role dump:

```ts
import { config } from "dotenv";
config({ path: ".env" });          // DATABASE_URL lives here
config({ path: ".env.local" });    // everything else; loaded second so it wins
import { prisma } from "@/lib/prisma";

const hires = await prisma.newHire.findMany({
  select: { id, name, legalName, position, department, location, managedAircraft,
            managedPilot, employmentStatus, stage, startDate, terminationDate,
            seniorityDate, canceled, pdpGraduate, importKey },
  orderBy: { name: "asc" }
});
const roles = await prisma.roleAssignment.findMany({
  select: { id, newHireId, title, fleetPositionSlug, seat, aircraft, department,
            startDate, endDate, transitionType, createdAt }
});
```

Raw output:

```
NewHire rows: 461
RoleAssignment rows: 498
--- employmentStatus distribution ---
{"TERMINATED":264,"ACTIVE":180,"CONTRACT":17}
--- stage distribution ---
{"ARCHIVED":428,"ACTIVE":6,"POST_ONBOARD":27}
--- canceled true count --- 2
--- pdpGraduate true count --- 2
--- open roles (endDate null) --- 187
--- hires with >1 open role ---
2 [["cmr5dyqxi000k6grmn4s6ps8b",2],["cmqac9j1s001lpkrm4ovuzh4z",2]]
--- hires with ZERO roles --- 73
```

461 and 498 match the counts the lead measured earlier tonight, so the dump is the same data.

Pass 2 - the candidate lookups for the three unmatched sheet names (same file, rewritten;
`displayName` / `currentTitle`, not `name` / `position`, which is what the `Candidate` model
actually calls them):

```ts
await prisma.candidate.count()                        // -> 8682
await prisma.candidate.findMany({
  where: { displayName: { contains: probe, mode: "insensitive" } },
  select: { displayName, primaryEmail, stage, status, currentTitle, origin, createdAt },
  take: 15, orderBy: { createdAt: "desc" }
});
```

Raw output for all ten probes is quoted inline in the sections above.

Everything after that ran in the session scratchpad against the JSON dump - **no further
database access**. I did not call `getEmployeeJourney()` anywhere, deliberately: it calls
`ensureInitialRole()` (`lib/data/ensure-initial-role.ts`), which **creates a RoleAssignment
row**. A read-only night has no business invoking it.

### The current-role rule I applied, and where I found it

**A person's current role is their `RoleAssignment` whose `endDate` is null. When more than
one is open, the one with the newest `startDate` wins.** Four places in the codebase say
this and they agree:

1. `prisma/schema.prisma:527` - `endDate DateTime? // null = current role`
2. `lib/data/employee-journey.ts:9-11` (module comment) - "A role's `endDate === null` means
   it's their current role" - and line 160 implements it: `current: r.endDate === null`
3. `app/api/new-hires/[id]/roles/route.ts:50-54` - the tie-break, verbatim:
   ```ts
   // The current (open) role, if any.
   const current = await prisma.roleAssignment.findFirst({
     where: { newHireId: id, endDate: null },
     orderBy: { startDate: "desc" },
     select: { id: true, startDate: true, seat: true }
   });
   ```
4. The same route, line 72-73, establishes that `NewHire.position` is a **denormalised mirror**
   of the current role, not an independent field: *"Keep the person's headline position in sync
   with their current role"* → `tx.newHire.update({ where: { id }, data: { position: title } })`.

So I compared the sheet against the **open RoleAssignment** first and used `NewHire.position`
only as a cross-check. That distinction mattered twice: Alex Andrade's `NewHire.position` says
"PC-12 Captain" while his current role by this rule is `Assistant Director of Training`, and
Jack Matiasevich's says "M2 Captain & PC-12 Captain" while his current role is `M2 Captain`.
Both are cases where the mirror and the journey disagree, which is only visible if you read
both.

For airframe and seat I reused the codebase's own derivation rather than inventing one:
`seatOf()` in `lib/data/employee-journey.ts:77-92` (stored seat first, then
`positionFor(slug, title)`, then a text fallback, with a ground/support guard so a
"G450 Maintenance Technician (HND)" carrying a `g450-captain` slug is **not** a pilot), and
the aircraft token order in `resolveFleetPosition()` in `lib/fleet/positions.ts` (most specific
first, so `560XLS+` wins over `560XL`). Canonical proposed titles come from
`RAW_FLEET_POSITIONS` in that same file.

### Which sheet tab I treated as the person's current seat, and why

**The twelve per-aircraft roster tabs.** A named row whose Status is `GREEN` or `IN-TRAINING`
is a live seat: the tab is a seat-by-seat roster with an ordinal per seat, and an empty name
cell with Status `OPEN` is a vacancy. That gave **69 primary rows**.

I deliberately treated three row types as **not** primary (14 rows):

- `Dual Qualified (dont use for numbers)` - the sheet itself says not to count them, and a
  note (G450/G5 r27-29 and seven other tabs) spells out the convention: *"When someone staying
  Dual Qualled transitions to other plane, please move them to bottom and mark as ..."*. 10
  rows.
- `TRANSISTION OUT` *(sic)* - Dayne Shafer (CJ2 r9), Tommy Harvey (CJ2 r20), Jacob Thacker
  (PC-12 r33). 3 rows.
- The dual-qual *area* below the Notes line on G200 - Jerry Harrington (r22). 1 row.

Testing that choice: all 14 secondary rows matched an employee, and in **every** case the
app's current role is consistent with the interpretation (Jerry Harrington's app role is
`G200 Captain`, matching the G200 primary block and *not* his CJ2 dual-qual row; Carl Wiltse's
is `560XL Captain`, matching 560XL and not his CJ2 dual-qual row; Kylee Madsen's is
`CJ2 Captain`, matching CJ2 and not her PC-12 dual-qual row). That is eleven independent
confirmations that the dual-qual convention means what I took it to mean, and it is why
`Training Events As Staffed` disagreements are mostly *not* disagreements.

Training Info and Training Events As Staffed were used as **corroboration only**. Training
Info is explicitly an archive (104 of its 108 rows sit below a row reading `ARCHIVED` in every
column) and records what somebody trained *into* at that date - which is exactly why Kevin
Smith's Training Info row says "XL First Officer" (2025) while the 560XL roster tab and the
app both say `560XL Captain` today, after his 2026-03-30 UPGRADE. Treating Training Info as
current would have produced a wrong downgrade proposal for him.

### The matching rules, in the order applied

Case- and punctuation-insensitive throughout. Each sheet name goes through, in order, and
stops at the first rule that returns exactly one employee. **If a rule returns more than one,
the name is reported ambiguous and no pick is made.**

1. **Exact normalised full name** against `NewHire.name`.
2. **Exact normalised full name** against `NewHire.legalName`.
3. **Alias-canonical** - the repo's own map, extended.
4. **Last name + first initial**.

Normalisation, copied from `prisma/import-training-transitions.ts:33`:
`s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim()`, applied after
(a) un-reversing `"Last, First"` → `"First Last"` when there is exactly one comma, which
`Training Events As Staffed` needs on every row, and (b) dropping parentheticals, which
`"Sven Lepschy (Lead)"`, `"Aleksandar (Alex) Kostic"`, `"Joshua (Brock) Tyler"`,
`"Harry (Chip) Mitchel"`, `"Alvaro Martin (Was Nick Smout)"` and
`"Jonathan Siswick (Start 06/22/2026)"` all need.

The alias map is the repo's 15-entry `ALIASES` from
`prisma/import-training-transitions.ts:37-53` **verbatim**, extended by the 11 pairs the
extraction found it does not cover. (I dropped the repo's one no-op entry,
`"nick nadolski": "nick nadolski"`.) The 13 I added:

```
"hanku park":           "hankyu park"
"russ hermian":         "russ herman"
"brooke kirchner":      "brooke milne"
"brooke milne kirchner":"brooke milne"
"kat larson":           "kathleen larson"
"zach davis":           "zachery davis"
"ben pobanz":           "benjamin pobanz"
"nick hastings":        "nicholas hastings"
"aleksandar kostic":    "alex kostic"
"brock tyler":          "joshua tyler"
"joshua brock tyler":   "joshua tyler"
"harry chip mitchel":   "harry mitchel"
"jake thacker":         "jacob thacker"
```

### Match-rule distribution - how much work each rule did

```
{"exact name":61,"legalName":1,"alias-canonical":4,"last+first-initial":2}
```

61 of 68 matched on the exact name, so the clever rules carried very little of the load and
the result does not depend on them. The 7 that needed help, named so they can be checked:
`legalName` - Aleksandar Kostic (app name "Alex Kostic", legal "Aleksandar Kostic");
`alias-canonical` - Russ Hermian→Russ Herman, Hanku Park→Hankyu Park, Alexander
Andrade→Alex Andrade, Jake Thacker→Jacob Thacker; `last+first-initial` - Nick Lembo→Nicholas
Lembo, Nicholas Zehr→Nick Zehr.

### The seat reconciliation table

App side: for every ACTIVE or CONTRACT employee, their current role's airframe + seat. Sheet
side: the 69 primary roster rows. Raw output:

```
| airframe|seat | sheet roster named | app open roles | delta |
| 560XLS+|PIC   | 1 | 1 | +0 |
| 560XLS+|SIC   | 1 | 1 | +0 |
| 560XL|PIC     | 6 | 6 | +0 |
| 560XL|SIC     | 2 | 1 | -1 |
| CJ2|PIC       | 6 | 10 | +4 |
| CJ2|SIC       | 4 | 5 | +1 |
| CJ3|PIC       | 1 | 1 | +0 |
| G200|PIC      | 6 | 9 | +3 |
| G200|SIC      | 4 | 4 | +0 |
| G450|PIC      | 4 | 5 | +1 |
| G450|SIC      | 5 | 5 | +0 |
| Legacy 650|PIC| 2 | 2 | +0 |
| M2|PIC        | 1 | 1 | +0 |
| PC-12|PIC     | 17 | 17 | +0 |
| PC-12|SIC     | 5 | 5 | +0 |
| Phenom 100|PIC| 1 | 1 | +0 |
| Phenom 100|SIC| 1 | 1 | +0 |
| Phenom 300|PIC| 1 | 1 | +0 |
| Phenom 300|SIC| 1 | 1 | +0 |

--- who differs, per bucket ---
560XL|SIC:   sheet only: Matt Dahle
CJ2|PIC:     app only:   David Ricks, Dayne Shafer, Devon Carter, Teren Christensen
CJ2|SIC:     app only:   Tommy Harvey
G200|PIC:    app only:   Jerry Harrington, Morri Harames, Rick Benik
G450|PIC:    app only:   Brock Tyler
PC-12|PIC:   sheet only: Alex Andrade, UNMATCHED:Gavin Wulderlich
             app only:   Gavin Wunderlich, Matt Dahle
(every other bucket: identical)
```

**13 of 19 buckets are identical, person for person.** That is the strongest positive control
in this file and it is what makes the six that differ worth reading. Each of the six:

- `560XL|SIC -1` - Matt Dahle, the proposal above.
- `CJ2|PIC +4` - Dayne Shafer is `TRANSISTION OUT` on the tab (deliberately excluded by me);
  Teren Christensen is CONTRACT; David Ricks is Chief Pilot, never on a hiring tracker;
  **Devon Carter is genuinely missing from the tab**.
- `CJ2|SIC +1` - Tommy Harvey, `TRANSISTION OUT`.
- `G200|PIC +3` - Jerry Harrington is on the tab but in its dual-qual area below the Notes
  line (so my primary filter excluded him, correctly for counting and not for existence);
  Morri Harames and Rick Benik are CONTRACT.
- `G450|PIC +1` - **Brock Tyler, genuinely missing from the tab.** The Headline.
- `PC-12|PIC +0 by coincidence` - and this one is worth calling out because the zero is a
  lie. Two errors cancel: Alex Andrade is "sheet only" purely because his stale second open
  role makes the app resolve him to a non-pilot title, and Matt Dahle is "app only" because
  the app has not recorded his move to the 560XL. Fix either one in isolation and this bucket
  stops balancing. A matching total is not agreement.

So the structural reason Master, Training Amount and the roster headers cannot be made to
agree is that **the roster tabs are not a headcount**: they exclude contract pilots,
management pilots and dual-qualified pilots parked below the Notes line by design - and then
they are additionally missing two real people by accident. Any future attempt to drive
open-seat numbers off one tab has to decide which of those four exclusions it means.

### Limitations, stated plainly

1. **The 21-tab question is still open and I could not close it.**
   `docs/audit-2026-09-11/_sheet-visible-tabs.md` **does not exist**. I checked at the start,
   mid-run, and again immediately before writing this file:
   ```
   $ ls -la docs/audit-2026-09-11/_sheet-visible-tabs.md
   ls: cannot access 'docs/audit-2026-09-11/_sheet-visible-tabs.md': No such file or directory
   ```
   The chrome-live sibling *did* write `docs/audit-2026-09-11/chrome-live.md` (last modified
   01:30 MT) but that file is about page rendering and mentions the workbook nowhere - I
   grepped it for "tab bar", "visible-tabs", "Recruiting Status" and "Master" and got **zero
   hits**. So **no row in this file can be marked as "from a non-hidden tab"**, and a July
   2026 session's record of this tracker as 32 tabs with ~600 candidate rows on PDP / Pilot /
   On-Hold / Other tabs is neither confirmed nor refuted. Every row above is from one of the
   21 tabs the extraction received, any of which may be hidden. I did not open a browser
   (tonight's rule 4) and did not download the file.
2. **The `r<n>` sheet row numbers can be uniformly off by one.** The extraction derived them
   from markdown-table position and flagged this. The tab name, the `[Lnnn]` file line and the
   quoted cell text are exact, so every row above is identifiable regardless.
3. **Dates in the sheet are not ISO and I did not parse most of them.** Where I compared a
   date (Jonathan Siswick, Gavin Wunderlich) I read it off the sheet text by eye and quoted
   it. I did not run the sheet's dates through a parser, partly because two of them are
   typo'd.
4. **"Lead" as a seat is under-specified.** Master carries distinct `Lead PIC` seats (G450/G5
   r7, M2 & PC-12 r128) and three people have "Lead" written somewhere against their name,
   but no tab has a Lead column. The fleet registry has `G450 Lead Captain` and
   `Legacy 650 Lead Captain` (both Archived) and **no** `PC-12 Lead Captain` or
   `M2 Lead Captain`. Applying any Lead title needs a registry decision first, which is why
   none of the three is marked high.
5. **Local dev bypasses auth, so I can say nothing about whether any of these fields is
   editable by a real user.** I read data, not permissions.
6. **I did not check `EmploymentStint`.** Master r85 [L86] says "Parker Hale SIC (coming back
   and filling the spot)", which reads like a rehire, and rehire handling lives in stints. His
   app record has a single `CJ2 First Officer` role from 2025-10-20 with no gap, which does
   **not** look like a rehire - but I did not pull the 284 stint rows to confirm it, so I am
   not asserting either way.
7. **I compared only the two tables I was asked for**, plus a targeted `Candidate` lookup.
   Paycom is the system of record for several of these facts (interview notes, seats) and has
   no integration, so anywhere the sheet and the app disagree, Paycom may agree with neither.

---

## If this were applied

Do **not** let anything here touch the database tonight, and do not write the apply script
from this file alone - several rows need the user's answer first (which M2 tail; whether
"Lead" becomes a registry title; whether Alex Andrade's PC-12 role closes; who "Harry (Chip)
Mitchel" is; whether Matt Smith has actually started).

When he approves specific rows, this is how it should be applied, following this project's
stated rule for live writes:

1. **Split it.** The 8 `managedAircraft` fills are a different kind of change from the one
   real seat move (Matt Dahle) and from the two date/role corrections. They should be three
   separate runs with three separate review files, not one script. The tail fills are
   additive into an empty column on 8 rows and are the safest thing here; Matt Dahle's is a
   seat change that closes one role and opens another and deserves its own run and its own
   confirmation.
2. **Dry run first, emitting a review file the user reads before anything is written.** The
   repo already has the shape for this - `prisma/import-training-transitions.ts` runs as a dry
   run with stats by default and writes only on `--commit`. Copy that, and make the review
   file name the person, the exact before value, the exact after value, the sheet tab and the
   sheet row, so each line can be checked against this document without re-deriving anything.
3. **Make it reversible before it is run, not after.** Record the prior value of every field
   touched into a timestamped JSON next to the review file, and ship an `--undo <file>` path
   in the same script. For the tail fills that is trivial (all 8 prior values are null). For
   Matt Dahle's role change it means recording the id and prior `endDate` of the closed
   `PC-12 Captain` row and the id of the created row, so a single `--undo` restores both.
4. **Small batch, verify, then the rest.** Two tails first - Shad Guffey and Matt Garner
   already carry theirs, so pick two of the eight, write them, then re-read those two rows and
   confirm the profile renders the tail - before the remaining six.
5. **Use the existing write path rather than raw updates, for the role change.**
   `POST /api/new-hires/[id]/roles` already closes the current open role at the new start date,
   opens the new one, derives seat from the title via the fleet registry, and syncs
   `NewHire.position` - all in one `$transaction`. Hand-rolling that in a script is how the two
   open-role rows above probably happened. Note that route derives `transitionType` as
   `UPGRADE` when the new seat is PIC and the old was SIC, else `PROMOTION` - **Matt Dahle is
   PIC → SIC, so it will label him `PROMOTION`, which is wrong.** Pass `transitionType`
   explicitly (`TRANSFER` or `LATERAL`) for him.
6. **Do not fix the sheet from a script.** Items 7-11 under "Data problems in the sheet
   itself" are edits to a live Google Sheet that five other people may have open. Hand him the
   list; let him type them.
7. **Leave the seat counts alone until he answers which tab is authoritative.** Nothing in
   this file proposes changing a count, and nothing should, until that question is closed.

---

## Counts

| Measure | Value | How measured |
|---|---|---|
| NewHire rows read | 461 | `prisma.newHire.findMany` |
| RoleAssignment rows read | 498 | `prisma.roleAssignment.findMany` |
| Candidate rows in the table | 8,682 | `prisma.candidate.count()` |
| Database writes performed | **0** | SELECT-only script; deleted |
| employmentStatus split | ACTIVE 180 / CONTRACT 17 / TERMINATED 264 | probe raw output |
| Open RoleAssignment rows (`endDate` null) | 187 | probe raw output |
| Hires with **more than one** open role | 2 (Alex Andrade, Devon Carter) | probe raw output |
| Hires with zero RoleAssignment rows | 73 | probe raw output |
| ACTIVE/CONTRACT employees whose current role holds a pilot seat | 81 | reverse-direction pass |
| Sheet roster rows transcribed | 83 | 69 primary + 14 dual-qual / transition-out |
| Primary roster rows (GREEN or IN-TRAINING) | 69 | distinct people: 69 |
| Primary rows that **AGREE** with the app on airframe + seat | **57** | match pass |
| Primary rows proposing a change | 11 | match pass |
| Primary rows with **no** match | 1 (Gavin Wulderlich - a sheet misspelling) | match pass |
| Primary rows **ambiguous** | **0** | match pass |
| Matches by exact name / legalName / alias / last+initial | 61 / 1 / 4 / 2 | match-rule distribution |
| Training Info people compared | 97 distinct (108 rows transcribed) | **83 agree**, 13 differ, 1 no-match; of the 13, 11 are archive-vs-current and only 2 are real |
| Training Events As Staffed rows compared | 70 rows / 62 distinct people | **52 rows agree**, 17 differ, 1 no-match; of the 17, 9 are a dual-qual second aircraft and 6 are tail-only, leaving 2 |
| Bonus/referral names compared | 34 distinct | 33 found in the app, 1 (Fred Saadat) a withdrawn candidate |
| Seat buckets reconciled (airframe × seat) | 19 | **13 identical person-for-person**, 6 differ |
| **Proposed changes in the table** | **18 rows, 16 distinct people** | Jeff Gerrard and Sven Lepschy each get a second, separately-labelled item |
| - of which high confidence | 11 | 10 pure high + Sven Lepschy (high on the tail, medium on "Lead") |
| - of which medium | 3 | Hankyu Park, Alex Andrade, Erik Schwerman |
| - of which low | 4 | Jeff Gerrard's Lead item, the Lepschy/Copeland location item, Jack Matiasevich (tail blocked by the sheet's own conflict), Devon Carter's app side |
| Proposed changes that are SHEET fixes, not app changes | 2 in the table (Brock Tyler, Devon Carter) + 5 more under Data problems | |
| `NewHire.managedAircraft` populated, whole table | **3 of 461** (N409KG, N366FB, N418T) | positive control |
| Tails the sheet names per person | 6 (N787JS, N413UU, N418T, N450JF, N409KG, N782PD-or-N785PD) | roster tabs |
| People the sheet puts on a named tail | 11 | of whom 2 already correct in the app, 8 proposed, 1 blocked by the sheet's own conflict |
| `managedPilot` true | 29 of 461 | of those, 3 carry a tail |
| `NewHire.location` null | 277 of 461 (13 of them ACTIVE/CONTRACT) | `{"null":277,"SLC":83,"OGD":60,"Home-Based":17,"SVR":16,"DVO":4,"HND":4}` |
| Surnames shared by 2+ non-terminated employees | 13 | 3 of them live hazards for this job |
| Extraction UNCERTAIN items this pass **closed** | 3 of 10 (#3 Robert Patrick et al, #5 Jake/Jacob Thacker, #6 Ben/Benjamin Butler) | |
| Extraction UNCERTAIN items this pass could **not** close | #1 (hidden tabs), #2 (which tab is authoritative), #4 (N782PD vs N785PD - neither is in the app), #7 (Evan), #8 (±1 row numbers), #9 (Fahali Campbell - app answers but he is terminated), #10 (ONION) | |
| New sheet data problems found this pass | 5 (items 7-11) | |
| App-side defects surfaced by the comparison | 6 classes | listed at the end of Data problems |
| Database writes performed | **0** | stated twice on purpose |

---

## Provenance

- Source A: `docs/audit-2026-09-11/_sheet-raw-positions.md` (1,371 lines), read in full. I
  did **not** re-read the workbook through Drive and did not re-derive any of its findings.
- Source B: the live Neon production database, read-only, 2026-09-12 ~01:00-01:40 MT.
- Source C: `lib/data/employee-journey.ts`, `lib/data/ensure-initial-role.ts`,
  `lib/data/employees.ts`, `lib/fleet/positions.ts`, `prisma/schema.prisma`,
  `prisma/import-training-transitions.ts`, `app/api/new-hires/[id]/roles/route.ts` - read to
  establish the current-role convention and the canonical title vocabulary.
- I read `docs/audit-2026-09-11/chrome-live.md` looking for the tab-bar list; it does not
  contain one. I did not open or edit any other sibling auditor's file.
- No git command. No browser tool. No `npm run build`. No email. No upload. No write of any
  kind to the database or the sheet.
- Files this session created or edited in the repo: this file, and
  `.claude/claims/r1-sheet-compare-afdc0817.md`. `scripts/_r1-sheet-compare-probe.ts` existed
  only while the queries ran and was deleted.
- Scratch (`hires.json`, `roles.json`, `match*.js`, `shared.js`, `out*.txt`) stayed in the
  session scratchpad and never entered the repo.
