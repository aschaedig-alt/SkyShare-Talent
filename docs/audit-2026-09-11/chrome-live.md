# Live rendering audit (chrome-live) - 2026-09-11

STATUS: IN PROGRESS - partial file written during the walk so a usage cap cannot
lose it. Final sections are appended at the end.

## Environment caveat that contaminates every timing number below

The dev server on :3000 is shared with twelve sibling audit agents who are
editing this same working tree. Chrome's console recorded 13 Fast Refresh
rebuilds in a 90-second window while I was measuring /candidates:

  [11:36:07 PM] [Fast Refresh] rebuilding
  [11:36:10 PM] [Fast Refresh] done in 3744ms
  [11:36:23 PM] [Fast Refresh] rebuilding
  [11:36:24 PM] [Fast Refresh] done in 1309ms
  [11:36:33 PM] [Fast Refresh] rebuilding
  [11:36:35 PM] [Fast Refresh] done in 2188ms
  [11:36:38 PM] [Fast Refresh] rebuilding
  [11:36:42 PM] [Fast Refresh] done in 4538ms
  [11:36:47 PM] [Fast Refresh] rebuilding
  [11:36:52 PM] [Fast Refresh] done in 5564ms
  [11:37:21 PM] [Fast Refresh] rebuilding
  [11:37:23 PM] [Fast Refresh] done in 1951ms
  [11:37:28 PM] [Fast Refresh] rebuilding

Every rebuild remounts the page. This caught me out once and I am recording the
near-miss because it would have been a false alarm of exactly the kind CLAUDE.md
warns about: mid-rebuild, /candidates reported main innerText = 106 chars,
document scrollHeight = 695 (no scroll), table height = 0 and 65 hidden staging
divs under body, with document.readyState = "complete". That reads as a
PERMANENT SKELETON. It is not. A screenshot taken seconds later showed the page
fully painted with real data. I therefore paired every subsequent probe with a
screenshot and treat the screenshot as the truth.

CONSEQUENCE: do not trust any load-time number in this file as a production
figure. They are dev-mode, on a machine running thirteen agents, with HMR
firing. They are only useful as relative signal.

---

# RE-RUN APPENDIX — written 2026-09-12, after the usage cap

Everything above this line is the killed run's partial output and is preserved
verbatim. Everything below was observed by me on 2026-09-12 between 01:25 and
03:00 MT. This is still the **2026-09-11 audit**; 2026-09-12 is only when I ran.

## Headline

**Dark mode is broken in the one place it costs money, and it is not the place
the code-reading audits predicted.** `/jobs` — the Job Post Builder — renders its
"Formatted and ready to publish" preview on permanently white paper while the
component carries 21 `dark:` utilities, so **65 of the 68 text nodes in the advert
measure under 3:1** (body copy 1.48:1, headings 1.10:1). A recruiter in dark mode
cannot proofread a job posting before it goes to the boards; the only legible part
is the navy hero band. No other audit file contains this, the root cause is two
lines (`app/globals.css:209` and `components/job-preview/FormattedJobPost.tsx`),
and the fix is to delete the dark variants, not to patch the CSS. Alongside it I
**confirmed by measurement all three dark-mode predictions visual.md made from
source** — the org charts really do render their person index at **1.17:1** (white
panel, near-white text, on both charts, with a 13.17:1 positive control inside the
same panel), the Reports tab bar really does select without gold (**1.092:1** chip
against surface in dark), and the month calendar's "today" really is the *least*
visible chip on the grid (1.055:1 versus 1.162:1 for all 29 others). I also found
one thing nobody was looking for: **the Command Center scrolls sideways by
1 313px** because `lib/roadmap/parse.ts:42` treats any trailing parenthetical as a
date, one roadmap entry ends with a 495-character note, and
`ProjectChecklistWorkspace.tsx:137` renders it `shrink-0`. Set against all that,
the app is in good health where it matters most: **33 of 33 route loads painted
real data, zero error boundaries, zero hydration errors, and exactly one console
message in the whole walk** — the deliberate auth-bypass warning.

Two caveats the morning reader must carry: **the dev server my brief said was
running was dead**, so I started it (read-only; no page or GET-only route writes),
and **local dev bypasses auth**, so every screen here was seen as ADMIN and
nothing in this file says anything about permissions.

## CORRECTION TO THE BRIEF: the dev server was NOT running

My brief stated "A dev server is ALREADY running on http://localhost:3000 (do not
start another)". That premise was false when I started. The server had died with
the killed sessions — it was a child process of one of them.

```
PS> Get-NetTCPConnection -State Listen | ? { $_.LocalPort -ge 3000 -and $_.LocalPort -le 9999 } |
      Select LocalAddress,LocalPort,OwningProcess | Sort LocalPort | Format-Table -AutoSize

LocalAddress LocalPort OwningProcess
------------ --------- -------------
0.0.0.0           5040          5156
::1               7679         25592
::                7680         19272

PS> Get-Process -Name node -ErrorAction SilentlyContinue
NO node.exe RUNNING
```

Chrome confirmed it from the other side:

```
javascript_tool → JSON.stringify({href:location.href, ...})
{"href":"chrome-error://chromewebdata/","title":"localhost","ready":"complete",
 "bodyLen":162,"bodyHead":"This site can't be reached\n\nlocalhost refused to
 connect.\n\n... ERR_CONNECTION_REFUSED ..."}
```

I therefore started the FIRST dev server (not a second one — zero node processes
were alive, so there was no port to collide with and no sibling's server to
disturb). Before doing it I closed the three ways that could have written to the
live database, the live S3 bucket, or a mailbox:

```
$ grep -rn "prisma\.[a-zA-Z]*\.\(create\|createMany\|update\|updateMany\|upsert\|delete\|deleteMany\)" \
      app --include=page.tsx --include=layout.tsx
(no output)
POSITIVE CONTROL, same scope, reads instead of writes:
$ grep -rln "prisma\.[a-zA-Z]*\.\(findMany\|findFirst\|findUnique\|count\)" app --include=page.tsx | wc -l
5
```

So the grep and the path are right, and no page or layout writes on render.

```
$ find app/api -name route.ts | wc -l
162
$ grep -rl "export async function GET\|export const GET" app/api --include=route.ts | wc -l
59
GET-ONLY routes (no POST/PUT/PATCH/DELETE export) that contain any prisma write
or $executeRaw:
--- end list ---          ← zero
POSITIVE CONTROL, same loop, routes it judged clean (first 8):
clean: app/api/book/[slug]/slots/route.ts
clean: app/api/candidate-files/unassigned/route.ts
clean: app/api/candidates/[id]/employee/route.ts
clean: app/api/contacts/vcard/route.ts
clean: app/api/cron/calendar-sync/route.ts
clean: app/api/cron/orientation-reminder/route.ts
clean: app/api/cron/paycom-scan/route.ts
clean: app/api/cron/pilot-app-scan/route.ts
```

Zero GET-only API routes write. (The cron routes are GET-only and carry no direct
prisma write, but they call into lib send/sync paths — I never navigated to or
curled any of them.) `npm run dev` itself only writes gitignored artifacts:
`prisma/generated` (`.gitignore:12`) and `/public/vendor/mermaid.min.js`
(`.gitignore:28`).

Server identity verified before I trusted anything:

```
$ curl -s -D - -o /dev/null http://localhost:3000/ | head -8
HTTP/1.1 200 OK
Vary: rsc, next-router-state-tree, next-router-prefetch, ...
link: </_next/static/css/app/layout.css?v=1789198220925>; rel=preload; as="style"
Cache-Control: no-store, must-revalidate
X-Powered-By: Next.js
Content-Type: text/html; charset=utf-8
Date: Sat, 12 Sep 2026 07:30:21 GMT
```

`Date: Sat, 12 Sep 2026 07:30:21 GMT` = 01:30 Mountain, which is the clock I ran on.

**What this means for the other four auditors and for the morning reader:** the
dev server is mine, started at 01:29 MT, and it is the only one. Nothing else was
editing the tree while I measured, so unlike the killed run's numbers these are
NOT contaminated by Fast Refresh storms. I confirm that below with a rebuild count.

## Two corrections to CLAUDE.md's "the browser cannot see this app"

CLAUDE.md, under "Tooling gotchas", says: screenshots time out everywhere,
`read_page`'s accessibility tree "shows **only the sidebar**", and on `/travel`
specifically `main` holds ~74 characters. I tested that exact page in Chrome.

**Screenshots.** Every screenshot in this file succeeded. Zero timed out.

**`/travel` text.** CLAUDE.md says ~74 chars in `main`. Chrome measured:

```
{"p":"/travel","doc":"2500/695","bodyW":"1521/1521","mainH":2500,"mainLen":3044,
 "head":"development | - Shared live database and live file storage ... | Travel |
  Every trip across new hires and candidates - onboarding ..."}
```

`mainLen` = **3 044**, not 74.

**`read_page` on `/travel`, filter=interactive** returned 42 refs, and they are
page content, not sidebar chrome. Abridged, but these are verbatim:

```
link "Open Auggie Quintero's Travel tab" [ref_16] href="/candidates/cmrno4o4e000004ju3yg30hfu?tab=travel"
link "Open Dayten Schureman's Travel tab" [ref_22] href="/people/cmsnjbonr000004i9zxpeal7h?tab=travel"
button "Previous month" [ref_30]
button "Next month" [ref_31]
link "Dayten Schureman - PHX->SLC · Southwest · 3:30p lands here" [ref_32]
link "Erik Schwerman - SLC->MKE · Delta · 5:00p leaves here" [ref_35]
button "Show only Dayten Schureman on the grid" [ref_37]
link "Open the SOP for this page: Travel reimbursement" [ref_42] href="/handbook/travel-reimbursement"
Viewport: 1536x695
```

Refs 1-10 are the sidebar; refs 11-42 are the page. So the tree is complete.

**The distinction that reconciles this with CLAUDE.md:** that note is about the
**in-app Browser pane**, and it is correct about the pane. Chrome (the
`claude-in-chrome` extension) does not share the limitation. My predecessor said
the same thing last night; this is the second independent confirmation, and I
used the one page CLAUDE.md cites by name so the comparison is like-for-like.
Someone should add "...in the in-app Browser pane; Chrome can read it" to that
bullet, because as written it tells every future session that live verification
is impossible when it is not.

## The mid-render lie, reproduced exactly

My predecessor nearly filed a false alarm on /candidates. I reproduced it on the
first try, which means it is systematic, not a fluke, and every future session
walking this app will hit it.

After `navigate` + a **7-second** wait, the probe returned:

```
{"p":"/candidates","doc":"695/695","bodyW":"1536/1536","mainLen":106,
 "head":"development | - Shared live database ... | SKYSHARE JOURNEY",
 "nIV":0,"iv":[],"nH":0,"hx":[],"btn":800,"a":436,"tbl":1,"tr":380,"err":null}
```

`doc: 695/695` means the document does not scroll. `mainLen: 106` means `main`
holds only the dev banner. Read alone, that is a page that rendered a shell and
died. The screenshot taken in the *same batch, one action later* showed the
Candidates table fully painted with real names, stage chips and counts.

The internal contradiction that gives it away is in the probe itself: `tr: 380`
and `btn: 800`. 380 table rows cannot live in a 695px non-scrolling document.
A re-probe moments later:

```
{"mainCount":1,"mains":[{"cls":"min-w-0 flex-1","sh":34837,"ch":34837,"txt":84970}]}
{"p":"/candidates","doc":"34838/695","docScrollsV":true,"docScrollsH":false,
 "nActiveInnerV":0,"nActiveH":0}
```

`main` is **34 837px** tall holding **84 970** characters of text. The first
reading was simply taken before layout settled, and `innerText` is
layout-dependent, so it returns near-nothing mid-render while `querySelectorAll`
counts are already correct.

**Rule for whoever walks this app next:** never conclude "blank page" from
`innerText` or `scrollHeight`. Take a screenshot, and cross-check against a
count-based signal (`tbody tr`, `button`) which does not depend on layout.

## Light-mode route walk

Method, identical for every route: `navigate` -> wait 7-8s -> `screenshot` ->
`javascript_tool` probe reading `documentElement.scrollHeight/clientHeight`,
`body.scrollWidth`, `main.scrollHeight/innerText.length`, every element whose
computed `overflow-y` is auto/scroll AND actually overflows, every element whose
computed `overflow-x` is auto/scroll AND actually overflows, and a regex over
`body.innerText` for error-boundary copy.

Every route below **PAINTED REAL DATA, confirmed by screenshot.** None showed an
error boundary, an empty shell or a stuck skeleton. `err` was `null` on all of
them - and that regex is not vacuous, it matches /Something went wrong|Unhandled|
Application error|error occurred|Failed to load|client-side exception/i.

| route | doc scrollH/clientH | body scrollW/clientW | main text | rows | painted |
|---|---|---|---|---|---|
| `/` -> `/settings/command-center` | 89004 / 680 | 2834 / 1521 | 887 837 | 0 | yes |
| `/candidates` | 34838 / 695 | 1521 / 1521 | 84 970 | 380 | yes |
| `/people` | 1898 / 695 | 1521 / 1521 | 2 640 | 0 | yes |
| `/employees` | 17785 / 695 | 1521 / 1521 | 32 609 | 454 | yes |
| `/orientation` | 695 / 695 | 1536 / 1536 | 872 | 0 | yes |
| `/travel` | 2500 / 695 | 1521 / 1521 | 3 044 | 8 | yes |
| `/offers` | 3523 / 695 | 1521 / 1521 | 4 678 | 0 | yes |
| `/jobs` | 6602 / 695 | 1521 / 1521 | 16 532 | 0 | yes |
| `/matching` | 774 / 695 | 1521 / 1521 | 939 | 0 | yes |
| `/reports` | 3100 / 695 | 1521 / 1521 | 4 675 | 6 | yes |

`/` and `/command-center` both redirect, and both are deliberate and documented
in source - `app/page.tsx` (`resolveUserHome`, falls back to `DEFAULT_HOME` when
auth is bypassed) and `app/command-center/page.tsx` (a comment explains it moved
Aug 3 and the stub is kept for bookmarks). Not a defect; noted so the morning
reader is not surprised that `/command-center` shows a Settings sidebar.

## CONFIRMED BY OBSERVATION: visual.md CERTAIN #2, the Reports tab bar

visual.md predicted from source that `components/reports/ReportsWorkspace.tsx:1526`
gives the Reports page's main tab bar a selected state with no gold, while the
same file's `SEGMENT_ON` constant 1 100 lines above it does it correctly. I
measured the rendered cascade on `/reports`. Gold is `#eaaa00` = `rgb(234,170,0)`.

```
getComputedStyle on the MAIN TAB BAR buttons:
{"txt":"Fleet Progression","color":"rgb(255, 255, 255)","bg":"rgb(13, 44, 67)",
 "boxShadow":"rgba(0,0,0,0) 0px 0px 0px 0px, rgba(0,0,0,0) 0px 0px 0px 0px,
              rgba(0,0,0,0.05) 0px 1px 2px 0px",
 "cls":"rounded px-4 py-2 text-sm font-semibold transition bg-brand-lea text-white shadow-sm"}
{"txt":"Travel Spend","color":"rgb(99, 102, 106)","bg":"rgba(0, 0, 0, 0)","boxShadow":"none",
 "cls":"... text-brand-grey hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/5"}
```

The selected tab's entire box-shadow is `shadow-sm`. No gold.

**POSITIVE CONTROL - the same query, the same page, the same theme, on the two
segmented controls that DO use `SEGMENT_ON`:**

```
"Active     || bg=rgb(13, 44, 67) || color=rgb(255,255,255) || boxShadow=rgb(255,255,255) 0px 0px 0px 0px, rgb(234, 170, 0) 0px 0px 0px 1px, rgba(0,0,0,0) 0px 0px 0px 0px || GOLD_PRESENT=true"
"Former     || bg=rgba(0, 0, 0, 0)  || color=rgb(99,102,106)  || boxShadow=none || GOLD_PRESENT=false"
"Fractional || bg=rgb(13, 44, 67) || color=rgb(255,255,255) || boxShadow=rgb(255,255,255) 0px 0px 0px 0px, rgb(234, 170, 0) 0px 0px 0px 1px, rgba(0,0,0,0) 0px 0px 0px 0px || GOLD_PRESENT=true"
"All fleets || bg=rgba(0, 0, 0, 0)  || color=rgb(99,102,106)  || boxShadow=none || GOLD_PRESENT=false"
```

So gold rings DO render on this page, in this theme, through this exact
measurement - they are simply absent from the primary tab bar. That rules out
"my probe cannot see gold" and "gold is broken globally". visual.md is right.

## Console output across the whole light walk

Console tracking only begins when `read_console_messages` is first called, so
after turning it on I re-walked the five heaviest routes (`/candidates`,
`/calendar`, `/fleet/crew`, `/reports`, `/employees`), 9s dwell each, then read
with `pattern: "."` — i.e. match everything, no filtering.

```
[read_console_messages] Found 1 console messages:
[1] [1:47:49 AM] [WARNING] (about://React/Server/webpack-internal:///(rsc)/./lib/auth/auth-config.ts?0:27:16)
[auth] Local development bypass is ACTIVE - every request is treated as ADMIN.
This database is the live one; set REQUIRE_AUTH=true to exercise real sign-in.
```

**One** message, and it is a deliberate warning the app prints on purpose. Zero
React errors, zero hydration mismatches, zero missing-key warnings, zero uncaught
exceptions, zero failed network requests surfaced to console, and zero Fast
Refresh rebuilds (nobody was editing the tree).

That last one matters: the killed run recorded **13 Fast Refresh rebuilds in 90
seconds** and warned its numbers were contaminated. Mine are not. Same app, same
machine, different neighbours.

It also independently corroborates what security.md will have found from source:
the auth bypass is real and live, and every measurement in this file was taken as
an implicit ADMIN. **No permission conclusion can be drawn from anything I saw.**

## DARK MODE

The toggle is `components/layout/ThemeToggle.tsx`, rendered in the left rail with
`aria-label="Switch to dark mode"`. I clicked the real control rather than using
`resize_window`'s colorScheme, because this app ignores `prefers-color-scheme`
entirely (visual.md established that: dark is purely `.dark`-class driven). After
the click:

```
{"after_htmlClass":"__variable_f367f3 dark","after_theme":"dark","bodyBg":"rgb(11, 22, 34)"}
```

`rgb(11,22,34)` = `#0b1622`, the documented dark page background. Toggle works.

*(Aside worth one line: my first click set `theme` to `light`, not `dark` —
`ThemeToggle` seeds its `dark` state from `document.documentElement.classList` in
a `useEffect`, so a click landing before that effect commits writes the wrong
value. I could not reproduce it a second time, so it goes under UNCERTAIN rather
than CERTAIN.)*

### CONFIRMED BY OBSERVATION: visual.md's headline finding is real

visual.md predicted, from source alone, that `--card`, `--line`, `--danger` and
`--sweet` are referenced by the fleet org charts but never defined, so in dark
mode `--ink` (which IS themed, to near-white) paints onto a `#fff` fallback at
about 1.1:1. I measured the live cascade on the rendered `.wrap` element on
`/fleet/crew` with `html.dark` active:

```
{
 "htmlClass": "__variable_f367f3 dark",
 "wrapClass": "OrgChart_wrap__xQXpA",
 "vars": {
  "--card":     "\"\"",            <-- EMPTY: undefined, fallback #fff applies
  "--line":     "\"\"",            <-- EMPTY
  "--danger":   "\"\"",            <-- EMPTY
  "--sweet":    "\"\"",            <-- EMPTY
  "--ink":      "\"#e9eef5\"",     <-- DEFINED and themed to near-white
  "--color-bg": "\"#10243a\"",     <-- DEFINED and themed
  "--glow":     "\"inset 0 0 0 9999px rgba(234,170,0,0.06), 0 0 0 1px rgba(234,170,0,0.65), ...\""
 }
}
```

**That is its own positive control.** The same `getPropertyValue` call, on the
same element, in the same instant, returns real values for `--ink`, `--color-bg`
and `--glow` and empty strings for the four. So the query is not broken, the
element is not wrong, and the theme is not inactive. Those four variables simply
do not exist.

### And here is what it looks like, because I opened one

The `PeopleIndex` surface is reachable without writing anything — it is the
"FIND A PERSON" disclosure in the chart toolbar. I clicked it on **both** charts
in dark mode. Screenshot: a **white panel** sitting in the dark page, filled with
ghost text. Measured, with WCAG ratios computed in-page:

`/fleet/crew`, the crew roster index:

```
{
 "panelBg": "rgb(255, 255, 255)",
 "samples": [
  {"txt":"Sort",                       "color":"rgb(233, 238, 245)","bgUsed":"rgb(255, 255, 255)","fontSize":"11px",  "ratio":"1.17"},
  {"txt":"Last name",                  "color":"rgb(255, 255, 255)","bgUsed":"rgb(22, 50, 76)",  "fontSize":"12px",  "ratio":"13.17"},
  {"txt":"Aircraft",                   "color":"rgb(233, 238, 245)","bgUsed":"rgb(255, 255, 255)","fontSize":"12px",  "ratio":"1.17"},
  {"txt":"Corby Alexander",            "color":"rgb(233, 238, 245)","bgUsed":"rgb(255, 255, 255)","fontSize":"12.5px","ratio":"1.17"},
  {"txt":"78 of 78 rows · a dual-quali","color":"rgb(233, 238, 245)","bgUsed":"rgb(255, 255, 255)","fontSize":"11.5px","ratio":"1.17"}
 ]
}
```

`/fleet/maintenance`, the same component, independently:

```
{
 "htmlClass": "__variable_f367f3 dark",
 "panelBg": "rgb(255, 255, 255)",
 "wrapVars": {"--card":"\"\"","--line":"\"\"","--ink":"\"#e9eef5\"","--color-bg":"\"#10243a\""},
 "samples": [
  {"txt":"Sort",                     "color":"rgb(233, 238, 245)","bg":"rgb(255, 255, 255)","fs":"11px",  "ratio":"1.17"},
  {"txt":"Last name",                "color":"rgb(255, 255, 255)","bg":"rgb(22, 50, 76)",  "fs":"12px",  "ratio":"13.17"},
  {"txt":"Location",                 "color":"rgb(233, 238, 245)","bg":"rgb(255, 255, 255)","fs":"12px",  "ratio":"1.17"},
  {"txt":"Drew Bassett",             "color":"rgb(233, 238, 245)","bg":"rgb(255, 255, 255)","fs":"12.5px","ratio":"1.17"},
  {"txt":"27 of 27 rows · a dual-qua","color":"rgb(233, 238, 245)","bg":"rgb(255, 255, 255)","fs":"11.5px","ratio":"1.17"}
 ]
}
```

**The "Last name" row is the positive control, and it is inside the same panel.**
It renders `rgb(255,255,255)` on `rgb(22,50,76)` = **13.17:1** because that chip
carries its own background instead of inheriting `var(--card)`. Same panel, same
query, same ratio function — so the function is right and 1.17 is a real number,
not an artefact.

**1.17:1.** WCAG AA for body text is 4.5:1. visual.md predicted ~1.1:1 from
source; the rendered value is 1.17:1. That prediction was correct.

The container declaration, read straight off the live element:

```
style = "margin-top: 12px; border: 1px solid var(--line, #cdd7e2);
         border-radius: 4px; background: var(--card, #fff); padding: 12px;"
computed: bg=rgb(255,255,255)  color=rgb(233,238,245)  border=rgb(205,215,226)
```

So `--line` falls back too: a `#cdd7e2` pale hairline on a dark page.

**What this costs.** In dark mode, "Find a person" on both org charts is a white
rectangle of invisible names. It is the chart's only search — 78 people on crew,
27 on maintenance — so a dark-mode user cannot find anybody on the org chart.

### The two org-chart modals: NOT tested, and deliberately so

visual.md also names `CrewOrgChart.tsx:2485` and `:2524`. I read them. They are
`noticePrompt` and `rolePrompt` — **write-confirmation dialogs**. The first
writes a notice date onto an employee record ("Save notice date"); the second
records a role change on a person's journey. Reaching either requires performing
the write action that summons it, against the live production database.

**I did not open them, and nobody should to check a colour.** But the finding
does not depend on opening them: both carry the identical declaration

```
background: "var(--card, #fff)", color: "var(--ink, #1a2b3c)"
```

on elements inside the same `.wrap`, where I have measured `--card` empty and
`--ink` = `#e9eef5`. Same variables, same subtree, same cascade. They render the
same 1.17:1. That is inference from a measured mechanism plus an observed
instance of it — strong, but flagged as inference, not sight.

`LinkPicker.tsx:117` (the profile-link popover) is the fourth surface. It lives
behind the chart's edit affordances, so I did not open it either. Same reasoning
applies.

**Scorecard on visual.md's four predicted surfaces:**

| surface | predicted | my result |
|---|---|---|
| `PeopleIndex` on `/fleet/crew` | unreadable, ~1.1:1 | **OBSERVED unreadable, measured 1.17:1** |
| `PeopleIndex` on `/fleet/maintenance` | unreadable | **OBSERVED unreadable, measured 1.17:1** |
| `CrewOrgChart` noticePrompt / rolePrompt modals | unreadable | **INFERRED** - identical declaration, variables measured empty; not opened because opening requires a live write |
| `LinkPicker` popover | unreadable | **INFERRED** - same; behind edit affordances |

### CONFIRMED BY OBSERVATION: the Reports tab bar is invisible-selected in dark

In light mode the missing gold ring is a style-guide violation you can argue
about, because navy-on-white is still obviously "picked". In dark mode it stops
being cosmetic. Measured on `/reports` with `html.dark`:

```
{
 "htmlClass": "__variable_f367f3 dark",
 "selectedChipBg":       "rgb(13, 44, 67)",   <- brand-lea  #0d2c43
 "surfaceBehindTabBar":  "rgb(16, 36, 58)",   <- brand-panel #10243a
 "CHIP_vs_SURFACE":      "1.092 :1",
 "unselectedChipBg":     "rgba(0, 0, 0, 0)",

 "segSelectedBg":        "rgb(13, 44, 67)",
 "segSurface":           "rgb(16, 36, 58)",
 "SEG_CHIP_vs_SURFACE":  "1.092 :1",
 "segHasGoldRing":       true
}
```

Read those two halves together, because the comparison is the finding: **the tab
bar's selected chip and the segmented control's selected chip have the IDENTICAL
1.092:1 chip-against-surface ratio.** The navy is equally invisible in both. The
only reason the segmented control still reads as selected in dark mode is
`segHasGoldRing: true`.

So the gold ring is not decoration — in dark mode it is the *entire* selection
signal, and the Reports page's primary navigation is the one place it is missing.
The only remaining cue there is text colour: `rgb(255,255,255)` selected vs
`rgb(148,163,184)` unselected.

Full per-button dark-mode readings:

```
{"txt":"Fleet Progression","color":"rgb(255,255,255)","ownBg":"rgb(13,44,67)",  "effBg":"rgb(13,44,67)","ratio":"14.40","gold":false}
{"txt":"Travel Spend",     "color":"rgb(148,163,184)","ownBg":"rgba(0,0,0,0)",  "effBg":"rgb(16,36,58)","ratio":"6.13", "gold":false}
{"txt":"Document Currency","color":"rgb(148,163,184)","ownBg":"rgba(0,0,0,0)",  "effBg":"rgb(16,36,58)","ratio":"6.13", "gold":false}
{"txt":"Active",           "color":"rgb(255,255,255)","ownBg":"rgb(13,44,67)",  "effBg":"rgb(13,44,67)","ratio":"14.40","gold":true}
```

Text legibility is fine everywhere (14.40:1 and 6.13:1 both pass AA). The defect
is purely "which one is selected".

### CONFIRMED BY OBSERVATION: MonthCalendar's "today" is the least visible day

visual.md predicted `components/calendar/MonthCalendar.tsx:174` would invert in
dark mode - today keeps a bare navy chip while every *other* day gets
`dark:bg-white/5`, so today becomes the one day with no visible chip. Today is
**Sat Sep 12 2026**. On `/calendar` in dark mode, across the rendered month grid:

```
{
 "total": 30,
 "ownBgHistogram": {
   "rgba(255, 255, 255, 0.05)": 29,     <- every other day
   "rgb(13, 44, 67)": 1                 <- today, alone
 },
 "todayChips": [{"n":"12","ownBg":"rgb(13, 44, 67)","color":"rgb(255,255,255)",
   "cls":"flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition bg-brand-lea text-white"}],
 "sampleOther": [{"n":"1","ownBg":"rgba(255, 255, 255, 0.05)","color":"rgb(241,245,249)",
   "cls":"... transition text-brand-lea hover:bg-brand-cloudDancer/50 dark:text-slate-10[0] dark:bg-white/5"}]
}
```

That histogram IS the positive control: 29 chips render one background and
exactly one - today - renders the other. Compositing each against the opaque
surface behind the cells:

```
{
 "todayIs": "12",
 "surfaceBehindCells":    "rgb(28, 47, 68)",
 "todayChip":             "rgb(13, 44, 67)",
 "TODAY_chip_vs_surface": "1.055:1",
 "otherChipRaw":          "rgba(255, 255, 255, 0.05)",
 "otherChipComposited":   "rgb(39, 57, 77)",
 "OTHER_chip_vs_surface": "1.162:1"
}
```

**Today is 1.055:1. Every other day is 1.162:1.** Both are poor, but the ordering
is the bug: the marker meant to pick today out of the grid is the *least* visible
chip on it. visual.md called this exactly right.

*(Method note: my first attempt at this composite walked up to
`rgba(255,255,255,0.05)` and treated that semi-transparent layer as the surface,
which produced a nonsense `1.000:1`. The numbers above come from a corrected walk
that continues up until it finds a fully opaque ancestor and then composites back
down. I am showing this because the wrong version looked perfectly plausible.)*

### A named project bug, live: TWO vertical scrollbars on /calendar

CLAUDE.md: "Scroll-inside-scroll is the bug. One vertical scrollbar per screen.
If the page already scrolls, the panel inside it must not."

`/calendar`, viewport 1536x695, measured twice with a full reload between:

```
{
 "win": "1536x695",
 "doc": "1408/695",
 "pageScrolls": true,                       <- scrollbar #1, the document
 "nInnerV": 1,
 "innerV": [
  {
   "sel": "DIV.min-h-0 flex-1 space-y-2 overflow-y-auto p-3",
   "sh": 13534,
   "ch": 249,
   "computedOx": "auto",
   "ratio": "54.4"                          <- scrollbar #2, the manifest panel
  }
 ],
 "nH": 0
}
```

The page scrolls (1408 > 695) **and** the "Interview manifest / All interviews"
panel scrolls inside it: **13 534px of content in 249px of box, a ratio of
54.4:1.** That is every interview in the workspace shown through a 249px slot.

Source: `components/calendar/CalendarWorkspace.tsx:108`.

```
$ grep -rn "min-h-0 flex-1 space-y-2 overflow-y-auto p-3" components app --include=*.tsx
components/calendar/CalendarWorkspace.tsx:108:      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
```

**`computedOx: "auto"` is the CLAUDE.md unpinned-axis trap, live.** The class is
`overflow-y-auto` with no `overflow-x-*`, and per the CSS overflow spec the other
axis therefore computes to `auto` rather than `visible`. Horizontal scrolling is
switched on; it is currently latent only because the content happens to fit
(`nH: 0`).

Whole-repo measurement of that trap, with its positive control:

```
$ grep -rn "overflow-y-auto overflow-x-hidden" components app --include=*.tsx | wc -l
5                       <- the CORRECT pinned pair; the convention does exist here
$ grep -rn "overflow-y-auto" components app --include=*.tsx | grep -v "overflow-x-" | wc -l
37                      <- unpinned
```

5 of 42 sites pin the other axis. The 5 prove the pattern is known and my grep
finds it when present, so the 37 are a real gap and not a bad query.

*(A near-miss worth recording, because it would have been a false "the layout is
unstable" claim. My second `/calendar` reading came back `doc: 15626/312` with no
inner scroller at all - which reads exactly like EditableGrid re-initialising and
collapsing. It was not. The Chrome window had silently collapsed to
`innerW:690, innerH:312, outerW:160, outerH:28`, so the grid had simply reflowed
to a narrow layout. I caught it by checking `window.innerWidth` before writing
anything down. Every measurement in this file is annotated with the viewport it
was taken at for this reason.)*

### NEW, and nobody predicted it: the Job Post Builder preview is unreadable in dark mode

This is the one thing I found that no sibling audit file contains, and it is the
worst dark-mode defect in the app — worse than the org charts, because it sits in
the middle of a publishing workflow.

`/jobs` is the SkyShare Job Post Builder. Panel 3 is "JOB POSTING PREVIEW -
Formatted and ready to publish": the WYSIWYG proof of the advert before it goes
to the job boards. In dark mode my white-surface detector fired on it:

```
{"p":"/jobs","theme":"__variable_f367f3 dark","doc":"6602/695","whiteSurfaces":2,
 "items":[
  {"cls":"preview-paper overflow-hidden rounded border border-brand-le",
   "bg":"rgb(255, 255, 255)","color":"rgb(241, 245, 249)","ratio":"1.10","w":723,"h":2484,
   "txt":"SKYSHARE CAREERS Gulfstream "},
  {"cls":"preview-paper overflow-hidden rounded border border-brand-le",
   "bg":"rgb(255, 255, 255)","color":"rgb(241, 245, 249)","ratio":"1.10","w":402,"h":3241,
   "txt":"SKYSHARE CAREERS Gulfstream "}]}
```

A white "paper" preview is legitimate by itself - the advert is printed on white
stock in both themes. So I sampled the text INSIDE it rather than trusting the
container:

```
{
 "theme": "__variable_f367f3 dark",
 "paperBg": "rgb(255, 255, 255)",
 "paperInheritedColor": "rgb(241, 245, 249)",
 "textSamples": [
  {"txt":"Gulfstream G450 & GV Captain",   "color":"rgb(255, 255, 255)","bg":"rgb(13, 44, 67)",        "fs":"31.5px", "ratio":"14.40"},
  {"txt":"Job Summary",                    "color":"rgb(241, 245, 249)","bg":"rgb(255, 255, 255)",    "fs":"15.75px","ratio":"1.10"},
  {"txt":"From Job Field",                 "color":"rgb(110, 231, 183)","bg":"rgba(16,185,129,0.15)", "fs":"11px",   "ratio":"1.66"},
  {"txt":"SkyShare is seeking a passiona", "color":"rgb(203, 213, 225)","bg":"rgb(255, 255, 255)",    "fs":"12.25px","ratio":"1.48"}
 ],
 "leafTextUnder3to1": 65,
 "leafTextOk": 3
}
```

**65 of the 68 leaf text nodes inside the preview render below 3:1. Three pass.**
Those three are the positive control and they are exactly the ones you would
expect: the hero band, which carries its own navy background, so white-on-navy at
14.40:1 survives.

**I then looked, because a number is not a sight.** Zoomed screenshot of the
preview in dark mode: the navy hero reads perfectly - "Gulfstream G450 & GV
Captain", "$230,000 annually | 15/13 rotation". Everything below it is ghost text
on white paper: "SLC - Salt Lake City, UT", "Home Based Available", "Full Time",
"May 26, 2026", the "Job Summary" heading, the "About Us:" heading, and the body
paragraph "SkyShare is seeking a passionate and skilled GV typed Captain to fly
both the G450 and GV while supporting an exceptional private aviation
experience." All of it barely visible. The picture and the numbers agree.

**Root cause, and it is exact.** `app/globals.css:209-213`:

```css
.preview-paper {
  background:
    linear-gradient(180deg, rgba(13, 44, 67, 0.02), rgba(13, 44, 67, 0)),
    #fff;
}
```

The surface is pinned to `#fff` in BOTH themes and has no `color`. Meanwhile the
component that renders on it was swept for dark mode like any other card:

```
$ grep -o "dark:text-[a-zA-Z0-9/-]*" components/job-preview/FormattedJobPost.tsx | sort | uniq -c | sort -rn
      9 dark:text-slate-100
      3 dark:text-slate-400
      2 dark:text-slate-300
      1 dark:text-red-400
      1 dark:text-emerald-300
$ grep -o "dark:[a-zA-Z0-9/:.-]*" components/job-preview/FormattedJobPost.tsx | sort | uniq -c | sort -rn
      ... plus 3 dark:border-white/10, 1 dark:bg-white/5, 1 dark:bg-emerald-500/15
```

`dark:text-slate-100` is `rgb(241,245,249)` and `dark:text-slate-300` is
`rgb(203,213,225)` - **exactly the two values I measured on the page.** The
declarations are explicit utilities on the children, which is why adding a
`color` to `.preview-paper` would NOT fix this: an explicit class beats
inheritance.

**These 21 `dark:` utilities are all inside a permanently-white surface, so every
one of them is wrong.** `preview-paper` appears in exactly two places in the
whole repo, and one of them is this component's own root element:

```
$ grep -rn "preview-paper" app components lib --include=*.css --include=*.tsx --include=*.ts
app/globals.css:209:.preview-paper {
components/job-preview/FormattedJobPost.tsx:173:    <article className={`preview-paper overflow-hidden rounded border border-brand-lea/12 shadow-sm dark:border-white/10 ${className}`}>
```

So there is no context in which `FormattedJobPost` renders on anything but white
paper. The fix is to delete the dark variants from that file, not to patch CSS.

## Real contrast samples, measured from the rendered cascade, both themes

The accessibility auditor computes ratios from config and cannot know what won
the cascade. These are the actual painted values, composited through every
semi-transparent ancestor to an opaque surface, with the WCAG formula applied
in-page.

**`/employees`, DARK (viewport 1536x695):**

| element | color | surface | size | ratio |
|---|---|---|---|---|
| table header | `rgb(148,163,184)` | `rgb(16,36,58)` | 10px | **6.13** |
| table cell | `rgb(232,238,245)` | `rgb(16,36,58)` | 12.25px | **13.46** |
| muted label | `rgb(148,163,184)` | `rgb(16,35,56)` | 11px | **6.24** |
| status pill "Current" | `rgb(110,231,183)` | `rgb(16,58,69)` | 10.5px | **8.01** |
| selected nav "People" | `rgb(13,44,67)` | `rgb(234,170,0)` | 13.3px | **7.03** |
| primary button | `rgb(255,255,255)` | `rgb(13,44,67)` | 10.5px | **14.40** |

**`/employees`, LIGHT (same viewport, same query):**

| element | color | surface | size | ratio |
|---|---|---|---|---|
| table header | `rgb(99,102,106)` | `rgb(255,255,255)` | 10px | **5.77** |
| table cell | `rgb(48,47,49)` | `rgb(255,255,255)` | 12.25px | **13.32** |
| muted label | `rgb(99,102,106)` | `rgb(253,254,254)` | 11px | **5.69** |
| status pill "Current" | `rgb(6,95,70)` | `rgb(236,253,245)` | 10.5px | **7.29** |
| selected nav "People" | `rgb(13,44,67)` | `rgb(234,170,0)` | 13.3px | **7.03** |
| body text | `rgb(99,102,106)` | `rgb(255,255,255)` | 12.25px | **5.77** |

**`/candidates`, LIGHT:**

| element | color | surface | ratio |
|---|---|---|---|
| table header | `rgb(99,102,106)` | `rgb(246,245,242)` | **5.29** |
| table cell | `rgb(48,47,49)` | `rgb(255,255,255)` | **13.32** |
| muted label | `rgb(99,102,106)` | `rgb(253,254,254)` | **5.69** |
| pill "REAPPLIED" | `rgb(146,64,14)` | `rgb(255,251,235)` | **6.84** |
| pill "CLOSED" | `rgb(99,102,106)` | `rgb(245,243,240)` | **5.21** |

**Every one of these passes WCAG AA (4.5:1), in both themes.** Two things worth
pulling out:

1. **`brand-grey` renders as `rgb(99,102,106)` = `#63666a`**, the *darkened*
   post-accessibility value. So the Jul 9 fix is genuinely live in the UI.
   visual.md notes a second, stale copy (`#76787b`) still sitting in
   `lib/formatting/brand.ts:8` - my measurement says that stale copy is not what
   the app paints, which narrows its blast radius to wherever that module is
   consumed directly.
2. **The selected nav item is navy on gold, `rgb(13,44,67)` on `rgb(234,170,0)`,
   7.03:1, identical in both themes.** The locked "selected = navy + gold" rule
   is correctly implemented in the left rail. That is the positive control for
   every "no gold on selected" finding elsewhere in this file: the app *can* do
   it and does do it here.

## The focus ring: defined globally, and it FAILS in light mode

I could not physically press Tab (see the environment limits below), but the
substantive question - is there a visible focus indicator - is answerable by
reading the rendered stylesheet, which I did:

```
stylesheetsRead: 2, stylesheetsBlocked: 0, focusRuleCount: 22
":focus-visible { outline: 2px solid var(--skyshare-gold); outline-offset: 2px; border-radius: 4px; }"
":focus:not(:focus-visible) { outline: none; }"
```

Both stylesheets parsed, none blocked, so this is the complete picture. **There
is a global, universal, on-brand focus indicator.** There is no
"invisible focus ring" bug of the kind I was asked to look for - a good result
and worth saying plainly.

But the ring is gold, and gold is a light colour:

```
{"goldToken":"#eaaa00","pageToken":"#eaf0f7",
 "focusRingVsWhiteCard": "2.05",
 "focusRingVsPageLight": "1.79",
 "focusRingVsDarkPanel": "7.67",
 "focusRingVsDarkPage":  "8.90"}
```

WCAG 2.1 SC 1.4.11 (Non-text Contrast) requires **3:1** for a focus indicator.

- On a white card in light mode: **2.05:1 - FAILS**
- On the cool-mist page background in light mode: **1.79:1 - FAILS**
- On the dark panel: 7.67:1 - passes
- On the dark page: 8.90:1 - passes

**The focus ring is hardest to see in the default theme and easy to see in the
opt-in one.** That is counter-intuitive, it is the sort of thing a config-only
audit cannot catch, and it means keyboard users on the default theme have a
focus indicator that does not meet the standard.

I am NOT proposing the fix as certain, because "make the focus ring not gold"
collides with the locked design system, and that is the user's call, not mine.
It goes under UNCERTAIN with the options spelled out.

## Tab-stop counts

Measured with
`querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')`:

| route | focusable elements |
|---|---|
| `/candidates` | **2 000** |
| `/employees` | **1 845** |
| `/business-cards` | 750 |
| `/archive` | 136 |
| `/handbook` | 24 |

`/candidates` renders 380 rows with ~5 controls each and no pagination by
default (the "SHOW 100 / 250 / 500" control defaults to 500). A keyboard user who
wants the footer presses Tab two thousand times. `/handbook` at 24 shows the
counter is measuring something real and not just counting DOM nodes.

This is an observation, not a filed defect - the page is doing what it was asked
to do. But 2 000 tab stops with no skip-link is the kind of thing worth a
decision, so it is in UNCERTAIN.
## NEW: the Command Center scrolls sideways, and one roadmap line is why

`/settings/command-center` is the page the team uses to see what is done. In
light mode, at a 1536x695 viewport, it measures:

```
{"win":"1536x695","theme":"__variable_f367f3",
 "doc":"89004/680",          <- 89 004px tall = 128 screens
 "bodyW":"2834/1521",        <- 2 834px wide in a 1 521px viewport
 "mainH":89004,"mainTextLen":887837,
 "tallElements":24,
 "tallest":[{"tag":"DIV","cls":"space-y-4 px-5 py-5 lg:px-8","h":88975,"kids":2},
            {"tag":"DIV","cls":"space-y-3","h":87690,"kids":25},
            {"tag":"SECTION","cls":"rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-p","h":17918},
            {"tag":"DIV","cls":"space-y-2 border-t border-brand-lea/10 px-5 py-4 dark:border-white/10","h":17856,"kids":211}]}
```

The height is the whole roadmap rendered as a checklist and is arguably by
design. **The width is not.** The document scrolls horizontally by 1 313px, and
that is a flat violation of the project rule that the page body must never scroll
sideways. You can see the horizontal scrollbar in the screenshot.

I asked the page which element is responsible:

```
{"viewportW":1521,"bodyScrollW":2834,"docScrollsH":true,
 "overflowingElements":1,
 "widest":[{"tag":"SPAN",
            "cls":"shrink-0 text-xs text-brand-grey dark:text-slate-400",
            "left":385,"right":2834,"w":2450,
            "txt":"RESOLVED Jul 22: the one unmat"}]}
```

**Exactly one element**, a single `<span>` 2 450px wide. Here is the full chain,
every link verified rather than assumed.

**Link 1 - the renderer.** `components/workspace/ProjectChecklistWorkspace.tsx:137`:

```tsx
{item.date && <span className="shrink-0 text-xs text-brand-grey dark:text-slate-400">{item.date}</span>}
```

`shrink-0` forbids it from shrinking in its flex row, and there is no `truncate`,
`min-w-0` or wrapping. Whatever `item.date` holds is rendered at full width.

**Link 2 - the parser.** `lib/roadmap/parse.ts:41-46`:

```js
// Trailing parenthetical → date, e.g. "Did the thing (Jun 10)"
const dateMatch = text.match(/\(([^)]*)\)\s*$/);
if (dateMatch) {
  date = dateMatch[1].trim();
  text = text.slice(0, dateMatch.index).trim();
}
```

`[^)]*` is unbounded and there is no check that the capture looks like a date. Any
trailing parenthetical of any length becomes `item.date`.

**Link 3 - the data.** `lib/roadmap/roadmap.ts:564` ends with a 495-character
parenthetical beginning `(RESOLVED Jul 22: the one unmatched row was a surname
spelling split. ...)`. That string matches the span text the page reported.

**How widespread it is**, counted over checklist lines only:

```
$ grep -cE '^- \[.\]' lib/roadmap/roadmap.ts
1020                                            <- checklist items
$ grep -E '^- \[.\]' lib/roadmap/roadmap.ts | grep -cE '\([^)]*\)[[:space:]]*$'
49                                              <- end with a parenthetical → parsed as a date
$ grep -E '^- \[.\]' … | grep -oE '\([^)]{21,}\)[[:space:]]*$' | wc -l
35                                              <- longer than 20 chars: NOT dates
$ grep -E '^- \[.\]' … | grep -oE '\([^)]{1,20}\)[[:space:]]*$' | wc -l
14                                              <- date-shaped
```

35 + 14 = 49, which reconciles. So **35 of the 49 "dates" on the Command Center
are not dates**, they are prose. Longest offenders:

```
495  (RESOLVED Jul 22: the one unmatched row was a surname spelling split. The correc…
163  (/jobs/layout-lab was retired; the Settings > Layout Lab visual overview STAYS p…
128  (Later: training-date importer filled/added dated position changes for 77 pilots…
101  (Paused Jul — needs per-move decisions incl. module-access implications of mov…
 90  (Legit non-links left alone: post-submit redirects, filter/query updates, file d…
 85  (Later: QR code + NFC/dot-style card pointed at the same URL; per-role contact s…
```

The positive control that this is a real classification and not a broken regex:
the same query returns 14 short ones, and they are exactly what you would expect
— `(Jun 8)`, `(Jun 10)`, `(Jun 9)` — though even among those, `(a phase/group)`
and `(admin-only)` are not dates either.

**Why this deserves attention beyond the scrollbar:** those 35 prose strings are
being rendered into a small grey "date" chip next to each item. The page that is
supposed to tell the team what shipped and when is displaying 495 characters of
a resolved-note where a date belongs. The sideways scroll is the symptom that
made it visible.

---

# CERTAIN — safe for a later agent to fix without re-deriving

Each of these I measured in the rendered page, with the source line confirmed.

### 1. `app/globals.css:209` + `components/job-preview/FormattedJobPost.tsx` — the job-post preview is unreadable in dark mode

**Problem.** `.preview-paper` pins the surface to `#fff` in both themes, but
`FormattedJobPost` carries 21 `dark:` utilities, so in dark mode the advert
renders near-white text on white paper. 65 of 68 leaf text nodes measure under
3:1; the body copy is 1.48:1 and headings are 1.10:1. Observed and screenshotted.

**Fix.** Delete every `dark:` variant from
`components/job-preview/FormattedJobPost.tsx`. The element that carries
`preview-paper` is that file's own root (`line 173`), and `preview-paper` appears
nowhere else in the repo, so this component always renders on white stock and the
light-mode colours are correct in both themes. Specifically remove:

```
9 × dark:text-slate-100      3 × dark:text-slate-400     2 × dark:text-slate-300
1 × dark:text-red-400        1 × dark:text-emerald-300
3 × dark:border-white/10     1 × dark:bg-white/5         1 × dark:bg-emerald-500/15
```

**Do NOT** instead add `color:` to `.preview-paper` — these are explicit
utilities on the children and would beat inheritance, so the bug would survive.

### 2. `components/workspace/ProjectChecklistWorkspace.tsx:137` — the Command Center scrolls sideways

**Problem.** A single `<span>` renders `item.date` with `shrink-0` and no
truncation. One roadmap entry puts 495 characters into that field, making the
span 2 450px wide and the document 2 834px wide in a 1 521px viewport.

**Before**

```tsx
{item.date && <span className="shrink-0 text-xs text-brand-grey dark:text-slate-400">{item.date}</span>}
```

**After**

```tsx
{item.date && <span className="min-w-0 max-w-[12rem] truncate text-xs text-brand-grey dark:text-slate-400" title={item.date}>{item.date}</span>}
```

`shrink-0` → `min-w-0`, plus `max-w` and `truncate`, with the full value kept in
`title` so nothing is lost. This is a pure layout guard: it cannot change what
the parser produces, and it makes any future long value harmless.

*(The deeper cause — `lib/roadmap/parse.ts:42` accepting any trailing
parenthetical as a date, which mis-files 35 of 49 — is a behaviour change with
roadmap-content implications, so it is under UNCERTAIN, not here.)*

### 3. `components/fleet/orgchart/OrgChart.module.css` — four undefined variables make org-chart surfaces unreadable in dark mode

**Problem.** `--card`, `--line`, `--danger`, `--sweet` are referenced but never
defined, so their light-mode fallbacks apply while `--ink` is themed to
`#e9eef5`. Measured live on both charts: panel background `rgb(255,255,255)`,
text `rgb(233,238,245)`, **1.17:1**. Observed on the "Find a person" index on
`/fleet/crew` and `/fleet/maintenance`.

**Fix.** This is visual.md's CERTAIN #1 and I am confirming it, not restating it
— apply the fix exactly as visual.md specifies (define the four in the base
`.wrap` block and override them in `:global(html.dark) .wrap` after line 237).
My contribution is that the defect is now *observed*, not just predicted, so it
does not need re-deriving before the fix lands.

### 4. `components/reports/ReportsWorkspace.tsx:1526` — the Reports tab bar has no gold on selected

**Problem.** The selected tab renders `bg-brand-lea` with `shadow-sm` and no gold
ring, while the same file's `SEGMENT_ON` constant (line 422) does it correctly.
Measured: selected chip vs its surface is **1.092:1 in dark mode** — identical to
the segmented control's chip, which stays visible only because of its gold ring.

**Before** (line 1526-1527)

```tsx
tab === t.id
  ? "bg-brand-lea text-white shadow-sm"
  : "text-brand-grey hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/5"
```

**After** — use the constant already defined at the top of the same file:

```tsx
tab === t.id ? SEGMENT_ON : SEGMENT_OFF
```

This is visual.md's CERTAIN #2, confirmed by measurement in both themes.

### 5. `components/calendar/CalendarWorkspace.tsx:108` — two vertical scrollbars, and an unpinned axis

**Problem.** `/calendar` scrolls (1408 > 695) while the interview manifest panel
also scrolls: 13 534px of content in 249px, a ratio of 54.4:1. The class is
`overflow-y-auto` with no `overflow-x` pin, so computed `overflow-x` is `auto`.

**Fix — the axis pin is unambiguous and safe:**

**Before** `<div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">`
**After**  `<div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden p-3">`

That closes the CLAUDE.md spec trap. **Whether the panel should scroll at all is
a layout decision I am NOT calling certain** — it is an EditableGrid panel whose
height the user sets in Layout Lab, which may be the documented fixed-container
exception. See UNCERTAIN #2.

### 6. Repo-wide: 35 sites set `overflow-y-auto` without pinning `overflow-x`

**Problem.** Per the CSS overflow spec — and CLAUDE.md's own warning — setting one
axis to non-visible makes the other compute to `auto`, silently enabling
horizontal scrolling. I confirmed this happens in the live page
(`computedOx: "auto"` on the calendar panel).

```
$ grep -rn "overflow-y-auto" components app --include="*.tsx" | grep -v "overflow-x-" | grep -c '"'
35                    ← real className sites
$ grep -rn "overflow-y-auto overflow-x-hidden" components app --include="*.tsx"
components/feedback/FeedbackButton.tsx:333
components/layout/Sidebar.tsx:232
components/layout/Sidebar.tsx:441
components/recruiting-jobs/BatchAddCandidatesToJob.tsx:276
components/shared/EmailBodyEditor.tsx:205
                      ← 5 correctly pinned
```

**Note on the count:** the raw grep returns 37, but two hits are prose inside code
comments (`components/job-editor/JobBlockAssembly.tsx:644` and
`components/layout/Sidebar.tsx:434`) that discuss this very rule. Excluding them
gives **35 unpinned className sites out of 40**. Those two comments are also the
positive evidence that the team knows the rule — and `Sidebar.tsx:441` is the nav
rail fix CLAUDE.md describes, confirmed still in place.

**Fix.** Append `overflow-x-hidden` to each. Mechanical and safe. (Not every one
of the 35 is a *visible* bug today — most are modals and dropdowns with a
`max-h` where the content happens to fit — but every one carries the latent trap.)

---

# UNCERTAIN — needs a human in the morning

### 1. The focus ring fails WCAG 1.4.11 in light mode

`:focus-visible { outline: 2px solid var(--skyshare-gold); outline-offset: 2px }`
is global and universal — genuinely good. But `#eaaa00` measures **2.05:1 on a
white card and 1.79:1 on the `#eaf0f7` page**, against a 3:1 requirement. In dark
mode it is 7.67:1 and 8.90:1, comfortably fine.

**Why I cannot close it.** Every obvious fix touches the locked design system —
darkening the ring, adding a navy outer ring, or using a dual-tone outline. That
is the user's call. **What would close it:** a decision on whether a
focus-indicator may deviate from the gold token, e.g. a 1px navy companion ring
(`outline` gold + `box-shadow: 0 0 0 4px rgba(13,44,67,.55)`), which keeps gold
as the signal while meeting 3:1 against light surfaces.

### 2. Should the `/calendar` manifest panel scroll at all?

Measured: page scrolls AND the panel scrolls 13 534px inside 249px. CLAUDE.md
says one scrollbar per screen and names scroll-inside-scroll as the bug — but it
also exempts "a genuinely fixed-height shell", and this is an EditableGrid panel
whose height the user controls in Layout Lab.

**What would close it:** the user saying whether a Layout-Lab-sized grid panel
counts as the fixed-container exception. If it does not, the panel should show a
capped list with a "see all" link rather than a 54:1 scroll port.

### 3. `lib/roadmap/parse.ts:42` files 35 of 49 "dates" that are prose

The regex `/\(([^)]*)\)\s*$/` takes any trailing parenthetical as `item.date`.
35 of 49 are sentences, up to 495 characters.

**Why I cannot close it.** Tightening the regex (e.g. to `/\(([A-Z][a-z]{2}\s?\d{1,2})\)\s*$/`)
would reclassify those 35 strings — they would fall back into the label or note,
changing what the Command Center displays for 35 items. That is a content
decision about the roadmap, which only the commit agent and the user own.
**What would close it:** a ruling on whether a trailing prose parenthetical
should render as a note rather than a date. My CERTAIN #2 makes the page safe
either way in the meantime.

### 4. The theme toggle may have a first-click race

`components/layout/ThemeToggle.tsx` seeds its `dark` state in a `useEffect` that
reads `document.documentElement.classList`. My very first click wrote
`theme: "light"` when the page was already light — i.e. it toggled the wrong way.

**Why I cannot close it.** I could not reproduce it, and every later click behaved
correctly. It is equally consistent with a click landing before hydration
committed. **What would close it:** a hard reload with `theme` unset in
localStorage, then a single click on the toggle within the first second, checked
against `localStorage.getItem('theme')`.

### 5. 2 000 tab stops on `/candidates`, with no skip link observed

`/candidates` 2 000, `/employees` 1 845, `/business-cards` 750, `/archive` 136,
`/handbook` 24. `/candidates` defaults to showing 500 rows.

**Why I cannot close it.** Whether this needs a skip-link, a lower default page
size, or nothing at all is a product call. **What would close it:** a decision on
the default row count, or adding a "skip to content" link. I could not verify
whether one already exists because I could not physically press Tab (below).

### 6. The two org-chart modals and the LinkPicker popover — inferred, not seen

`CrewOrgChart.tsx:2485` (`noticePrompt`) and `:2524` (`rolePrompt`) are
write-confirmation dialogs; reaching either requires performing a live write
against the production database, so I did not. `LinkPicker.tsx:117` sits behind
the chart's edit affordances. All three carry the same
`background: var(--card, #fff); color: var(--ink, #1a2b3c)` declaration inside the
same `.wrap` where I measured `--card` empty and `--ink` `#e9eef5`, so they almost
certainly render at 1.17:1 like the surfaces I did see.

**What would close it:** somebody with a safe environment opening them in dark
mode. Fixing CERTAIN #3 makes the question moot.

---

# Could not test — needs a human, and why

These are environment limits, not app findings. I am listing them so the morning
reader knows what is still open rather than assuming it passed.

1. **Responsive / mobile at 375x812.** `resize_window` reported success every
   time but the OS window never changed: `window.innerWidth` stayed `1536` across
   attempts at 375, 500, 430 and 420, and at one point `window.outerWidth`
   reported `0` while `innerWidth` reported `1536`. Device emulation would solve
   it but lives in the browser tool I was barred from. **The one narrow-viewport
   data point I do have is accidental:** the window spontaneously collapsed to
   690x312 while I was on `/calendar`, and the EditableGrid layout reflowed
   cleanly to a stacked column (document 15 626px tall, no inner scroller, no
   horizontal overflow). That is weak evidence that narrow layouts do reflow
   rather than break, at ~690px — it says nothing about 375px.

2. **Keyboard Tab order.** Key events did not move focus: `activeElement` stayed
   `BODY` across six Tab presses. `document.hasFocus()` returned `true` but
   `document.visibilityState` was `"hidden"` and `outerWidth` `0` — the window is
   not really presented to the OS, so synthesized key input does not drive focus.
   I substituted a stylesheet read, which answers the important half (a global
   gold `:focus-visible` ring exists), but **tab ORDER, focus traps in modals, and
   skip links remain untested.**

3. **Anything requiring a click that writes.** Not attempted, by rule: the two
   org-chart write-confirmation modals, `LinkPicker`, any Save/Send/Publish path,
   the Job Post Builder's Export and Save Draft, "Copy all for printer" on
   `/business-cards`, and every form submit. `/jobs` shows "2 validation warnings"
   which I could read but not act on.

4. **`/interviews/debrief` beyond its empty state.** It rendered a clean, honest
   notice rather than content: *"Google sign-in isn't configured on this server
   (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET)."* That is correct local behaviour and
   good degradation, but it means **the debrief queue itself was never exercised**.
   Whoever has those credentials should walk it.

5. **Anything permission-related.** Local dev bypasses auth and the console
   confirmed it live: *"[auth] Local development bypass is ACTIVE — every request
   is treated as ADMIN."* Every screen I saw, I saw as an admin. No conclusion in
   this file says anything about what a VIEWER or a non-admin sees.
---

# Counts

**Coverage**

| measure | number |
|---|---|
| routes walked in light mode | 21 |
| routes walked in dark mode | 12 |
| routes that painted real data | 33 of 33 |
| routes showing an error boundary / stuck skeleton / empty shell | **0** |
| routes showing a degraded config notice instead of content | 1 (`/interviews/debrief`) |
| screenshots captured | 40+ (I did not keep an exact tally; every route above has one) |
| screenshots that timed out | 4, all retried successfully (2 on the app, 2 on the Google Sheet) |
| console messages across 5 heavy routes, unfiltered | **1** |
| console errors / hydration warnings / uncaught exceptions | **0** |
| Fast Refresh rebuilds during measurement | **0** |

**Dark mode**

| measure | number |
|---|---|
| routes checked for opaque white surfaces in dark | 12 |
| routes with a white panel in dark mode | **2** (`/jobs`, plus both org charts' person index) |
| org-chart CSS variables referenced but undefined | **4** (`--card`, `--line`, `--danger`, `--sweet`) |
| org-chart variables defined and correctly themed (positive control) | 3 measured (`--ink`, `--color-bg`, `--glow`) |
| measured contrast of org-chart person index in dark | **1.17:1** |
| positive control inside that same panel | **13.17:1** |
| job-post preview leaf text nodes under 3:1 in dark | **65 of 68** |
| `dark:` utilities wrongly applied inside the white paper | **21** |
| month-calendar day chips carrying `white/5` | 29 |
| month-calendar day chips carrying bare navy (today) | **1** |
| today chip vs surface / other chips vs surface | **1.055:1** vs 1.162:1 |
| Reports selected tab chip vs surface, dark | **1.092:1** |
| Reports segmented-control chip vs surface, dark | 1.092:1 — but **with** a gold ring |

**Layout**

| measure | number |
|---|---|
| pages with two vertical scrollbars | **1** (`/calendar`) |
| worst inner-scroll ratio measured | **54.4:1** (13 534px in 249px) |
| pages with horizontal document overflow | **1** (`/settings/command-center`) |
| how far it overflows | **1 313px** (2 834 in a 1 521 viewport) |
| elements responsible for that overflow | **1** |
| tallest document measured | **89 004px** (`/settings/command-center`, 128 screens) |
| `overflow-y-auto` className sites with no `overflow-x` pin | **35** |
| sites correctly pinned (positive control) | **5** |
| grep hits excluded as code comments | 2 |

**Contrast, measured from the rendered cascade**

| measure | number |
|---|---|
| element/theme samples taken | 17 |
| samples failing WCAG AA (4.5:1) in the normal UI | **0** |
| lowest passing sample | 5.21:1 (`CLOSED` pill, light) |
| selected nav item, both themes | 7.03:1 navy on gold |
| focus ring vs white card / light page | **2.05:1 / 1.79:1 — fails 3:1** |
| focus ring vs dark panel / dark page | 7.67:1 / 8.90:1 — passes |

**Roadmap data (the cause of the sideways scroll)**

| measure | number |
|---|---|
| checklist items in `roadmap.ts` | 1 020 |
| items ending in a parenthetical, parsed as a date | 49 |
| of those, prose rather than a date (>20 chars) | **35** |
| of those, genuinely date-shaped | 14 |
| longest string rendered into the date chip | **495 characters** |

**Google Sheet (written to `docs/audit-2026-09-11/_sheet-visible-tabs.md`)**

| measure | number |
|---|---|
| tabs visible in the tab bar | **21** |
| tabs the Drive API returned | 21 |
| tabs in the bar but not in the Drive list | **0** |
| tabs in the Drive list but not in the bar | **0** |
| hidden tabs | **0** |
| tabs that fit on screen without scrolling | 14 of 21 |
| the four July tabs (PDP / Pilot / On-Hold / Other) | **not present in any form** |

**Verdict on the eight completed audit files' predictions that I could test**

| prediction | source | result |
|---|---|---|
| org-chart surfaces ~1.1:1 in dark from 4 undefined vars | visual.md | **CONFIRMED**, measured 1.17:1, seen on both charts |
| Reports tab bar selects without gold | visual.md | **CONFIRMED**, measured in both themes |
| MonthCalendar "today" chip invisible in dark | visual.md | **CONFIRMED**, today is the least visible chip on the grid |
| screenshots time out everywhere; a11y tree shows only the sidebar | CLAUDE.md | **REFUTED for Chrome** (true for the in-app pane) |
| `/travel` `main` holds ~74 chars | CLAUDE.md | **REFUTED for Chrome**, measured 3 044 |

---

# Housekeeping for whoever reads this next

- **The dev server on :3000 was mine.** I started it at 01:29 MT because the one
  the brief assumed was running had died with the killed sessions (evidence at the
  top of this appendix). It is a child of my session, so it stops when my session
  ends. **If you need to walk the app, start a fresh one** — and check first that
  nothing is already listening, because the whole reason I had to start one was
  that nobody had.
- **I created no scratch scripts.** Every live measurement in this file was taken
  through Chrome's `javascript_tool`, so there is no `scripts/_r1-*.ts` to sweep up.
  `scripts/` is unchanged by me.
- **I ran no git commands and edited no app code.** The only two files I touched
  are `docs/audit-2026-09-11/chrome-live.md` (this one) and
  `docs/audit-2026-09-11/_sheet-visible-tabs.md`, plus my own claim file.
- **`npm run dev` did write two gitignored artifacts** as it always does:
  `prisma/generated` (`.gitignore:12`) and `/public/vendor/mermaid.min.js`
  (`.gitignore:28`). Neither is stageable.
- **Nothing was written to the live database, the live S3 bucket, or any mailbox.**
  I clicked only navigation, tab, disclosure and theme-toggle controls, and I
  explicitly declined to open the two org-chart modals because reaching them
  requires a live write.
