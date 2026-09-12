# Sheet-extract audit - 2026-09-11

Raw person/position extraction from the live Google Sheet "Recruiting Status Tracking"
(fileId 1ciM1uAWV1iN9Nqd2XIzj1dIt2m-tdp9bs0mNtzRpJ3U). Read-only, via the Google Drive
MCP. Nothing was written to the sheet or to the database.

---

## PUT THIS IN FRONT OF A HUMAN

1. **The read is NOT truncated, and I can show why.** Two independent Drive renderings of
   the workbook both end at the same tab ("Training Amount") and at the same final cell
   ("> 2000hrs, $100k"). The renderer signals truncation with a literal "..." - the BRIEF
   snippet ends "MIN..." mid-row, the MAX_ALLOWED snippet ends with a closed code fence and
   no ellipsis. Raw evidence in "What I checked". **21 tabs received, all 21 complete.**
2. **But 21 is not provably the whole tab bar.** The Drive API cannot tell a hidden tab from
   a visible one, and cannot tell me the sheet's true tab count. A July 2026 deep-dive of a
   *downloaded .xlsx* of this tracker recorded **32 tabs including ~600 candidate pipeline
   rows** (PDP / Pilot / On-Hold / Other). **None of those candidate tabs are in what I
   received.** Either they were removed from the live Sheet since July, or the renderer is
   not showing them. I cannot close that from here. See UNCERTAIN #1.
3. **Two tabs give contradictory open-seat counts for the same seats, today.** "Master" and
   "Training Amount" disagree on 12 of 19 comparable seat rows - G450 PIC is 4 target /
   1 open in Master and 5 target / 3 open in Training Amount; CJ2 PIC is 6/0 vs 7/2; PC-12
   PIC is 13/0 vs 14/3. A third number sits in each per-aircraft roster tab's own header
   ("CAPTAIN (PIC) 5"). If anyone recruits off the wrong tab they recruit to the wrong
   number. Full matrix in section 2.
4. **docs/audit-2026-09-11/_sheet-visible-tabs.md did not exist when I ran** (23:2x MT).
   The chrome-live sibling has claimed it. Whoever reads this in the morning should read that
   file next to this one - it is the thing that closes #2.

---

## Headline

I received and fully extracted 21 tabs of the live workbook, recovering **330 person-to-position
name-cell occurrences across 14 tabs - 206 distinct exact name strings, about 119 distinct humans
once spelling variants collapse** - every one with a tab name and a row locator. The extraction
itself is sound and cross-validated against a second rendering of the same file. The cost sits
in two places. First, the workbook is still the team's open-seat truth source and it contradicts
itself *within itself*: the "Master" tab and the "Training Amount" tab carry different
target/green/training/open numbers for 12 of the 19 seat rows they share, and each per-aircraft
roster tab carries a third number in its own column header - so "how many PC-12 captains are we
short" has three live answers (0, 3, and 14-vs-13-listed) depending on which tab you open.
Second, the same human appears under up to four different spellings across tabs (Hankyu Park /
Hanku Park / Park, Hanku; Russ Herman / Russ Hermian; Brooke Milne / Brooke Milne Kirchner /
Brooke Kirchner), so any import that keys on the name string will silently split or drop people -
which is exactly the failure the repo's own prisma/import-training-transitions.ts already carries
a hand-maintained 15-entry ALIASES map to work around. I have deliberately NOT normalised any
name or title; normalisation is the next agent's job and an early normalisation would destroy the
evidence.

---

## What I checked, and how

### 1. File metadata (read-only)

Tool: mcp__...__get_file_metadata, excludeContentSnippets true.

    {"canAddChildren":false,
     "createdTime":"2023-04-11T14:20:43.033Z",
     "fileSize":"26135566",
     "id":"1ciM1uAWV1iN9Nqd2XIzj1dIt2m-tdp9bs0mNtzRpJ3U",
     "mimeType":"application/vnd.google-apps.spreadsheet",
     "modifiedTime":"2026-09-11T17:38:38.762Z",
     "parentId":"0AP8eFdS7_JQWUk9PVA",
     "title":"Recruiting Status Tracking",
     "viewedByMeTime":"2026-09-11T19:20:33.229Z"}

26,135,566 bytes. Last modified today 2026-09-11 17:38 UTC, i.e. about 5.5 hours before I read
it - this is a live, actively-edited document.

### 2. read_file_content - and the heading problem

Tool: mcp__...__read_file_content, fileId as above, includeComments false.

The result exceeded the inline token cap and was saved to
C:\Users\Recruiter\.claude\projects\C--Users-Recruiter-Projects-skyshare-talent-ops\afdc0817-5b3b-40a5-93c9-fe02f07d218a\tool-results\mcp-29448c0c-720c-485f-882f-4999576df7f5-read_file_content-1789190777384.txt
as JSON {fileContent: string}. Extracted with node:

    KEYS [ 'fileContent' ]
    LEN 100229
    LINES 1110

**The lead's brief said the content arrives with each sheet introduced by a markdown heading
and that the first one is "# Master". That is NOT true of read_file_content.** Positive control -
I searched for the "#" character across the entire 100,229-char body:

    $ grep -c '#' sheet.txt
    0

Zero. Not "no headings I recognised" - zero hash characters in the file. **So read_file_content
gave me the data with no tab names at all.** What it gave instead was 21 GitHub-flavoured markdown
tables separated by blank lines. I found the boundaries off the alignment rows:

    $ grep -n ':-:' sheet.txt | head -3
    2:| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
    169:| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
    208:| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
    $ grep -c ':-:' sheet.txt
    21

21 tables. Per-table line ranges, column counts and row counts (node script, tables.js):

    T 1 lines 1-167     cols=12  bodyRows=164  nonEmptyRows=149
    T 2 lines 168-206   cols=12  bodyRows=36   nonEmptyRows=17
    T 3 lines 207-349   cols=13  bodyRows=140  nonEmptyRows=110
    T 4 lines 350-380   cols=12  bodyRows=28   nonEmptyRows=19
    T 5 lines 381-411   cols=12  bodyRows=28   nonEmptyRows=22
    T 6 lines 412-436   cols=14  bodyRows=22   nonEmptyRows=22
    T 7 lines 437-462   cols=12  bodyRows=23   nonEmptyRows=15
    T 8 lines 463-483   cols=12  bodyRows=18   nonEmptyRows=17
    T 9 lines 484-509   cols=12  bodyRows=23   nonEmptyRows=20
    T10 lines 510-544   cols=12  bodyRows=32   nonEmptyRows=28
    T11 lines 545-554   cols=12  bodyRows=7    nonEmptyRows=3
    T12 lines 555-564   cols=12  bodyRows=7    nonEmptyRows=3
    T13 lines 565-574   cols=12  bodyRows=7    nonEmptyRows=3
    T14 lines 575-601   cols=12  bodyRows=24   nonEmptyRows=13
    T15 lines 602-628   cols=11  bodyRows=24   nonEmptyRows=14
    T16 lines 629-670   cols=14  bodyRows=39   nonEmptyRows=29
    T17 lines 671-708   cols=9   bodyRows=35   nonEmptyRows=35
    T18 lines 709-960   cols=10  bodyRows=249  nonEmptyRows=56
    T19 lines 961-984   cols=14  bodyRows=21   nonEmptyRows=20
    T20 lines 985-1013  cols=27  bodyRows=26   nonEmptyRows=21
    T21 lines 1014-1110 cols=17  bodyRows=95   nonEmptyRows=86

### 3. Recovering the tab names - a second, different renderer

get_file_metadata's contentSnippet uses a DIFFERENT renderer from read_file_content: it emits
"# TabName" headings with the tab as CSV inside a fence. snippetVerbosity MAX_ALLOWED returned
all 21 headings in order, and the content under each one matches my 21 tables one-for-one:

    1  # Master                      -> T1
    2  # Staffing Change Notes       -> T2
    3  # Training Info               -> T3
    4  # G450/G5                     -> T4
    5  # Legacy 650                  -> T5
    6  # Challenger 350              -> T6
    7  # G200                        -> T7
    8  # 560XL                       -> T8
    9  # CJ2                         -> T9
    10 # PC-12                       -> T10
    11 # CJ3? Utah                   -> T11
    12 # CJ                          -> T12
    13 # M2                          -> T13
    14 # Phenom 100                  -> T14
    15 # Phenom 300e / Longitude     -> T15
    16 # Referral Bonus Info         -> T16
    17 # Sign-on/Relo Bonus          -> T17
    18 # Training Events As Staffed  -> T18
    19 # Budgeting Training Events   -> T19
    20 # Pilot Mins Overview         -> T20
    21 # Training Amount             -> T21

Tab-name mapping is certain, not inferred: I matched each heading's first CSV rows against the
first rows of the corresponding markdown table. Example - heading "# G200" is followed by
"CAPTAIN (PIC) 6,...", "1,Aman Lal,August ,GREEN,Fractional,1,Fabio Alves,March ,GREEN,Fractional",
which is exactly T7 r2/r4.

### 4. The truncation test, with its positive control

This is the claim the night turns on, so here is the evidence rather than my reading of it.

**(a) The renderer DOES mark truncation, visibly.** snippetVerbosity BRIEF (capped ~1000 chars)
ended mid-row with a literal ellipsis:

    ...SLC,CAPTAIN (PIC),FIRST OFFICER (SIC),Dayten Schureman (Start 08/24)\nMIN...

**(b) MAX_ALLOWED did NOT carry that marker.** It ended with the last row of the last tab and a
closed fence:

    PC-12,Target,Green,Training/Scheduled,Open
    $90k-$100k,PIC,14,8,3,3
    ...
    < 1500hrs,$90k,300 hours Turbine
    1500hrs-2000hrs,$95k,100 hours Instrument,50 hours Instrument
    > 2000hrs,$100k
     
    ```

So the truncation-capable renderer, given its largest budget, reported itself complete.

**(c) read_file_content independently ends at the same cell.** Its final 200 characters:

    "rument | \\[merged\\] 100 hours Instrument | \\[merged\\] 50 hours Instrument |
     \\[merged\\] 50 hours Instrument |  |  |  |  |  |  |  |  |\n
     |  | \\> 2000hrs | $100k |  |  |  |  |  |  |  |  |  |  |  |  |  |  |"

Same tab, same last row ("> 2000hrs / $100k"), reached by a different renderer.

**(d) No truncation marker anywhere in read_file_content.** Searched for seven candidate markers:

    marker "truncat"           -> -1
    marker "TRUNCAT"           -> -1
    marker "..."               -> 29659
    marker "[omitted"          -> -1
    marker "incomplete"        -> -1
    marker "Content truncated" -> -1
    marker "<truncated"        -> -1

The one "..." hit is NOT a marker - it is inside a real note cell on Training Info row 60
(file line 267): "Current on aircraft part 91 until end of October..... will not be going to
inital sim training..... going to Executive flight 11/11/2024". Only occurrence in the file:

    $ grep -n '\.\.\.' sheet.txt
    267:| Erik Holmgren  | External | M | PC-12 NG BMC | 9/8/24 | ...

**(e) Per-tab completeness agrees between the two renderings.** Spot-checked the last row of
four tabs in both: Training Info ends "Erik Schwerman ... CJ3 ... Feb 2027" in both; Referral
Bonus Info ends "Jason Zolezzi,Teren Christensen,PC12 FO" in both; Training Events As Staffed
ends "Zehr , Nicholas,PC-12,Fractional,March ,September" followed by blank padding in both;
Training Amount ends "> 2000hrs,$100k" in both.

**Conclusion I will defend: all 21 tabs I received are COMPLETE. Whether the workbook holds
tabs beyond these 21 is open - see UNCERTAIN #1.**

### 5. Hidden vs visible tabs - stated plainly

**I cannot tell a hidden tab from a visible one through the Drive API.** Neither
read_file_content nor the metadata snippet carries any visibility flag, and neither reports a
tab count I could compare against. I checked for
docs/audit-2026-09-11/_sheet-visible-tabs.md before extracting:

    $ ls -la docs/audit-2026-09-11/
    total 4
    drwxr-xr-x 1 Recruiter 197121 0 Sep 11 23:17 .
    drwxr-xr-x 1 Recruiter 197121 0 Sep 11 23:17 ..

Empty. The sibling has claimed the file (.claude/claims/r1-chrome-live-afdc0817.md lists
"docs/audit-2026-09-11/_sheet-visible-tabs.md (new, the Sheet tab-bar list)") but had not written
it yet. **So I proceeded over all 21 tabs I received and the visibility question stays open.**
I did not read any browser, per tonight's rule 4.

### 6. Independent confirmation that T3 really is "Training Info"

Not inference - the repo itself consumes this tab. prisma/import-training-transitions.ts line 16:

    const FILE = "C:/Users/Recruiter/Downloads/Recruiting Status Tracking - Training Info.csv";

and its column indices match my T3 exactly: c[0] name, c[3] Position, c[4] Start Date,
c[7] Training Start Date, and it skips rows matching /^archived$/i - which is precisely the
ARCHIVED divider I found at T3 row 37. Independent agreement on the tab name, its column order,
and its archived-row sentinel.

### 7. What I did NOT do

- No database read or write. No script in scripts/ was run. Nothing was written to the sheet.
- No download_file_content. Downloading a file needs the user's explicit say-so and I had none;
  it is also the one call that would settle UNCERTAIN #1 for good (see there).
- No browser tool of any kind. No git command of any kind.
- Scratch files (sheet.txt, dump.js, tables.js, x.js, y.js) live only in the session scratchpad
  at C:\Users\RECRUI~1\AppData\Local\Temp\claude\...\scratchpad and never entered the repo.

### 8. How to read my row locators

Exact and unambiguous: the TAB NAME plus the file line number [Lnnn] in the read_file_content
body, plus (for roster tabs) the ordinal the sheet itself prints in column A.

Derived, trust to +/-1: the "r<n>" sheet row. I computed it as (file line - table header line),
treating each markdown table's header line as sheet row 1 and its alignment row as synthetic.
Nobody can confirm the off-by-one without opening the sheet, so I am flagging it rather than
asserting it. Where a row matters, the tab name plus the quoted cell text identifies it
unambiguously regardless.

---

# SECTION 1 - EVERY PERSON-TO-POSITION ROW

Names and positions are copied **exactly as the sheet spells them**, including trailing spaces
(shown where present as a visible note), odd capitalisation and misspellings. No normalisation.

## 1a. Tab "Master" - names that appear as candidate / note cells

The Master tab is a seat matrix, not a roster, so the only people on it are written into the two
right-hand note columns (cols K and L). Every one of them is a live hiring signal.

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status words / colour meaning | Start or effective date | TAB | Row locator |
|---|---|---|---|---|---|---|---|
| Evan | (no position given - sits in col A above the G450 block) | - | - | - | - | Master | r2 [L3] |
| Hankyu Park (Start 08/24) | SS SIC | G200 | SLC | in the SIC row showing Training/Scheduled 2 | Start 08/24 | Master | r28 [L29] col K |
| Dayten Schureman (Start 08/24) | (written on the CAPTAIN/FIRST OFFICER header row under SS SIC) | G200 | SLC | in the SIC Training/Scheduled block | Start 08/24 | Master | r29 [L30] col K |
| Evan has the green light for PIC (Not Lead) | PIC | Challenger 350 / N522AD | SLC | PIC row is Target 2 / Green 0 / Open 2 | - | Master | r39 [L40] col K |
| Bailey out on Medical | (no seat given; sits on the OGD row of the 560XL block) | 560XL | OGD | out on Medical | - | Master | r53 [L54] col K |
| Parker Hale SIC (coming back and filling the spot) | SIC | CJ2 | SLC | SIC row Training/Scheduled 1 | - | Master | r85 [L86] col K |
| Matt Smith PIC (Sending offer) | PIC | PC-12 | OGD | Sending offer | - | Master | r139 [L140] col K |
| Nick Lembo SIC (Start 08/24) | SIC | PC-12 | OGD | SIC row Training/Scheduled 1 | Start 08/24 | Master | r140 [L141] col K |
| Jake Thacker PIC upgrade | PIC upgrade | PC-12 / N418T | OGD | - | - | Master | r141 [L142] col K |
| Augustus Hickman (Cory Referral) | (no seat; on the N413UU PIC row) | PC-12 / N413UU | OGD | Cory Referral | - | Master | r142 [L143] col L |
| Cayden Christensen | (no seat; on the PC-12 CAPTAIN/FIRST OFFICER header row) | PC-12 | OGD | - | - | Master | r143 [L144] col L |

Decision notes on Master that name a person (not position rows, but they are the reason a number
looks the way it does):

| Text exactly as written | TAB | Row locator |
|---|---|---|
| PIC Target was 16 we pulled back to 13 - Harry | Master | r138 [L139] col K |
| Harry - Approved the 6th PDP to hire July 10 | Master | r138 [L139] col L |
| Changed to 14 and 6 per conversation with Executives week of 04/20/2026 | Master | r139 [L140] col L |
| changed to 13 and 5 per Harry and Tommy on 09/03/2026 | Master | r140 [L141] col L |
| Both SIC on hold after conversation with Executives 03/24/26 | Master | r26 [L27] col L |
| Full staff as of the most recent managers meeting | Master | r27 [L28] col L |

## 1b. Tab "Staffing Change Notes" - people named inside dated decisions

| Person(s) named | Position implication as written | TAB | Row locator | Date on the row |
|---|---|---|---|---|
| David & Tommy | "conversation about too many PICs on the G200 ... holding off on hiring anymore G200 SICs" | Staffing Change Notes | r3 [L171] | 03/20/2026 |
| Jerry | "We have and will keep Jerry dual qualified in the CJ and G200." | Staffing Change Notes | r3 [L171] | 03/20/2026 |
| (Hiring Alignment Meeting - no person named) | "PC-12: 15 Captains / 6 PDPs \| CJ2: 7 Captains / 5 FOs \| Excel/XLS: 6 Captains / 2 FOs \| G200: 7 Captains / 3 FOs" | Staffing Change Notes | r4 [L172] | 3/24/2026 |
| Hank | "have approval to move forward with Hank for SIC" (G200 SIC) | Staffing Change Notes | r5 [L173] | 07/10/2026 |
| (managers and directors meeting) | "staff G200 full staffing no later than oct 1" | Staffing Change Notes | r6 [L174] | 7/21/26 |
| Cory | "Pery Cory this morning, the Praetor deal is on hold until January. I paused both jobs." | Staffing Change Notes | r7 [L175] | 09/03/2026 |
| Cory | "Green to hire per Cory text 08/17/26" (Praetor 600 SIC) | Staffing Change Notes | r29 [L197] col L | 08/17/26 |

## 1c. Tab "Training Info" - the onboarding / training tracker (108 person rows)

Columns as the sheet has them: Name | (unlabelled: External/Internal) | (unlabelled:
SS / M / PDP / -) | Position | Start Date | Orientation Date | Basic Indoc Date | Training Start
Date | Training End Date | Training Location | Training Status | (blank) | Open Training Dates.

Rows 3-6 sit ABOVE a divider row reading "ARCHIVED" in every column (row 37) - those four are the
live/upcoming ones. Rows 38-141 sit below it and are the tab's own archive. Rows 7-36 are blank
(the sheet's working space for the next intake).

### Above the ARCHIVED divider - current / upcoming

| Person name as written | Position as written | Int/Ext | SS/M/PDP | Training location | Start Date | Orientation | Basic Indoc | Training start | Training end | Status | TAB | Row locator |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hankyu Park | G200 SIC | External | SS | CAE MMU | 08/24/2026 | 09/01/2026 | 09/02/2026 | 09/06/2026 | 09/25/2026 | Confirmed | Training Info | r3 [L210] |
| Nick Lembo | PC-12 SIC | External | SS | EFT DFW | 08/24/2026 | N/A | 09/02/2026 | 9/14/2026 | 9/14/2026 | Confirmed | Training Info | r4 [L211] |
| Dayten Schureman | G200 SIC | External | SS | CAE MMU | 08/24/2026 | 09/01/2026 | 09/02/2026 | 09/06/2026 | 09/14/2026 | Confirmed | Training Info | r5 [L212] |
| Jake Thacker | PC-12 Captain | Internal | SS | FSI DFW | N/A | N/A | N/A | 09/14/2026 | 09/18/2026 | Confirmed | Training Info | r6 [L213] |

Open-training notes on those four rows: "Hank unavailable 08/27-08/31 FACTS 9/6/26" (r3),
"(PIC 135 INH-B)" (r5).

### Below the ARCHIVED divider - the tab's archive

| Person name as written | Position as written | Int/Ext | SS/M/PDP | Training location | Start Date | Training start | Status | TAB | Row locator |
|---|---|---|---|---|---|---|---|---|---|
| Rick Benik | G200 Captain | External | M | FSI/DFW | N/A | 2/5/24 | Confirmed | Training Info | r38 [L245] |
| Ian Marks | XL Captain | External | SS | Loft/CRQ (Carlsbad) | 1/10/24 | 2/2/24 | Confirmed | Training Info | r39 [L246] |
| Will Page | CJ2 FO | External | SS | FSI/MCO | 2/3/24 | 3/11/24 | Confirmed | Training Info | r40 [L247] |
| Ben Houston | CJ2 Captain | External | SS | FSI/MCO | 3/10/24 | 3/11/24 | Confirmed | Training Info | r41 [L248] |
| Teren Christenson | CJ2 Captain | Internal | SS | FSI/MCO | N/A | 4/8/24 | Confirmed | Training Info | r42 [L249] |
| Chris Holiday | G200 FO | Internal | SS | FSI/DFW | N/A | (blank) | Confirmed | Training Info | r43 [L250] |
| Brian Thomas | CJ2 Captain | Internal | SS | Loft/CRQ (Carlsbad) | N/A | 4/24/24 | Confirmed | Training Info | r44 [L251] |
| Nick Charles | PC-12 Captain | External | M | FSI/DEN | N/A | 5/3/24 | Confirmed | Training Info | r45 [L252] |
| Kimbol Poulsen | G200 FO | Internal | SS | FSI/DFW | N/A | 3/4/24 | Confirmed (SIC ONLY) | Training Info | r46 [L253] |
| Bailey Barcelon | XL FO | Internal | SS | Loft/CRQ (Carlsbad) | N/A | 2/26/24 | Confirmed (SIC ONLY) | Training Info | r47 [L254] |
| Devan Stewart | XL FO | Internal | SS | Loft/CRQ (Carlsbad) | N/A | 4/5/24 | Confirmed (SIC ONLY) | Training Info | r48 [L255] |
| Jeff Gerrard | PC-12 Lead Capt | External | M | FSI/DFW | N/A | 6/3/24 | Confirmed (NG) | Training Info | r49 [L256] |
| Chris Geradine | PC12 FO | External | PDP | Exec/In House | 3/8/24 | 4/2/24 | Confirmed | Training Info | r50 [L257] |
| Alex Ponomarev | CJ2 FO | External | SS | Loft/CRQ (Carlsbad) | 3/8/24 | 4/1/24 | Confirmed (SIC ONLY) | Training Info | r51 [L258] |
| Alec Smith | CJ2 FO | External | SS | FSI/MCO | 04/08/24 | 5/6/24 | Confirmed (SIC ONLY) | Training Info | r52 [L259] |
| Fabio Alves | CJ2 FO | External | SS | FSI/MCO | 04/08/24 | 5/6/24 | Confirmed (SIC ONLY) | Training Info | r53 [L260] |
| John McGarry | PC12 Captain | External | SS | FSI/DFW | 04/08/24 | 5/7/24 | Confirmed | Training Info | r54 [L261] |
| Benjamin Butler | PC12 Captain | External | SS | FSI/DFW | 5/20/2024 | 6/17/24 | Confirmed | Training Info | r55 [L262] |
| Allen Newport | M2 Captain | External | M | FSI/ICT | 5/21/2024 | 7/9/24 | Confirmed | Training Info | r56 [L263] |
| Alvaro Martin | CJ2 FO | External | SS | FSI/MCO | 6/10/24 | 7/15/24 | Confirmed | Training Info | r57 [L264] |
| Jaren Smith | M2 FO | External | M | FSI TAMPA | 6/17/24 | 8/6/24 | Confirmed | Training Info | r58 [L265] |
| Bryan Eklund | M2 FO | External | M | FSI TAMPA | 7/26/24 | 7/29/24 | Confirmed | Training Info | r59 [L266] |
| Erik Holmgren | PC-12 NG BMC | External | M | N/A | 9/8/24 | N/A | Confirmed | Training Info | r60 [L267] |
| Jermey McGraw | CJ2 Captain | External | SS | FSI MCO | 7/29/2024 | 8/12/24 | Confirmed | Training Info | r61 [L268] |
| Kylee Madsen | PC-12 Captain | External | SS | FSI DFW | N/A | 10/1/24 | Confirmed | Training Info | r62 [L269] |
| Cameron Nickel | CJ2 First Officer | External | SS | FSI MCO | 08/26/24 | 9/16/24 | Confirmed | Training Info | r63 [L270] |
| Brent Lowe | XL & CJ2 Captain | External | SS | LOFT CRQ | 9/17/24 | 10/01/24 | Confirmed | Training Info | r64 [L271] |
| Ren Stephani | PC-12 First Officer | External | PDP | In House / Executive | 10/23/2024 | 11/4/24 | Confirmed | Training Info | r65 [L272] |
| Jackson Wadsworth | PC-12 First Officer | External | PDP | In House / Executive | 10/23/2024 | 11/4/24 | Confirmed | Training Info | r66 [L273] |
| Landon Roberts | PC-12 Captain | External | SS | FSI DFW | 10/23/24 | 11/4/24 | Confirmed | Training Info | r67 [L274] |
| Chad Verdaglio | M2 Captain | External | M | FSI Wichita | 10/04/2024 | 10/08/2024 | Confirmed | Training Info | r68 [L275] |
| Scott Adams | G450 Captain | External | M | CAE LAS | 10/11/24 | 11/4/24 | Confirmed | Training Info | r69 [L276] |
| Patrick McPartland | G450 Lead Captain | External | M | CAE LAS | 10/20/2024 | 01/03/2025 (?) | **Canceled** - "Space holder for potential hire (Carter?)" | Training Info | r70 [L277] |
| Josh Thompson | G200 Captain | Internal | SS | FSI DFW | N/A | 12/2/24 | Confirmed | Training Info | r71 [L278] |
| Carter Copeland | G450 FO | External | M | CAE LAS | 12/16/2024 | 01/03/2025 | Confirmed (NEEDS CPDLC) | Training Info | r72 [L279] |
| Brenton Lamb | PC12 FO | External | PDP | IN-HOUSE | 6/10/2024 | In Progress | **Canceled** | Training Info | r73 [L280] |
| Jerry Harrington | CJ2 Captain | External | SS | LOFT CRQ | 01/13/2025 | 1/27/2025 | Confirmed | Training Info | r74 [L281] |
| Tommy Harvey | CJ2 SIC | External | SS | LOFT CRQ | 01/13/2025 | 1/27/2025 | Confirmed | Training Info | r75 [L282] |
| Wyatt Thomas | XL SIC | Internal | SS | LOFT CRQ | N/A | 1/13/2025 | Confirmed | Training Info | r76 [L283] |
| Kevin Smith | XL First Officer | Internal | SS | LOFT CRQ | N/A | 02/17/2025 | Confirmed | Training Info | r77 [L284] |
| Daniel Gonzalez | CJ2 Captain | Internal | SS | FSI MCO | N/A | 2/13/2025 | Confirmed | Training Info | r78 [L285] |
| Matt Dahle | PC-12 Captain | External | SS | FSI DFW | 1/13/2025 | 03/04/2025 | Confirmed | Training Info | r79 [L286] |
| Sven Lepschy | G450 Captain | External | M | FSI - LGB | 03/16/2025 | 04/14/2025 | Confirmed | Training Info | r80 [L287] |
| Nick Nadolski | PC-12 Captain | External | SS | FSI DFW | 2/17/2025 | 03/17/2025 | Confirmed | Training Info | r81 [L288] |
| Karina Wilson | PC-12 First Officer | External | PDP | Executive Flight Training | 03/24/2025 | 04/16/2025 | Confirmed | Training Info | r82 [L289] |
| Alvaro Martin (Was Nick Smout) | PC-12 Captain | Internal | SS | FSI-DFW | 04/12/2025 | 04/29/2025 | Confirmed | Training Info | r83 [L290] |
| Alexander Fowl | PC-12 Captain | External | SS | FSI DFW | 05/19/2025 | 7/8/2025 | Confirmed | Training Info | r84 [L291] |
| Brooke Milne | CJ2 First Officer | External | SS | LOFT CRQ | 06/01/2025 | 06/16/2025 | Confirmed | Training Info | r85 [L292] |
| Daniel Blanc | PC-12 Captain | External | SS | FSI DFW | 07/20/2025 | 8/6/2025 | Confirmed | Training Info | r86 [L293] |
| Chris Geradine | PC-12 Captain | Internal | SS | FSI DFW | N/A | 7/19/2025 | Confirmed | Training Info | r87 [L294] |
| Dayne Shafer | CJ2 Captain | Internal | SS | LOFT CRQ | N/A | 8/18/25 | Confirmed | Training Info | r88 [L295] |
| Carl Wiltse | XL Captain | Internal | SS | LOFT CRQ | N/A | 08/25/2025 | Confirmed | Training Info | r89 [L296] |
| Jacob Thacker | PC-12 First Officer | External | PDP | Executive Flight Training | 08/26/2025 | 9/16/2025 | Confirmed | Training Info | r90 [L297] |
| Kaytlin Francis | PC-12 NG Captain | Internal | M | FSI DEN | 08/18/2025 | 2/6/2026 | Confirmed | Training Info | r91 [L298] |
| Patrick Horan | CJ2 Captain | Internal | SS | LOFT | N/A | 10/11/2025 | Confirmed | Training Info | r92 [L299] |
| John Bohman | PC-12 Captain UofU | External | M | FSI Denver | 10/20/2025 | 11/03/2025 | Confirmed | Training Info | r93 [L300] |
| Parker Hale | CJ2 First Officer | External | SS | FSI | 10/20/2025 | 11/03/2025 | Confirmed | Training Info | r94 [L301] |
| Joel Garcia | G450 First Officer | External | SS | FSI Long Beach | 10/20/2025 | 11/6/2025 | Confirmed | Training Info | r95 [L302] |
| Patrick Bauder | G450 Captain | External | SS | CAE LAS | 10/20/2025 | 11/10/2025 | Confirmed | Training Info | r96 [L303] |
| Mickey Stateler | G450 Captain | External | SS | FSI LGB | 10/20/2025 | 11/17/2025 | Confirmed | Training Info | r97 [L304] |
| Alex Andrade | PC12 Captain | External | SS | FSI | 11/03/2025 | 11/17-11/21 | Confirmed | Training Info | r98 [L305] |
| Katie Bright | PC-12 First Officer | External | PDP | Executive Flight Training | 11/03/2025 | 11/24/2025 | Confirmed | Training Info | r99 [L306] |
| Corby Alexander | PC-12 Captain | External | SS | FSI DFW | 12/15/2025 | 01/06/2026 (end 01/16/2026) | Confirmed | Training Info | r100 [L307] |
| Nick Beine | PC-12 Captain | External | SS | FSI DFW | 12/15/2025 | 01/06/2026 (end 01/16/2026) | Confirmed | Training Info | r101 [L308] |
| David Gandolfi | XL Captain | Internal | SS | LOFT CRQ | N/A | 01/03/2026 (end 01/13/2026) | Confirmed | Training Info | r102 [L309] |
| Joshua (Brock) Tyler | G450 Captain | External | SS | CAE DFW | 12/15/2025 | 01/12/2026 (end 01/18/2026) | Confirmed | Training Info | r103 [L310] |
| Nicholas Hastings | G450 F/O | External | SS | CAE DFW | 1/12/2026 | 01/26/2026 (end 01/31/2026) | Confirmed | Training Info | r104 [L311] |
| Benjamin Pobanz | CJ2 F/O | External | SS | FSI MCO | 1/12/2026 | 02/02/2026 (end 02/17/2026) | Confirmed | Training Info | r105 [L312] |
| Adrienne Vaughn | PC-12 Captain | External | SS | FSI DFW | 1/12/2026 | 02/03/2026 (end 02/13/2026) | Confirmed | Training Info | r106 [L313] |
| Nicholas Zehr | PC-12 Captain | External | SS | FSI DFW | 1/12/2026 | 02/03/2026 (end 02/13/2026) | Confirmed | Training Info | r107 [L314] |
| Devon Carter | CJ2 Captain | Internal | SS | LOFT CRQ | N/A | 02/21/2026 (end 03/04/2026) | Confirmed | Training Info | r108 [L315] |
| Robbie Allen | G450 F/O | Internal | SS | CAE LAS | N/A | 03/04/2026 (end 03/24/2026) | Confirmed | Training Info | r109 [L316] |
| Mark Harris | G450 F/O | Internal | SS | CAE LAS | N/A | 03/04/2026 (end 03/24/2026) | Confirmed | Training Info | r110 [L317] |
| Fabio Alves | G200 SIC | Internal | SS | FSI DFW | N/A | 03/02/2026 (end 03/20/2026) | Confirmed | Training Info | r111 [L318] |
| Aleksandar (Alex) Kostic | G450 Captain | External | SS | CAE DFW | 2/16/2026 | 03/06/2026 (end 03/12/2026) | Confirmed | Training Info | r112 [L319] |
| Richard Vance | G200 Captain | External | SS | FSI DFW | 2/16/2026 | 03/02/2026 (end 03/20/2026) | Confirmed | Training Info | r113 [L320] |
| Maka Bailey | G200 SIC | External | SS | CAE MMU | 2/16/2026 | 03/02/2026 (end 03/18/2026) | Confirmed | Training Info | r114 [L321] |
| Gavin Wulderlich | PC-12 Captain | External | SS | FSI DFW | 2/16/2026 | 03/02/2026 (end 03/13/2026) | Confirmed | Training Info | r115 [L322] |
| Luke Diederich | CJ2 SIC | External | SS | LOFT CRQ | 2/16/2026 | 03/04/2026 (end 03/17/2026) | Confirmed | Training Info | r116 [L323] |
| Ren Carter | PC-12 Captain | Internal | SS | FSI DFW | N/A | 03/04/2026 (end 03/12/2026) | Confirmed | Training Info | r117 [L324] |
| Ben Butler | CJ2 Captain | Internal | SS | LOFT CRQ | N/A | 03/04/2026 (end 03/17/2026) | Confirmed | Training Info | r118 [L325] |
| Kyle Ferrin | CJ2 PIC | External | SS | LOFT CRQ | 3/2/2026 | 03/23/2026 (end 04/02/2026) | Confirmed | Training Info | r119 [L326] |
| Parker Potter | PC-12 SIC | External | PDP | EFT Dallas | 3/9/2026 | 03/28/2026 (end 03/28/2026) | Confirmed | Training Info | r120 [L327] |
| Branigan Hughes | PC-12 SIC | External | PDP | EFT Dallas | 3/9/2026 | 03/28/2026 (end 03/28/2026) | Confirmed | Training Info | r121 [L328] |
| Craig Little | G450 Captian (sic) | External | SS | CAE DFW | 3/23/2026 | 04/06/2026 (end 04/11/2026) | Confirmed | Training Info | r122 [L329] |
| Zach Davis | XLS+ Captain | External | M | CAE DFW | 3/23/2026 | 04/06/2026 (end 04/11/2026) | Confirmed | Training Info | r123 [L330] |
| Fahali Campbell | PC-12 Captain SIC | External | SS | In House | 3/23/2026 | 04/09/2026 (end 04/13/2026) | Confirmed | Training Info | r124 [L331] |
| David Costa | G450 Contract | External | - | CAE DFW | Contract | 04/01/2026 (end 04/21/2026) | Confirmed | Training Info | r125 [L332] |
| Jaren Smith | XLS+ SIC | External | M | CAE DFW | 3/23/2026 | 04/06/2026 (end 04/22/2026) | Confirmed | Training Info | r126 [L333] |
| Jerry Harrington | G200 PIC | Internal | SS | FSI DFW | N/A | 04/06/2026 (end 04/24/2026) | Confirmed | Training Info | r127 [L334] |
| Jack Matiasevich | M2 Lead Captain | External | M | FSI TPA | 3/23/2026 | 04/16/2026 (end 04/19/2026) | Confirmed | Training Info | r128 [L335] |
| Elijah Hall | PC-12 Captain | External | SS | FSI DFW | 4/20/2026 | 05/05/2026 (end 05/16/2026) | Confirmed | Training Info | r129 [L336] |
| Kylee Madsen | CJ2 Captain | Internal | SS | LOFT CRQ | N/A | 05/28/2026 (end 06/02/2026) | Confirmed | Training Info | r130 [L337] |
| Nick Carter | Legacy 650 | External | M | N/A | 4/1/2026 | N/A | (blank) - "91 ONLY" | Training Info | r131 [L338] |
| Russ Herman | Legacy 650 | External | M | N/A | 4/1/2026 | N/A | (blank) - "91 ONLY" | Training Info | r132 [L339] |
| Truman Nelson | Phenom 100 SIC | External | M | CAE LAS | 5/11/2026 | 05/26/2026 (end 6/10/2026) | Confirmed | Training Info | r133 [L340] |
| Chris Johnston | PC-12 Captain | External | SS | FSI DFW | 5/18/2026 | 06/02/2026 (end 06/12/2026) | Confirmed | Training Info | r134 [L341] |
| Landon Roberts | CJ2 Captain | Internal | SS | LOFT CRQ | N/A | 05/02/2026 (end 05/12/2026) | Confirmed | Training Info | r135 [L342] |
| Jonathan Siswick | Phenom 100 Captain | External | M | CAE LAS | 6/22/2026 | 07/07/2026 (end 07/22/2026) | Confirmed | Training Info | r136 [L343] |
| Caleb Green | PC-12 Captain | External | SS | FSI DFW | 6/8/2026 | 06/22/2026 (end 06/26/2026) | Confirmed | Training Info | r137 [L344] |
| Michael Salvagnini | PC-12 SIC | External | PDP | EFT | 6/8/2026 | 06/28/2026 (end 06/28/2026) | Confirmed | Training Info | r138 [L345] |
| Brett Moreland | G450 Captian (sic) | External | SS | CAE | 07/01/2026 | 07/13/2026 (end 07/19/2026) | Confirmed | Training Info | r139 [L346] |
| Matt Dahle | XL SIC | Internal | SS | LOFT | (blank) | 08/13/2026 (end 08/25/2026) | Confirmed | Training Info | r140 [L347] |
| Erik Schwerman | CJ3 | External | M | Feb 2027 | 08/24/2026 | Feb 2027 (end Feb 2027) | Confirmed | Training Info | r141 [L348] |

Training Info note cells worth keeping (col M, "Open Training Dates"):
- r43 Chris Holiday: "April 21-23"
- r45 Nick Charles: "135 INH-B"
- r49 Jeff Gerrard: "NG"
- r50 Chris Geradine: "Tentative March 22-25 Ground inhouse"
- r55 Benjamin Butler: "Travel 6/16-6/25"
- r60 Erik Holmgren: "Current on aircraft part 91 until end of October..... will not be going to
  inital sim training..... going to Executive flight 11/11/2024 for 91 flight training."
- r70 Patrick McPartland: "Space holder for potential hire (Carter?)"  [status Canceled]
- r72 Carter Copeland: "NEEDS CPDLC"
- r73 Brenton Lamb: "Confirmed with Teren 26th-29th (in house) // EFT @ AUS 7/6 0900"  [Canceled]
- r79 Matt Dahle: "FSI Date got messed up was entered at 02/04/2024"
- r80 Sven Lepschy: "Drug Test in Febuary AAA after"
- r104 Nicholas Hastings: "FACTS Jan 25th DFW"
- r109 Robbie Allen: "FACTS March 26th DFW"
- r111 Fabio Alves: "FACTS March 1st DFW"
- r112 Aleksandar (Alex) Kostic: "FACTS March 4th DFW"
- r113 Richard Vance: "FACTS March 1st DFW"
- r114 Maka Bailey: "FACTS March 1st MMU"
- r128 Jack Matiasevich: "04/16/2026 - 4/19/2026 for M2 | 05/07/2026 - 5/18/2026 for PC-12"
- r133 Truman Nelson: "(Truman unavailable 04/17-04/22) start 05/11, orientation , indoc 05/21,
  training 06/23"
- r138 Michael Salvagnini: "PC-12 Ground School 23rd-26th EFT: 6/28 Dallas 0900"
- r139 Brett Moreland: "Indoc in OGD 07/06-07/08, travel to CAE on 07/09 for training starting
  on 07/10"
- r134 Chris Johnston: Basic Indoc Date reads **"5/26/0206"** - a four-digit-year typo for 2026.

## 1d. The twelve per-aircraft roster tabs - the seat-by-seat roster

Every one of these tabs has the same skeleton: two seat blocks side by side, CAPTAIN (PIC) on the
left (cols A-E) and FIRST OFFICER (SIC) on the right (cols F-J), each with an ordinal, the person,
a "Base Month (CPO USING FOR TRAINING)", a Status, and an Aircraft (a tail number, the literal
word "Fractional", or "ONION"). Column L holds pay + qualification minimums and then Notes.

Status vocabulary observed, verbatim: GREEN, IN-TRAINING, OPEN, OPEN (ON HOLD), OPEN (On Hold),
TRANSISTION OUT (sic), Dual Qualified (dont use for numbers) (sic). An empty-named seat row whose
Status is OPEN is a vacancy, not a person; a seat whose name cell reads
"(Holding NOT READY TO HIRE)" is a parked seat.

### Tab "G450/G5" - header counts: CAPTAIN (PIC) 5 / FIRST OFFICER (SIC) 4

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | Base Month | TAB | Row locator |
|---|---|---|---|---|---|---|---|
| Sven Lepschy (Lead) | CAPTAIN (PIC) ordinal 1 | N787JS | - | GREEN | April | G450/G5 | r3 [L353] |
| Carter Copeland | FIRST OFFICER (SIC) ordinal 1 | N787JS | - | GREEN | January | G450/G5 | r3 [L353] |
| (vacant) | CAPTAIN (PIC) | N787JS | - | **OPEN** | - | G450/G5 | r4 [L354] |
| Patrick Bauder | CAPTAIN (PIC) ordinal 1 | Fractional | - | GREEN | November | G450/G5 | r6 [L356] |
| Robbie Allen | FIRST OFFICER (SIC) ordinal 1 | Fractional | - | GREEN | March | G450/G5 | r6 [L356] |
| Aleksandar Kostic | CAPTAIN (PIC) ordinal 2 | Fractional | - | GREEN | March | G450/G5 | r7 [L357] |
| Mark Harris | FIRST OFFICER (SIC) ordinal 2 | Fractional | - | GREEN | March | G450/G5 | r7 [L357] |
| Brett Moreland | CAPTAIN (PIC) ordinal 3 | Fractional | - | GREEN | July | G450/G5 | r8 [L358] |
| Nick Hastings | FIRST OFFICER (SIC) ordinal 3 | Fractional | - | GREEN | February | G450/G5 | r8 [L358] |
| (vacant) | CAPTAIN (PIC) ordinal 4 | Fractional | - | **OPEN** | - | G450/G5 | r9 [L359] |
| Joel Garcia | FIRST OFFICER (SIC) ordinal 4 | Fractional | - | GREEN | November | G450/G5 | r9 [L359] |

Pay on this tab (col L): Captain $250k-$270k (r3), First Officer $110k-$130k (r12).

### Tab "Legacy 650"

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | TAB | Row locator |
|---|---|---|---|---|---|---|
| Nick Carter | CAPTAIN (PIC) ordinal 1 | (blank) | - | GREEN | Legacy 650 | r3 [L384] |
| Russ Hermian | CAPTAIN (PIC) ordinal 2 | (blank) | - | GREEN | Legacy 650 | r4 [L385] |

Note the spelling: this tab writes **Russ Hermian**; Training Info r132 writes **Russ Herman**.
Notes on this tab (col L): "Recurrent Scheduled 11/6/2025 FSI DFW", "Recurrent Scheduled
11/17/2025 FSI DFW", "Recurrent Scheudled 12/18/2025 FSI DFW", "Initial Scheudled 1/5/2026
FSI DFW" (r20-r23).

### Tab "Challenger 350" - no people yet

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | TAB | Row locator |
|---|---|---|---|---|---|---|
| (vacant) | CAPTAIN (PIC) ordinal 1 | (blank) | SLC | **OPEN** | Challenger 350 | r3 [L415] |
| (vacant) | FIRST OFFICER (SIC) ordinal 1 | (blank) | SLC | **OPEN** | Challenger 350 | r3 [L415] |
| (vacant) | CAPTAIN (PIC) ordinal 2 | (blank) | SLC | **OPEN** | Challenger 350 | r4 [L416] |

This tab also carries a "SkyShare New Aircraft - Initial Data" intake block (rows 4-23, cols M-N):
Aircraft Type Challenger 350 / Tail Number N522AD / Year-Serial 2016, 20664 / Configuration
9 passengers (6 chairs, 3 place bench) / Operation Type Both Part 91 and 135 / Primary Airport
Base SLC / Hangar Atlantic Aviation / Operating Region Domestic - Oceanic / Number of PICs 2 /
PIC Salary Range $220K-$230K / Number of SICs 1 / SIC Salary Range $130K / Number of Cabin
Attendants 0 / CA Salary Range 0 / Per Diem Standard SkyShare Rates / Schedule Type and Hard Days
both "8 hard days off a month based on owner approval" / Crew Base Aircraft Based.

### Tab "G200" - header counts: CAPTAIN (PIC) 6 / FIRST OFFICER (SIC) 4

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | Base Month | TAB | Row locator |
|---|---|---|---|---|---|---|---|
| Aman Lal | CAPTAIN (PIC) ordinal 1 | Fractional | - | GREEN | August | G200 | r4 [L441] |
| Fabio Alves | FIRST OFFICER (SIC) ordinal 1 | Fractional | - | GREEN | March | G200 | r4 [L441] |
| Eric Fowles | CAPTAIN (PIC) ordinal 2 | Fractional | - | GREEN | August | G200 | r5 [L442] |
| Maka Bailey | FIRST OFFICER (SIC) ordinal 2 | Fractional | - | GREEN | March | G200 | r5 [L442] |
| Shawn Schiele | CAPTAIN (PIC) ordinal 3 | Fractional | - | GREEN | November | G200 | r6 [L443] |
| Hanku Park | FIRST OFFICER (SIC) ordinal 3 | Fractional | - | **IN-TRAINING** | (blank) | G200 | r6 [L443] |
| Josh Thompson | CAPTAIN (PIC) ordinal 4 | Fractional | - | GREEN | December | G200 | r7 [L444] |
| Dayten Schureman | FIRST OFFICER (SIC) ordinal 4 | Fractional | - | **IN-TRAINING** | (blank) | G200 | r7 [L444] |
| Richard Vance | CAPTAIN (PIC) ordinal 5 | Fractional | - | GREEN | March | G200 | r8 [L445] |
| (vacant) | FIRST OFFICER (SIC) ordinal 5 | Fractional | - | **OPEN** | - | G200 | r8 [L445] |
| Kat Larson | CAPTAIN (PIC) ordinal 6 | Fractional | - | GREEN | February | G200 | r9 [L446] |
| (vacant) | CAPTAIN (PIC) ordinal 7 | Fractional | - | **OPEN (ON HOLD)** | - | G200 | r10 [L447] |
| Jerry Harrington | (no ordinal - sits below the Notes line, the dual-qual area) | (blank) | - | GREEN | April | G200 | r22 [L459] |

"Hanku Park" here vs "Hankyu Park" on Master and Training Info vs "Park, Hanku" on Training
Events As Staffed - three spellings, one person.
Pay on this tab: First Officer $110,000 (r8).

### Tab "560XL" - two blocks. First block (ONION), then CAPTAIN (PIC) 5 / FIRST OFFICER (SIC) 3

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | Base Month | TAB | Row locator |
|---|---|---|---|---|---|---|---|
| Zach Davis | CAPTAIN ordinal 1 | ONION | - | GREEN | (blank) | 560XL | r3 [L466] |
| Jaren Smith | FIRST OFFICER ordinal 1 | ONION | - | GREEN | (blank) | 560XL | r3 [L466] |
| David Gandolfi | CAPTAIN (PIC) ordinal 1 | Fractional | - | GREEN | January | 560XL | r5 [L468] |
| Bailey Barcelon | FIRST OFFICER (SIC) ordinal 1 | Fractional | - | GREEN | March | 560XL | r5 [L468] |
| Kevin Smith | CAPTAIN (PIC) ordinal 2 | Fractional | - | GREEN | March | 560XL | r6 [L469] |
| Matt Dahle | FIRST OFFICER (SIC) ordinal 2 | Fractional | - | GREEN | (blank) | 560XL | r6 [L469] |
| Rob Bell | CAPTAIN (PIC) ordinal 3 | Fractional | - | GREEN | January | 560XL | r7 [L470] |
| (Holding NOT READY TO HIRE) | FIRST OFFICER (SIC) ordinal 3 | Fractional | - | **OPEN (On Hold)** | - | 560XL | r7 [L470] |
| Ben Fleckenstein | CAPTAIN (PIC) ordinal 4 | Fractional | - | GREEN | March | 560XL | r8 [L471] |
| (Holding NOT READY TO HIRE) | FIRST OFFICER (SIC) ordinal 4 | Fractional | - | **OPEN (On Hold)** | - | 560XL | r8 [L471] |
| Ian Marks | CAPTAIN (PIC) ordinal 5 | Fractional | - | GREEN | February | 560XL | r9 [L472] |
| Carl Wiltse | CAPTAIN (PIC) ordinal 6 | Fractional | - | GREEN | September | 560XL | r10 [L473] |

Note: the header says CAPTAIN (PIC) **5** but six GREEN captains are listed (ordinals 1-6).
Pay: Captain $160,000 (r5), First Officer $100,000 (r13).

### Tab "CJ2" - header counts: CAPTAIN (PIC) 7 / FIRST OFFICER (SIC) 6

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | Base Month | TAB | Row locator |
|---|---|---|---|---|---|---|---|
| Bryan Thomas | CAPTAIN (PIC) ordinal 1 | Fractional | - | GREEN | December | CJ2 | r3 [L487] |
| Brooke Kirchner | FIRST OFFICER (SIC) ordinal 1 | Fractional | - | GREEN | February | CJ2 | r3 [L487] |
| Jeremy McGraw | CAPTAIN (PIC) ordinal 2 | Fractional | - | GREEN | August | CJ2 | r4 [L488] |
| Ben Pobanz | FIRST OFFICER (SIC) ordinal 2 | Fractional | - | GREEN | June | CJ2 | r4 [L488] |
| Ben Butler | CAPTAIN (PIC) ordinal 3 | Fractional | - | GREEN | March | CJ2 | r5 [L489] |
| Luke Diederich | FIRST OFFICER (SIC) ordinal 3 | Fractional | - | GREEN | February | CJ2 | r5 [L489] |
| Kyle Ferrin | CAPTAIN (PIC) ordinal 4 | Fractional | - | GREEN | April | CJ2 | r6 [L490] |
| Parker Hale | FIRST OFFICER (SIC) ordinal 4 | Fractional | - | **IN-TRAINING** | (blank) | CJ2 | r6 [L490] |
| Kylee Madsen | CAPTAIN (PIC) ordinal 5 | Fractional | - | GREEN | June | CJ2 | r7 [L491] |
| (Holding NOT READY TO HIRE) | FIRST OFFICER (SIC) ordinal 5 | Fractional | - | **OPEN (On Hold)** | - | CJ2 | r7 [L491] |
| Landon Roberts | CAPTAIN (PIC) ordinal 6 | Fractional | - | GREEN | May | CJ2 | r8 [L492] |
| (Holding NOT READY TO HIRE) | FIRST OFFICER (SIC) ordinal 6 | Fractional | - | **OPEN (On Hold)** | - | CJ2 | r8 [L492] |
| Dayne Shafer | CAPTAIN (PIC) ordinal 7 | Fractional | - | **TRANSISTION OUT** | August | CJ2 | r9 [L493] |
| Tommy Harvey | (SIC column, below Notes) | (blank) | - | **TRANSISTION OUT** | April | CJ2 | r20 [L504] |
| Jerry Harrington | (PIC column, below Notes) | Fractional | - | **Dual Qualified (dont use for numbers)** | February | CJ2 | r21 [L505] |
| David Gandolfi | (PIC column, below Notes) | Fractional | - | **Dual Qualified (dont use for numbers)** | February | CJ2 | r22 [L506] |
| Josh Thompson | (PIC column, below Notes) | Fractional | - | **Dual Qualified (dont use for numbers)** | December | CJ2 | r23 [L507] |
| Carl Wiltse | (PIC column, below Notes) | Fractional | - | **Dual Qualified (dont use for numbers)** | November | CJ2 | r24 [L508] |

Pay: Captain $125,000 (r3), First Officer $65,000 (r10).
Note on this tab: "3 A/C in fleet Aligmnent Meeting 3/24/26" (r18).

### Tab "PC-12" - managed-tail block, then CAPTAIN (PIC) 14 / FIRST OFFICER (SIC) 6

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | Base Month | TAB | Row locator |
|---|---|---|---|---|---|---|---|
| Shad Guffey | CAPTAIN (PIC) ordinal 1 | N418T | - | GREEN | October | PC-12 | r3 [L513] |
| Jeff Gerrard | CAPTAIN (PIC) ordinal 1 | N413UU | - | GREEN | June | PC-12 | r4 [L514] |
| John Bohman | CAPTAIN (PIC) ordinal 2 | N413UU | - | GREEN | November | PC-12 | r5 [L515] |
| Kaytlin Francis | CAPTAIN (PIC) ordinal 3 | N413UU | - | GREEN | February | PC-12 | r6 [L516] |
| Daniel Blanc | CAPTAIN (PIC) ordinal 1 | Fractional | - | GREEN | August | PC-12 | r8 [L518] |
| Karina Wilson | FIRST OFFICER (SIC) ordinal 1 | Fractional | - | GREEN | April | PC-12 | r8 [L518] |
| Chris Geradine | CAPTAIN (PIC) ordinal 2 | Fractional | - | GREEN | July | PC-12 | r9 [L519] |
| Parker Potter | FIRST OFFICER (SIC) ordinal 2 | Fractional | - | GREEN | April | PC-12 | r9 [L519] |
| Alvaro Martin | CAPTAIN (PIC) ordinal 3 | Fractional | - | GREEN | September | PC-12 | r10 [L520] |
| Branigan Hughes | FIRST OFFICER (SIC) ordinal 3 | Fractional | - | GREEN | April | PC-12 | r10 [L520] |
| Alexander Andrade | CAPTAIN (PIC) ordinal 4 | Fractional | - | GREEN | November | PC-12 | r11 [L521] |
| Michael Salvagnini | FIRST OFFICER (SIC) ordinal 4 | Fractional | - | GREEN | July | PC-12 | r11 [L521] |
| Corby Alexander | CAPTAIN (PIC) ordinal 5 | Fractional | - | GREEN | January | PC-12 | r12 [L522] |
| Nick Lembo | FIRST OFFICER (SIC) ordinal 5 | Fractional | - | **IN-TRAINING** | September | PC-12 | r12 [L522] |
| Nick Beine | CAPTAIN (PIC) ordinal 6 | Fractional | - | GREEN | January | PC-12 | r13 [L523] |
| (Holding NOT READY TO HIRE) | FIRST OFFICER (SIC) ordinal 6 | Fractional | - | **OPEN (ON HOLD)** | - | PC-12 | r13 [L523] |
| Adrienne Vaughn | CAPTAIN (PIC) ordinal 7 | Fractional | - | GREEN | February | PC-12 | r14 [L524] |
| Nicholas Zehr | CAPTAIN (PIC) ordinal 8 | Fractional | - | GREEN | March | PC-12 | r15 [L525] |
| Ren Carter | CAPTAIN (PIC) ordinal 9 | Fractional | - | GREEN | March | PC-12 | r16 [L526] |
| Gavin Wulderlich | CAPTAIN (PIC) ordinal 10 | Fractional | - | GREEN | March | PC-12 | r17 [L527] |
| Elijah Hall | CAPTAIN (PIC) ordinal 11 | Fractional | - | GREEN | May | PC-12 | r18 [L528] |
| Caleb Green | CAPTAIN (PIC) ordinal 12 | Fractional | - | GREEN | June | PC-12 | r19 [L529] |
| Jake Thacker | CAPTAIN (PIC) ordinal 13 | Fractional | - | **IN-TRAINING** | September | PC-12 | r20 [L530] |
| (Holding NOT READY TO HIRE) | CAPTAIN (PIC) ordinal 14 | Fractional | - | **OPEN (ON HOLD)** | - | PC-12 | r21 [L531] |
| (Holding NOT READY TO HIRE) | CAPTAIN (PIC) ordinal 15 | Fractional | - | **OPEN (ON HOLD)** | - | PC-12 | r22 [L532] |
| (Holding NOT READY TO HIRE) | CAPTAIN (PIC) ordinal 16 | Fractional | - | **OPEN (ON HOLD)** | - | PC-12 | r23 [L533] |
| Benjamin Butler | (PIC column, below Notes) | Fractional | - | **Dual Qualified (dont use for numbers)** | June | PC-12 | r28 [L538] |
| Devon Carter | (PIC column, below Notes) | Fractional | - | **Dual Qualified (dont use for numbers)** | January | PC-12 | r29 [L539] |
| Matt Dahle | (PIC column, below Notes) | Fractional | - | **Dual Qualified (dont use for numbers)** | March | PC-12 | r30 [L540] |
| Dayne Shafer | (PIC column, below Notes) | Fractional | - | **Dual Qualified (dont use for numbers)** | January | PC-12 | r31 [L541] |
| Landon Roberts | (PIC column, below Notes) | Fractional | - | **Dual Qualified (dont use for numbers)** | November | PC-12 | r32 [L542] |
| Kylee Madsen | (PIC column, below Notes) | Fractional | - | **Dual Qualified (dont use for numbers)** | October | PC-12 | r33 [L543] |
| Jacob Thacker | (SIC column, below Notes) | Fractional | - | **TRANSISTION OUT** | September | PC-12 | r33 [L543] |

Pay: Captain $90,000 to $100,000 (r3), First Officer $40,000 (r12).
Note on this tab: "8 PC-12's Need Staffed as of 3/24/26 with Alignment Meeting" (r20).
**Note "Jake Thacker" (ordinal 13, IN-TRAINING, PC-12 Captain) and "Jacob Thacker"
(TRANSISTION OUT, PC-12 SIC) appear as two entries on the same tab. Training Info has both
spellings too: r6 "Jake Thacker / PC-12 Captain / Internal" and r90 "Jacob Thacker / PC-12 First
Officer / External / PDP". Consistent with one person upgrading PDP SIC to Captain - but the
sheet never says so, and a name-keyed import will treat them as two people.**

### Tab "CJ3? Utah"

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | TAB | Row locator |
|---|---|---|---|---|---|---|
| Erik Schwerman | CAPTAIN (PIC) ordinal 1 | (blank) | - | **IN-TRAINING** | CJ3? Utah | r3 [L548] |

### Tab "CJ"

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | TAB | Row locator |
|---|---|---|---|---|---|---|
| (vacant) | CAPTAIN (PIC) ordinal 1 | (blank) | Georgia / CVC / N443BC per Master | **OPEN** | CJ | r3 [L558] |

### Tab "M2"

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | TAB | Row locator |
|---|---|---|---|---|---|---|
| Jack Matiasevich | CAPTAIN (PIC) ordinal 1 | N782PD | - | GREEN | M2 | r3 [L568] |

**N782PD appears nowhere else in the workbook.** Master's "M2 & PC-12" block names M2 = N785PD
(r133 [L134]) and PC-12 = N477KR (r134 [L135]). So either the M2 tab's tail or Master's is wrong -
see UNCERTAIN #4.

### Tab "Phenom 100" - header counts: CAPTAIN (PIC) 1 / FIRST OFFICER (SIC) 1

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | Start date inside the name cell | TAB | Row locator |
|---|---|---|---|---|---|---|---|
| Jonathan Siswick (Start 06/22/2026) | CAPTAIN (PIC) ordinal 1 | N450JF | - | GREEN | Start 06/22/2026 | Phenom 100 | r3 [L578] |
| Truman Nelson (Start 05/11/2026) | FIRST OFFICER (SIC) ordinal 1 | N450JF | - | GREEN | Start 05/11/2026 | Phenom 100 | r3 [L578] |

Pay cells on this tab are literally "Captain - $" and "First Officer - $" - amounts never filled in
(r3 and r10).

### Tab "Phenom 300e / Longitude" - header counts: CAPTAIN (PIC) 1 / FIRST OFFICER (SIC) 1

This tab is shifted one column left of its siblings (11 cols, not 12) - it has no ordinal column.

| Person name as written | Position/seat as written | Aircraft or tail | Base | Status | Base Month | TAB | Row locator |
|---|---|---|---|---|---|---|---|
| Matt Garner | CAPTAIN (PIC) | N409KG | - | GREEN | July | Phenom 300e / Longitude | r3 [L605] |
| Will Page | FIRST OFFICER (SIC) | N409KG | - | GREEN | November | Phenom 300e / Longitude | r3 [L605] |
| (vacant) | CAPTAIN (PIC) | (blank) | - | **OPEN (ON HOLD)** | - | Phenom 300e / Longitude | r4 [L606] |

Note on this tab: "N409KG 1 Captian, 1 First Officer" (r16).

## 1e. Tab "Referral Bonus Info" - 28 rows, each naming TWO people

The "Referral Name" is the hire; the "Referrer (Bonus Receiver)" is an existing employee. Both are
people, and the Position column is the hire's position.

| Referral Name (the hire) | Referrer (Bonus Receiver) | Position as written | Start Date | Completion of 135.293/299 | 1st bonus | Paid | 6-mo bonus | Paid | TAB | Row locator |
|---|---|---|---|---|---|---|---|---|---|---|
| Patrick Horan | Clay Lingo | PC12 - PIC | 10/16/2023 | 11/2023 | $1,000 | TRUE | $2,000 | TRUE | Referral Bonus Info | r3 [L632] |
| Kathleen Larson | Wyatt Thomas | G200 - FO | 9/20/2023 | 10/2023 | $500 | TRUE | $500 | TRUE | Referral Bonus Info | r4 [L633] |
| Alex Ponomarev | Teren Christensen | CJ2 FO | 3/8/2024 | 4/19/24 | $500 | TRUE | $500 | TRUE | Referral Bonus Info | r5 [L634] |
| Chris Geradine | Teren Christensen | PC12 FO | 3/8/2024 | 5/2/24 | $500 | TRUE | $500 | TRUE | Referral Bonus Info | r6 [L635] |
| Ben Houston | Ben Fleckenstein | CJ2 Captain | 3/10/2024 | 4/26/24 | $500 | FALSE | $1,000 | FALSE | Referral Bonus Info | r7 [L636] |
| Alec Smith | Teren Christensen | CJ2 FO | 4/8/2024 | 5/25/24 | $500 | TRUE | $500 | TRUE | Referral Bonus Info | r8 [L637] |
| Jermey McGraw | Mike Newton | CJ2 Captain | 7/29/2024 | 8/27/24 | $1,000 | TRUE | $2,000 | TRUE | Referral Bonus Info | r9 [L638] |
| Cameron Nickel | Kylee Madsen | CJ2 FO | 08/26/2024 | 10/1/2024 | $500 | TRUE | $500 | TRUE | Referral Bonus Info | r10 [L639] |
| Erik Holmgren | Wyatt Thomas | PC-12 NG Lead PIC | 9/9/2024 | 11/11/2024 | $1,000 | TRUE | $2,000 | **FALSE** | Referral Bonus Info | r11 [L640] |
| Carter Copeland | Corissa Thomas | G450 FO | (blank) | 1/15/25 | $500 | TRUE | $500 | **FALSE** | Referral Bonus Info | r12 [L641] |
| Tommy Harvey | Harry Mitchel | CJ2 FO | (blank) | (blank) | $0 | FALSE | $0 | FALSE | Referral Bonus Info | r13 [L642] |
| Matt Dahle | Ben Fleckenstein | PC12 - PIC | 1/13/2025 | 3/15/2025 | $1,000 | TRUE | $2,000 | TRUE | Referral Bonus Info | r14 [L643] |
| Sven Lepschy | Carter Copeland | G450 PIC | 03/16/2025 | (blank) | $1,000 | TRUE | $2,000 | TRUE | Referral Bonus Info | r15 [L644] |
| Brooke Milne Kirchner | Josh Thompson | CJ2 FO | 06/01/2025 | 6/16/2025 | $500 | TRUE | $500 | TRUE | Referral Bonus Info | r16 [L645] |
| John Bohman | Jeff Gerrard | PC12 - PIC (UU) | 10/20/2025 | 11/8/2025 | $1,000 | TRUE | $2,000 | TRUE | Referral Bonus Info | r17 [L646] |
| Alexander Andrade | Patrick Horan | PC12 - PIC | 11/3/2025 | 11/21/25 | $1,000 | TRUE | $2,000 | TRUE | Referral Bonus Info | r18 [L647] |
| Brock Tyler | Mickey Stateler | G450 PIC | 12/15/2025 | (blank) | (blank) | (blank) | (blank) | (blank) | Referral Bonus Info | r19 [L648] |
| Benjamin Pobanz | Jordan Wayment | CJ2 FO | 1/12/2026 | 2/18/26 | $500 | TRUE | $500 | TRUE | Referral Bonus Info | r20 [L649] |
| Alex Kostic | Nicholas Hastings | G450 PIC | 2/16/2026 | 3/11/26 | $1,000 | TRUE | $2,000 | TRUE | Referral Bonus Info | r21 [L650] |
| Luke Diederich | Karina Wilson | CJ2 FO | 2/16/2026 | 3/17/26 | $500 | TRUE | $500 | TRUE | Referral Bonus Info | r22 [L651] |
| Kyle Ferrin | Levi Clark | CJ2 PIC | 3/2/2026 | 4/2/26 | $1,000 | TRUE | $2,000 | **FALSE** (due 9/29/26) | Referral Bonus Info | r23 [L652] |
| Jack Matiasevich | BizJetJobs | M2 PIC | (blank) | (blank) | (blank) | (blank) | (blank) | (blank) | Referral Bonus Info | r24 [L653] |
| Craig Little | (blank) | GV PIC | (blank) | (blank) | (blank) | (blank) | (blank) | (blank) | Referral Bonus Info | r25 [L654] |
| Zach Davis | Ben Butler | XLS+ PIC | (blank) | 4/11/26 | $1,000 | TRUE | $2,000 | (blank, due 10/8/26) | Referral Bonus Info | r26 [L655] |
| Elijah Hall | (blank) | PC12 - PIC | (blank) | (blank) | (blank) | (blank) | (blank) | (blank) | Referral Bonus Info | r27 [L656] |
| Jonathan Siswick | Truman Nelson | Phenom 100 PIC | 6/22/2026 | 7/22/26 | $1,000 | TRUE | $2,000 | **FALSE** (due 1/18/27) | Referral Bonus Info | r28 [L657] |
| Nicholas Smout | Benjamin Huff | PC12 - PIC | 04/14/2025 | (blank) | $1,000 | **FALSE** | $2,000 | **FALSE** | Referral Bonus Info | r39 [L668] |
| Jason Zolezzi | Teren Christensen | PC12 FO | 3/8/2024 | (blank) | $500 | **FALSE** | $500 | **FALSE** | Referral Bonus Info | r40 [L669] |

Rows 29-38 are blank; the last two rows (39, 40) sit below that gap, which is why they read as
stragglers. "BizJetJobs" in the Referrer column for Jack Matiasevich is a job board, not a person.
Referral Info panel (col N): "Captain Referral Bonus: $3,000" / "Paid out to employee $1,000 after
successful completion of 135.299, then $2,000 paid out after 6 months." / "First Officer Referral
Bonus: $1,000" / "Paid out to employee $500 after successful completion of 135.293, then $500 paid
out after 6 months." / "To be eligible for the SkyShare Employee Referral Bonus: You must be
employed by SkyShare or employed by an aircraft owner managed by SkyShare at the time of payout."

## 1f. Tab "Sign-on/Relo Bonus" - 16 rows, 14 distinct people, NO position column

This tab names people with no position at all, so it is the one tab where a person cannot be tied
to a seat from the tab itself. Several of these names appear nowhere in the pilot rosters
(Fred Saadat, Kayla Perez, Scott Strahan, Luke Webb, Robert Patrick, Harry (Chip) Mitchel) -
likely non-pilot hires. Captured because they are person records the workbook holds.

| Person name as written | Bonus Type | Start Date | 1st Payment Date | 1st Amount | 1st Paid | 2nd Payment Date | 2nd Amount | 2nd Paid | TAB | Row locator |
|---|---|---|---|---|---|---|---|---|---|---|
| Fred Saadat | Sign-On | (blank) | training completion | $10,000 | FALSE | 6 months fromtraining completion | $10,000 | FALSE | Sign-on/Relo Bonus | r3 [L674] |
| Nicholas Zehr | Relocation | 1/12/2026 | only 1 payment | $500 | TRUE | (blank) | (blank) | FALSE | Sign-on/Relo Bonus | r4 [L675] |
| Jack Matiasevich | Sign-On | 3/23/2026 | Completion of Citation M2 initial Training - 4/19 | $5,000 | TRUE | (blank) | (blank) | FALSE | Sign-on/Relo Bonus | r5 [L676] |
| Jack Matiasevich | Sign-On | 3/23/2026 | Completion of Citation PC-12 initial Training 5/18 | $5,000 | TRUE | (blank) | (blank) | FALSE | Sign-on/Relo Bonus | r6 [L677] |
| Jack Matiasevich | Relocation | 3/23/2026 | 4/15/2026 | $10,000 | TRUE | (blank) | (blank) | FALSE | Sign-on/Relo Bonus | r7 [L678] |
| Kayla Perez | Relocation | 12/4/2025 | First Paycheck | $3,000 | TRUE | N/A | (blank) | FALSE | Sign-on/Relo Bonus | r8 [L679] |
| Nicholas Hastings | Sign-On | 1/12/2026 | Training completion | $15,000 | TRUE | N/A | (blank) | FALSE | Sign-on/Relo Bonus | r9 [L680] |
| Kyle Ferrin | Sign-On | 03/02/2026 | 4/15/2026 | $5,000 | TRUE | One year anniversary | $5,000 | FALSE | Sign-on/Relo Bonus | r10 [L681] |
| Harry (Chip) Mitchel | Relocation | 2/16/2026 | 4/15/2026 | $10,000 | TRUE | n/a | (blank) | FALSE | Sign-on/Relo Bonus | r11 [L682] |
| Zachery Davis | Relocation | 3/23/2026 | 4/15/2026 | $7,500 | TRUE | (blank) | (blank) | FALSE | Sign-on/Relo Bonus | r12 [L683] |
| Scott Strahan | Sign-On | 7/6/2026 | 30 days after start - 8/15/2026 | $2,500 | TRUE | 6 months after start - 01/15/2027 | $2,500 | FALSE | Sign-on/Relo Bonus | r13 [L684] |
| Luke Webb | Sign-On | 07/27/2026 | 30 days after start - 9/15/2026 | $2,500 | TRUE | 6 months after start - 01/23/2027 | $2,500 | FALSE | Sign-on/Relo Bonus | r14 [L685] |
| Brett Moreland | Sign-On | 7/1/2026 | after training completion (pay 7/31/2026) | $15,000 | TRUE | (blank) | (blank) | FALSE | Sign-on/Relo Bonus | r15 [L686] |
| Erik Schwerman | Relocation | 8/24/2026 | First regular pay date after start - 9/15/2026 | $7,000 | TRUE | (blank) | (blank) | FALSE | Sign-on/Relo Bonus | r16 [L687] |
| Robert Patrick | Relocation | 8/24/2026 | First regular pay date after start - 10/15/2026 | $8,000 | **FALSE** | (blank) | (blank) | FALSE | Sign-on/Relo Bonus | r17 [L688] |
| Robert Patrick | Sign-On | **08/242026** (typo) | 30 days of employment - | $2,500 | FALSE | 6 months after start - | $2,500 | FALSE | Sign-on/Relo Bonus | r18 [L689] |

"Zachery Davis" here vs "Zach Davis" on the 560XL tab and Training Info - same person, two
spellings. **Robert Patrick has an 8/24/2026 start and both bonus payments still FALSE as of
today's 2026-09-11 modification; he appears on NO roster tab and NO Training Info row.** See
UNCERTAIN #3.

## 1g. Tab "Training Events As Staffed" - 70 person rows (recurrent-training roster)

Names here are "Last, First" format, which is a third naming convention in the same workbook.
Two columns of people: PIC (cols A-E) and SIC (cols G-J). A person appearing twice means dual
qualification (the aircraft differs).

| Person name as written | Column | Aircraft Type | SkyShare/Managed | .293's month | .297's month | TAB | Row locator |
|---|---|---|---|---|---|---|---|
| Alexander, Corby | PIC | PC-12 | Fractional | January | July | Training Events As Staffed | r5 [L714] |
| Andrade, Alexander | PIC | PC-12 | Fractional | November | May | Training Events As Staffed | r6 [L715] |
| Bauder, Patrick | PIC | G450 | Fractional | November | May | Training Events As Staffed | r7 [L716] |
| Beine, Nick | PIC | PC-12 | Fractional | January | July | Training Events As Staffed | r8 [L717] |
| Bell, Rob | PIC | 560XL | Fractional | January | July | Training Events As Staffed | r9 [L718] |
| Blanc, Daniel | PIC | PC-12 | Fractional | August | February | Training Events As Staffed | r10 [L719] |
| Bohman, John | PIC | PC-12 | N413UU | November | May | Training Events As Staffed | r11 [L720] |
| Butler, Ben | PIC | CJ2 | Fractional | March | September | Training Events As Staffed | r12 [L721] |
| Butler, Benjamin | PIC | PC-12 | Fractional | June | December | Training Events As Staffed | r13 [L722] |
| Carter, Devon | PIC | PC-12 | Fractional | January | July | Training Events As Staffed | r14 [L723] |
| Carter, Ren | PIC | PC-12 | Fractional | (blank) | (blank) | Training Events As Staffed | r15 [L724] |
| Dahle, Matt | PIC | PC-12 | Fractional | March | September | Training Events As Staffed | r16 [L725] |
| Ferrin, Kyle | PIC | CJ2 | Fractional | April | October | Training Events As Staffed | r17 [L726] |
| Fleckenstein, Ben | PIC | 560XL | Fractional | March | September | Training Events As Staffed | r18 [L727] |
| Fowles, Eric | PIC | G200 | Fractional | August | February | Training Events As Staffed | r19 [L728] |
| Francis, Kaytlin | PIC | PC-12 | N413UU | February | August | Training Events As Staffed | r20 [L729] |
| Gandolfi, David | PIC | CJ2 | Fractional | February | August | Training Events As Staffed | r21 [L730] |
| Garner, Matt | PIC | Phenom 300e | N409KG | July | January | Training Events As Staffed | r22 [L731] |
| Geradine, Chris | PIC | PC-12 | Fractional | July | January | Training Events As Staffed | r23 [L732] |
| Gerrard , Jeff | PIC | PC-12 | N413UU | June | December | Training Events As Staffed | r24 [L733] |
| Green, Caleb | PIC | PC-12 | Fractional | June | December | Training Events As Staffed | r25 [L734] |
| Guffey, Shad | PIC | PC-12 | N418T | October | April | Training Events As Staffed | r26 [L735] |
| Hall, Elijah | PIC | PC-12 | Fractional | May | November | Training Events As Staffed | r27 [L736] |
| Harrington , Jerry | PIC | G200 | (blank) | April | October | Training Events As Staffed | r28 [L737] |
| Harrington, Jerry | PIC | CJ2 | Fractional | February | August | Training Events As Staffed | r29 [L738] |
| Kostic, Aleksandar | PIC | G450 | Fractional | March | September | Training Events As Staffed | r30 [L739] |
| Lal, Aman | PIC | G200 | Fractional | August | February | Training Events As Staffed | r31 [L740] |
| Larson, Kat | PIC | G200 | Fractional | February | August | Training Events As Staffed | r32 [L741] |
| Lepschy (Lead), Sven | PIC | G450 | N787JS | April | October | Training Events As Staffed | r33 [L742] |
| Madsen, Kylee | PIC | CJ2 | Fractional | June | December | Training Events As Staffed | r34 [L743] |
| Madsen, Kylee | PIC | PC-12 | Fractional | October | April | Training Events As Staffed | r35 [L744] |
| Marks, Ian | PIC | 560XL | Fractional | February | August | Training Events As Staffed | r36 [L745] |
| Martin , Alvaro | PIC | PC-12 | Fractional | September | March | Training Events As Staffed | r37 [L746] |
| McGraw, Jeremy | PIC | CJ2 | Fractional | August | February | Training Events As Staffed | r38 [L747] |
| Moreland, Brett | PIC | G450 | Fractional | July | January | Training Events As Staffed | r39 [L748] |
| Roberts, Landon | PIC | CJ2 | Fractional | May | November | Training Events As Staffed | r43 [L752] |
| Roberts, Landon | PIC | PC-12 | Fractional | November | May | Training Events As Staffed | r44 [L753] |
| Schiele, Shawn | PIC | G200 | Fractional | November | May | Training Events As Staffed | r45 [L754] |
| Shafer, Dayne | PIC | CJ2 | Fractional | August | Dual Qualled | Training Events As Staffed | r46 [L755] |
| Shafer, Dayne | PIC | PC-12 | Fractional | January | Dual Qualled | Training Events As Staffed | r47 [L756] |
| Thacker, Jake | PIC | PC-12 | Fractional | September | March | Training Events As Staffed | r48 [L757] |
| Thomas, Bryan | PIC | CJ2 | Fractional | December | June | Training Events As Staffed | r49 [L758] |
| Thompson, Josh | PIC | CJ2 | Fractional | December | June | Training Events As Staffed | r50 [L759] |
| Thompson, Josh | PIC | G200 | Fractional | December | June | Training Events As Staffed | r51 [L760] |
| Vance, Richard | PIC | G200 | Fractional | March | September | Training Events As Staffed | r52 [L761] |
| Vaughn, Adrienne | PIC | PC-12 | Fractional | February | August | Training Events As Staffed | r53 [L762] |
| Wiltse, Carl | PIC | 560XL | Fractional | September | March | Training Events As Staffed | r54 [L763] |
| Wiltse, Carl | PIC | CJ2 | Fractional | November | May | Training Events As Staffed | r55 [L764] |
| Wulderlich, Gavin | PIC | PC-12 | Fractional | March | September | Training Events As Staffed | r56 [L765] |
| Zehr , Nicholas | PIC | PC-12 | Fractional | March | September | Training Events As Staffed | r57 [L766] |
| Allen, Robbie | SIC | G450 | Fractional | recurrent month: March | - | Training Events As Staffed | r3 [L712] |
| Alves, Fabio | SIC | G200 | Fractional | recurrent month: March | - | Training Events As Staffed | r4 [L713] |
| Bailey , Maka | SIC | G200 | Fractional | recurrent month: March | - | Training Events As Staffed | r5 [L714] |
| Copeland, Carter | SIC | G450 | N787JS | recurrent month: January | - | Training Events As Staffed | r6 [L715] |
| Dahle, Matt | SIC | 560XL | Fractional | (blank) | - | Training Events As Staffed | r7 [L716] |
| Diederich, Luke | SIC | CJ2 | Fractional | recurrent month: February | - | Training Events As Staffed | r8 [L717] |
| Garcia, Joel | SIC | G450 | Fractional | recurrent month: November | - | Training Events As Staffed | r9 [L718] |
| Hale, Parker | SIC | CJ2 | Fractional | (blank) | - | Training Events As Staffed | r10 [L719] |
| Harris, Mark | SIC | G450 | Fractional | recurrent month: March | - | Training Events As Staffed | r11 [L720] |
| Harvey, Tommy | SIC | CJ2 | (blank) | recurrent month: April | - | Training Events As Staffed | r12 [L721] |
| Hastings , Nick | SIC | G450 | Fractional | recurrent month: February | - | Training Events As Staffed | r13 [L722] |
| Hughes, Branigan | SIC | PC-12 | Fractional | recurrent month: April | - | Training Events As Staffed | r14 [L723] |
| Lembo, Nick | SIC | PC-12 | Fractional | recurrent month: September | - | Training Events As Staffed | r15 [L724] |
| Page, Will | SIC | Phenom 300e | N409KG | recurrent month: November | - | Training Events As Staffed | r23 [L732] |
| Park, Hanku | SIC | G200 | Fractional | (blank) | - | Training Events As Staffed | r24 [L733] |
| Pobanz, Ben | SIC | CJ2 | Fractional | recurrent month: June | - | Training Events As Staffed | r25 [L734] |
| Potter, Parker | SIC | PC-12 | Fractional | recurrent month: April | - | Training Events As Staffed | r26 [L735] |
| Salvagnini , Michael | SIC | PC-12 | Fractional | recurrent month: July | - | Training Events As Staffed | r27 [L736] |
| Schureman, Dayten | SIC | G200 | Fractional | (blank) | - | Training Events As Staffed | r28 [L737] |
| Wilson, Karina | SIC | PC-12 | Fractional | recurrent month: April | - | Training Events As Staffed | r29 [L738] |

Non-person rows on this tab that a naive import WILL pick up as people - flagging them so nobody
has to rediscover it. These are column-header text that got sorted into the data:

| Garbage value | Column | TAB | Row locator |
|---|---|---|---|
| (PIC) 14, CAPTAIN | PIC, Aircraft Type PC-12 | Training Events As Staffed | r3 [L712] |
| (PIC) 5, CAPTAIN | PIC, Aircraft Type G450, "Aircraft" in the Managed col | Training Events As Staffed | r4 [L713] |
| OFFICER (SIC) 4, FIRST | SIC, G450, "Aircraft" | Training Events As Staffed | r21 [L730] |
| OFFICER (SIC) 6, FIRST | SIC, PC-12 | Training Events As Staffed | r22 [L731] |
| NOT READY TO HIRE), (Holding | SIC, 560XL, Fractional | Training Events As Staffed | r16 [L725] |
| NOT READY TO HIRE), (Holding | SIC, 560XL, Fractional | Training Events As Staffed | r17 [L726] |
| NOT READY TO HIRE), (Holding | SIC, CJ2, Fractional | Training Events As Staffed | r18 [L727] |
| NOT READY TO HIRE), (Holding | SIC, CJ2, Fractional | Training Events As Staffed | r19 [L728] |
| NOT READY TO HIRE), (Holding | SIC, PC-12, Fractional | Training Events As Staffed | r20 [L729] |
| NOT READY TO HIRE), (Holding | PIC, PC-12, Fractional | Training Events As Staffed | r40 [L749] |
| NOT READY TO HIRE), (Holding | PIC, PC-12, Fractional; .297 cell reads "N/A (MUST GET FORMULA)" | Training Events As Staffed | r41 [L750] |
| NOT READY TO HIRE), (Holding | PIC, PC-12, Fractional | Training Events As Staffed | r42 [L751] |

The "Last, First" reversal plus these 12 artifacts is strong evidence this tab was produced by
sorting a name column that contained header text and placeholder rows - the sort inverted
"CAPTAIN (PIC) 14" into "(PIC) 14, CAPTAIN". Rows 58-250 are blank padding.

# SECTION 2 - SEAT-LEVEL STAFFING NUMBERS, AND THE NOTES THAT EXPLAIN THEM

## 2a. Tab "Master" - the seat matrix (Target / Green / Training-Scheduled / Open)

Columns are, left to right: pay or tail or base (col D), seat (col E), Target (F), Green (G),
Training/Scheduled (H), Open (I).

| Aircraft block | Pay / tail / base on the row | Seat as written | Target | Green | Training/Sched | Open | TAB | Row locator |
|---|---|---|---|---|---|---|---|---|
| G450/G5 (2 Planes) | $230k | PIC | 4 | 3 | 0 | 1 | Master | r4 [L5] |
| G450/G5 | $120k | SIC | 4 | 4 | 0 | 0 | Master | r5 [L6] |
| G450/G5 | (blank) | CA | 4 | 4 | 0 | 0 | Master | r6 [L7] |
| G450/G5 | N787JS | Lead PIC | 1 | 1 | 0 | 0 | Master | r7 [L8] |
| G450/G5 | N787JS | PIC | 0 | 0 | 0 | 0 | Master | r8 [L9] |
| G450/G5 | N787JS | SIC | 1 | 1 | 0 | 0 | Master | r9 [L10] |
| G450/G5 | N787JS | CA | 1 | 1 | 0 | 0 | Master | r10 [L11] |
| G450/G5 | N787JS | MX | 1 | 1 | 0 | 0 | Master | r11 [L12] |
| G450/G5 | SLC (base, col D) | - | - | - | - | - | Master | r12 [L13] |
| Legacy 650 (SLC) | (blank) | PIC | 1 | 1 | 0 | 0 | Master | r22 [L23] |
| Legacy 650 | (blank) | PIC | 1 | 1 | 0 | 0 | Master | r23 [L24] |
| G200 (3 Planes, SLC) | $160k | SS PIC | 7 | 6 | 0 | 1 | Master | r27 [L28] |
| G200 | $110k | SS SIC | 5 | 2 | 2 | 1 | Master | r28 [L29] |
| Challenger 350 (1 Plane, SLC, N522AD) | $220k-$230k | PIC | 2 | 0 | 0 | 2 | Master | r39 [L40] |
| Challenger 350 | (blank) | SIC | 1 | 0 | 0 | 1 | Master | r40 [L41] |
| 560XL (2 Planes, SLC) | $160k | PIC | 6 | 6 | 0 | 0 | Master | r51 [L52] |
| 560XL | $100k | SIC | 2 | 2 | 0 | 0 | Master | r52 [L53] |
| 560XL | Onion XLS+ (OGD) | PIC | 1 | 1 | 0 | 0 | Master | r54 [L55] |
| 560XL | Onion XLS+ | SIC | 1 | 1 | 0 | 0 | Master | r55 [L56] |
| Phenom 300/ Longitude (SLC) | - | PIC | 2 | 1 | 0 | **1 (HOLD)** | Master | r65 [L66] |
| Phenom 300/ Longitude | - | SIC | 1 | 1 | 0 | 0 | Master | r66 [L67] |
| Phenom 100 (SLC) | 150-160 | PIC | 1 | 1 | 0 | 0 | Master | r73 [L74] |
| Phenom 100 | 60 - 70 | SIC | 1 | 1 | 0 | 0 | Master | r74 [L75] |
| CJ2 (3 Planes, SLC) | $125k | PIC | 6 | 6 | 0 | 0 | Master | r84 [L85] |
| CJ2 | $65k | SIC | 4 | 3 | 1 | 0 | Master | r85 [L86] |
| M2 | $150-$160k | PIC | 2 | 2 | 0 | 0 | Master | r95 [L96] |
| M2 | $70k-$80k | SIC | 2 | 2 | 0 | 0 | Master | r96 [L97] |
| CJ3/+? (SLC, tail "N???") | 140 - 160 | PIC | 1 | 1 | 0 | 0 | Master | r106 [L107] |
| CJ3/+? | (blank) | SIC | 0 | 0 | 0 | 0 | Master | r107 [L108] |
| CJ (Georgia / CVC / N443BC) | 160 - 180 | PIC | 1 | 0 | 0 | 1 | Master | r117 [L118] |
| CJ | (blank) | SIC | 0 | 0 | 0 | 0 | Master | r118 [L119] |
| M2 & PC-12 (OGD) | 145-160 | Lead PIC | 1 | 1 | 0 | 0 | Master | r128 [L129] |
| M2 & PC-12 | 120 | **PIC  SIC** (one cell, two seats) | 1 | 0 | 0 | **1 HOLD** | Master | r129 [L130] |
| PC-12 (5 Planes, OGD) | $90k-$100k | PIC | 13 | 12 | 1 | 0 | Master | r139 [L140] |
| PC-12 | $40k | SIC | 5 | 4 | 1 | 0 | Master | r140 [L141] |
| PC-12 | N418T | PIC | 1 | 1 | 0 | 0 | Master | r141 [L142] |
| PC-12 | N413UU | PIC | 3 | 3 | 0 | 0 | Master | r142 [L143] |
| (unlabelled trailing block, no aircraft name) | (blank) | PIC | 0 | 0 | 0 | 0 | Master | r157 [L158] |
| (unlabelled trailing block) | (blank) | SIC | 0 | 0 | 0 | 0 | Master | r158 [L159] |

PC-12 tail sub-rows on Master sum to 4 PICs (N418T 1 + N413UU 3) while the PC-12 roster tab lists
4 managed-tail captains (Shad Guffey on N418T; Gerrard, Bohman, Francis on N413UU). Those agree.

## 2b. Tab "Staffing Change Notes" - the Praetor 600 block (parked)

| Aircraft block | Pay | Seat | Target | Green | Training/Sched | Open | TAB | Row locator |
|---|---|---|---|---|---|---|---|---|
| Praetor 600 (EMB-550), 1 Plane, OGD | $230k-$240k | PIC | 1 | 0 | 0 | 1 | Staffing Change Notes | r28 [L196] |
| Praetor 600 (EMB-550) | $130k-$140k | SIC | 1 | 0 | 0 | 1 | Staffing Change Notes | r29 [L197] |

**This block is the clearest example of a number that is wrong without its note.** Two seats read
as open, and the same tab's own r7 [L175] dated 09/03/2026 says: "Pery Cory this morning, the
Praetor deal is on hold until January. I paused both jobs." Note on r29 still says "Green to hire
per Cory text 08/17/26" - which the 09/03 entry supersedes. Anyone reading the number alone would
recruit two pilots for an aircraft deal that is paused until January. Praetor 600 does NOT appear
on Master at all, and has no roster tab.

## 2c. Tab "Training Amount" - a SECOND seat matrix, with DIFFERENT numbers

| Aircraft block | Pay / tail | Seat | Target | Green | Training/Sched | Open | TAB | Row locator |
|---|---|---|---|---|---|---|---|---|
| G450/G5 | $230k | PIC | 5 | 0 | 2 | 3 | Training Amount | r4 [L1018] |
| G450/G5 | $120k | SIC | 4 | 0 | 2 | 2 | Training Amount | r5 [L1019] |
| G450/G5 | (blank) | CA | 2 | 0 | 0 | 1 | Training Amount | r6 [L1020] |
| G450/G5 | N787JS | Lead PIC | 1 | 1 | 0 | 0 | Training Amount | r7 [L1021] |
| G450/G5 | N787JS | PIC | 1 | 1 | 0 | 0 | Training Amount | r8 [L1022] |
| G450/G5 | N787JS | SIC | 1 | 1 | 0 | 0 | Training Amount | r9 [L1023] |
| G450/G5 | N787JS | CA | 1 | 1 | 0 | 0 | Training Amount | r10 [L1024] |
| G450/G5 | N787JS | MX | 1 | 1 | 0 | 0 | Training Amount | r11 [L1025] |
| G200 | $160k | SS PIC | 5 | 4 | 0 | 1 | Training Amount | r23 [L1037] |
| G200 | $110k | SS SIC | 3 | 3 | 0 | 0 | Training Amount | r24 [L1038] |
| 560XL | $160k | PIC | 5 | 4 | 1 | 0 | Training Amount | r36 [L1050] |
| 560XL | $100k | SIC | 3 | 3 | 0 | 0 | Training Amount | r37 [L1051] |
| Phenom | - | PIC | 1 | 1 | 0 | 0 | Training Amount | r47 [L1061] |
| Phenom | - | SIC | 1 | 1 | 0 | 0 | Training Amount | r48 [L1062] |
| CJ2 | $125k | PIC | 7 | 5 | 0 | 2 | Training Amount | r55 [L1069] |
| CJ2 | $65k | SIC | 5 | 4 | 1 | 0 | Training Amount | r56 [L1070] |
| M2 (first block) | $150-$160k | PIC | 2 | 2 | 0 | 0 | Training Amount | r66 [L1080] |
| M2 (first block) | $70k-$80k | SIC | 2 | 2 | 0 | 0 | Training Amount | r67 [L1081] |
| M2 (second block) | 145-150 | Lead PIC | 1 | 0 | 0 | 1 | Training Amount | r77 [L1091] |
| M2 (second block) | 135-145 | PIC | 1 | 0 | 0 | 1 | Training Amount | r78 [L1092] |
| PC-12 | $90k-$100k | PIC | 14 | 8 | 3 | 3 | Training Amount | r85 [L1099] |
| PC-12 | $40k | SIC | 6 | 4 | 1 | 1 | Training Amount | r86 [L1100] |
| PC-12 | N418T | PIC | 1 | 1 | 0 | 0 | Training Amount | r87 [L1101] |
| PC-12 | **N825NX** | PIC | 1 | 1 | 0 | 0 | Training Amount | r88 [L1102] |
| PC-12 | N413UU | PIC | 3 | 2 | 0 | 1 | Training Amount | r89 [L1103] |

This tab also carries the training-agreement reference grid (cols K-Q, rows 3-26): for a TYPED
Captain on G450/G5 the Training Agreement Length is "12 month" with "Reduced Salary During
Training" = No; for NOT-TYPED the amounts are G450/G5 $100,000 / 18 month (listed twice, rows 19
and 20), G200 $65,000 / 18 month / "Unsure", 560XL $45,000 / 18 month / "Unsure", CJ2 $40,000 /
18 month, M2 $40,000 / 18 month, PC-12 $40,000 (both typed and not-typed columns) / 18 month,
PC-12 NG $40,000 / 18 month.

## 2d. The contradiction, laid out

Three places in this one workbook carry a count for the same seat. Each row below is a
disagreement, with the exact cell each number came from.

| Aircraft - seat | Master T/G/Tr/O (tab row) | Training Amount T/G/Tr/O (tab row) | Roster tab's own header count (tab row) | Roster tab's actual named GREEN rows |
|---|---|---|---|---|
| G450/G5 PIC | **4/3/0/1** (Master r4) | **5/0/2/3** (Training Amount r4) | CAPTAIN (PIC) 5 (G450/G5 r5) | 3 Fractional GREEN + 1 N787JS Lead GREEN = 4 |
| G450/G5 SIC | **4/4/0/0** (Master r5) | **4/0/2/2** (Training Amount r5) | FIRST OFFICER (SIC) 4 (G450/G5 r5) | 4 GREEN (3 Fractional + 1 N787JS) |
| G450/G5 CA | **4/4/0/0** (Master r6) | **2/0/0/1** (Training Amount r6) | no CA block on the roster tab | 0 named |
| G450/G5 N787JS PIC | **0/0/0/0** (Master r8) | **1/1/0/0** (Training Amount r8) | - | 1 OPEN row (G450/G5 r4) |
| G200 SS PIC | **7/6/0/1** (Master r27) | **5/4/0/1** (Training Amount r23) | CAPTAIN (PIC) 6 (G200 r2) | 6 GREEN + 1 OPEN (ON HOLD) |
| G200 SS SIC | **5/2/2/1** (Master r28) | **3/3/0/0** (Training Amount r24) | FIRST OFFICER (SIC) 4 (G200 r2) | 2 GREEN + 2 IN-TRAINING + 1 OPEN |
| 560XL PIC | **6/6/0/0** (Master r51) | **5/4/1/0** (Training Amount r36) | CAPTAIN (PIC) 5 (560XL r4) | 6 Fractional GREEN + 1 ONION GREEN |
| 560XL SIC | **2/2/0/0** (Master r52) | **3/3/0/0** (Training Amount r37) | FIRST OFFICER (SIC) 3 (560XL r4) | 2 GREEN + 1 ONION GREEN + 2 OPEN (On Hold) |
| CJ2 PIC | **6/6/0/0** (Master r84) | **7/5/0/2** (Training Amount r55) | CAPTAIN (PIC) 7 (CJ2 r2) | 6 GREEN + 1 TRANSISTION OUT |
| CJ2 SIC | **4/3/1/0** (Master r85) | **5/4/1/0** (Training Amount r56) | FIRST OFFICER (SIC) 6 (CJ2 r2) | 3 GREEN + 1 IN-TRAINING + 2 OPEN (On Hold) |
| PC-12 PIC | **13/12/1/0** (Master r139) | **14/8/3/3** (Training Amount r85) | CAPTAIN (PIC) 14 (PC-12 r7) | 12 GREEN + 1 IN-TRAINING + 3 OPEN (ON HOLD) |
| PC-12 SIC | **5/4/1/0** (Master r140) | **6/4/1/1** (Training Amount r86) | FIRST OFFICER (SIC) 6 (PC-12 r7) | 4 GREEN + 1 IN-TRAINING + 1 OPEN (ON HOLD) |
| PC-12 N413UU PIC | **3/3/0/0** (Master r142) | **3/2/0/1** (Training Amount r89) | - | 3 GREEN named |
| PC-12 N825NX PIC | **absent from Master** | **1/1/0/0** (Training Amount r88) | - | **no such tail anywhere in the roster tabs** |
| Phenom 300/Longitude PIC | **2/1/0/1 (HOLD)** (Master r65) | **1/1/0/0** (Training Amount r47, labelled just "Phenom") | CAPTAIN (PIC) 1 (Phenom 300e r2) | 1 GREEN + 1 OPEN (ON HOLD) |
| M2 & PC-12 Lead PIC | **1/1/0/0** (Master r128) | **1/0/0/1** (Training Amount r77) | M2 tab: 1 GREEN (Jack Matiasevich) | 1 GREEN |
| M2 PIC | **2/2/0/0** (Master r95) | **2/2/0/0** (Training Amount r66) | - | agrees |
| M2 SIC | **2/2/0/0** (Master r96) | **2/2/0/0** (Training Amount r67) | - | agrees |
| PC-12 N418T PIC | **1/1/0/0** (Master r141) | **1/1/0/0** (Training Amount r87) | - | agrees (Shad Guffey) |

**12 of the 19 comparable seat rows disagree between Master and Training Amount.** On the evidence
Training Amount is the stale copy: its Green column is zero for all three G450/G5 fractional seats
(PIC, SIC, CA) where Master and the roster tab both name real GREEN pilots, and it carries tail
N825NX which appears in no roster tab and which the July 2026 session recorded the user as calling
no longer managed. But I cannot prove which tab the team currently reads off, so I am NOT calling
Training Amount dead - see UNCERTAIN #2.

## 2e. Every note cell that explains why a number looks the way it does

These matter more than the numbers, exactly as the brief says.

| Note exactly as written | What it explains | TAB | Row locator |
|---|---|---|---|
| Both SIC on hold after conversation with Executives 03/24/26 | why G200 SS SIC shows 1 open and 2 in training | Master | r26 [L27] col L |
| Full staff as of the most recent managers meeting | why G200 SS PIC 1 open is not being worked | Master | r27 [L28] col L |
| acq signed, 135 managed and 91 also. will be hiring for this one sooner. thinking we should have it november-ish, could be sooner, must be 2026 | why Challenger 350 shows 2 PIC + 1 SIC open with 0 green | Master | r38 [L39] col L |
| must have 250 hours PIC in the 300/350 | extra gate on the Challenger 350 PIC seat | Master | r39 [L40] col L |
| owners flying mostly NA and lots of hawaii. roughly 200 hours owner yearly. 300 hours of charter is hoped for. | Challenger 350 utilisation context | Master | r40 [L41] col L |
| Bailey out on Medical | why a 560XL body is not flying | Master | r53 [L54] col K |
| would add 1 more pilot for the Garf account. joe has possible candidate already. likely us advertising on behalf of them. all very tbd. | why Phenom 300/Longitude PIC open is "1 (HOLD)" | Master | r65 [L66] col L |
| non payroll managed pilot position | Phenom 300/Longitude SIC is not a SkyShare payroll seat | Master | r66 [L67] col L |
| 8 hard days off, Match CJ2 minimums | CJ3/+? terms | Master | r106 [L107] col L |
| Owner pilot who has a heavy jet. The purpose of this aircraft is to take the small missions off of the heavy aircraft. | CJ3/+? and CJ mission rationale | Master | r107 [L108] and r118 [L119] col L |
| Per Joe: 91 only, single pilot, $140K-$160K, 1 PIC | CJ3/+? scope | Master | r108 [L109] col L |
| Up to $20k sign on bonus | CJ3/+? offer lever | Master | r109 [L110] col L |
| Per Joe: 91 only, single pilot, $160K-$180K, 1 PIC | CJ (Georgia) scope | Master | r119 [L120] col L |
| One PC-12 PIC/M2 SIC \| PC-12 will still be single pilot. M2 will be crew (SIC does not need single pilot jet time) | why M2 & PC-12 has ONE cell reading "PIC  SIC" | Master | r129 [L130] cols L-M |
| 8 hard days off a month with the schedule approved a month in advance. Will be 135 trained. $120k | M2 & PC-12 terms | Master | r130 [L131] col L |
| As of 04/07: SIC for M2 and PIC for PC-12. $120k. | the dual-seat arrangement, dated | Master | r134 [L135] col L |
| PIC Target was 16 we pulled back to 13 - Harry | why PC-12 PIC target is 13 and not 16 | Master | r138 [L139] col K |
| Harry - Approved the 6th PDP to hire July 10 | a 6th PDP approved though SIC target reads 5 | Master | r138 [L139] col L |
| Changed to 14 and 6 per conversation with Executives week of 04/20/2026 | an EARLIER target change, superseded | Master | r139 [L140] col L |
| changed to 13 and 5 per Harry and Tommy on 09/03/2026 | the CURRENT PC-12 target, 8 days old | Master | r140 [L141] col L |
| Yellow = Hired but not flying the line | colour legend | Master | r2 [L3] col L |
| Blue = Current employee moving to a new position | colour legend | Master | r3 [L4] col L |
| Pery Cory this morning, the Praetor deal is on hold until January. I paused both jobs. | why Praetor 600's 2 open seats must not be recruited | Staffing Change Notes | r7 [L175] |
| Green to hire per Cory text 08/17/26 | a SUPERSEDED green light on the Praetor 600 SIC | Staffing Change Notes | r29 [L197] col L |
| No 135 travel in the first year. ideally charter later. | Praetor 600 mission | Staffing Change Notes | r27 [L195] col L |
| PIC must have overseas internaitonal exp / Overseas international exp preffered for FO | Praetor 600 gates | Staffing Change Notes | r33-34 [L201-202] col L |
| holding off on hiring anymore G200 SICs until we have confirmed if we keeping 860 | the origin of the G200 SIC hold, dated 03/20/2026 | Staffing Change Notes | r3 [L171] |
| One CJ will go away in the middle of 2027. | future CJ2 target reduction | Staffing Change Notes | r3 [L171] |
| PC-12: 15 Captains / 6 PDPs \| CJ2: 7 Captains / 5 FOs \| Excel/XLS: 6 Captains / 2 FOs \| G200: 7 Captains / 3 FOs | a FOURTH set of target numbers, dated 3/24/2026, agreeing with none of the three matrices above | Staffing Change Notes | r4 [L172] |
| CJ2 - changed the target numbers to 6 and 4 | CJ2 target per 07/10/2026, matching Master not Training Amount | Staffing Change Notes | r5 [L173] |
| Per managers and directors meeting staff G200 full staffing no later than oct 1 | a deadline 20 days out from today | Staffing Change Notes | r6 [L174] |
| 3 A/C in fleet Aligmnent Meeting 3/24/26 | CJ2 fleet size | CJ2 | r18 [L502] col L |
| 8 PC-12's Need Staffed as of 3/24/26 with Alignment Meeting | PC-12 staffing pressure | PC-12 | r20 [L530] col L |
| N409KG 1 Captian, 1 First Officer | Phenom 300e establishment | Phenom 300e / Longitude | r16 [L618] col L |
| When someone staying Dual Qualled transitions to other plane, please move them to bottom and mark as "Dual Quallified (dont use for numbers)" | the rule that makes 10 roster rows non-countable | G450/G5 r27-29, Legacy 650 r27-29, G200 r22-24, 560XL r19, CJ2 r16, PC-12 r19, Phenom 100 r25, Phenom 300e r25 | (as listed) |
| N/A (MUST GET FORMULA) | a .297 cell the team knows is uncomputed | Training Events As Staffed | r41 [L750] |
| Recurrent Scheduled 11/6/2025 FSI DFW / Recurrent Scheduled 11/17/2025 FSI DFW / Recurrent Scheudled 12/18/2025 FSI DFW / Initial Scheudled 1/5/2026 FSI DFW | Legacy 650 training calendar | Legacy 650 | r20-r23 [L401-L404] col L |

## 2f. Tab "Budgeting Training Events" - planned training events per month

Not a person/position tab, captured because it is a fifth place the fleet is enumerated and it is
the only tab that splits SkyShare from MANAGED PILOTS explicitly (divider at r14 [L975]).

| Training Type | Aircraft Type | Jan-Dec counts | TAB | Row locator |
|---|---|---|---|---|
| PC-12 Recurrent | PC-12 | 4,1,3,3,1,2,2,1,3,1,2,0 | Budgeting Training Events | r3 [L964] |
| PC-12 .297 (In House) | PC-12 | 1,1,2,1,2,0,3,1,3,0,1,2 | Budgeting Training Events | r4 [L965] |
| CJ2 Recurrents | CJ2 | 0,3,1,1,1,2,0,2,0,0,1,2 | Budgeting Training Events | r5 [L966] |
| CJ2 .297 | CJ2 | 0,1,0,0,1,2,0,2,1,1,1,1 | Budgeting Training Events | r6 [L967] |
| XL Recurents | 560XL | 1,1,1,0,0,0,0,0,1,0,0,0 | Budgeting Training Events | r7 [L968] |
| XL .297 | 560XL | 0,0,1,0,0,0,1,1,1,0,0,0 | Budgeting Training Events | r8 [L969] |
| G200 Recurrents | G200 | 0,1,3,0,0,0,0,2,0,0,1,1 | Budgeting Training Events | r9 [L970] |
| G200 .297 | G200 | 0,2,0,0,1,1,0,1,1,0,0,0 | Budgeting Training Events | r10 [L971] |
| G450 Recurrents | G450 | 0,1,3,0,0,0,1,0,0,0,2,0 | Budgeting Training Events | r11 [L972] |
| G450 .297's | G450 | 1,0,0,0,1,0,0,0,1,0,0,0 | Budgeting Training Events | r12 [L973] |
| MANAGED PILOTS (divider) | - | - | Budgeting Training Events | r14 [L975] |
| PC-12 Recurrents | PC-12 | 0,1,0,0,0,1,0,0,0,1,1,0 | Budgeting Training Events | r15 [L976] |
| PC-12 .297 (in house) | PC-12 | 0,0,0,1,1,0,0,1,0,0,0,1 | Budgeting Training Events | r16 [L977] |
| Phenom 300 Recurrents | Phenom 300e | 0,0,0,0,0,0,1,0,0,0,1,0 | Budgeting Training Events | r17 [L978] |
| Phenom 300 .297 | Phenom 300e | 1,0,0,0,0,0,0,0,0,0,0,0 | Budgeting Training Events | r18 [L979] |
| G200 Recurrents | G200 | all zero | Budgeting Training Events | r19 [L980] |
| G200 .297 | G200 | all zero | Budgeting Training Events | r20 [L981] |
| G450 Recurrents | G450 | 1,0,0,1,0,0,0,0,0,0,0,0 | Budgeting Training Events | r21 [L982] |
| G450 .297's | G450 | 0,0,0,0,0,0,0,0,0,1,0,0 | Budgeting Training Events | r22 [L983] |

Managed G200 is all zeros in both rows - no managed G200 training budgeted at all, although
Master's G200 block says "3 Planes" and the G200 roster tab is all Fractional.

## 2g. Tab "Pilot Mins Overview" - the hiring-gate reference grid

No people. Captured because it is the seventh place minimums are written and it DISAGREES with the
per-aircraft minimums on Master - e.g. Master r32 [L33] gives G200 Captain insurance minimum
"3,000 hours PIC" with total-time MINS 4,500 (new hire) / 3,500 (SkyShare), while this tab gives
G200 Captain Total 4500 / PIC 3000. Those agree. But Master r14 [L15] gives G450 SIC new-hire MINS
2,000 while Training Amount r14 [L1028] gives 2,500 for the same seat.

| Aircraft | Position | Total | PIC | Multi | Jet | Fixed Wing Turbine | Instrument | Cross Country | Night | Time in Type | TAB | Row locator |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pilatus PC-12 | Captain | 1500 | 1000 | N/A | N/A | 300 | 100 | 500 | 100 | Preferred | Pilot Mins Overview | r17 [L1002] |
| Pilatus PC-12 | First Officer | 800 | N/A | N/A | N/A | N/A | 50 | 100 | N/A | - | Pilot Mins Overview | r18 [L1003] |
| Citation CE-525 | Captain | 2800 | 1500 | 500 | 500 | N/A | 200 | 500 | 200 | Preferred | Pilot Mins Overview | r20 [L1005] |
| Citation CE-525 | First Officer | 1000 | N/A | 50 | N/A | N/A | 50 | 150 | N/A | - | Pilot Mins Overview | r21 [L1006] |
| Citation Excel | Captain | 3500 | 2000 | 1000 | 500 | N/A | 250 | 1000 | 300 | Preferred | Pilot Mins Overview | r22 [L1007] |
| Citation Excel | First Officer | 1500 | N/A | 200 | N/A | 100 | 100 | 200 | N/A | - | Pilot Mins Overview | r23 [L1008] |
| Gulfstream G200 | Captain | 4500 | 3000 | 1000 | 800 | N/A | 300 | 2000 | 500 | Preferred | Pilot Mins Overview | r24 [L1009] |
| Gulfstream G200 | First Officer | 2000 | N/A | 300 | N/A | 200 | 200 | 400 | N/A | - | Pilot Mins Overview | r25 [L1010] |
| Gulfstream G450 | Captain | 5000 | 3000 | 2000 | 1500 | N/A | 300 | 3000 | 800 | 1000 | Pilot Mins Overview | r26 [L1011] |
| Gulfstream G450 | First Officer | 2000 | N/A | 500 | 200 | N/A | 300 | 600 | N/A | 100 | Pilot Mins Overview | r27 [L1012] |

Universal gates on the same tab (rows 4-14): "Must meet all FAA 135.243 (c) qualifications as well
as SkyShare's minimum requirements noted below", then FAA Commercial or ATP Certificate; Valid FAA
1st Class Medical; FCC Restricted Radiotelephone Operator Permit; FAA Instrument Rating; Valid U.S.
passport and driver's license; must be legally authorized to work in the United States without
sponsorship; must pass TSA background checks and secure appropriate SIDA badge when applicable; all
PICs must meet the IFR requirements listed in 135.243; PC-12 Captains must have prior professional
single-pilot time.

---

# SECTION 3 - NAME-SPELLING HAZARDS (do not normalise these, but do not key on them either)

Measured: **206 distinct exact name strings** across the 14 tabs that have name cells. Folding
"Last, First" into "First Last" and dropping parentheticals and case collapses that to **136**.
At least **17 of those 136 are a second spelling of a person already counted**, which is why the
true distinct-human count is below 136 (about 119). The 17:

| Spelling A (tab) | Spelling B (tab) | Spelling C |
|---|---|---|
| Hankyu Park (Master, Training Info) | Hanku Park (G200) | Park, Hanku (Training Events As Staffed) |
| Russ Herman (Training Info r132) | Russ Hermian (Legacy 650 r4) | - |
| Jeremy McGraw (CJ2 r4) | Jermey McGraw (Training Info r61, Referral Bonus r9) | McGraw, Jeremy (Training Events r38) |
| Brooke Milne (Training Info r85) | Brooke Kirchner (CJ2 r3) | Brooke Milne Kirchner (Referral Bonus r16) |
| Kat Larson (G200 r9, Training Events r32) | Kathleen Larson (Referral Bonus r4) | - |
| Zach Davis (560XL r3, Training Info r123) | Zachery Davis (Sign-on/Relo r12) | - |
| Teren Christensen (Referral Bonus r5) | Teren Christenson (Training Info r42) | - |
| Ben Pobanz (CJ2 r4) | Benjamin Pobanz (Training Info r105, Referral Bonus r20) | Pobanz, Ben (Training Events r25) |
| Nick Hastings (G450/G5 r8) | Nicholas Hastings (Training Info r104, Sign-on/Relo r9) | Hastings , Nick (Training Events r13) |
| Aleksandar Kostic (G450/G5 r7) | Aleksandar (Alex) Kostic (Training Info r112) | Alex Kostic (Referral Bonus r21) |
| Alex Andrade (Training Info r98) | Alexander Andrade (PC-12 r11, Referral Bonus r18) | Andrade, Alexander (Training Events r6) |
| Brock Tyler (Referral Bonus r19) | Joshua (Brock) Tyler (Training Info r103) | - |
| Brian Thomas (Training Info r44) | Bryan Thomas (CJ2 r3) | Thomas, Bryan (Training Events r49) |
| Ren Stephani (Training Info r65) | Ren Carter (Training Info r117, PC-12 r16) | Carter, Ren (Training Events r15) |
| Harry Mitchel (Referral Bonus r13) | Harry (Chip) Mitchel (Sign-on/Relo r11) | - |
| Jake Thacker (Master, Training Info r6, PC-12 r20) | Jacob Thacker (Training Info r90, PC-12 r33) | Thacker, Jake (Training Events r48) |
| Ben Butler (CJ2 r5) | Benjamin Butler (Training Info r55, PC-12 r28) | Butler, Ben + Butler, Benjamin (Training Events r12, r13) |

Corroboration that this is a live problem, not a theoretical one: the repo already carries a
hand-maintained alias map for exactly this tab. prisma/import-training-transitions.ts lines 37-53:

    const ALIASES: Record<string, string> = {
      "chris holiday": "chris holladay",
      "brian thomas": "bryan thomas",
      "jermey mcgraw": "jeremy mcgraw",
      "robbie allen": "robert allen",
      "ben houston": "benjamin houston",
      "will page": "william page",
      "nick charles": "nicholas charles",
      "teren christenson": "teren christensen",
      "matt dahle": "matthew dahle",
      "ben butler": "benjamin butler",
      "josh thompson": "joshua thompson",
      "alex andrade": "alexander andrade",
      "katie bright": "caiden bright",
      "ren stephani": "ren carter",
      "nick nadolski": "nick nadolski"
    };

That map covers 15 variants. **My extraction found at least 17, and the overlap is only 6** -
"brian thomas", "jermey mcgraw", "teren christenson", "ben butler", "alex andrade", "ren stephani".
The 11 the map does NOT cover and would mis-key today: hanku/hankyu park, russ herman/hermian,
brooke milne/kirchner/milne kirchner, kat/kathleen larson, zach/zachery davis, ben/benjamin pobanz,
nick/nicholas hastings, aleksandar/alex kostic, brock/joshua tyler, harry/harry (chip) mitchel,
jake/jacob thacker. (Note also that "nick nadolski": "nick nadolski" in that map is a no-op entry.)

---

# CERTAIN - safe for a later agent to use without re-deriving

1. **The workbook's 21 tabs, in order, are:** Master, Staffing Change Notes, Training Info,
   G450/G5, Legacy 650, Challenger 350, G200, 560XL, CJ2, PC-12, CJ3? Utah, CJ, M2, Phenom 100,
   Phenom 300e / Longitude, Referral Bonus Info, Sign-on/Relo Bonus, Training Events As Staffed,
   Budgeting Training Events, Pilot Mins Overview, Training Amount. Derived from
   get_file_metadata snippetVerbosity MAX_ALLOWED and cross-matched row-for-row against
   read_file_content's 21 markdown tables. Raw output in "What I checked" section 3.

2. **All 21 tabs arrived complete.** The renderer marks truncation with a literal "..." (proved by
   the BRIEF snippet ending "MIN..."); MAX_ALLOWED contains no such marker and closes its final
   code fence; and read_file_content independently terminates on the same final cell of the same
   final tab. Evidence in section 4 of "What I checked".

3. **Master and Training Amount carry contradictory counts for 12 of the 19 seat rows they share.**
   Every disagreement with its exact cell is in section 2d. No interpretation required - the cells
   are quoted.

4. **"Training Amount" r88 [L1102] carries a PC-12 tail "N825NX" that exists nowhere else in the
   workbook** - not on Master's PC-12 block (which lists only N418T and N413UU), and not on the
   PC-12 roster tab (whose managed-tail block lists N418T and N413UU only). Positive control: I
   searched the whole body; N825NX occurs exactly once.

5. **Praetor 600's two open seats must not be recruited.** Staffing Change Notes r28-29 [L196-197]
   show PIC 1 open and SIC 1 open; the same tab's r7 [L175], dated 09/03/2026, reads "Pery Cory
   this morning, the Praetor deal is on hold until January. I paused both jobs." The older
   "Green to hire per Cory text 08/17/26" on r29 col L is superseded by it. Praetor 600 appears on
   no other tab.

6. **Tab "M2" r3 [L568] gives Jack Matiasevich tail N782PD; Master r133 [L134] gives the M2 as
   N785PD.** One digit apart, two different tails, same single aircraft. Both strings occur exactly
   once in the workbook.

7. **Training Info r134 [L341] has a typo'd date: Basic Indoc Date reads "5/26/0206"** (Chris
   Johnston). Year 0206 for 2026. Any date parser will either throw or produce a year-206 date.

8. **Sign-on/Relo Bonus r18 [L689] has a typo'd date: Start Date reads "08/242026"** (Robert
   Patrick, Sign-On). Missing separator.

9. **Tab "Training Events As Staffed" contains 12 non-person rows inside its person columns**,
   enumerated with locators in section 1g - four inverted column headers ("(PIC) 14, CAPTAIN",
   "(PIC) 5, CAPTAIN", "OFFICER (SIC) 4, FIRST", "OFFICER (SIC) 6, FIRST") and eight
   "NOT READY TO HIRE), (Holding" placeholders. Any import of this tab must exclude them.

10. **The repo's existing alias map covers only 6 of the 17 name-variant pairs present in the
    workbook today.** prisma/import-training-transitions.ts lines 37-53 vs section 3 above; the 11
    uncovered pairs are listed there by name.

11. **Two tabs hold zero people and are pure vacancy:** "CJ" (one OPEN captain seat, r3 [L558]) and
    "Challenger 350" (three OPEN seats, r3-r4 [L415-416]).

12. **Roster-tab header counts disagree with their own listed rows in two places.** 560XL says
    "CAPTAIN (PIC) 5" (r4 [L467]) but lists six GREEN fractional captains, ordinals 1-6
    (r5-r10 [L468-L473]). G200 says "CAPTAIN (PIC) 6" (r2 [L439]) but lists seven ordinals, the
    seventh being OPEN (ON HOLD) (r10 [L447]).

13. **PC-12's current target is 13 PIC / 5 SIC as of 09/03/2026**, per Master r140 [L141] col L:
    "changed to 13 and 5 per Harry and Tommy on 09/03/2026", which matches Master's own numbers
    (r139, r140) and supersedes the col-L note one row above ("Changed to 14 and 6 per conversation
    with Executives week of 04/20/2026"). Training Amount still carries the 14 and 6.

14. **There is a FOURTH target set, dated 3/24/2026**, in Staffing Change Notes r4 [L172]:
    "PC-12: 15 Captains / 6 PDPs | CJ2: 7 Captains / 5 FOs | Excel/XLS: 6 Captains / 2 FOs |
    G200: 7 Captains / 3 FOs". It agrees with none of Master, Training Amount, or the roster
    headers.

15. **Master's colour legend as rendered has exactly TWO entries, not three:** "Yellow = Hired but
    not flying the line" (r2 [L3] col L) and "Blue = Current employee moving to a new position"
    (r3 [L4] col L). Positive control: I printed every non-empty cell of Master's col L across all
    166 rows (section 1a and 2e list them); no green legend row exists. "Green" in this workbook is
    a COLUMN HEADER on every seat block ("Target | Green | Training/Scheduled | Open") and a
    Status value on the roster tabs - not a legend entry. The lead's brief expected a green legend
    line; it is not in the Master tab.

# UNCERTAIN - needs a human in the morning

1. **Whether the workbook has tabs beyond the 21 I received.** What I found: 21 tabs, all complete,
   and no candidate/applicant-pipeline tab of any kind. Why I cannot close it: the Drive API exposes
   no tab count and no hidden/visible flag, so an empty result for "is there a PDP tab" is
   indistinguishable from a renderer that stops at 21. This matters because a July 2026 session
   recorded this tracker as having **32 tabs including roughly 600 candidate rows across PDP /
   Pilot / On-Hold / Other tabs** plus recurrent .293/.297 budgeting tabs - and that session was
   reading a **downloaded .xlsx**, which may have diverged from this live Sheet. The one thing that
   would close it: the real tab bar. The chrome-live sibling is writing
   docs/audit-2026-09-11/_sheet-visible-tabs.md; read it next to this file. Failing that, a
   download_file_content export (which I deliberately did not run - downloading needs the user's
   say-so) would settle it.

2. **Which of Master / Training Amount / the roster headers the team actually recruits off.** What I
   found: three live, disagreeing answers per seat (section 2d), and the evidence leans to Training
   Amount being a stale copy (zero Green on G450 seats that demonstrably have GREEN pilots, plus a
   tail nobody else lists). Why I cannot close it: nothing in the workbook says which tab is
   authoritative, and a July 2026 session recorded the user saying "Master is accurate for open
   pilot positions" - which is a year-old statement about a document edited today. The one thing
   that would close it: ask him which tab he reads, and whether Training Amount should be deleted
   or is a deliberate budget scenario. **Do not import either tab's numbers until that is answered.**

3. **Robert Patrick.** What I found: two Sign-on/Relo Bonus rows (r17, r18 [L688-689]) with an
   8/24/2026 start, a $8,000 relocation and a $2,500 + $2,500 sign-on, all four payments marked
   FALSE. He appears on no roster tab, no Training Info row, and no referral row. Why I cannot
   close it: the sheet gives him no position and no aircraft, so I cannot tell whether he is a
   pilot who never got entered on a roster, a non-pilot hire, or a cancelled offer. The one thing
   that would close it: his record in Paycom or the app's NewHire table. Same question applies to
   Fred Saadat, Kayla Perez, Scott Strahan and Luke Webb on that tab.

4. **N782PD vs N785PD (CERTAIN #6 says they conflict; which one is right is not certain).** The M2
   roster tab says Jack Matiasevich flies N782PD; Master's M2 & PC-12 block says M2 = N785PD and
   PC-12 = N477KR. The one thing that would close it: the fleet's own tail list - the repo has
   lib/fleet/ and a FLEET_POSITIONS reference; I did not cross-check it because Round 1 is
   read-the-sheet and another auditor owns the app side.

5. **Jake Thacker vs Jacob Thacker - one person upgrading, or two people.** The PC-12 roster tab
   lists "Jake Thacker" as ordinal 13 IN-TRAINING captain (r20 [L530]) AND "Jacob Thacker" as
   TRANSISTION OUT in the SIC column (r33 [L543]); Training Info has "Jake Thacker / PC-12 Captain /
   Internal" (r6) and "Jacob Thacker / PC-12 First Officer / External / PDP" (r90, start 08/26/2025).
   That reads exactly like a PDP first officer upgrading to captain, but the sheet never says so.
   The one thing that would close it: one Paycom or NewHire record. **If they are one person, the
   PC-12 captain count is right; if two, one of the counts is wrong.**

6. **Ben Butler vs Benjamin Butler.** Training Events As Staffed lists BOTH "Butler, Ben" (CJ2) and
   "Butler, Benjamin" (PC-12) as separate rows (r12, r13 [L721-722]), and the CJ2 tab's PIC ordinal
   3 is "Ben Butler" while PC-12's dual-qualified list has "Benjamin Butler". Reads like one
   dual-qualified pilot written two ways - but the repo's alias map already asserts
   "ben butler" -> "benjamin butler", so somebody has decided this before. Confirm before counting
   them as two seats.

7. **"Evan" (Master r2 [L3] col A) and the first-name-only people in the notes.** Master col A row 2
   holds the bare word "Evan", and Staffing Change Notes names David, Tommy, Jerry, Hank, Harry and
   Cory with no surnames. Memory note skyshare-email-to-name-map is explicit that guessing a
   surname here is a mistake that has been made before, so I have left every one of them exactly as
   written. The one thing that would close it: him telling you who Evan is (the Master tab may be
   his sheet, or he may be the Challenger 350 candidate per r39's "Evan has the green light for PIC
   (Not Lead)").

8. **The +/-1 on every derived sheet-row number.** I derived "r<n>" from markdown-table position
   (see "How to read my row locators"). The tab name, the file line [Lnnn] and the quoted cell text
   are exact; the r<n> could be off by one uniformly. The one thing that would close it: one glance
   at the sheet - e.g. confirming whether Master's "Evan" is in A1 or A2.

9. **Whether "Fahali Campbell / PC-12 Captain SIC" (Training Info r124 [L331]) is a captain or a
   first officer.** The position cell literally reads "PC-12 Captain SIC" - both seats in one
   string. He appears on no PC-12 roster row under either seat. The one thing that would close it:
   his actual seat from Paycom.

10. **Whether the "ONION" / "Onion XLS+" block is an owner, a tail, or a base.** The 560XL roster
    tab uses "ONION" in the Aircraft column for Zach Davis and Jaren Smith (r3 [L466]); Master uses
    "Onion XLS+" in the pay/tail column for a separate PIC 1 / SIC 1 pair at OGD (r54-55 [L55-56]).
    I could not tell from the sheet whether that is one aircraft counted twice or a managed
    owner-name. The one thing that would close it: the fleet tail list.

---

# COUNTS

| Measure | Value | How measured |
|---|---|---|
| Tabs received | 21 | grep -c ':-:' on read_file_content body; confirmed by 21 "# " headings in the MAX_ALLOWED snippet |
| Tabs received COMPLETE | 21 | no truncation marker in MAX_ALLOWED; both renderings end on the same final cell |
| Tabs received PARTIAL | 0 | same |
| Tabs in the workbook but not seen | unknown - see UNCERTAIN #1 | the API exposes no tab count |
| Hidden vs visible tabs | indistinguishable through the Drive API | stated in section 5 |
| read_file_content body size | 100,229 chars / 1,110 lines | node, LEN + split('\n') |
| Drive-reported file size | 26,135,566 bytes | get_file_metadata |
| Last modified | 2026-09-11T17:38:38.762Z | get_file_metadata |
| Name-cell occurrences extracted | 330 | count.js, non-person strings excluded |
| Distinct exact name strings | 206 | count.js, Set of raw strings |
| Distinct after folding "Last, First" + parentheticals + case | 136 | count.js |
| Of those 136, known second spellings of someone already counted | at least 17 | section 3, enumerated |
| Implied distinct humans | about 119, certainly below 136 | 136 minus the 17 |
| Tabs with name cells | 14 of 21 | count.js per-tab breakdown |
| Tabs with NO people | 7 - Master (note cells only), Staffing Change Notes, CJ, Challenger 350, Budgeting Training Events, Pilot Mins Overview, Training Amount | inspection of all 21 dumps |
| Person rows on "Training Info" | 108 (4 above the ARCHIVED divider, 104 below) | count.js |
| Person rows on the 12 roster tabs | 86 named + 14 vacancy/placeholder rows | count.js + section 1d |
| Person rows on "Training Events As Staffed" | 70 (50 PIC column, 20 SIC column) | count.js |
| Non-person artifact rows inside that tab's person columns | 12 | section 1g, enumerated |
| Referral rows (each naming 2 people) | 28 | section 1e |
| Sign-on/Relo rows | 16 rows, 14 distinct people | section 1f |
| Seat rows on "Master" | 38 | section 2a |
| Seat rows on "Training Amount" | 25 | section 2c |
| Comparable seat rows between the two | 19 | section 2d |
| Of those, DISAGREEING | 12 | section 2d |
| Distinct target-number sources in the workbook | 4 (Master, Training Amount, roster-tab headers, Staffing Change Notes r4) | sections 2a, 2c, 2d, 2e |
| Aircraft types named across the workbook | 16 - G450/G5, Legacy 650, G200, Challenger 350, 560XL / XLS+ / Citation Excel, Phenom 300/Longitude (Phenom 300e), Phenom 100, CJ2 / Citation CE-525, M2, CJ3/+?, CJ, M2 & PC-12, PC-12, PC-12 NG, Praetor 600 (EMB-550), CJ3? Utah | sections 2a-2g |
| Tail numbers named | 10 - N787JS, N522AD, N418T, N413UU, N443BC, N477KR, N785PD, N782PD, N450JF, N409KG, plus N825NX (Training Amount only) and the placeholder "N???" | sections 1d, 2a, 2c |
| Base cities named | SLC, OGD, Georgia, CVC | Master col D |
| Status vocabulary on roster tabs | 7 - GREEN, IN-TRAINING, OPEN, OPEN (ON HOLD) / OPEN (On Hold), TRANSISTION OUT, Dual Qualified (dont use for numbers) | section 1d |
| Date typos found | 2 - "5/26/0206", "08/242026" | CERTAIN #7, #8 |
| CERTAIN items | 15 | below section 2 |
| UNCERTAIN items | 10 | below CERTAIN |

---

## Provenance and housekeeping

- Source: live Google Sheet, fileId 1ciM1uAWV1iN9Nqd2XIzj1dIt2m-tdp9bs0mNtzRpJ3U, read
  2026-09-11 late evening MT via the Google Drive MCP only.
- Read-only throughout. No database query, no sheet edit, no file upload, no email, no git
  command, no browser tool, no script in scripts/ executed.
- The only file this session created or edited in the repo is this one, plus its claim at
  .claude/claims/r1-sheet-extract-afdc0817.md.
- Scratch (sheet.txt, dump.js, tables.js, count.js, x.js, y.js) stayed in the session scratchpad
  and was removed.
- Names and positions are verbatim. Normalisation is deliberately left to the next agent; section 3
  is the list of traps it must handle.



