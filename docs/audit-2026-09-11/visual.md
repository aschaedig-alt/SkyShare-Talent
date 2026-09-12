# Visual design audit - 2026-09-11

Role key: `visual`. Read-only. No git, no browser tools, no DB access, no writes outside
this file and `.claude/claims/r1-visual-afdc0817.md`.

Scope of every grep below: `app/ components/ lib/` (the repo has no other source roots
that ship UI). `node_modules`, `.next`, `.next-check`, `prisma/generated` and
`public/vendor` are not inside those three directories, so they never entered a result;
where `public/vendor/pdfjs` did appear in one wide grep it is called out as noise.

---

## Headline

**Four CSS custom properties used by the fleet org charts are never defined anywhere —
`--card`, `--line`, `--danger`, `--sweet` — and because `--ink` IS defined and IS
themed, dark mode renders the crew/maintenance chart modals and the "Find a person"
panel as near-white text (`#e9eef5`) on a pure-white background (`#fff`). Four
surfaces, all of them the places where somebody records a notice date or a role move,
are unreadable in dark mode.** That is the one thing in this audit that makes a real
screen unusable rather than merely inconsistent. Everything else is drift, and the
drift has one dominant shape: tokens were created and the literals they replaced were
never swept. `dark:bg-[#0f2033]` still appears **106** times against **25** uses of the
`brand-field` token that holds the identical hex, and `dark:text-[#8fb3d6]` appears
**88** times against **16** uses of `brand-edenOnDark` — while the precedent for
finishing the job is in the same config file: `brand-panel` is **563 / 0**. Separately,
the Sep 08 designer review's own fix constant, `SEGMENT_ON = "bg-brand-lea text-white
ring-1 ring-brand-gold"`, sits at `ReportsWorkspace.tsx:422` and the primary tab bar
**1 104 lines below it in the same file** still selects with bare navy and no gold.

Good news worth stating plainly, because it is the part most likely to be assumed
broken: dark-mode coverage in the Tailwind layer is essentially complete
(1 032 of 1 054 `bg-white` className strings carry a `dark:`; 1 290 of 1 300
`text-brand-lea`; 478 of 478 `bg-brand-cloudDancer`), there are **zero** `rounded-full`
pills with horizontal padding, and spacing sits on the scale (18 arbitrary
gap/padding/margin values in the entire app).

---

## What I checked, and how

### 0. The locked system, read from source first

`tailwind.config.ts` (read in full). Radius scale collapsed as documented:

```
  borderRadius: {
    sm: "2px",  DEFAULT: "4px", md: "4px", lg: "4px", xl: "4px",
    "2xl": "4px", "3xl": "6px", card: "4px", element: "4px"
  }
```

Note `"3xl": "6px"` — `rounded-3xl` yields **6px**, not 4px. It is used 0 times
(`rg -o "rounded-3xl" app components lib` → no output), so it is a latent trap rather
than a live violation.

Brand tokens beyond the five in the brief, all of which matter to this audit:

| token | hex | added for |
|---|---|---|
| `brand-grey` | `#63666a` | darkened from `#76787b` for WCAG AA (roadmap Jul 9) |
| `brand-black` | `#302f31` | body text |
| `brand-panel` | `#10243a` | dark card surface — replaced ~440 literals |
| `brand-field` | `#0f2033` | dark input surface — "Use `dark:bg-brand-field`" |
| `brand-edenOnDark` | `#8fb3d6` | "Use `dark:text-brand-edenOnDark` wherever light uses `text-brand-eden`" |
| `value-*` | 6 triples | Compliments sub-brand |

`app/globals.css` (256 lines, read in full). `--skyshare-page: #eaf0f7` light /
`#0b1622` dark; `--glow` themed; five `--stage-*` vars themed; `html { font-size: 14px }`;
`body { font-size: 0.95rem }` = **13.3px**; font stack `var(--font-inter), -apple-system,
"Segoe UI", …`. `.no-scrollbar` defined at lines 121-127 with the "fixed-width chrome
only" comment.

**Font-size arithmetic that the rest of this file depends on.** `tailwind.config.ts`
does not override `fontSize`, so Tailwind's rem defaults resolve against
`html { font-size: 14px }`:

```
text-xs   0.75rem  = 10.5px
text-sm   0.875rem = 12.25px
text-base 1rem     = 14px
text-lg   1.125rem = 15.75px
text-xl   1.25rem  = 17.5px
text-2xl  1.5rem   = 21px
text-3xl  1.875rem = 26.25px
text-4xl  2.25rem  = 31.5px
```

`@media (prefers-color-scheme)` — **zero occurrences** in `app components lib`
(`rg -n "prefers-color-scheme" app components lib` → exit 1). Dark mode is purely
`.dark`-class driven, exactly as documented. That is the positive control for every
dark-mode claim below: if a surface is wrong in dark, it is wrong because a `dark:`
variant or a themed var is missing, not because a media query is fighting the toggle.

---

### 1. `rounded-full` — circles vs pills

```
$ rg -o "rounded-full" app components lib | wc -l
131
$ rg -l "rounded-full" app components lib | wc -l
65
```

Of the 131, three are not code: `lib/roadmap/roadmap.ts:635` (prose),
`components/candidates/CandidateTagPill.tsx:6` and
`components/settings/CandidateAccessPicker.tsx:151` (comments that *assert* the rule —
"pills are rectangles here, rounded-full is for circles only"). **126 code sites.**

**The decisive pill test.** A pill is a rectangle with horizontal padding and a text
label. So:

```
$ rg -n "rounded-full" app components lib | rg "px-[0-9]|pl-[0-9]|pr-[0-9]"
(no output, exit 1)
```

**Zero.** There is no text pill drawn with `rounded-full` anywhere in the app. The Aug 3
"zero pill violations remain" conclusion still holds and I am not overturning it.

**Positive control — the legitimate circles the same grep found.** 86 of the 126 sites
carry an equal `h-N w-N` pair, i.e. they are actual circles: avatars
(`components/booking/PublicBooking.tsx:151` `h-14 w-14 … object-cover`,
`components/scheduling/SchedulingAdmin.tsx:291` `h-16 w-16`,
`components/compliments/Avatar.tsx:32`), initials chips
(`components/candidates/CandidateRow.tsx:140` `h-10 w-10 … bg-brand-lea/10`), status
dots (`h-2 w-2`, `h-1.5 w-1.5`, `h-2.5 w-2.5` — 22 of them), checkbox-substitute rings
(`components/people/PostOnboardTab.tsx:326` `h-4 w-4 … border-2`), a skeleton avatar
(`app/loading.tsx:32` `h-9 w-9`), a colour swatch
(`components/shared/InlineFormatToolbar.tsx:43` `h-3.5 w-3.5`) and one decorative
circle (`components/job-preview/FormattedJobPost.tsx:176` `h-44 w-44 … border`). All
legal.

**The 40 non-circle sites.** These are progress-bar tracks and fills, one vertical
accent stripe, one horizontal rule and one timeline connector — pill-shaped rectangles,
not circles. Full list, with what each is:

| file:line | shape | what it is |
|---|---|---|
| `components/workspace/ProjectChecklistWorkspace.tsx:67` | `h-2 overflow-hidden` | progress track |
| `components/widgets/registry.tsx:119` | `h-2 overflow-hidden` | progress track |
| `components/widgets/registry.tsx:232` | `h-1.5 flex-1` | score segment bar |
| `components/widgets/registry.tsx:352` | `h-2 flex-1 overflow-hidden` | coverage track |
| `components/travel/TravelChecklistRollup.tsx:68` / `:69` | `h-1.5 w-20` / `h-full` | track + fill |
| `app/compliments/page.tsx:64` / `:65` | `h-2.5` / `h-full` | goal track + fill |
| `app/compliments/page.tsx:196` / `:198` | `h-2` / `h-full` | value track + fill |
| `app/compliments/analytics/page.tsx:101` / `:103` | `h-2` / `h-full` | track + fill |
| `app/compliments/analytics/page.tsx:156` / `:158` | `h-1.5 flex-1` / `h-full` | track + fill |
| `app/compliments/budget/page.tsx:80` / `:82` | `h-2.5` / `h-full` | budget track + fill |
| `app/compliments/budget/page.tsx:125` / `:127` | `h-2` / `h-full` | track + fill |
| `app/compliments/budget/page.tsx:152` / `:154` | `h-2` / `h-full` | track + fill |
| `app/compliments/budget/page.tsx:158` / `:160` | `h-2` / `h-full` | track + fill |
| `components/matchboard/RoleMatchCard.tsx:63` / `:65` | `h-1.5` / `h-1.5` | score track + fill |
| `components/pilot-requirements/MatchCard.tsx:408` / `:410` | `h-1.5` / `h-1.5` | sub-score track + fill |
| `components/people/OnboardingGridTab.tsx:272` / `:273` | `h-1.5 w-24` / `h-full` | track + fill |
| `components/people/OnboardingDashboardTab.tsx:179` | `h-2.5 w-full flex` | stacked segment bar |
| `components/people/OnboardingDashboardTab.tsx:222` / `:223` | `h-2 w-24` / `h-full` | track + fill |
| `components/people/OnboardingDashboardTab.tsx:332` / `:333` | `h-2 w-24` / `h-full` | track + fill |
| `components/people/NewHireDetailWorkspace.tsx:863` / `:864` | `h-2 w-40` / `h-full` | track + fill |
| `components/people/NewHireDetailWorkspaceClassic.tsx:346` / `:347` | `h-2 w-40` / `h-full` | track + fill |
| `components/compliments/RecognitionRow.tsx:33` | `w-[3px] self-stretch` | vertical accent stripe |
| `components/job-preview/FormattedJobPost.tsx:57` | `h-1.5 w-8` | decorative gold rule |
| `components/people/EmployeeJourney.tsx:432` | `h-[3px] w-full` | timeline connector |

**This is not my reading of the rule — it is the project's own.** `lib/roadmap/roadmap.ts:635`
records a Sep 08 designer review whose first finding was, verbatim: *"rounded-full on the
tile bars, where this project's pills are rectangles"*, and the fix shipped as
*"rounded-full off the tile bars"*. The fixed result is at
`components/reports/ReportsWorkspace.tsx:1295`:

```
<div className="mt-2 flex h-3 w-full overflow-hidden rounded bg-brand-cloudDancer dark:bg-white/10">
```

So `rounded` is the canonical bar corner. The sweep stopped at that one file.

**Strongest single piece of evidence — a same-file contradiction.**
`components/widgets/registry.tsx` draws the *same* horizontal count bar twice:

```
line 320:  <div className="h-3 flex-1 overflow-hidden rounded bg-brand-cloudDancer dark:bg-white/5">       ← conforming
line 352:  <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-cloudDancer dark:bg-white/5">  ← not
```

Two widgets sitting on the same Command Center grid, one with 4px ends and one with
round ends.

---

### 2. Arbitrary radius values

```
$ rg -o "rounded(-[a-z]+)?-\[" app components lib | wc -l
5
```

All five, with line numbers:

```
components\travel\TravelHubCalendar.tsx:477:            seg.continuesLeft ? "rounded-r-[3px]" : "rounded-[3px]",
components\travel\TravelHubCalendar.tsx:478:            seg.continuesRight && "rounded-l-[3px] rounded-r-none"
components\candidates\CandidateRow.tsx:155:                    className="inline-flex h-4 w-4 … rounded-[3px] text-[8px] …"
components\candidates\PaycomLinkControl.tsx:43:      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] text-[9px] …`}
```

3px, not the locked 4px. Four elements.

```
$ rg -o "borderRadius" app components lib | wc -l
58
```

55 of the 58 are `borderRadius: 4` — on-system, just written in an inline style instead
of a class (all in `components/fleet/orgchart/*`, which is an inline-style component
family by design). The three that are **not** 4px:

```
components\fleet\orgchart\LinkPicker.tsx:117:   … borderRadius: 6 …      (profile-link popover)
components\fleet\orgchart\CrewOrgChart.tsx:2464: … borderRadius: 6 …      (save toast)
components\fleet\orgchart\CrewOrgChart.tsx:2485: … borderRadius: 8 …      (notice-date modal)
components\fleet\orgchart\CrewOrgChart.tsx:2524: … borderRadius: 8 …      (role-move modal)
```

CSS files:

```
$ rg -n "border-radius" app components lib
app\globals.css:103:  border-radius: 8px;                       ← dark scrollbar THUMB, chrome, fine
app\globals.css:203:  border-radius: 4px;                       ← :focus-visible ring, on-system
components\scheduling\SchedulingAdmin.tsx:505:  border-radius: 0.5rem;    ← 8px, styled-jsx :global(.inp)
components\fleet\orgchart\OrgChart.module.css: 4px × 33, "4px 4px 0 0" × 2,
                                               "0 0 4px 4px" × 1, 50% × 2    ← all on-system
components\candidates\PdfViewer.tsx:162: border-radius: 2px;       ← pdf highlight mark, = rounded-sm
```

Also worth recording because nobody would find it from a class grep —
`components/scheduling/SchedulingAdmin.tsx:503-509`:

```
      <style jsx>{`
        :global(.inp) {
          border-radius: 0.5rem;
          border: 1px solid rgb(20 33 61 / 0.2);
          …
```

Three problems in five lines: 8px radius against the locked 4px; `rgb(20 33 61)` =
`#14213d`, which is not a brand token and is a near-miss of `lea #0d2c43`; and no dark
variant is possible in a plain global rule, so that navy hairline stays put in dark mode.
It is also **dead**: the file's own inputs use the TypeScript constant `inp` at line 54
(`const inp = "w-full rounded border border-brand-lea/20 …"`), 13 call sites, and
`rg -ln 'className="[^"]*\binp\b' app components` returns nothing — no element ever
receives the CSS class `.inp`.

**Custom radius aliases.** `rounded-element` 91 uses, `rounded-card` 3 uses
(`components/compliments/{RecognitionCard,Leaderboard,Card}.tsx`). Both resolve to 4px,
i.e. they are synonyms of `rounded`. Harmless, but it means three spellings of one value.

---

### 3. Hardcoded hex that duplicates or approximates a token

Every hex literal in the three source roots, counted by value (top of the list):

```
$ rg -o --no-filename "#[0-9a-fA-F]{6}\b" app components lib | tr 'A-F' 'a-f' | sort | uniq -c | sort -rn | head -20
    106 #0f2033      ← == brand-field
     90 #8fb3d6      ← == brand-edenOnDark
     32 #cdd7e2      ← orgchart --line fallback, no token
     28 #0d2c43      ← == brand-lea / --skyshare-lea
     21 #eaaa00      ← == brand-gold
     14 #466481      ← == brand-eden
     12 #c0392b      ← error red, no token, NO dark variant possible (inline style)
     10 #1a2b3c      ← orgchart --ink FALLBACK, drifts from --ink's actual value #0d2c43
      9 #2e7d32
      6 #ba0c2f      ← == brand-red
      6 #302f31      ← == brand-black
      5 #ffffff
      5 #b0670e      ← warning amber, no token, NO dark variant possible
      5 #63666a      ← == brand-grey
      4 #a6c9e7      ← == brand-sweet
      4 #0b1622      ← == dark --skyshare-page
      3 #f0eee9      ← == brand-cloudDancer
      3 #eaf0f7      ← == --skyshare-page
      3 #e2904a
      3 #10243a      ← == brand-panel
```

Most of the token-equal counts are the token *definitions* themselves
(`tailwind.config.ts`, `app/globals.css`) plus `lib/roadmap/roadmap.ts` prose plus the
org-chart module's own var block — legitimate. The two that are not:

```
$ rg -o --no-filename "(?:[a-z-]+)-\[#[0-9a-fA-F]{3,8}\]" app components lib --pcre2 | sort | uniq -c | sort -rn
    106 bg-[#0f2033]
     88 text-[#8fb3d6]
      2 text-[#7db3ef]
      2 text-[#0b63ce]
      1 to-[#fffdf7]
      1 to-[#5f88ad]
      1 text-[#9a5b12]
      1 from-[#fdf6e3]
      1 bg-[#fafcfe]
      1 bg-[#edf4fa]
      1 bg-[#e7eef7]
      1 bg-[#10243a]    ← NOT a live utility: this hit is roadmap PROSE, see CERTAIN #7
      1 bg-[#0b1c2b]
```

(That grep included `lib/`, which is how `lib/roadmap/roadmap.ts` prose entered the
count. 206 of the 207 are real utilities.)

Every one of the 106 and 88 is under a `dark:` prefix, with no exceptions:

```
$ rg -o --no-filename "[a-zA-Z0-9:_/-]*bg-\[#0f2033\]" app components lib | sort | uniq -c
    106 dark:bg-[#0f2033]
$ rg -o --no-filename "[a-zA-Z0-9:_/-]*text-\[#8fb3d6\]" app components lib | sort | uniq -c
     86 dark:text-[#8fb3d6]
      2 dark:hover:text-[#8fb3d6]
```

**Positive control — the tokens exist, work, and are already used:**

```
$ rg -o --no-filename "[a-zA-Z0-9:_/-]*bg-brand-field" app components lib | sort | uniq -c
     25 dark:bg-brand-field
$ rg -o --no-filename "[a-zA-Z0-9:_/-]*text-brand-edenOnDark" app components lib | sort | uniq -c
      5 dark:hover:text-brand-edenOnDark
     11 dark:text-brand-edenOnDark
$ rg -o "brand-panel" app components lib | wc -l
572
$ rg -n "#10243a" app components lib
lib\roadmap\roadmap.ts:988  (prose)
lib\roadmap\roadmap.ts:991  (prose)
components\fleet\orgchart\OrgChart.module.css:237:  --color-bg: #10243a;   (a var definition)
```

So the migration that was actually finished — `brand-panel` — is **563 utility uses,
0 surviving literals**. `brand-field` is 25 / 106. `brand-edenOnDark` is 16 / 88. The
`tailwind.config.ts` comments for both tokens end with an instruction ("Use
`dark:bg-brand-field`", "Use `dark:text-brand-edenOnDark`") that was never carried out.
`components/shared/EditableGrid.tsx` uses **both** the token and the literal.

Per-file counts for the sweep: see the **Counts** table at the end.

Near-miss hexes that are not token-equal, each one located:

| hex | file:line | near what | note |
|---|---|---|---|
| `#76787b` | `lib/formatting/brand.ts:8` | `brand-grey #63666a` | the **pre-accessibility** grey, 4.0:1 on white. Darkened to `#63666a` (~5:1) and approved Jul 9 (roadmap:987); this second copy never followed. Feeds `lib/formatting/rich-text.ts:7` (a user-selectable inline colour in job posts) and the swatch shown at **/settings/templates** |
| `#1a2b3c` | `MaintenanceOrgChart.tsx:1381,1411`, `CrewOrgChart.tsx:2051,2340,2372,2433,2485,2509,2524,2576` | `--ink`, whose real value is `#0d2c43` | a fallback that does not match the variable it backs |
| `#14213d` | `SchedulingAdmin.tsx:506` | `lea #0d2c43` | in a styled-jsx global |
| `#0b1c2b` | `TravelHubCalendar.tsx:225` | dark page `#0b1622` | out-of-month cell |
| `#e7eef7` | `TravelHubCalendar.tsx:225` | page `#eaf0f7` | out-of-month cell |
| `#fafcfe` | `OnboardingChecklist.tsx:207` | page `#eaf0f7` / white | |
| `#edf4fa` | `HireDetailsAccordion.tsx:53` | — | **deliberate and documented** at lines 12-14: "Sweet Blue at 20% over white is #edf4fa … written as the resolved colour … because an alpha tint would composite against the page background". Leave it. |
| `#10243a` | `lib/roadmap/roadmap.ts:988` only | `brand-panel` | **not a code hit** — roadmap prose. Zero surviving utilities. |
| `#c0392b` ×8, `#b0670e` ×5 | `CrewOrgChart.tsx:2056,2345,2377,2421,2452,2497,2564`, `TrainingTab.tsx:315,438,461`, `MaintenanceOrgChart.tsx:1388`, `CrewOrgChart.tsx:2058,2347` | — | inline `style={{ color: … }}`, so **no dark variant is possible**. On `brand-panel #10243a` these land around 3.0-3.3:1 at 12px |
| `#0b63ce` / `#7db3ef` | `EmailBodyEditor.tsx:99`, `OrientationEmailPanel.tsx:1252` | — | email-preview link colour; arguably correct since it mirrors a mail client, not the app |
| `#9a5b12`, `#5f88ad`, `#fdf6e3`, `#fffdf7` | `NewHireDetailWorkspace.tsx:418`, `OnboardingChecklist.tsx:150,176` | gold family | one-off gradient/text tints |

**Chip-ramp drift.** The house informational chip is `bg-sky-50 text-sky-800
dark:bg-sky-500/15 dark:text-sky-300` — that is what `components/ui/Badge.tsx:14`
defines as `info`, and it recurs 9 times. Four places use the **blue** ramp in light and
the **sky** ramp in dark for the same semantic, so the light chip reads heavier than its
siblings:

```
components\calendar\CalendarWorkspace.tsx:74:      return "bg-blue-100 dark:bg-sky-500/15 text-blue-800 dark:text-sky-300";
components\settings\FeedbackWorkspace.tsx:79:  IDEA: {… chip: "bg-blue-100 text-blue-800 dark:bg-sky-500/15 dark:text-sky-300" },
components\settings\FeedbackWorkspace.tsx:87:  REVIEWING: "bg-blue-100 text-blue-800 dark:bg-sky-500/15 dark:text-sky-300",
components\calendar\UpcomingInterviews.tsx:109: … bg-blue-100 … text-blue-700 hover:bg-blue-200 dark:bg-blue-500/15 …
```

Whole-scope blue-family measurement, for context: 121 occurrences across 21 files;
the overwhelming majority are sky/indigo status tints that match `Badge.tsx`. The only
saturated fills are `bg-indigo-600` ×2 (`LayoutLab.tsx:60,68` — a page-marker dot legend)
and the `ScheduleTimeline.tsx:42-43` interviewer-colour palette
(`bg-blue-500 bg-purple-500 bg-emerald-500 bg-orange-500 bg-rose-500 bg-cyan-600
bg-amber-500 bg-indigo-500`), which is a categorical identity palette and correctly
not brand-coloured.

---

### 4. Dark-mode coverage

**File-level sweep.** 315 `.tsx` files in `app/ components/`; 258 of them set at least
one colour utility. Of those 258, the number with **no `dark:` anywhere in the file** is
**five**, and I read all five:

```
app\not-found.tsx                       ← PageStatus (dark-aware) + navy button w/ white text. FINE in both.
components\auth\GoogleSignInButton.tsx  ← bg-brand-lea text-white. FINE in both.
components\layout\SignOutButton.tsx     ← text-white/70 on the navy rail. FINE.
components\layout\ThemeToggle.tsx       ← text-white/85 on the navy rail. FINE.
components\layout\Sidebar.tsx           ← the rail is navy in both themes by design.
```

So **zero** files are missing dark mode. The risk is per-line, not per-file, so I ran
four whole-scope line-level sweeps. Each reports the offenders **and** the conforming
count from the same query:

```
$ rg -n 'className=(\{?`|")[^"`]*\bbg-white\b[^"`]*' app components -o --pcre2 | rg -v "dark:" | wc -l
22
$ … | rg "dark:" | wc -l
1032
```

All 22 are `bg-white/N` alpha overlays on navy/gradient surfaces
(`hover:bg-white/10` on the rail, `bg-white/20` on a gradient hero, `bg-white/25`
badges). **No opaque white card lacks a dark variant.**

```
$ rg -n 'className=(\{?`|")[^"`]*\btext-brand-lea\b[^"`]*' app components -o --pcre2 | rg -v "dark:" | wc -l
10        (1290 with dark:)
$ … \btext-brand-black\b …  | rg -v "dark:" | wc -l
10        (135 with dark:)   ← all 10 are on bg-brand-gold, correct in both themes
$ … \bbg-brand-cloudDancer …  | rg -v "dark:" | wc -l
0         (478 with dark:)
$ … (bg-amber-(50|100)|text-amber-(600|700|800)) …  | rg -v "dark:" | wc -l
2         (119 with dark:)   ← both on components/widgets/registry.tsx:261
$ … (bg-emerald-(50|100)|text-emerald-(600|700|800)) …  | rg -v "dark:" | wc -l
7         (86 with dark:)
$ … (bg-red-(50|100)|text-red-(600|700|800)) …  | rg -v "dark:" | wc -l
2         (177 with dark:)
```

Those residuals are listed individually under CERTAIN. Their value is exactly that the
positive controls are so large: a `text-red-600` with no `dark:text-red-400` is provably
an oversight, not a style, because 177 of its 179 siblings have one.

**The real hole is not in Tailwind — it is in the org-chart CSS variables.**

```
$ rg -o --no-filename "^\s*--[a-z0-9-]+(?=:)" components/fleet/orgchart/OrgChart.module.css --pcre2 | sort -u   → 37 vars defined
$ rg -o --no-filename "var\(--[a-z0-9-]+" components/fleet/orgchart | sort -u                                   → 41 vars referenced
$ comm -13 defined used
--card
--danger
--line
--sweet
```

Four referenced, never defined. Their fallbacks are light-mode colours, and the dark
block `:global(html.dark) .wrap` (line 236) cannot override a variable that does not
exist. Meanwhile `--ink` **is** defined and **is** overridden (`#0d2c43` → `#e9eef5`).
The consequence, verbatim from the source:

```
components\fleet\orgchart\CrewOrgChart.tsx:2485:
  style={{ width: "100%", maxWidth: 380, background: "var(--card, #fff)",
           color: "var(--ink, #1a2b3c)", borderRadius: 8, padding: 20, … }}
components\fleet\orgchart\CrewOrgChart.tsx:2524:   (identical)
components\fleet\orgchart\PeopleIndex.tsx:95-98:
        border: "1px solid var(--line, #cdd7e2)",
        borderRadius: 4,
        background: "var(--card, #fff)",
components\fleet\orgchart\LinkPicker.tsx:117:
  <div style={{ … border: "1px solid var(--line, #cdd7e2)", borderRadius: 6, background: "var(--card, #fff)" }}>
```

In dark mode that is `color: #e9eef5` on `background: #fff`. Contrast ≈ **1.1:1**.

I closed the two ways this could have been a false alarm:

1. **Could the modal be portaled outside `.wrap`, so `--ink` also falls back and the
   pair stays readable?** No.
   `rg -n "createPortal|ReactDOM" components/fleet/orgchart` → exit 1, no output. And
   `styles.wrap` is applied once, at `CrewOrgChart.tsx:1651`
   (`<div className={\`${styles.wrap}…\`} ref={wrapRef}>`); the file is 2 586 lines and
   its final `</div>` at 2584 closes that root, so lines 2478-2583 are inside it.
   `PeopleIndex` is rendered at `CrewOrgChart.tsx:1782` and
   `MaintenanceOrgChart.tsx:1124`, `LinkPicker` at `CrewOrgChart.tsx:337` and
   `MaintenanceOrgChart.tsx:317` — all inside the same root.
2. **Is the dark block even wired to the app's toggle?** Yes —
   `OrgChart.module.css:236` is `:global(html.dark) .wrap`, which keys off the same
   `.dark` class `app/layout.tsx:28` sets. So dark mode *is* active on the charts; the
   charts just have a hole in it.

`--line` is referenced 32 times (CrewOrgChart 9, MaintenanceOrgChart 9, TrainingTab 6,
PeopleIndex 4, LinkPicker 4), so every input and ghost-button border on both charts
renders `#cdd7e2` — a pale light-mode hairline — in dark mode. `--danger` is referenced
at `OrgChart.module.css:1616-1617` and stays `#a32d2d` in dark (~2.5:1 on `#10243a`).

---

### 5. Selected and hover states

**Positive control — the gold glow is genuinely the house hover.**

```
$ rg -o --no-filename "[a-z:\[\]()&_-]*shadow-glow[a-z-]*" app components | sort | uniq -c | sort -rn
    151 hover:shadow-glow
      6 shadow-glow
      4 focus:shadow-glow
      1 has-[[data-section-head]:hover]:shadow-glow
$ rg -l "hover:shadow-glow" app components | wc -l
76
```

**Positive control — navy + gold is genuinely the house selected state.** 312 lines pair
`brand-lea` with `brand-gold`; `border-brand-gold*` 233 occurrences;
`ring-brand-gold*` 64.

**The canonical string exists, with a comment explaining why.**
`components/reports/ReportsWorkspace.tsx:419-423`:

```
// Selected = navy + gold; hover = gold glow. Both segmented controls used bare
// navy with no gold at all, which is the one combination the locked design system
// names for a selected state.
const SEGMENT_ON = "bg-brand-lea text-white ring-1 ring-brand-gold";
const SEGMENT_OFF = "text-brand-grey hover:text-brand-lea hover:shadow-glow dark:text-slate-400 dark:hover:text-slate-100";
```

Used at lines 850 and 864 — the two controls the Sep 08 review named.

**And the same file's primary tab bar, 1 104 lines below the constant, still does not
use it.** `components/reports/ReportsWorkspace.tsx:1524-1528`:

```
              tab === t.id
                ? "bg-brand-lea text-white shadow-sm"
                : "text-brand-grey hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/5"
```

No gold on selected, no `hover:shadow-glow` on either branch. That is both halves of the
rule missing on the Reports page's main navigation.

**Whole-scope measurement of the pattern:**

```
$ rg -n '\?\s*"[^"]*bg-brand-lea[^"]*"' app components --pcre2 | rg -v gold | wc -l
73
$ rg -n '\?\s*"[^"]*bg-brand-lea[^"]*"' app components --pcre2 | rg gold | wc -l
15
```

Honest qualifier: not all 73 are segmented-control selected states — `app/archive/page.tsx:80`
is a count badge, `components/travel/TravelChecklist.tsx:255,257` is a row wash,
`components/ui/Button.tsx:24` is the primary button (which *does* carry
`hover:shadow-glow`, so it conforms on hover). The unambiguous tab-bar and
segmented-control offenders are itemised under CERTAIN.

**The dark-mode inversion, which is the part that actually hurts.** 17 single-line
ternaries (plus `CandidateViewTabs.tsx:27-28`, which spans two lines and so escaped the
one-line grep) give the **unselected** option a `dark:bg-white/5` chip while the
**selected** option keeps bare `bg-brand-lea` with no dark override:

```
$ rg -n '\?\s*"[^"]*bg-brand-lea[^"]*"\s*:\s*"[^"]*dark:bg-white/' app components --pcre2 | wc -l
17
```

`brand-lea` is `#0d2c43`; `brand-panel` is `#10243a`. Contrast between them is ≈1.03:1.
`white/5` over `#10243a` composites to about `#1d2f43` — **lighter** than the selected
navy. So in dark mode the selected item is the flattest chip in the row and the
unselected ones are the ones that look picked. The only surviving cue is text colour.

**And the same defect on "today".** Seven calendars mark today with a navy circle.
Four add a dark override, three do not:

```
CONFORMING (dark:bg-brand-gold dark:text-brand-lea):
components\events\EventsCalendar.tsx:187
components\events\EventDetailWorkspace.tsx:388, 400, 465
components\travel\TravelPersonCalendar.tsx:157   (dark:text-brand-black)

NOT (navy chip, no dark override → ~1.03:1 on the panel):
components\calendar\MonthCalendar.tsx:174:      isToday ? "bg-brand-lea text-white" : "text-brand-lea hover:bg-brand-cloudDancer/50 dark:text-slate-100 dark:bg-white/5"
components\calendar\TimeGridCalendar.tsx:222:   isToday(day) ? "bg-brand-lea text-white" : "text-brand-lea dark:text-slate-100"
components\calendar\ScheduleTimeline.tsx:247:   isToday ? "bg-brand-lea text-white" : "text-brand-lea dark:text-slate-100"
```

`MonthCalendar.tsx:174` is the worst of the three because its *unselected* branch carries
`dark:bg-white/5`: in dark mode all 42 day numbers get a visible chip and today's is the
one that disappears.

---

### 6. The vertical-space rule

```
$ rg -o --no-filename "max-h-\[[^]]*\]" app components --glob '!*roadmap*' | sort | uniq -c | sort -rn
      2 max-h-[90vh]      1 max-h-[640px]     1 max-h-[560px]
      1 max-h-[calc(100vh-2rem)]               1 max-h-[520px]
      1 max-h-[88vh]      1 max-h-[620px]     1 max-h-[320px]
      1 max-h-[85svh]     1 max-h-[60vh]      1 max-h-[28rem]
      1 max-h-[82vh]      1 max-h-[600px]
      1 max-h-[70vh]
```

Judged per hit:

| file:line | value | verdict |
|---|---|---|
| `components/calendar/EditInterviewModal.tsx:131` | `90vh` | **legal** — modal shell, the documented fixed-container exception |
| `components/people/StartNewOnboardingButton.tsx:135` | `90vh` | **legal** — modal |
| `components/settings/TeamMemberAccessModal.tsx:137` | `88vh` | **legal** — modal |
| `components/recruiting-jobs/BatchAddCandidatesToJob.tsx:212` | `calc(100vh-2rem)` | **legal** — modal |
| `components/settings/SettingsLayoutLab.tsx:436` | `60vh` | **legal** — `fixed` dropdown menu |
| `components/feedback/FeedbackButton.tsx:333` | `85svh` | **legal** — drawer, and it releases the cap at `lg` (`lg:max-h-none lg:overflow-visible`) |
| `components/candidates/CandidateDocuments.tsx:119` | `82vh` | **legal** — on an `<img>`, constraining an image rather than a data panel |
| `components/pilot-requirements/PilotRequirementsWorkspace.tsx:66` | `320px` | **legal and deliberate** — roadmap:648 names this one explicitly: "ONE CAP KEPT ON PURPOSE — the raw job-description reader at 320px, which is a long text block that does not drive page scroll" |
| `components/content-blocks/BlockLibrary.tsx:807` | `640px` | **data panel** — block list grows with the library |
| `components/job-editor/JobsSandboxWorkspace.tsx:1662` | `520px` | **data panel** |
| `components/job-editor/JobsSandboxWorkspace.tsx:1679` | `620px` | **data panel** |
| `components/settings/BlockManagementWorkspace.tsx:104` | `560px` | **data panel** — divided list, grows with data |
| `components/settings/SettingsLayoutLab.tsx:280` | `70vh` | **data panel** |
| `components/booking/PublicBooking.tsx:320` | `28rem` | **data panel** — the slot list on the public booking page |
| `max-h-[600px]` | — | **GONE.** See below. |

**A roadmap correction, measured.** `lib/roadmap/roadmap.ts:648` states
"components/calendar/TimeGridCalendar.tsx **still has** max-h-[600px] and was touched by
no commit in the batch". That is now stale:

```
$ rg -n "max-h|h-\[" components/calendar/TimeGridCalendar.tsx
233:          an early or late interview, so a max-h-[600px] was guaranteed to put a
```

The only occurrence in the file is inside the comment that records its removal
(lines 231-234): *"Time grid. NO height cap here, deliberately: the default 7am-8pm
window is already 14 * HOUR_HEIGHT = 784px … The page scrolls instead."* The cap is
gone. Somebody should flip that roadmap line rather than leave a fixed item reading as
open.

**`h-[…]` fixed heights.** Only two are layout-scale; the rest are icon sizes
(`h-[9px]`, `h-[11px]`, `h-[18px]`, `h-[14px]`, `h-[6px]`, `h-[3px]`):

```
components\candidates\PdfViewer.tsx:103:  <iframe … className="h-[1000px] w-full rounded-b bg-white dark:bg-brand-panel" />
components\candidates\PdfViewer.tsx:136:  <div ref={containerRef} className="h-[74vh] overflow-y-auto px-3 py-3">
```

A document viewer — a genuinely fixed shell that handles its own overflow. I am calling
it the nav-rail-class exception, but see UNCERTAIN #3: a 1000px iframe inside a 74vh
scroller is two nested scroll regions by construction and I could not see it render.

**`min-h-[…]`** — 33 occurrences, 16 distinct values. Every one is a **floor**, not a
cap, so none of them violates the rule (and `JobBlockAssembly.tsx:594,709` even release
theirs at `xl` with `xl:min-h-0`). Listing them would be noise; the measured answer is
"no cap among them".

**The nav-rail exception is exemplary and should be left alone.**
`components/layout/Sidebar.tsx:335`:

```
<div className="flex h-full min-h-0 w-[70px] flex-col items-center border-r border-white/10 bg-brand-eden py-2 [@media(max-height:620px)]:overflow-y-auto [@media(max-height:620px)]:overflow-x-hidden">
```

Both axes pinned, gated to viewports that genuinely cannot fit, `min-h-0` present, and
a 30-line comment (lines 305-334) explaining the arithmetic and why `no-scrollbar` was
removed.

---

### 7. The overflow-axis trap

```
$ rg -n "overflow-y-(auto|scroll)" app components lib | wc -l
46
$ rg -n "overflow-y-(auto|scroll)" app components lib | rg -v "overflow-x-" | wc -l
37    ← 2 of these are prose inside comments (JobBlockAssembly.tsx:644, Sidebar.tsx:434) → 35 real
$ rg -n "overflow-y-(auto|scroll)" app components lib | rg "overflow-x-" | wc -l
9     ← 3 of these are roadmap prose → 6 real
```

The 6 that pin both axes:

```
components\feedback\FeedbackButton.tsx:333
components\shared\EmailBodyEditor.tsx:205
components\layout\Sidebar.tsx:232, 335, 441
components\recruiting-jobs\BatchAddCandidatesToJob.tsx:276
```

**I am NOT reporting the 35 unpinned ones as a finding, because the project already
decided not to sweep them**, and the decision is on the record at
`lib/roadmap/roadmap.ts:646`: *"About 40 other components use overflow-y-auto without
pinning the other axis and were deliberately NOT swept, because auto only shows a bar
when content actually overflows and none of them is showing one."* My 35 is consistent
with that "about 40". Re-raising it would be re-litigating a closed call.

**The mirror-image trap was treated differently in the same codebase, and that is worth
reporting.**

```
$ rg -n "overflow-x-(auto|scroll)" app components --glob '!*roadmap*' | rg -v "overflow-y-" | wc -l
28    ← 3 are comment prose (TravelSpendYear.tsx:89, ReportsWorkspace.tsx:223, OnboardingGridTab.tsx:241) → 25 real
$ rg -n "overflow-x-(auto|scroll)" app components --glob '!*roadmap*' | rg "overflow-y-" | wc -l
4
```

The 4 that pin:

```
components\travel\TravelSpendYear.tsx:93:        <div className="w-full overflow-x-auto overflow-y-hidden">
components\reports\ReportsWorkspace.tsx:228:    <div className="w-full overflow-x-auto overflow-y-hidden">
components\reports\ReportsWorkspace.tsx:491:    <div className="mt-3 overflow-x-auto overflow-y-hidden">
components\reports\ReportsWorkspace.tsx:1439:   <div className="mt-4 overflow-x-auto overflow-y-hidden">
```

Those four were added by the Sep 08 fix, which `roadmap.ts:635` describes as
*"an overflow-x-auto with the y axis left unpinned, which is exactly the documented trap
… overflow-y-hidden added beside every overflow-x-auto in the file"*. So the same trap is
a must-fix on the journey report and untouched on 25 other elements. The 25:

```
app\archive\page.tsx:251                              components\candidates\SavedViewWorkspace.tsx:272
app\candidates\recent-interviews\page.tsx:92          components\candidates\SelectableCandidateTable.tsx:299
components\calendar\TimeGridCalendar.tsx:203          components\compliments\RewardCatalogAdmin.tsx:121
components\candidates\CandidateComparison.tsx:378     components\compliments\RewardsWorkspace.tsx:105
components\candidates\CandidateDocuments.tsx:388      components\employees\EmployeesWorkspace.tsx:424
components\candidates\CandidateProfileWorkspace.tsx:573 components\events\EventDetailWorkspace.tsx:319, 640
components\candidates\DepartmentReviewWorkspace.tsx:139 components\events\SuppliesWorkspace.tsx:136
components\orientation\OrientationEmailPanel.tsx:257, 1305
components\orientation\OrientationSessionDetail.tsx:537
components\people\EmployeeJourney.tsx:245             components\people\OnboardingArchivedTab.tsx:163
components\people\OnboardingGridTab.tsx:250           components\people\PostOnboardTab.tsx:260
components\settings\UsersManagementWorkspace.tsx:276  components\travel\TravelHubCalendar.tsx:185
components\travel\TravelHubWorkspace.tsx:422
```

Most are table wrappers with no height constraint, so the implied `overflow-y: auto`
never produces a bar — same reasoning as the deliberate non-sweep above. I am putting
this under UNCERTAIN rather than CERTAIN for exactly that reason; what I can state as
certain is only that two identical traps in one codebase get two different treatments.

**`.no-scrollbar` is dead code.**

```
$ rg -n "no-scrollbar" app components lib --glob '!*roadmap*'
app\globals.css:121:.no-scrollbar {
app\globals.css:125:.no-scrollbar::-webkit-scrollbar {
components\layout\Sidebar.tsx:319:   no-scrollbar is GONE and must not come back: hiding a bar on real content
```

Zero call sites. The utility it was written for (the 70px rail) stopped using it and the
Sidebar comment says so. It is loaded on every page and applied to nothing.

---

### 8. Typography and spacing

**Font setup.** `app/layout.tsx:2,10,23`:

```
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
<html lang="en" className={inter.variable} suppressHydrationWarning>
```

`app/globals.css:151`: `font-family: var(--font-inter), -apple-system, "Segoe UI", …`.
Inter is the only face `next/font` loads:

```
$ rg -n "next/font" app components lib
app\layout.tsx:2:import { Inter } from "next/font/google";
(plus one comment and one roadmap line)
$ rg -n "@font-face" app components lib public
(only public/vendor/pdfjs/pdf.min.mjs — vendor noise, not ours)
```

**So the fleet org charts render in a different typeface from the rest of the app.**
`components/fleet/orgchart/OrgChart.module.css:42`, applied at line 53
(`font-family: var(--fh)` on `.wrap`):

```
  --fh: "Archivo", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
```

`Archivo` is never loaded — `rg -n "Archivo" app components lib public` returns exactly
two hits, this line and a comment at `CrewOrgChart.tsx:1427` ("The old JS pass that
measured and set minHeight raced the Archivo web-font load"), which suggests somebody
believed it was loading. The second family, bare `"Inter"`, is not a registered family
either: `next/font` emits a hashed `@font-face` family and exposes it only through
`--font-inter`, so `"Inter"` matches only if the viewer has Inter installed locally
(common on a designer's Mac, uncommon on Windows). On the user's Windows machine the
charts therefore fall through to `system-ui` → Segoe UI.

**Verdana is deliberate and is not a finding.** 14 `font-family: Verdana` occurrences,
all in `lib/front/*` email builders and `lib/formatting/job-post-code.ts` /
`components/job-preview/JobExportMenu.tsx` — i.e. the Front-template house style and the
job-post export, both intentional. Separately though,
`lib/formatting/brand.ts:24` ships `{ key: "font", label: "Font Family", value: "Verdana / locked" }`
to the **/settings/templates** page, which is the job-post token reference — correct in
context, but a reader on that page sees "Verdana / locked" with nothing saying it
describes exports rather than the app. The same table's
`{ key: "cloudDancer", … use: "Page background" }` is simply wrong: the page background
is `#eaf0f7` (`--skyshare-page`), not cloudDancer `#f0eee9`.

**Arbitrary font sizes.**

```
$ rg -o "text-\[[0-9.]+(px|rem|pt)\]" app components | wc -l
1221      across 212 files
$ rg -o --no-filename "(?<![a-z-])text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)(?![a-z-])" app components --pcre2 | wc -l
2569
```

Distribution:

```
    755 text-[11px]     ← de-facto house "small"
    288 text-[10px]     ← de-facto house "tiny"
     57 text-[9px]
     28 text-[12px]
     21 text-[10.5px]   ← EXACTLY text-xs at html 14px
     20 text-[12.5px]   ← 0.25px above text-sm
     20 text-[11.5px]
     19 text-[13px]
      7 text-[8px]
      2 text-[9.5px]
      2 text-[28px]
      1 text-[32px]      ← 0.5px above text-4xl
      1 text-[0.95rem]   ← == the body default
```

The top three (1 100 of 1 221) are a consistent, if unnamed, extension of the scale —
11px and 10px do not exist in Tailwind's default set, there is no `fontSize` override in
the config, and they are used everywhere. I would not sweep those. The 89 occurrences of
`text-[10.5px]` / `text-[11.5px]` / `text-[12px]` / `text-[12.5px]` are four spellings
that all land within 0.75px of two real scale classes, so they are noise rather than
intent; `text-[10.5px]` is not even approximately `text-xs`, it is byte-for-byte
`text-xs`.

**Headings.** 71 `<h1>`, 168 `<h2>`, 64 `<h3>`.

```
$ rg -n -o '<h1[^>]*className="[^"]*"' app components --pcre2 | sed 's/.*className="//;s/"$//' | sort | uniq -c | sort -rn
     38 text-2xl font-semibold text-brand-lea dark:text-slate-100
      4 mt-0.5 text-3xl font-semibold text-white
      4 flex items-center gap-2 text-2xl font-semibold text-brand-lea dark:text-slate-100
      3 text-2xl font-semibold text-red-700 dark:text-red-300
      3 mt-2 text-2xl font-semibold text-brand-lea dark:text-slate-100
      3 mt-0.5 text-2xl font-semibold text-white
      2 text-lg font-semibold text-brand-lea dark:text-slate-100
      … (full output reproduced in the session; 48 of 71 are text-2xl)
```

48 of 71 h1s are `text-2xl` (21px), 7 are `text-3xl` (gradient heroes, white text —
deliberate), and the outliers are:

```
app\handbook\[slug]\page.tsx:26        text-lg  (15.75px)
app\interviews\debrief\page.tsx:28     text-lg
components\reports\SharedFleetProgression.tsx:22  text-lg (shared-report hero)
app\error.tsx:13                       text-xl
app\r\[token]\page.tsx:20              text-xl
components\shared\PageStatus.tsx:15    text-xl
components\job-editor\JobsSandboxWorkspace.tsx:1228  text-xl
components\job-preview\FormattedJobPost.tsx:186      text-4xl (the job-post document title — deliberate)
```

So `/handbook/<slug>` and `/interviews/debrief` give their page title 15.75px, a third
smaller than the 48 pages that use 21px, while
`components/workspace/ProjectChecklistWorkspace.tsx:57`,
`components/pilot-requirements/PilotRequirementsWorkspace.tsx:106`,
`components/content-blocks/{BlockTemplateBoard.tsx:231,BlockLibrary.tsx:846}` and
`components/recruiting-jobs/JobTitleField.tsx:111` give an `<h2>` the full 21px.

**The uppercase section label has 39 spellings.**

```
$ rg -o --no-filename "text-\[?[a-z0-9.]+p?x?\]? font-(bold|semibold|medium) uppercase tracking-\[[0-9.]+em\]" app components | sort | uniq -c | sort -rn
     73 text-[11px] font-bold uppercase tracking-[0.14em]
     55 text-[11px] font-bold uppercase tracking-[0.2em]
     55 text-[11px] font-bold uppercase tracking-[0.22em]
     36 text-[10px] font-bold uppercase tracking-[0.16em]
     25 text-[11px] font-bold uppercase tracking-[0.18em]
     22 text-[11px] font-bold uppercase tracking-[0.16em]
     19 text-[10px] font-bold uppercase tracking-[0.08em]
     16 text-xs    font-bold uppercase tracking-[0.22em]
     … 31 more spellings, 13 distinct tracking values
$ rg -o --no-filename "tracking-\[[^]]*\]" app components | sort | uniq -c | sort -rn
    110 tracking-[0.14em]   83 tracking-[0.16em]   74 tracking-[0.22em]   57 tracking-[0.2em]
     37 tracking-[0.08em]   32 tracking-[0.12em]   27 tracking-[0.18em]    5 tracking-[0.1em]
      2 tracking-[0.13em]    2 tracking-[0.09em]    2 tracking-[0.02em]    1 tracking-[0.07em]
      1 tracking-[0.04em]
```

Seven of those occurrences use a tracking value that appears nowhere else and sits within
0.01-0.02em of a common neighbour — `tracking-[0.13em]`
(`OnboardingChecklist.tsx:151,166`), `tracking-[0.09em]`
(`TravelHubCalendar.tsx:196,278`), `tracking-[0.07em]` (`TravelHubCalendar.tsx:239`),
`tracking-[0.04em]` (`TravelHubCalendar.tsx:378`), `tracking-[0.02em]`
(`TravelHubCalendar.tsx:561,567`).

**Spacing is clean — say so.**

```
$ rg -o --no-filename "(?:gap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|space-[xy])-\[[^]]*\]" app components --pcre2 | sort | uniq -c | sort -rn
      7 gap-[3px]     3 px-[5px]     2 py-[3px]     1 pl-[9px]
      1 pl-[1.125rem] 1 p-[26px]     1 p-[19px]     1 mx-[-0.04em]
      1 gap-[7px]     1 m-[#fdf6e3]  ← false positive: my regex caught "from-[#fdf6e3]"
```

18 real arbitrary spacing values in the entire app. Padding and gap sit on the 0.25rem
scale essentially everywhere. No finding.

**Border widths.** `border-[0.5px]` ×24, in 15 files, 11 of which are the Compliments
module plus `pilot-requirements` (3) and `travel` (1). It is the only sub-pixel border in
the app and it travels with the module's other bespoke choices (`rounded-element`,
`rounded-card`, the `value-*` palette), so I read it as a deliberate sub-brand rather
than drift, and I have left it out of CERTAIN. See UNCERTAIN #5.

---

## CERTAIN - safe for a later agent to fix without re-deriving

### 1. Dark mode renders four org-chart surfaces as white text on white — `components/fleet/orgchart/OrgChart.module.css`

`--card`, `--line`, `--danger` and `--sweet` are referenced via `var()` and defined
nowhere, so they hold their light fallbacks in both themes, while `--ink` (which IS
themed to `#e9eef5` in dark) supplies the text colour beside them. Affected surfaces:
`CrewOrgChart.tsx:2485` (notice-date modal), `CrewOrgChart.tsx:2524` (role-move modal),
`PeopleIndex.tsx:98` (Find-a-person panel, on BOTH charts), `LinkPicker.tsx:117`
(profile-link popover, on BOTH charts), plus 32 `var(--line, #cdd7e2)` borders.

**Fix — add the four missing definitions to the two blocks that already exist. Light
mode is provably unchanged because each new value equals the fallback it replaces.**

In `.wrap`, after line 6 (`--color-bg: #ffffff;`) insert:

```css
  --card: #ffffff;
  --line: #cdd7e2;
  --danger: #a32d2d;
  --sweet: #a6c9e7;
```

In `:global(html.dark) .wrap`, after line 237 (`--color-bg: #10243a;`) insert:

```css
  --card: #10243a;
  --line: #33475d;
  --danger: #f2a8b6;
  --sweet: #5b8fc0;
```

Those dark values are not invented: `#10243a` is what `--color-bg` already flips to and
equals `brand-panel`; `#33475d` is what `--n300` already flips to; `#f2a8b6` is what
`--open-soft-fg` already flips to; `#5b8fc0` is what `--eden` already flips to. Severity:
**high**.

### 2. The Reports page's main tab bar ignores the constant defined in its own file — `components/reports/ReportsWorkspace.tsx:1526-1527`

Before:

```
              tab === t.id
                ? "bg-brand-lea text-white shadow-sm"
                : "text-brand-grey hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/5"
```

After:

```
              tab === t.id ? SEGMENT_ON : SEGMENT_OFF
```

`SEGMENT_ON` / `SEGMENT_OFF` are already declared at lines 422-423 of the same file with
a comment naming the locked rule. This simultaneously adds the missing gold on selected
and the missing gold glow on hover. Severity: **high** (it is the navigation of the page
the executive reviews look at, and it contradicts a constant 1 100 lines above it).

### 3. `components/widgets/registry.tsx:261-262` — the "≤90d" document-currency count is invisible in dark mode

Line 260 is the correct pattern; 261 and 262 are its unfinished siblings in the same
three-tile row. Before:

```
            <div className="rounded bg-red-50 dark:bg-red-500/10 py-1"><div className="text-base font-semibold text-red-600 dark:text-red-400">{dc.counts.expired}</div>…
            <div className="rounded bg-amber-50 py-1"><div className="text-base font-semibold text-amber-600">{dc.counts.due30}</div>…
            <div className="rounded bg-brand-cloudDancer/60 py-1 dark:bg-white/5"><div className="text-base font-semibold text-brand-lea">{dc.counts.due90}</div>…
```

After — line 261 `bg-amber-50` → `bg-amber-50 dark:bg-amber-500/10` and `text-amber-600`
→ `text-amber-600 dark:text-amber-400`; line 262 `text-brand-lea` →
`text-brand-lea dark:text-slate-100`. `brand-lea #0d2c43` on `white/5`-over-`brand-panel`
is ≈1.3:1, so the number currently does not render. Whole-scope positive control: these
are the only 2 of 121 amber status strings in the app with no `dark:`. Severity: **high**
for 262, **medium** for 261.

Also in the same function, line 265: `const tone = it.days < 0 ? "text-red-600 dark:text-red-400" : it.days <= 30 ? "text-amber-600" : …`
— the red arm has a dark variant and the amber arm does not. Change `"text-amber-600"`
→ `"text-amber-600 dark:text-amber-400"`. Severity: **medium**.

### 4. Three calendars lose their "today" marker in dark mode

Exact replacement, copied from the four conforming siblings
(`EventsCalendar.tsx:187`, `EventDetailWorkspace.tsx:388,400,465`): add
`dark:bg-brand-gold dark:text-brand-lea` to the `isToday` branch.

- `components/calendar/MonthCalendar.tsx:174` — `isToday ? "bg-brand-lea text-white"` → `isToday ? "bg-brand-lea text-white dark:bg-brand-gold dark:text-brand-lea"`. Worst case of the three: its else-branch carries `dark:bg-white/5`, so in dark mode every other day gets a chip and today's is the one that vanishes.
- `components/calendar/TimeGridCalendar.tsx:222` — same replacement.
- `components/calendar/ScheduleTimeline.tsx:247` — same replacement.

Severity: **medium** each.

### 5. `dark:bg-[#0f2033]` → `dark:bg-brand-field`, 106 occurrences

The hexes are identical, so this is a pure rename with no visual change. All 106 are
exactly the string `dark:bg-[#0f2033]` — there is no variant spelling, verified by
`rg -o --no-filename "[a-zA-Z0-9:_/-]*bg-\[#0f2033\]"` returning one distinct result.
Positive control: `dark:bg-brand-field` already appears 25 times in 14 files, and the
identical migration for `brand-panel` finished at 563/0. Per-file counts in the Counts
table. Severity: **medium** (no rendered change; it removes a 106-site drift surface and
completes an instruction written in `tailwind.config.ts:33`).

### 6. `dark:text-[#8fb3d6]` → `dark:text-brand-edenOnDark`, 88 occurrences

86 are `dark:text-[#8fb3d6]` and 2 are `dark:hover:text-[#8fb3d6]`
(`components/job-editor/JobsSandboxWorkspace.tsx:196` and
`components/reports/ReportShareButton.tsx:120`); replace the bracket expression in
place, keeping any variant prefix. Identical hex, no visual change. Positive control:
`dark:text-brand-edenOnDark` ×11 and `dark:hover:text-brand-edenOnDark` ×5 already in
the tree. `tailwind.config.ts:38` asks for exactly this. Severity: **medium**.

### 7. `brand-panel` needs nothing — a self-correction, recorded so nobody chases it

My first pass counted `1 bg-[#10243a]` surviving and I had written this up as a
one-line fix. It is wrong, and the check that disproved it is one command:

```
$ rg -n "bg-\[#10243a\]" app components lib
lib\roadmap\roadmap.ts:988:- [x] Dark-mode token + gaps (Jun 30) — the hardcoded dark card color (dark:bg-[#10243a], ~440 literals) is now the single brand-panel token …
```

The only hit is the roadmap sentence *describing* the migration. There are **zero**
surviving `#10243a` utilities in `app/` or `components/`. The `brand-panel` migration is
563 / 0 and is genuinely complete — which is exactly why it is the right precedent to
cite for CERTAIN #5 and #6. No action.

### 8. `lib/formatting/brand.ts:8` carries the pre-accessibility grey

Before: `grey: "#76787b",` — After: `grey: "#63666a",`

`#76787b` is 4.0:1 on white, below WCAG AA; `tailwind.config.ts:22` darkened the
`brand-grey` token to `#63666a` (~5:1) and `lib/roadmap/roadmap.ts:987` records that as
approved Jul 9. This second copy feeds two real outputs: the "Grey" inline text colour a
user can apply in the rich-text editor (`lib/formatting/rich-text.ts:7`, which renders
into job-post HTML), and the Grey swatch on **/settings/templates**
(`components/template-tokens/TemplateTokensPanel.tsx` ← `colorTokens`). Severity:
**medium**. Note the side effect honestly in any commit: existing job-post HTML that
already baked `#76787b` into stored markup will not change retroactively; only new
renders will.

### 9. `lib/formatting/brand.ts:17` mislabels the page background

Before: `{ key: "cloudDancer", label: "Cloud Dancer", value: brandColors.cloudDancer, use: "Page background" },`

The page background is `#eaf0f7` (`--skyshare-page`, `app/globals.css:15`), not
cloudDancer `#f0eee9`. After: change `use:` to `"Light panel fill / info blocks"`, which
is what cloudDancer is actually used for (478 `bg-brand-cloudDancer*` call sites, none of
them a page background). This string is rendered to the team on /settings/templates.
Severity: **low**, but it is a wrong fact on a reference page.

### 10. `components/fleet/orgchart/OrgChart.module.css:42` names two fonts the app never loads

Before:

```css
  --fh: "Archivo", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
```

After:

```css
  --fh: var(--font-inter), system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
```

`Archivo` has no `@font-face` and no `next/font` import anywhere
(`rg -n "Archivo" app components lib public` → the declaration plus one comment). Bare
`"Inter"` is not the family name `next/font` registers; the variable is.
`--font-inter` is in scope because `app/layout.tsx:23` puts `inter.variable` on `<html>`.
Today the charts render in Segoe UI on Windows while every other page renders in Inter.
Severity: **medium**.

### 11. `components/recruiting-jobs/AddCandidateToJob.tsx:180` — the job title disappears in dark mode

Before: `Linking to <span className="font-semibold text-brand-lea">{jobTitle}</span>`
After: `<span className="font-semibold text-brand-lea dark:text-slate-100">`

The surrounding `<p>` is `text-brand-grey dark:text-slate-400`, so in dark mode the
emphasised span is the only unreadable part of the sentence. Severity: **medium**.

### 12. Two `text-red-600` error messages with no dark variant

- `app/settings/users/page.tsx:132` — `className="mt-2 text-sm text-red-600"` → add `dark:text-red-400`
- `app/settings/feedback/page.tsx:53` — same

`#dc2626` on `brand-panel` is ≈4.1:1 at 12.25px, just under AA. Positive control: 177 of
179 red status strings in the app already carry a dark variant, so these two are
oversights. Severity: **low**.

### 13. `components/new-hire-contacts/NewHireContactsAdmin.tsx:586` — `text-xs font-semibold text-emerald-600` with no dark variant

Add `dark:text-emerald-400`. `#059669` on `#10243a` is ≈3.2:1, below AA for 10.5px text.
Positive control: 86 of 93 emerald status strings carry a dark variant; the other six
residuals are 14px/16px **icons** (`BusinessCardsWorkspace.tsx:416`,
`GuideBuilder.tsx:194`, `ReportShareButton.tsx:121`, `ReadinessCard.tsx:27,42`,
`BusinessCardPanel.tsx:65`) where 3:1 is the applicable threshold, so this is the only
text one. Severity: **low**.

### 14. `components/scheduling/SchedulingAdmin.tsx:503-509` — delete the dead `<style jsx>` block

Nothing in the app carries the CSS class `.inp`
(`rg -ln 'className="[^"]*\binp\b' app components` → no output); the file's inputs use
the TypeScript constant `inp` declared at line 54. The block ships an 8px radius against
the locked 4px, an off-token `rgb(20 33 61 / 0.2)` border, and a `:global()` rule that
leaks while the component is mounted. Deleting lines 503-509 changes nothing rendered.
Severity: **low**, but it removes a trap: the next person to write `className="inp"` gets
an 8px corner and no dark mode.

### 15. `app/globals.css:121-127` — `.no-scrollbar` has zero call sites

`rg -n "no-scrollbar" app components lib --glob '!*roadmap*'` returns only the two
definition lines and the `Sidebar.tsx:319` comment saying it was removed on purpose.
Either delete it or keep it and tighten the comment to say it is currently unused and
reserved. Do **not** silently "reuse" it. Severity: **low**. I would keep the block and
add one line to its comment rather than delete, because the comment itself is a useful
warning — but that is a judgement call, so: the certain part is that it has no call
sites.

### 16. `components/calendar/TimeGridCalendar.tsx` no longer has `max-h-[600px]`; `lib/roadmap/roadmap.ts:648` says it does

Not a code fix — a roadmap correction for the commit agent.
`rg -n "max-h|h-\[" components/calendar/TimeGridCalendar.tsx` returns exactly one line,
233, which is the comment recording the cap's deliberate removal. The roadmap's Aug 31
correction on line 648 ("still has max-h-[600px] and was touched by no commit in the
batch") is stale and currently keeps a fixed item reading as open. Severity: **medium**
for the roadmap's truthfulness; zero code risk.

### 17. Four `rounded-[3px]` → `rounded` (4px)

- `components/travel/TravelHubCalendar.tsx:477` — `"rounded-r-[3px]" : "rounded-[3px]"` → `"rounded-r" : "rounded"`
- `components/travel/TravelHubCalendar.tsx:478` — `"rounded-l-[3px] rounded-r-none"` → `"rounded-l rounded-r-none"`
- `components/candidates/CandidateRow.tsx:155` — `rounded-[3px]` → `rounded`
- `components/candidates/PaycomLinkControl.tsx:43` — `rounded-[3px]` → `rounded`

Severity: **low**. A 1px difference on a 16px chip, but it is the locked value and there
is no reason for three.

---

## UNCERTAIN - needs a human in the morning

### 1. The 40 `rounded-full` progress bars: sweep them, or write the exception down?

The rule says pills are rectangles and `rounded-full` is for circles. A progress track is
a pill. The Sep 08 designer review treated exactly this as a violation and the fix shipped
(`ReportsWorkspace.tsx:1295` now uses `rounded`). By that precedent all 40 sites listed in
section 1 should become `rounded`, and `components/widgets/registry.tsx` proves the
inconsistency is visible — lines 320 and 352 draw the same bar two ways on the same
Command Center grid.

**Why I will not put it in CERTAIN:** 40 edits across 15 files would noticeably change the
look of the Compliments dashboard, the onboarding progress rails and the match cards all
at once, and a rounded 2px-tall bar is a widely-held convention that a designer might have
intended here. The locked rule does not explicitly mention bars.

**The one thing that would close it:** a yes/no from him on a single sentence — "do 2px
progress bars get 4px ends like everything else, or are bars an exception?" If yes,
the change is mechanical: `rounded-full` → `rounded` on those 40 lines and nothing else.
If no, the answer belongs in CLAUDE.md beside the pill rule so this question stops coming
back, and `ReportsWorkspace.tsx:1295` should be reverted to match.

### 2. The 73-line navy-without-gold selected state: which of them are really segmented controls?

Measured: 73 ternary lines select with `bg-brand-lea` and no gold on the line; 15 do carry
gold. I hand-verified and am confident about item CERTAIN #2 (the Reports tab bar, whose
own file defines the fix) and about the three calendars in CERTAIN #4. The rest I can
group but not individually certify without seeing them render, because some are
checkbox-style toggles and count badges rather than selected states:

Tab bars / segmented controls, selected = bare navy, no gold:
`components/candidates/CandidateViewTabs.tsx:27`,
`components/interview-questions/InterviewTabs.tsx:22`,
`components/compliments/ComplimentsTabs.tsx:39` (navy underline, no gold),
`components/business-cards/BusinessCardsWorkspace.tsx:221`,
`components/employees/EmployeesWorkspace.tsx:263`,
`components/matchboard/MatchboardWorkspace.tsx:167,177,187`,
`components/calendar/CalendarWorkspace.tsx:379,408`,
`components/candidates/CandidateDocuments.tsx:369,377,402,419,425`,
`components/people/OnboardingArchivedTab.tsx:119`,
`components/recruiting-jobs/JobClassificationEditor.tsx:70,77`,
`components/recruiting-jobs/AddCandidateToJob.tsx:183,184`,
`components/job-editor/LayoutLab.tsx:613,636,651,671`,
`components/settings/SettingsLayoutLab.tsx:293,322,339,347`,
`components/content-blocks/BlockLibrary.tsx:691,787,798`,
`components/job-editor/JobDataEditor.tsx:333`,
`components/job-editor/JobsSandboxWorkspace.tsx:1319`,
`components/people/OnboardingChecklist.tsx:290`,
`components/candidates/CandidatePageSize.tsx:42`,
`components/pilot-requirements/UnverifiedQueuePanel.tsx:115`,
`components/final-review/FinalReviewWorkspace.tsx:194,206`,
`components/interviews/InterviewDetailWorkspace.tsx:133,174`,
`components/interview-questions/InterviewQuestionsWorkspace.tsx:137`,
`components/interview-questions/GuideBuilder.tsx:178`,
`components/scheduling/SchedulingAdmin.tsx:464`,
`components/reports/ReportsWorkspace.tsx:1526` (this one IS certain, see above).

**Why I cannot close it:** the replacement is known (`SEGMENT_ON`), but 40-odd controls
is a whole-app visual change, adding a gold ring to every selected tab in the product.
That is a design decision, not a bug fix, even though it is the rule as written.

**The one thing that would close it:** him looking at one before/after — apply
`SEGMENT_ON` to `components/candidates/CandidateViewTabs.tsx:27` alone, open /candidates,
and say whether that is what "selected = navy + gold" should look like. Everything else
follows from that one answer.

### 3. The dark-mode inversion: how bad does it actually look?

17 single-line sites (listed in section 5) plus `CandidateViewTabs.tsx:27-28` give the
unselected option a `dark:bg-white/5` chip and the selected option no dark override, so
arithmetically (`#0d2c43` selected vs ≈`#1d2f43` unselected over `brand-panel`) the
selected chip is the darker, flatter one. I am confident in the arithmetic and in the
classes; I am not confident about perceived severity, because the text colour still
differentiates them (`text-white` vs `dark:text-slate-400`) and I could not render a
single pixel — per CLAUDE.md the Browser pane cannot read this app, and the brief assigns
Chrome to a different agent tonight.

**The one thing that would close it:** the Chrome agent, or him, toggling dark mode on
/candidates and /reports and saying whether the selected tab reads as selected. If it
does not, the fix is the same `SEGMENT_ON` from UNCERTAIN #2, which happens to solve both
at once — which is an argument for doing that one sweep rather than two.

### 4. The 25 unpinned `overflow-x-auto` containers

The CSS spec makes the y axis compute to `auto` on every one of them, and the Sep 08
review treated that as a must-fix on the journey report (4 elements now carry
`overflow-y-hidden`). The other 25 were never swept. The roadmap's explicit reasoning for
*not* sweeping the mirror-image case — "auto only shows a bar when content actually
overflows and none of them is showing one" — applies to most of these too, since they are
table wrappers with no height constraint.

**Why I cannot close it:** the exception is the subset that sits inside a height-bounded
flex or `EditableGrid` parent, where the implied `overflow-y: auto` really can produce
scroll-inside-scroll. `components/candidates/SelectableCandidateTable.tsx:299` and
`components/calendar/TimeGridCalendar.tsx:203` are the two I would look at first, and
roadmap:648 records a history of exactly this going wrong and being mis-reported twice.
Deciding it from source requires walking each parent chain, which is more reliably done
by looking at the rendered page.

**The one thing that would close it:** a rendered check of those 25 at a short viewport
(say 700px) for a vertical bar inside a horizontally scrolling box. Absent that, the
cheap and safe move is to add `overflow-y-hidden` to all 25 — it is a no-op wherever
nothing overflows vertically — but that is 25 edits on a hypothesis, so it is a call for
him.

### 5. `border-[0.5px]` ×24 and the Compliments sub-brand

24 sub-pixel borders in 15 files, 11 of them Compliments. Everywhere else in the app uses
`border` (1px). A 0.5px border is a full hairline at DPR 2 and rounds unpredictably at
DPR 1, so on a 1× Windows monitor some of those card edges may be invisible at some zoom
levels. But the Compliments module also ships `rounded-card`, `rounded-element` and its
own `value-*` palette, all of which are in `tailwind.config.ts` as deliberate additions,
so I read 0.5px as part of that sub-brand rather than drift.

**The one thing that would close it:** whether the Compliments module's lighter borders
were a deliberate design choice. If yes, leave all 24 and note it in CLAUDE.md beside the
design-system block so no future audit flags it again. If no, `border-[0.5px]` → `border`
is 24 mechanical edits.

### 6. The 39 spellings of the uppercase section label

73/55/55/36/25/22 occurrences of six near-identical treatments, 13 distinct tracking
values. Collapsing them to two or three would visibly tidy every page, and the seven
one-off tracking values (`0.13em`, `0.09em`, `0.07em`, `0.04em`, `0.02em`) are drift by
any reading. But "eyebrow at 11px/0.14em" vs "at 11px/0.22em" may be a real hierarchy
distinction — wide tracking on a page-level eyebrow, tighter on a panel label — that I
cannot infer from classes alone.

**The one thing that would close it:** one look at a page that uses two of them side by
side (`components/reports/ReportsWorkspace.tsx` mixes `0.16em` and others) to say whether
the difference is meaningful. If it is not, the fix is a single shared class
(`@layer components { .eyebrow { @apply text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400 } }`)
and ~430 call sites collapse to it — a large but entirely mechanical change, and the kind
of reformatting that would genuinely improve the look.

### 7. 89 redundant font sizes

`text-[10.5px]` ×21 is byte-identical to `text-xs`; `text-[12px]` ×28,
`text-[12.5px]` ×20 and `text-[11.5px]` ×20 all land within 0.75px of `text-sm`
(12.25px). Replacing them with the scale classes is sub-pixel-invisible **given
`html { font-size: 14px }`**.

**Why I cannot close it:** that 14px root is itself load-bearing, and `globals.css:142-146`
bumps it to 14.5px above 1600px — at which point `text-xs` becomes 10.875px and
`text-[10.5px]` stops being identical. Whether that 0.375px divergence on wide monitors
matters is a judgement call, and the whole point of the arbitrary values may have been to
opt out of the root-size scaling.

**The one thing that would close it:** a decision on whether small text should scale with
the 1600px root-size bump. If yes, convert all 89 to scale classes. If no, they are
correct as literals and the finding is void.

### 8. The `"3xl": "6px"` trap in `tailwind.config.ts:62`

`rounded-3xl` yields 6px, not 4px, inside a scale whose stated purpose is "the full scale
is collapsed to 4px so every rounded-* class is uniform". It has **zero** uses today
(`rg -o "rounded-3xl" app components lib` → no output), so nothing is broken; the risk is
that someone reaches for `rounded-3xl` expecting 4px. Whether the 6px was deliberate
(some specific card that has since changed) I cannot tell from the repo.

### 9. `components/candidates/PdfViewer.tsx:103,136`

A `h-[1000px]` iframe inside a `h-[74vh] overflow-y-auto` container is two nested scroll
regions by construction. I am classifying it as the fixed-shell exception (a document
viewer), but the rule says one vertical scrollbar per screen and this is a page where a
recruiter reads a resume. I could not see it render and the file has no comment defending
the numbers. A human looking at one candidate's documents tab settles it in ten seconds.

---

## Counts

| measurement | value |
|---|---|
| `.tsx` files in `app/ components/` | 315 |
| of those, setting at least one colour utility | 258 |
| of those, with **no** `dark:` anywhere in the file | **5** (all verified correct in both themes) |
| `rounded-full` occurrences / files | 131 / 65 |
| — comments + roadmap prose | 3 |
| — real code sites | 126 |
| — circles (equal `h-N w-N`) — **legal** | 86 |
| — non-circles (bars, rules, connector) | **40** |
| — **pills (rounded-full + horizontal padding)** | **0** |
| `rounded-[Npx]` arbitrary radii | 5 lines, 4 elements, all 3px |
| `borderRadius:` inline — on-system (4) / off (6, 8) | 55 / 3 |
| `border-radius` in CSS — on-system / off | 38 / 2 (`globals.css:103` thumb; `SchedulingAdmin.tsx:505` 8px) |
| `rounded-element` / `rounded-card` (both = 4px) | 91 / 3 |
| `rounded-3xl` (would be 6px) | 0 |
| `dark:bg-[#0f2033]` literal **vs** `dark:bg-brand-field` token | **106 / 25** |
| `dark:text-[#8fb3d6]` literal **vs** `brand-edenOnDark` token | **88 / 16** |
| `bg-[#10243a]` literal **vs** `brand-panel` token (the finished migration) | **0 in code / 563** (the 1 hit is roadmap prose) |
| total Tailwind arbitrary-hex utilities / files | 207 / 70 (206 in code; 1 is roadmap prose) |
| distinct arbitrary-hex values | 13 |
| `#76787b` (pre-AA grey) surviving | 1 (`lib/formatting/brand.ts:8`) |
| `hover:shadow-glow` / files | 151 / 76 |
| lines pairing `brand-lea` + `brand-gold` | 312 |
| `border-brand-gold*` / `ring-brand-gold*` | 233 / 64 |
| selected-state ternaries: navy **without** gold / **with** gold | **73 / 15** |
| dark-mode-inverted selected states (unselected chip lighter) | **17** + 1 multi-line |
| "today" markers: with dark override / without | 5 / **3** |
| `bg-white` className strings: with `dark:` / without | 1032 / 22 (all `bg-white/N` overlays) |
| `text-brand-lea`: with `dark:` / without | 1290 / 10 |
| `text-brand-black`: with / without | 135 / 10 (all on gold) |
| `bg-brand-cloudDancer`: with / without | 478 / **0** |
| amber status strings: with / without | 119 / **2** (both `registry.tsx:261`) |
| emerald status strings: with / without | 86 / 7 (6 are icons) |
| red status strings: with / without | 177 / **2** |
| org-chart CSS vars defined / referenced / **undefined** | 37 / 41 / **4** |
| `var(--line, #cdd7e2)` call sites (light border in dark) | 32 |
| white-on-white-in-dark surfaces | **4** |
| inline `#c0392b` / `#b0670e` (no dark variant possible) | 8 / 5 |
| `max-h-[…]` total / modal-or-image (legal) / deliberate / **data panel** | 15 / 7 / 1 / **6** |
| `min-h-[…]` (floors, not caps — no violation) | 33, 16 distinct values |
| `overflow-y-auto\|scroll`: total / unpinned (deliberate per roadmap:646) / pinned | 44 code / 35 / 6 |
| `overflow-x-auto\|scroll`: unpinned / pinned | **25** / 4 |
| `.no-scrollbar` call sites | **0** |
| `@media (prefers-color-scheme)` occurrences | **0** |
| `text-[Npx]` arbitrary sizes / files | 1221 / 212 |
| scale `text-xs…4xl` occurrences | 2569 |
| redundant sizes (10.5 / 11.5 / 12 / 12.5px) | 89 |
| `<h1>` / `<h2>` / `<h3>` | 71 / 168 / 64 |
| h1 at `text-2xl` (house) / at `text-lg` (outlier) | 48 / 3 |
| h2 sizes in use | `text-base` 75, `text-lg` 53, `text-xl` 19, `text-sm` 10, `text-2xl` 5, `text-[11px]` 1 |
| uppercase-section-label spellings / distinct `tracking-[…]` values | 39 / 13 |
| arbitrary spacing values (gap/padding/margin) | 18 — **spacing is clean** |
| `border-[0.5px]` / files | 24 / 15 (11 Compliments) |
| fonts loaded by the app | 1 (Inter, `next/font`) |
| fonts **named but never loaded** | 1 (`Archivo`, `OrgChart.module.css:42`) |

### Per-file counts for CERTAIN #5 (`dark:bg-[#0f2033]` → `dark:bg-brand-field`), 106 in 44 files

```
16 components\scheduling\SchedulingAdmin.tsx          1 components\travel\SendReimbursementEmailButton.tsx
 8 components\orientation\OrientationSessionDetail.tsx 1 components\shared\RichTextEditor.tsx
 6 components\people\ChecklistManagePanel.tsx          1 components\settings\CandidateAccessPicker.tsx
 6 components\orientation\OrientationOverview.tsx      1 components\settings\ActivityDashboardWorkspace.tsx
 6 components\calendar\EditInterviewModal.tsx          1 components\richtext\RichTextEditor.tsx
 5 components\calendar\ScheduleInterviewForm.tsx       1 components\recruiting-jobs\JobTitleField.tsx
 4 components\settings\UsersManagementWorkspace.tsx    1 components\recruiting-jobs\JobDetailsFields.tsx
 4 components\settings\TeamMemberAccessModal.tsx       1 components\people\SupervisorPicker.tsx
 4 components\booking\PublicBooking.tsx                1 components\people\SendTaskEmailButton.tsx
 3 components\settings\FeedbackWorkspace.tsx           1 components\people\OnboardingHistoryPanel.tsx
 3 components\orientation\OrientationEmailPanel.tsx    1 components\new-hire-contacts\ContactPicker.tsx
 3 components\imports\ImportActionCards.tsx            1 components\matchboard\MatchboardWorkspace.tsx
 2 components\shared\EditableGrid.tsx                  1 components\interviews\InterviewDetailWorkspace.tsx
 2 components\settings\BrandingPanel.tsx               1 components\interview-questions\InterviewQuestionsWorkspace.tsx
 2 components\settings\BlockManagementWorkspace.tsx    1 components\imports\CandidateCsvImportCard.tsx
 2 components\pilot-requirements\MatchCard.tsx         1 components\events\SuppliesWorkspace.tsx
 2 components\people\NewHireDetailWorkspaceClassic.tsx 1 components\events\EventsOverview.tsx
 2 components\orientation\OrientationCalendarPanel.tsx 1 components\events\EventFromEmailModal.tsx
                                                       1 components\events\EventDetailWorkspace.tsx
                                                       1 components\compliments\RewardCatalogAdmin.tsx
                                                       1 components\compliments\ProgramSettingsForm.tsx
                                                       1 components\compliments\PersonPicker.tsx
                                                       1 components\compliments\GiveRecognitionForm.tsx
                                                       1 components\candidates\InterviewWriteUp.tsx
                                                       1 components\candidates\ApplicationStatusPicker.tsx
                                                       1 components\calendar\InterviewerPicker.tsx
```

### Per-file counts for CERTAIN #6 (`dark:text-[#8fb3d6]` → `dark:text-brand-edenOnDark`), 88 in 24 files

```
18 components\job-editor\JobsSandboxWorkspace.tsx      1 components\shared\RichTextEditor.tsx
11 components\pilot-requirements\PilotRequirementEditor.tsx  1 components\shared\RichText.tsx
10 components\job-editor\JobBlockAssembly.tsx          1 components\shared\InlineFormatToolbar.tsx
10 components\content-blocks\BlockLibrary.tsx          1 components\shared\EditableGrid.tsx
 6 components\content-blocks\BlockTemplateBoard.tsx    1 components\settings\SettingsLayoutLab.tsx
 5 components\pilot-requirements\PilotRequirementsWorkspace.tsx 1 components\settings\BlockManagementWorkspace.tsx
 5 components\job-editor\JobDataEditor.tsx             1 components\reports\ReportShareButton.tsx
 3 components\job-editor\ContentSourceMap.tsx          1 components\pilot-requirements\UnverifiedQueuePanel.tsx
 2 components\job-editor\LayoutLab.tsx                 1 components\pilot-requirements\PostingCheckPanel.tsx
                                                       1 components\pilot-requirements\MatchCard.tsx
                                                       1 components\pilot-requirements\ManagedAircraftPanel.tsx
                                                       1 components\pilot-requirements\CandidateTriagePanel.tsx
                                                       1 components\layout\PagePlaceholder.tsx
                                                       1 components\imports\ImportsWorkspace.tsx
                                                       1 components\calendar\MonthCalendar.tsx
```

---

## Reformatting that would genuinely improve look and feel

Three, all of them things I would defend to a designer rather than taste:

1. **One shared eyebrow class.** 39 spellings and 13 tracking values for one typographic
   role is the single biggest source of visual noise in the app.
   `@layer components { .eyebrow { @apply text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400; } }`
   in `app/globals.css`, then sweep. ~430 call sites, zero semantic risk, and the pages
   immediately read as one product. Gated on UNCERTAIN #6.
2. **The page-title size.** 48 of 71 page titles are 21px and three are 15.75px
   (`app/handbook/[slug]/page.tsx:26`, `app/interviews/debrief/page.tsx:28`,
   and the shared-report hero). Bringing those two app pages to
   `text-2xl font-semibold text-brand-lea dark:text-slate-100` costs nothing and stops
   two pages reading as sub-pages of something.
3. **Finish the two token migrations (CERTAIN #5 and #6).** 194 edits, zero rendered
   change, and they remove the only remaining place in the app where a dark-mode surface
   colour can drift away from its token without anybody noticing — which is exactly how
   `#10243a` reached 440 copies before.

---

## Provenance

Everything above came from reading files and running `rg`/`perl`/`comm` over
`app/ components/ lib/`. No database query, no HTTP request, no browser, no `git`
invocation, and no file written outside `docs/audit-2026-09-11/visual.md` and
`.claude/claims/r1-visual-afdc0817.md`. Nothing here was verified visually: per CLAUDE.md
the Browser pane cannot read this app's rendered content, and tonight's brief assigns
Chrome to a different agent — so every dark-mode severity claim in this file is derived
from class strings, CSS variable scope and contrast arithmetic, not from a rendered pixel.
The four white-on-white surfaces in CERTAIN #1 are the ones I would most want a human to
confirm by eye before and after, because they are also the ones I am most confident about.
