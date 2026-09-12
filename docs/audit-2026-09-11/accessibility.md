# Accessibility audit - 2026-09-11

Role key: `accessibility`. Written 2026-09-12 ~00:05-01:30 MT (this is the re-run after the
session usage cap killed the first attempt; the audit and its directory stay named
2026-09-11 by instruction).

**Method, stated plainly so nothing here is mistaken for more than it is.** I did **not**
run axe, Lighthouse, a screen reader, or any browser tool — I was not the Chrome driver
tonight. Every contrast number below is **computed arithmetic** on the hex values in
`tailwind.config.ts` and `app/globals.css` using the WCAG 2.1 relative-luminance formula,
not a measurement of a rendered pixel. Every structural finding is a **static read of the
source**. The one thing I did fetch over the wire is the `<title>` element on three live
routes (HTTP GET against the already-running dev server on :3000, read-only). Where a
static scan cannot settle something — most importantly whether a form control is labelled
by a `<label>` that lives in a *different component* — I say so and the finding goes under
UNCERTAIN.

No git. No DB access. No writes outside this file and
`.claude/claims/r1-accessibility-afdc0817.md`. Scratch scripts were written to the session
scratchpad, never to `scripts/`, so there is no probe to sweep up.

I read `docs/audit-2026-09-11/visual.md` (sibling agent, role `visual`) before starting, to
corroborate rather than duplicate its CSS-variable finding. Credit and two numeric
corrections are in §1.6.

---

## Headline

**One token is responsible for the two worst accessibility failures in the app, and they
are both light-mode-only.** Brand gold `#eaaa00` has a relative luminance of 0.4624, which
puts it at **2.05:1 against white** and **1.79:1 against the cool-mist page** — below even
the 3:1 floor for large text and UI boundaries, let alone 4.5:1 for body text. The app uses
that exact colour for (a) the **single global keyboard focus ring**
(`app/globals.css:200-204`, `outline: 2px solid var(--skyshare-gold)`), so the one thing
that tells a keyboard user where they are is effectively invisible on every white card in
the product, and (b) the **small-caps page-header kicker**, `text-[11px] font-bold uppercase
tracking-[0.22em] text-brand-gold`, at **110 call sites on opaque white** and 7 more on
cloudDancer (1.77:1) — 11px text at 2.05:1, which is not large text, so no exemption
applies. In dark mode both are fine (7.67:1 on `brand-panel`, 8.90:1 on the dark page) and
on the navy sidebar gold is 7.03:1. So this is not a palette problem; it is gold being used
on light surfaces, and the fix is a decision about which darker gold or which surface, which
is why it sits in UNCERTAIN rather than CERTAIN.

Second, independently: **65 of the 67 page routes serve the same `<title>`**. I confirmed
that over HTTP, not from the code — `/settings/users`, `/candidates` and `/fleet/crew` all
return `<title>SkyShare Journey</title>`. Only `app/welcome/page.tsx` and the
`app/compliments` segment export their own. A screen-reader user, or anyone with eight tabs
open, cannot tell the pages apart. There is also **no skip link anywhere** in `app/` or
`components/`, so every page begins with the full sidebar in tab order.

Third, and this is the good news worth stating because it is the part most likely to be
assumed broken: the app has real accessibility machinery already. 156 buttons carry
`aria-label`. All 15 `<img>` elements have `alt`. `components/ui/Modal.tsx` is a properly
built dialog — `role="dialog"`, `aria-modal`, focus trap, scroll lock, focus restore,
Escape — and 28 call sites use it. `lib/hooks/useDialogClose.ts` gives 11 of the 12
hand-rolled modals Escape-to-close. 23 toggle buttons carry `aria-pressed`. There are zero
positive `tabIndex` values and zero uses of `.no-scrollbar` on real content. Dark mode
passes contrast almost everywhere I checked. The failures below are specific, countable and
mostly mechanical — not a systemic absence of care.

---

## What I checked, and how

### 0. The palette, read from source

`tailwind.config.ts` (read in full) and `app/globals.css` (read in full).

```
tailwind.config.ts:14-38   brand.red #ba0c2f  cloudDancer #f0eee9  gold #eaaa00
                           sweet #a6c9e7  eden #466481  lea #0d2c43  grey #63666a
                           black #302f31  panel #10243a  field #0f2033
                           edenOnDark #8fb3d6
app/globals.css:5-38       --skyshare-page #eaf0f7   (light)
app/globals.css:64-85      .dark { --skyshare-page #0b1622; --skyshare-red #f87171; ... }
app/globals.css:86-88      .dark body { color: #e8eef5 }
app/globals.css:150        body { color: var(--skyshare-black) }  → #302f31 in light
```

Note `tailwind.config.ts:20-22` — the comment says `grey` was **deliberately darkened**
from `#76787b` to `#63666a` so small body text would pass AA. I verified both:
`#76787b` on white is **4.43:1** (fails), `#63666a` on white is **5.77:1** (passes). The
darkening worked. §1.5 is about 66 call sites that undo it with an opacity modifier.

### 1. Contrast, computed

The arithmetic, shown once in full so the rest of the table is checkable. WCAG 2.1:
channel `c` → `c/255`, then `s ≤ 0.04045 ? s/12.92 : ((s+0.055)/1.055)^2.4`; luminance
`L = 0.2126R + 0.7152G + 0.0722B`; ratio `(L_lighter + 0.05) / (L_darker + 0.05)`.

Gold `#eaaa00` → R 234/255 = 0.9176 → 0.8268; G 170/255 = 0.6667 → 0.4019;
B 0/255 = 0 → 0. `L = 0.2126(0.8268) + 0.7152(0.4019) + 0.0722(0) = 0.1758 + 0.2874 =`
**0.4624**. White `L = 1.0000`. Ratio `= (1.0000 + 0.05) / (0.4624 + 0.05) = 1.05 / 0.5124 =`
**2.05:1**.

#### 1.1 Gold first, as instructed

```
label                                          fg       bg       L_fg     L_bg     ratio   4.5:1  3:1
gold text on white card                        #eaaa00  #ffffff  0.4624   1.0000   2.05    FAIL   FAIL
white text on gold fill                        #ffffff  #eaaa00  1.0000   0.4624   2.05    FAIL   FAIL
gold on page cool-mist                         #eaaa00  #eaf0f7  0.4624   0.8653   1.79    FAIL   FAIL
gold on cloudDancer                            #eaaa00  #f0eee9  0.4624   0.8556   1.77    FAIL   FAIL
gold on brand-eden (gradient end)              #eaaa00  #466481  0.4624   0.1200   3.01    FAIL   PASS
navy text on gold fill                         #0d2c43  #eaaa00  0.0229   0.4624   7.03    PASS   PASS
brand-black on gold fill                       #302f31  #eaaa00  0.0288   0.4624   6.50    PASS   PASS
gold text on navy                              #eaaa00  #0d2c43  0.4624   0.0229   7.03    PASS   PASS
gold on brand-panel (dark card)                #eaaa00  #10243a  0.4624   0.0168   7.67    PASS   PASS
gold on brand-field (dark input)               #eaaa00  #0f2033  0.4624   0.0137   8.04    PASS   PASS
gold on dark page                              #eaaa00  #0b1622  0.4624   0.0076   8.90    PASS   PASS
slate-100 on gold fill (the dark: override)    #f1f5f9  #eaaa00  0.9085   0.4624   1.87    FAIL   FAIL
```

So gold is fine as **text on navy/dark** and fine as a **fill under navy or black text**.
It fails as text on anything light, and white/slate text on a gold fill fails in both
directions.

**Where the app actually does each.** Found by grepping for the pair on one element, not
assumed:

`text-white` on `bg-brand-gold` — 2.05:1, three sites, all the same filter-chip idiom:
```
components/candidates/CandidateTagFilter.tsx:24          on ? "border-brand-gold bg-brand-gold text-white" : …
components/candidates/CandidateStatusFilter.tsx:136      on ? "border-brand-gold bg-brand-gold text-white" : …
components/candidates/CandidateDepartmentFilter.tsx:104  on ? "border-brand-gold bg-brand-gold text-white" : …
```
Positive control that the house pairing is navy-on-gold, not white-on-gold:
`components/ui/Button.tsx:31` — `gold: "bg-brand-gold text-brand-lea hover:bg-brand-sweet hover:shadow-glow"`.
So these three are provably drift from the primitive, not a deliberate variant.

`bg-brand-gold` + `dark:text-slate-100` — 14 occurrences across 11 files. The background
has no `dark:` variant, so in dark mode near-white text lands on the same gold fill:
7.03:1 → **1.87:1**. Measured:
```
$ rg -c "bg-brand-gold[^/\w].*dark:text-slate-100|dark:text-slate-100.*bg-brand-gold[^/\w]" app components
  → 14 occurrences across 11 files
  app/compliments/page.tsx:58                              components/candidates/LinkedHistoricalPanel.tsx:96
  components/job-preview/FormattedJobPost.tsx:297          components/candidates/MoveToPreOnboardingPanel.tsx:135,227,338
  components/travel/TravelPanel.tsx:888                     components/offers/OffersWorkspace.tsx:105
  components/candidates/CandidateProfileWorkspace.tsx:437   components/jobs/JobDuplicateClusters.tsx:270
  components/recruiting-jobs/NewJobButton.tsx:160           components/new-hire-contacts/NewHireContactsView.tsx:174
  components/final-review/FinalReviewWorkspace.tsx:91,219
```

#### 1.2 The global focus ring is gold, and that is the worst case

`app/globals.css:196-207`:
```
:focus-visible {
  outline: 2px solid var(--skyshare-gold);
  outline-offset: 2px;
  border-radius: 4px;
}
:focus:not(:focus-visible) { outline: none; }
```

This is the app's *only* keyboard focus indicator — the comment says so, and
`components/ui/Button.tsx:9` and `components/ui/Input.tsx:7` both say the ring "comes from
the global `:focus-visible` rule in globals.css" rather than styling their own.

WCAG 2.1 SC 1.4.11 (Non-text Contrast, AA) requires 3:1 for "visual information required
to identify … states" against adjacent colour. The ring measures:

```
gold ring vs white card         2.05:1   FAIL
gold ring vs cool-mist page     1.79:1   FAIL
gold ring vs cloudDancer        1.77:1   FAIL
gold ring vs navy sidebar       7.03:1   PASS
gold ring vs brand-panel (dark) 7.67:1   PASS
gold ring vs dark page          8.90:1   PASS
```

The ring is therefore compliant only on the navy rail and in dark mode, and fails on every
white card and on the page ground — which is where essentially all the app's controls live.

Positive control that the ring is genuinely the only one: the Tailwind `focus-visible:`
variant is used **zero** times in `app/` or `components/`.
```
$ rg -n "focus-visible" app components lib --glob "*.{tsx,ts,css}"
components/ui/Input.tsx:7          // ring is handled globally via :focus-visible.
components/ui/Button.tsx:9         // ring comes from the global :focus-visible rule in globals.css.
lib/roadmap/roadmap.ts:987         [roadmap prose]
components/fleet/orgchart/OrgChart.module.css:105   .wrap :global(.tabstrip button:focus-visible)
components/fleet/orgchart/OrgChart.module.css:346   .wrap :global(.seg button:focus-visible)
components/fleet/orgchart/OrgChart.module.css:519   .wrap :global(.card:focus-visible)
app/globals.css:198,200,205        the global rule and its comment
components/booking/PublicBooking.tsx:295            a comment pointing at the global rule
```
Every hit is either a comment, the global rule itself, or one of three CSS-module rules
inside the org charts. Not one component sets its own `focus-visible:` ring.

#### 1.3 Twelve elements suppress that ring outright, proved from the compiled CSS

`focus:outline-none` is not cosmetic here. Tailwind 3.4.19 defines
(`node_modules/tailwindcss/src/corePlugins.js:2458-2463`):
```
'.outline-none': { outline: '2px solid transparent', 'outline-offset': '2px' },
```
so `outline-none` paints a *transparent* 2px outline — it overwrites the gold one rather
than merely removing a default.

Whether it wins is a specificity/order question, and I settled it against the CSS the dev
server is actually serving rather than reasoning about it:
```
$ grep -n "outline-none" .next/static/css/app/layout.css
3949:.outline-none {
4953:.focus\:outline-none:focus {
$ grep -n ":focus-visible{\|^:focus-visible" .next/static/css/app/layout.css
4340::focus-visible {
```
- Bare `.outline-none` (line **3949**) has the same specificity as `:focus-visible` (both
  0-1-0) and comes **earlier** in the sheet, so the gold ring at 4340 wins. **Bare
  `outline-none` is harmless.** That matters, because it is the overwhelmingly common
  spelling (127 of the 139 occurrences in `components/`).
- `.focus\:outline-none:focus` (line **4953**) is 0-2-0 — one class plus one pseudo-class —
  so it beats `:focus-visible` (0-1-0) **and** comes later. It wins twice over. **The gold
  ring is gone on those elements.**

There are exactly 12 live `focus:outline-none` occurrences (a 13th hit is a comment), and
**none** of them carries a `focus:ring*` replacement:
```
$ rg -n "focus:outline-none|focus:outline-0|focus-visible:outline-none|focus-within:outline-none" app components lib
components/booking/PublicBooking.tsx:292   ← a COMMENT explaining why this select does NOT use it
components/travel/TravelChecklist.tsx:349
components/feedback/FeedbackButton.tsx:396
components/candidates/CandidateDocuments.tsx:548
components/candidates/CandidateTagFilter.tsx:143
components/candidates/CandidateTagEditor.tsx:151
components/candidates/FlightProfilePanel.tsx:192, 218, 230, 268, 279, 337, 347
$ rg -n "focus:outline-none" app components | rg -c "focus:ring"
0
```
All 12 substitute a border-colour change (`focus:border-brand-gold`, or
`focus:border-brand-lea` at `FeedbackButton.tsx:396`). That substitute is itself weak:
the unfocused border `border-brand-lea/20` composites to `#cfd5d9` (1.48:1 on white) and
the focused border is gold at 2.05:1, so the state change is a 1.48 → 2.05 shift, nowhere
near the 3:1 SC 1.4.11 wants.

Positive control that a ring idiom does exist elsewhere: `focus:ring` / `focus-within:ring`
/ `focus:shadow-glow` appears **51 times across 36 files**
(`components/shared/EditableGrid.tsx`, `components/candidates/CandidateSearchBox.tsx`,
`components/job-editor/JobDataEditor.tsx`, …), and `tailwind.config.ts:74` even defines a
`glow-soft` shadow for it. The 12 above are the gap, not the norm.

#### 1.4 Field and card boundaries

SC 1.4.11 also covers the boundary that identifies a control. Alpha-composited against
white:
```
border-brand-lea/10  → #e7eaec   1.21:1   FAIL
border-brand-lea/15  → #dbdfe3   1.34:1   FAIL
border-brand-lea/20  → #cfd5d9   1.48:1   FAIL
border-brand-lea/25  → #c3cad0   1.66:1   FAIL
border-brand-lea/30  → #b6c0c7   1.85:1   FAIL
dark:border-white/10 on #10243a → #283a4e  1.35:1  FAIL
dark:border-white/20 on #10243a → #405061  1.90:1  FAIL
```
`border-brand-lea/20` is the default field border in both shared primitives
(`components/ui/Input.tsx:10`, `components/ui/Button.tsx:27`), so this is the whole app's
input boundary. This is a design decision with a real cost, not a bug — it goes in
UNCERTAIN with the numbers attached.

#### 1.5 The grey token is diluted back below AA at 66 sites

`tailwind.config.ts:20-22` darkened `grey` specifically to clear 4.5:1. Composited with an
opacity modifier on white it goes straight back under:
```
text-brand-grey      #63666a             5.77:1   PASS   ← the token as designed
text-brand-grey/80 → #828588             3.71:1   FAIL
text-brand-grey/75 → #8a8c8f             3.37:1   FAIL
text-brand-grey/70 → #929497             3.04:1   FAIL
text-brand-grey/65 → #9a9c9e             2.75:1   FAIL
text-brand-grey/60 → #a1a3a6             2.53:1   FAIL
text-brand-grey/50 → #b1b3b5             2.10:1   FAIL
text-brand-grey/40 → #c1c2c3             1.78:1   FAIL
text-brand-grey/70 on the page #eaf0f7   2.83:1   FAIL  (fails 3:1 as well)
```
Counts, with the positive control that makes them provably oversights:
```
$ rg -o "text-brand-grey" app components --glob "*.tsx" | wc -l      → 1855
$ rg -o "text-brand-grey/\d+" app components --glob "*.tsx" | wc -l  →   66
                                                      bare (passing) → 1789
```
1789 uses of the token at 5.77:1 against 66 diluted below 4.5:1. The full 66-line list with
file:line is in §C8 of CERTAIN.

For contrast, the opacity idiom on *navy* is fine — `text-white/55` → 5.37:1,
`/70` → 7.78:1, `/75` → 8.69:1, `/85` → 10.75:1 on `bg-brand-lea`. Only `text-white/20` and
`/25` fail (1.87:1 / ~2.2:1) and both are decorative placeholder glyphs
(`InterviewWriteUp.tsx:302,452,525`, `recent-interviews/page.tsx:131`). And
`text-brand-black/80` → 7.00:1, `/75` → 5.98:1, `/70` → 5.15:1 all pass. So the problem is
specific to `brand-grey`, which is the one token with no headroom.

#### 1.6 The org-chart dark-mode hole — corroborating visual.md, with two corrections

`docs/audit-2026-09-11/visual.md` found that `--card`, `--line`, `--danger` and `--sweet`
are referenced by the fleet org charts and defined nowhere. **I reproduced that
independently and it is correct:**
```
$ node: vars DEFINED in components/fleet/orgchart/OrgChart.module.css  → 37
$ node: vars REFERENCED under components/fleet/orgchart/              → 41
$ set difference  → --card, --danger, --line, --sweet
```
I also confirmed its two falsification checks hold: there is no `createPortal` under
`components/fleet/orgchart`, and `OrgChart.module.css:236` is `:global(html.dark) .wrap`,
keyed to the same `.dark` class `app/layout.tsx:28` sets — so dark mode *is* active on the
charts and `--ink` *is* themed (`#0d2c43` → `#e9eef5`) while those four fall back to their
light literals.

**Two corrections to its numbers**, both computed above:
- visual.md gives the modal text/background pair as "≈ **1.1:1**". The exact figure for
  `#e9eef5` on `#ffffff` is **1.17:1** (L 0.8507 vs 1.0000). Same conclusion, tighter number.

  **Independently confirmed while I was writing this.** `docs/audit-2026-09-11/chrome-live.md`
  landed at 01:52 and its Chrome-driven measurement of the rendered `PeopleIndex` panel on
  both `/fleet/crew` and `/fleet/maintenance` returns `"ratio":"1.17"` on five text samples,
  with `--card`/`--line`/`--danger`/`--sweet` read back as empty strings from
  `getPropertyValue` on the live `.wrap` while `--ink` returns `"#e9eef5"`. So the same
  number now has three independent derivations: predicted from source (visual.md), computed
  from the hex values (this file), and measured in a real browser (chrome-live.md). Treat
  1.17:1 as settled.
- visual.md gives `--danger` `#a32d2d` on `brand-panel` as "~**2.5:1**". I compute
  **2.22:1** (L 0.0985 vs 0.0168). And its inline-colour pair "around **3.0-3.3:1**" is
  actually `#c0392b` → **2.89:1** and `#b0670e` → **3.59:1** on `#10243a`; the red is worse
  than stated and the amber better.

**One thing I would soften.** `--line`'s fallback `#cdd7e2` on `brand-panel` measures
**10.79:1**. It is visually wrong in dark mode (a pale light-mode hairline) but it is not a
contrast failure — if anything it is over-contrasted. Worth separating so nobody "fixes" a
readable border while the 1.17:1 text is still there. `--sweet`'s fallback `#a6c9e7` on
panel is likewise 9.08:1.

Affected surfaces, from visual.md and re-read by me in source:
```
components/fleet/orgchart/CrewOrgChart.tsx:2484-2485   notice-date prompt   → #e9eef5 on #fff  1.17:1
components/fleet/orgchart/CrewOrgChart.tsx:2523-2524   role-change prompt   → 1.17:1
components/fleet/orgchart/PeopleIndex.tsx:95-98        "Find a person"      → 1.17:1
components/fleet/orgchart/LinkPicker.tsx:117           profile-link popover → 1.17:1
```

#### 1.7 Status colours: the -600 shades fail, the -700 shades pass, and -700 is the house norm

```
text-red-600     #dc2626 on white   4.83:1   PASS
text-emerald-600 #059669 on white   3.77:1   FAIL (body)   PASS (3:1)
text-amber-600   #d97706 on white   3.19:1   FAIL (body)   PASS (3:1)
text-red-700     #b91c1c on white   6.47:1   PASS
text-emerald-700 #047857 on white   5.48:1   PASS
text-amber-700   #b45309 on white   5.02:1   PASS
```
Counts:
```
$ rg -o "text-emerald-600" app components | wc -l →  24      text-emerald-700 → 69
$ rg -o "text-amber-600"   app components | wc -l →  16      text-amber-700   → 52
$ rg -o "text-red-600"     app components | wc -l →  89      text-red-700     → 120
```
The -700 shade outnumbers -600 in all three hues and all three -700s pass. So the 40
`emerald-600` + `amber-600` uses are an oversight by the same argument visual.md used for
missing `dark:` variants — the passing sibling is the dominant choice.

#### 1.8 Dark mode passes nearly everywhere, and that is worth recording

```
#e8eef5 body on dark page #0b1622          15.61:1  PASS
#e8eef5 body on brand-panel #10243a        13.46:1  PASS
#e8eef5 body on brand-field #0f2033        14.10:1  PASS
slate-100 #f1f5f9 on brand-panel           14.35:1  PASS
slate-300 #cbd5e1 on brand-panel           10.59:1  PASS
slate-400 #94a3b8 on brand-panel            6.13:1  PASS
brand-edenOnDark #8fb3d6 on brand-panel     7.18:1  PASS
brand-edenOnDark #8fb3d6 on brand-field     7.52:1  PASS
emerald-400 / amber-400 / red-400 on panel  8.18 / 9.42 / 5.68  all PASS
stage colours (dark) on panel: working 9.43, decided 10.32, archive 6.35, across 8.52  PASS
```
And the stage variables are correctly re-themed — light `--stage-working #0369a1` is 5.93:1
on white, dark `#7dd3fc` is 9.43:1 on panel (`app/globals.css:33-37, 77-81`).

Positive control that nothing leaks the dark text colour into light mode:
```
$ rg -o "[^:]text-slate-400" app components --glob "*.tsx" | rg -v "dark:text-slate-400" | wc -l
0                     ← zero bare uses (it would be 2.56:1 on white)
$ rg -o "dark:text-slate-400" app components --glob "*.tsx" | wc -l
1729                  ← all of them are dark-gated
```

#### 1.9 The gold eyebrow: where the 110 are

Scan: every line matching both `text-brand-gold` and `uppercase`, then walk back up to 14
lines for the nearest enclosing opaque surface class. 150 eyebrows total.
```
nearest enclosing surface = opaque bg-white ............ 110   → 2.05:1  FAIL
                          = bg-brand-lea ...............   7   → 7.03:1  pass
                          = bg-brand-cloudDancer .......   7   → 1.77:1  FAIL
                          = bg-brand-panel only ........   1
                          = nothing found in 14 lines ..  25   → unclassified
```
**The heuristic is imperfect and I caught it being wrong, which is why I hand-checked.**
A first pass matched `bg-white/5` and wrongly put `components/layout/Sidebar.tsx:478` and
`:484` in the white bucket; reading `Sidebar.tsx:464-486` shows the match was
`hover:bg-white/5` on the line itself and the sidebar ground is `bg-brand-lea` — gold there
is 7.03:1 and fine. Re-run with an opaque-white-only pattern, those two moved to
unclassified. Five of the remaining unclassified
(`app/candidates/{compare,departments,manage,views,views/[id]}/page.tsx`) sit on
`bg-gradient-to-br from-brand-lea to-brand-eden`, where gold runs 7.03:1 at the navy end
and **3.01:1** at the eden end — passes 3:1, fails 4.5:1 at 11px.

Hand-verified white-surface examples, each read in source:
```
app/settings/users/page.tsx:112-113
  <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel …">
    <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin foundation</p>
app/compliments/layout.tsx:18-20                  bg-white p-5 shadow-panel   → gold eyebrow "People"
components/command-center/CommandCenterWorkspace.tsx:22-25   bg-white p-5 → "Recruiting command center"
components/settings/SettingsWorkspace.tsx:40-41              bg-white p-5 → "Admin foundation"
components/pilot-requirements/PilotRequirementsWorkspace.tsx:53-57  bg-white p-4 → "Source evidence"
components/shared/PageStatus.tsx:10-13                       bg-white p-5 → the eyebrow prop
```
Hand-verified navy example (correctly passing):
`app/archive/page.tsx:184-187` — `<section className="rounded bg-brand-lea p-6 text-white …">`
then the gold eyebrow. 7.03:1.

Because every one of those sections is `bg-white dark:bg-brand-panel`, **the failure is
light mode only** — the same element is 7.67:1 in dark.

### 2. Accessible names on buttons, links and anchors

Static JSX scan (scratchpad script): locate each `<button>` / `<Link>` / `<a>` opening tag,
brace- and quote-aware so `className={clsx("…", x ? "…" : "…")}` does not break tag
boundaries; match the closing tag by depth; then compute four independent flags —
`aria-label`/`aria-labelledby`, `sr-only` in the children, literal or string-literal text
among the children after stripping every nested tag *and its attributes*, and `title`.

```
<button>  total = 806
   aria-label / aria-labelledby / sr-only ......... 156
   literal or string-literal text ................. 505
   title= is the ONLY name source .................  49
   no name source at all ..........................  96
       of those, children render ZERO text ........   5
<Link>    total = 170
   aria-label / aria-labelledby / sr-only .........   3
   literal or string-literal text .................  96
   title= only ....................................   9
   no name source at all ..........................  62  (all render dynamic text)
<a>       total =  35
   aria-label / sr-only ...........................   5
   literal text ...................................  18
   title= only ....................................   3
   no name source at all ..........................   9  (all render dynamic text)
```

**The honest reading of that 96.** Nearly all of them render a runtime expression —
`{t.label}`, `{person.name}`, `{STATUS_BTN[s].label}` — which *does* produce an accessible
name. Only 5 render nothing at all. My first pass over-reported badly (it counted 66
"icon-only" buttons because it stripped `{saving ? "Saving…" : "Save"}` along with the
tags); refining the classifier to keep string literals inside expressions cut it to 5. I am
recording that because the 66 figure would have been a wrong CERTAIN item.

The 5 with zero rendered text:
```
components/candidates/CandidateTagEditor.tsx:158   children = <Check className="h-3 w-3" />   ← real
components/candidates/CandidateTagEditor.tsx:165   children = <X className="h-3 w-3" />       ← real
components/employees/EmployeesWorkspace.tsx:289    <button type="button" aria-hidden className="fixed inset-0 …" />  ← real, and worse than nameless
components/employees/EmployeesWorkspace.tsx:355    same                                         ← real
components/ui/Button.tsx:69   <button … {...rest} />   ← FALSE POSITIVE: children arrive through {...rest}
```
I read `components/ui/Button.tsx` in full to confirm the last one is a forwardRef primitive
that spreads `React.ButtonHTMLAttributes`, so children and `aria-label` both come from the
caller. Not a finding.

Positive control, a sample of the 156 that are named properly:
```
components/richtext/RichTextEditor.tsx:375-378   title="Bold" aria-label="Bold" aria-pressed={marks.bold}  (and Italic/Underline/Strikethrough)
components/richtext/RichTextEditor.tsx:392-397   aria-label="Heading" / "Quote" / "Color"
components/fleet/orgchart/CrewOrgChart.tsx:478   aria-label={`Remove the ${l} opening`}
components/ui/Modal.tsx:151                      aria-label="Close"
components/layout/Sidebar.tsx:201,245,340,375,388  "Open menu" / "Close menu" / "Home" / "My preferences" / Expand-Collapse
components/fleet/orgchart/TrainingTab.tsx:436,452  aria-label={`Location for ${row.name}`} / `Status for ${row.name}`
components/people/OnboardingGridTab.tsx:258        aria-label="Select all hires"
```

**The 49 `title`-only buttons are a separate, lower-severity class.** `title` *is* the last
fallback in the accessible-name computation, so these do get a name in a screen reader —
axe's `button-name` would pass them. But `title` is invisible on touch, invisible on
keyboard focus in most browsers, and ignored by some AT configurations. They are mostly
destructive icon buttons, which is the worst place for a weak name:
```
components/interview-questions/InterviewQuestionsWorkspace.tsx:324,327   title="Edit" / "Delete"  → <Pencil/> / <Trash2/>
components/interviews/InterviewDetailWorkspace.tsx:317,320               title="Edit" / "Delete"
components/people/BusinessCardPanel.tsx:55,60,64     title="Edit card" / "Delete card" / "Copy for printer"
components/reports/ReportShareButton.tsx:120,123     title="Copy link" / "Revoke link"
components/job-editor/JobBlockAssembly.tsx:269,279   title="Adopt current block version" / "Remove block from this job"
components/travel/TravelPanel.tsx:518,590,1049,1209  title="Delete trip" / `Remove ${g}` / "Remove item" / "Delete receipt"
components/candidates/{CandidateTagFilter,CandidateStatusFilter,CandidateDepartmentFilter}.tsx:122,89,70  title="Clear … filter"
… 30 more
```

**Seven of those are worse than title-only: the rendered glyph beats the title.** In the
accessible-name algorithm, name-from-content is computed *before* the `title` fallback. A
button whose content is `✕` therefore computes the name `"✕"` and the helpful `title` is
never reached. Read in source:
```
components/fleet/orgchart/CrewOrgChart.tsx:317-324        title="Take off the chart"            content ✕
components/fleet/orgchart/CrewOrgChart.tsx:2230-2232      title="Remove departure"              content ✕
components/fleet/orgchart/MaintenanceOrgChart.tsx:157-163 title="Delete this whole section"     content ✕
components/fleet/orgchart/MaintenanceOrgChart.tsx:247-249 title="Remove"                        content ✕
components/fleet/orgchart/MaintenanceOrgChart.tsx:355-357 title="Delete this named opening"     content ✕
components/fleet/orgchart/TrainingTab.tsx:402-408         title={`Show ${row.name} on the chart`} content ◎
components/fleet/orgchart/TrainingTab.tsx:512-518         title="Delete this training record outright" content ✕
```
Positive control **in the same feature**: `components/fleet/orgchart/CrewOrgChart.tsx:478`
is the identical `×` idiom *with* `aria-label={`Remove the ${l} opening`}`. The pattern is
known in that file; it was applied once out of eight.

### 3. Keyboard paths

Scan: every `<div|span|li|tr|td|th|p|section|…>` carrying `onClick`, with independent flags
for `role`, `tabIndex` and any key handler.
```
non-interactive elements with onClick ................... 50
  no role, no tabIndex, no key handler ................. 45   (44 div, 1 th)
  partially enabled (some but not all three) ...........  1
  role + tabIndex + onKeyDown (the correct pattern) .....  4
```
Positive control — the correct pattern, verbatim:
```
components/fleet/orgchart/CrewOrgChart.tsx:1454   <div className="card" tabIndex={0} role="button"
                                                    onClick={() => openCard(g.idx)}
                                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCard(g.idx); } }}>
components/fleet/orgchart/CrewOrgChart.tsx:1521   same
components/fleet/orgchart/MaintenanceOrgChart.tsx:968  same
components/travel/TravelPanel.tsx:453             same, plus aria-expanded
```

**Most of the 45 are not real keyboard failures and I will not inflate them.** 41 of the 45
are one of two benign shapes: a full-screen dismissal backdrop
(`<div className="fixed inset-0 …" onClick={close} />`, 22 of them) or a
`onClick={(e) => e.stopPropagation()}` guard on the inner panel (11 of them). A backdrop
click is a mouse convenience whose keyboard equivalent is Escape, and §5 shows Escape is
wired almost everywhere.

The ones that are real controls:
```
components/calendar/MonthCalendar.tsx:183   an interview chip; onClick opens the interview. draggable, no role, no tabIndex, no key handler.
components/calendar/TimeGridCalendar.tsx:288 the same chip in the time-grid view.
components/fleet/orgchart/TrainingTab.tsx:345 <th className="sortable" onClick={() => toggleSort(c.key)} title={`Sort by ${c.label}`}>
                                              — a sortable column header that cannot be activated by keyboard.
components/richtext/RichTextEditor.tsx:373   onClick={blockLabelActivation} on the editor shell — a guard, not a control.
```
So **3** genuinely keyboard-unreachable controls, not 45.

**Custom popovers are built from plain buttons with no disclosure semantics.** Five
triggers, each read in source, have no `aria-expanded` and no `aria-haspopup`:
```
components/candidates/CandidateTagFilter.tsx:104        onClick={() => setOpen((v) => !v)}
components/candidates/CandidateStatusFilter.tsx:73      onClick={() => setOpen((v) => !v)}
components/candidates/CandidateDepartmentFilter.tsx:54  onClick={() => setOpen((v) => !v)}
components/employees/EmployeesWorkspace.tsx:282         Filter popover trigger
components/employees/EmployeesWorkspace.tsx:348         Columns popover trigger
```
ARIA census across `app/` + `components/`:
```
aria-pressed .... 23        role="tablist" ... 3      aria-controls ..... 1
aria-expanded ... 18        role="tab" ....... 3      aria-haspopup ..... 0
role="dialog" ....  5       aria-selected .... 3      role="menu" ....... 0
aria-modal ......   4                                 role="listbox" .... 0
                                                      role="option" ..... 0
                                                      role="combobox" ... 0
                                                      aria-invalid ...... 0
                                                      aria-describedby .. 0
                                                      aria-required ..... 0
```
Positive control that `aria-expanded` is a known idiom here — all 18 sites are accordions
and disclosures (`components/layout/Sidebar.tsx:477`,
`components/recruiting-jobs/JobListsPanel.tsx:89`,
`components/recruiting-jobs/JobScreeningPanel.tsx:600,658,715,771`,
`components/people/HireDetailsAccordion.tsx:60`,
`components/travel/TravelChecklistRollup.tsx:40`, …). The five popovers are the gap.

`tabIndex` hygiene is clean: `tabIndex={[1-9]` → **zero matches**, `tabIndex={0}` → 4,
`tabIndex={-1}` → 3. No tab-order hazards.

**Scroll containers cannot be scrolled by keyboard.** 102 elements carry an
`overflow-*-auto|scroll`; **0** carry `tabIndex`. For a region whose content is all
focusable that is fine (Tab moves focus and the browser scrolls). For a region of
non-focusable text — an import log, a preview pane — a keyboard-only user cannot reach the
bottom. I could not determine statically which of the 102 have no focusable children, so
this goes in UNCERTAIN with the count.

Separately, and overlapping the visual/UX remit: 34 of the 39 `overflow-y-auto|scroll`
declarations have **no explicit `overflow-x`**, which per the CSS overflow spec makes
`overflow-x` compute to `auto` — the exact trap CLAUDE.md documents. 5 are paired
correctly. Flagging the count only; the per-site list belongs to whoever owns that rule.

### 4. Form labels

Scan: every `<input>`, `<select>`, `<textarea>`; flags for `aria-label`,
`aria-labelledby`, an `id` that matches some `htmlFor` in the same file, and enclosure in a
`<label>` (by counting unclosed `<label>` tags earlier in the file).
```
total controls ................................. 514   (6 type="hidden" excluded → 508)
programmatically labelled ...................... 262
    aria-label ................. 85
    aria-labelledby ............  0
    id ↔ htmlFor ...............  5
    nested inside a <label> .... 176
not labelled by any of those .................... 246
    only a placeholder ......................... 101
    only a title ...............................   4
    neither .................................... 141
```
```
$ node: <label> with htmlFor ..... 5
$ node: <label> WITHOUT htmlFor . 271
```
So the app labels forms almost entirely by **wrapping**, which is valid HTML and works.

**That 246 is an overcount and must not be treated as certain.** The scan counts `<label>`
nesting *within one file*, and this codebase wraps via component composition. Concretely,
`components/scheduling/SchedulingAdmin.tsx` shows 27 "unlabelled" controls — but
`SchedulingAdmin.tsx:516-523` is:
```
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
      {label}
      {children}
    </label>
  );
}
```
and the fields at `:387-431` are `<Field label="Name"><input …/></Field>`. Those are
implicitly labelled at runtime and my scan cannot see it. Three more `Field`-shaped
wrappers exist (`app/archive/page.tsx:20`,
`components/pilot-requirements/ManagedAircraftPanel.tsx:191`,
`components/business-cards/BusinessCardVisual.tsx:7`). `components/ui/Input.tsx` contributes
3 more false positives — it is a primitive that spreads `{...rest}`, so the caller supplies
the label.

So instead of asserting a number I hand-verified the subsets where the absence is
unambiguous. Those are in CERTAIN §C3-C5. The aggregate stays in UNCERTAIN.

### 5. Dialogs

Positive control first. `components/ui/Modal.tsx` (read in full) does everything a dialog
should: `role="dialog"` + `aria-modal="true"` + `aria-label={title ?? "Dialog"}` (:136-138),
a Tab trap (:105-127), body scroll lock (:72-79), focus restore to the opener (:84-91),
initial focus into the panel (:96-102), `aria-label="Close"` on the X (:151), and
Escape via `useDialogClose` (:67). It is used at **28 call sites across 22 files**.
`lib/hooks/useDialogClose.ts` (read in full) is the shared Escape hook and even handles a
dirty-state confirm.

The 11 hand-rolled modal shells measured against it:
```
file                                                   useDialogClose  role=dialog  aria-modal  Tab trap
components/calendar/DepartmentColorEditor.tsx               yes            yes          yes        no
components/calendar/EditInterviewModal.tsx                  yes            no           no         no
components/candidates/AddJobToCandidate.tsx                 yes            no           no         no
components/candidates/DeleteCandidateButton.tsx             yes            no           no         no
components/candidates/DocumentIntake.tsx                    yes            no           no         no
components/candidates/NewCandidateButton.tsx                yes            no           no         no
components/candidates/ResumeIntake.tsx                      yes            no           no         no
components/recruiting-jobs/AddCandidateToJob.tsx            yes            no           no         no
components/recruiting-jobs/BatchAddCandidatesToJob.tsx      yes            no           no         no
components/settings/TeamMemberAccessModal.tsx               yes            no           no         no
components/settings/UsersManagementWorkspace.tsx            yes            no           no         no
components/fleet/orgchart/CrewOrgChart.tsx (2 prompts)      no*            yes          yes        no
  * CrewOrgChart rolls its own Escape handler at :1437 (`if (e.key === "Escape") closeModalRef.current()`),
    and MaintenanceOrgChart.tsx:950 does the same, so Escape works there too.
```
**Escape-to-close: 12 of 12. `role="dialog"` + `aria-modal`: 3 of 12. Tab trap: 0 of 12.**
So Tab walks straight out of every hand-rolled dialog into the page behind it, and 9 of them
announce as an unnamed `div`.

### 6. Images, landmarks, headings, tables

**Images — clean.** All 15 `<img>` in `app/` + `components/` have `alt`. There is no
`next/image` usage at all.
```
components/booking/PublicBooking.tsx:151   alt={host.name}
components/candidates/CandidateDocuments.tsx:119  alt={file.displayFilename}
components/calendar/ScheduleTimeline.tsx:67  alt={name}
components/feedback/FeedbackButton.tsx:414   alt=""          ← deliberate, a thumbnail beside its filename
components/layout/Sidebar.tsx:238,348        alt="Home"
components/fleet/orgchart/CrewOrgChart.tsx:2296  alt={`${active.name} photo`}
components/settings/FeedbackWorkspace.tsx:264  alt={shot.name}
components/settings/BrandingPanel.tsx:190,194,228  alt={logo.name} / `${logo.name} on dark` / {slot.label}
components/scheduling/SchedulingAdmin.tsx:291  alt={host.name}
components/reports/ReportsWorkspace.tsx:1509  alt="Workspace logo"
components/reports/SharedFleetProgression.tsx:27  alt="SkyShare"
app/login/page.tsx:163  alt="SkyShare"
```

**Landmarks.** `app/layout.tsx:23` sets `<html lang="en">` — present and correct.
`components/layout/AppShell.tsx:68` renders `<main className="min-w-0 flex-1">` around every
gated route, and the bare-render branch (`AppShell.tsx:21-25`, for `/book`, `/r/`,
`/welcome`) is covered because each of those pages supplies its own `<main>`
(`components/booking/PublicBooking.tsx:146`, `components/new-hire-contacts/NewHireContactsView.tsx:71`,
`components/reports/SharedFleetProgression.tsx:32`, `app/book/[slug]/page.tsx:12`,
`app/welcome/not-found.tsx:22`). I checked that specifically because "the bare branch has no
main" was my first hypothesis and it is wrong.

Two routes nest a second `<main>` inside AppShell's:
```
components/command-center/CommandCenterWorkspace.tsx:21  <main className="space-y-4">   ← rendered by app/settings/command-center/page.tsx:38
components/final-review/FinalReviewWorkspace.tsx:111     <main className="space-y-5">   ← rendered by app/review/page.tsx:11
```
Neither route matches the bare-render prefixes, so both pages ship two `main` landmarks.

**No skip link exists.** Positive control that the mechanism is available: `sr-only` appears
7 times in `app/` + `components/`, and `.sr-only` is a Tailwind built-in. A grep for
`skip.*content`, `skipnav`, `#main-content` and `id="main` across both trees returns
nothing. With the sidebar rendered first in DOM order on every gated route, a keyboard user
traverses the whole nav before reaching page content, on every navigation.

**Headings.**
```
h1 = 71   h2 = 168   h3 = 65   h4 = 3   h5 = 0   h6 = 0
```
Per-route h1, resolved one import level deep from each `app/**/page.tsx`:
```
67 page routes
  h1 in the page file ................... 21
  h1 in a directly-imported child ....... 35
  no h1 found at depth 1 ................ 11
```
I then resolved all 11 by hand rather than reporting them as failures:
- 7 are `app/compliments/*` and get their h1 from `app/compliments/layout.tsx:21`
  (verified: the layout contains exactly 1 `<h1>`).
- `app/page.tsx` and `app/command-center/page.tsx` are pure `redirect()` calls with no UI
  (both read in full).
- **`app/fleet/crew/page.tsx` and `app/fleet/maintenance/page.tsx` genuinely have no
  heading of any level.** Read in source: the page is
  `<div className="p-4 md:p-6"><CrewOrgChart …/></div>`, and
  `rg -o "<h[1-6]" components/fleet/orgchart/CrewOrgChart.tsx` and the same for
  `MaintenanceOrgChart.tsx` both return **nothing**. Two of the largest, most interactive
  pages in the app have zero document outline.

One confirmed level skip: `components/travel/TravelChecklist.tsx:89` is an `<h4>`; it is
rendered at `components/travel/TravelPanel.tsx:537`, and TravelPanel's only heading is an
`<h2>` at :235. So the sequence is h2 → h4.

16 files use h3-or-deeper as their shallowest heading. Whether each is a skip depends on
what the parent page supplies, which I did not resolve for all 16 — that list is in
UNCERTAIN.

**Tables.** Good news: the app uses real tables.
```
files containing <table> .... 22
<th> elements ............... 123
scope="…" attributes .........  0
<caption> elements ...........  0
role="table"/"grid"/"row"/"cell"/"columnheader" ... 0
```
For a simple one-axis table browsers infer header association, so 0 `scope` is a
best-practice gap, not a failure. It becomes a failure on the one table with headers on
**both** axes — the onboarding grid, `components/people/OnboardingGridTab.tsx:251-336`:
`<thead>` uses `<th>` for the hire columns (:256, :265) but the task-name row label at
**:321 is a `<td>`**, so a screen reader reading a status cell announces neither the hire
nor the task. See §C6.

### 7. Colour-alone state

Scan: self-closing `<span|div>` with `rounded-full`, a small `h-1…h-3`, and a colour `bg-`.
```
coloured status dots .................................. 16
  with aria-label / title / sr-only ...................  2
  with no text equivalent on the element itself .......  14
```
I read all 14 rather than reporting the number. **12 are decorative** — list bullets
(`components/shared/RichText.tsx:56`, `components/job-preview/FormattedJobPost.tsx:77,152`,
`components/content-blocks/BlockLibrary.tsx:278`, `components/job-editor/LayoutLab.tsx:196`),
timeline markers (`components/candidates/CandidateActivityTimeline.tsx:49`), a pulse beside
its own text (`components/shared/PageStatus.tsx:12`, read in full), a dot beside its label
(`components/layout/BuildChecklistPanel.tsx:25`), and a legend swatch whose word is right
next to it (`components/orientation/OrientationOverview.tsx:367` — `<span …/> session`).

**2 are genuine colour-alone state:**
```
components/orientation/OrientationOverview.tsx:100
  {m.sessionId ? <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500" /> : null}
  — inside a mini-month calendar cell, a 4px emerald dot is the only signal that a day has
    an orientation session. The legend at :367 decodes it visually; there is no text form.
components/candidates/CandidateDocuments.tsx:408
  {isMatch && <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-white dark:bg-brand-panel" : "bg-brand-gold")} />}
  — a gold dot is the only signal that a document matched the search.
```

**The bigger colour/shape-alone case is not a dot.** `components/people/OnboardingGridTab.tsx:41-52`:
```
function Glyph({ status }: { status: GridTaskStatus }) {
  if (status === "DONE") return (<span className="…bg-emerald-100 text-emerald-700…"><svg …/></span>);
  if (status === "TODO") return <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-brand-grey/40" />;
  return <span className="text-brand-grey/50">–</span>;
}
```
No branch emits text, the inline `<svg>` has no `<title>` and no `aria-hidden`, and the cell
button that wraps it (`:327-332`) is named only `title="Click to change"`. So on the main
onboarding grid a screen-reader user hears "Click to change" for every cell in the matrix
and cannot tell done from to-do from not-applicable.

Also worth separating from colour: the inline amber at `TrainingTab.tsx:438` carries the
words "move to line" beside it, and the status select at `:446-455` has
`label={`Status for ${row.name}`}`. Those are *not* colour-alone. I checked before counting.

### 8. lang, page titles, live regions

**`lang`** — `app/layout.tsx:23`, `<html lang="en" …>`. Present.

**Page titles — verified over HTTP, not inferred.**
```
$ grep -rl "export const metadata|export async function generateMetadata" --include=page.tsx app | wc -l
1   of 67          → app/welcome/page.tsx
$ grep -rl "export const metadata" --include=layout.tsx app
app/compliments/layout.tsx      (title: "Compliments by SkyShare")
app/layout.tsx                  (title: "SkyShare Journey")

$ curl -s http://localhost:3000/settings/users | grep -o "<title[^>]*>[^<]*</title>"
<title>SkyShare Journey</title>
$ curl -s http://localhost:3000/candidates    | grep -o "<title[^>]*>[^<]*</title>"
<title>SkyShare Journey</title>
$ curl -s http://localhost:3000/fleet/crew    | grep -o "<title[^>]*>[^<]*</title>"
<title>SkyShare Journey</title>
```
Three different routes, three identical titles. 65 of 67 routes inherit the root title.
WCAG 2.4.2.

**Live regions — 8 components out of 121.** Scan: client components that both use
`useState` and render an async outcome (`setError(`, `setStatus(`, `setSaved(`,
`setMessage(`, `setNotice(`, or the words saving/saved), split by whether the file contains
any `aria-live`, `role="status"` or `role="alert"`.
```
components rendering an async outcome ........ 121
  with a live region ........................    8
  without .................................... 113
```
The 8, as the positive control — the idiom exists and is used well:
```
components/calendar/CalendarWorkspace.tsx            components/imports/CandidateCsvImportCard.tsx
components/calendar/ScheduleInterviewForm.tsx        components/imports/ImportActionCards.tsx
components/candidates/CandidateFileUploadButton.tsx  components/jobs/JobDismissedPairs.tsx
components/duplicate-review/CandidateDuplicateScanCard.tsx   components/jobs/JobDuplicateClusters.tsx
```
(`components/imports/ImportActionCards.tsx` alone has 8 `role="status"`/`role="alert"`
regions; `CandidateCsvImportCard.tsx` pairs `role="status"` with `aria-live="polite"`.)

The 113 without include essentially every save path a recruiter uses daily —
`components/candidates/CandidateNotes.tsx`, `OfferControl.tsx`, `FlightProfilePanel.tsx`,
`components/people/OnboardingChecklist.tsx`, `components/travel/TravelPanel.tsx`,
`components/settings/UsersManagementWorkspace.tsx`, both org charts. A save, and a failed
save, are silent.

Related and measurable: **`aria-invalid` = 0, `aria-describedby` = 0, `aria-required` = 0**
across 508 form controls. No field ever marks itself invalid, and no error message is
programmatically tied to the field it describes.

---

## CERTAIN - safe for a later agent to fix without re-deriving

Each of these I read in source and each fix is mechanical. None of them changes a colour
decision — every contrast remedy is in UNCERTAIN, because picking a shade is the user's call.

**C1. `components/candidates/CandidateTagEditor.tsx:155-160` — nameless "confirm tag" button.**
Only child is `<Check className="h-3 w-3" />`; no aria-label, no title, no text.
Before: `<button onClick={() => void addTag(draft)} disabled={busy || !draft.trim()} className="rounded border border-brand-gold …">`
After: add `aria-label="Add this tag"` to the opening tag.

**C2. `components/candidates/CandidateTagEditor.tsx:162-168` — nameless "cancel" button.**
Only child is `<X className="h-3 w-3" />`.
After: add `aria-label="Cancel adding a tag"`.

**C3. `components/employees/EmployeesWorkspace.tsx:289` — an `aria-hidden` button that is still focusable.**
Before: `<button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setFiltersOpen(false)} />`
After: `<button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setFiltersOpen(false)} />`
Why: `aria-hidden` on a focusable element is a contradiction (axe `aria-hidden-focus`) — a
keyboard user Tabs onto a full-screen invisible control with no name. `tabIndex={-1}` keeps
the mouse behaviour and removes it from tab order. Escape already closes these overlays
(`EmployeesWorkspace.tsx:134` comment plus its handler).

**C4. `components/employees/EmployeesWorkspace.tsx:355` — the identical backdrop for the Columns popover.** Same fix: add `tabIndex={-1}`.

**C5. `components/pilot-requirements/ScoringSetupForm.tsx:255` — nameless range slider (category weight).**
Its visible label is a sibling `<div>{CATEGORY_LABELS[key]}</div>` at :252, not a `<label>`.
After: add `aria-label={`${CATEGORY_LABELS[key]} weight`}` to the `<input type="range">`.

**C6. `components/pilot-requirements/ScoringSetupForm.tsx:468` — nameless range slider.**
Visible label is `<span>Worth a look ≥</span>` at :467.
After: add `aria-label="Worth a look threshold"`.

**C7. `components/pilot-requirements/ScoringSetupForm.tsx:486` — nameless range slider.**
Visible label is `<span>Strong signal ≥</span>` at :485.
After: add `aria-label="Strong signal threshold"`.

**C8. `components/pilot-requirements/ScoringSetupForm.tsx:565-567` — a `<label>` that labels nothing.**
`<label className="text-sm font-medium …">{label}</label>` is a *sibling* of the
`<input type="range">` at :567, with no `htmlFor`. Clicking the label does nothing and the
slider has no name.
After: add `aria-label={label}` to the input at :567. (Equivalent alternative: give the
input an `id` and the label a matching `htmlFor`; the `aria-label` is the smaller edit.)

**C9. Two visible file inputs kept in the accessibility tree with `sr-only` and no name.**
```
components/candidates/CandidateDocuments.tsx:333   <input ref={fileInputRef} type="file" multiple accept={UPLOAD_ACCEPT} className="sr-only" …/>
components/candidates/CandidateFileUploadButton.tsx:109  <input ref={inputRef} type="file" multiple accept={acceptTypes} className="sr-only" …/>
```
`sr-only` clips visually but keeps the element focusable and announced, so a keyboard user
lands on an unnamed file-upload control. Both are triggered by a visible button, so the
right fix is to take them out of tab order: add `tabIndex={-1}` to each.
Positive control that this distinction is real: four other hidden file inputs use
`className="hidden"` (`components/feedback/FeedbackButton.tsx:400`,
`components/people/ImportHiresButton.tsx:106`, `components/scheduling/SchedulingAdmin.tsx:318`,
`components/travel/TravelPanel.tsx:1183`) → `display:none` removes them from the tree
entirely, so they are **not** findings. 2 `sr-only` + 4 `hidden` + 6 visible = the 12
`type="file"` controls the form scan counted.

**C10. Six visible, unlabelled file inputs.** Each renders as a native "Choose files"
control with no accessible name. Add an `aria-label`:
```
components/candidates/DocumentIntake.tsx:107          aria-label="Choose document files to upload"
components/candidates/ResumeIntake.tsx:115            aria-label="Choose resume files to upload"
components/imports/CandidateCsvImportCard.tsx:71      aria-label="Choose a candidate CSV file"
components/imports/ImportActionCards.tsx:145          aria-label="Choose files to import"
components/imports/ImportActionCards.tsx:314          aria-label="Choose candidate document files"
components/imports/ImportActionCards.tsx:484          aria-label="Choose PDF files to import"
```

**C11. `components/travel/TravelChecklist.tsx:89` — heading level skip.**
Before: `<h4 className="text-xs font-semibold uppercase tracking-wide text-brand-lea dark:text-slate-100">Checklist</h4>`
After: the same line with `<h3 …>Checklist</h3>`.
Why: this component renders at `components/travel/TravelPanel.tsx:537`, and TravelPanel's
only heading is the `<h2>` at :235, so h2 → h4 skips h3. No visual change — the size comes
from `text-xs`, not the tag.

**C12. Two nested `<main>` landmarks.**
```
components/command-center/CommandCenterWorkspace.tsx:21   <main className="space-y-4">   → <div className="space-y-4">
components/final-review/FinalReviewWorkspace.tsx:111      <main className="space-y-5">   → <div className="space-y-5">
```
`components/layout/AppShell.tsx:68` already wraps both routes in `<main>`, and neither
`/settings/command-center` nor `/review` hits the bare-render branch at `AppShell.tsx:21`.
`main` is not a layout class here, so swapping the tag is visually inert.

**C13. The primary sidebar never marks the current page.** `active` is computed and used
only for styling.
```
components/layout/Sidebar.tsx:497-526   const active = item.href === activeHref;   …  <Link key={item.href} href={item.href} prefetch={false} className={clsx(…)}>
   → add   aria-current={active ? "page" : undefined}
components/layout/Sidebar.tsx:169-180   the mobile-drawer copy of the same list (item.href === activeHref is inlined at :176)
   → add   aria-current={item.href === activeHref ? "page" : undefined}
```
Positive control that this is the house idiom: `aria-current="page"` already appears at
`app/archive/page.tsx:133`, `components/candidates/CandidateSegmentTiles.tsx:94`,
`components/candidates/CandidateViewTabs.tsx:24`,
`components/compliments/ComplimentsTabs.tsx:35`,
`components/interview-questions/InterviewTabs.tsx:20`. The main nav is the one that skipped it.

**C14. Neither sidebar `<nav>` has an accessible name.**
```
components/layout/Sidebar.tsx:249   <nav className="space-y-3 px-3 py-4">                      → add aria-label="Main navigation"
components/layout/Sidebar.tsx:441   <nav className="flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden px-2.5 py-2">  → add aria-label="Section navigation"
```
With two `nav` landmarks on the page, a screen reader's landmark list shows
"navigation, navigation". Positive control: `components/compliments/ComplimentsTabs.tsx:28`
already does `<nav className="flex flex-wrap gap-6" aria-label="Compliments sections">`, and
`components/fleet/orgchart/CrewOrgChart.tsx:1663` does `role="tablist" aria-label="Crew views"`.

**C15. Seven org-chart buttons whose `✕`/`◎` glyph overrides their `title`.** Name-from-content
is computed before the `title` fallback, so each announces as the symbol. Add an
`aria-label` (the `title` can stay as the tooltip), and mark the glyph decorative:
```
components/fleet/orgchart/CrewOrgChart.tsx:317          aria-label={`Take ${name} off the chart`}
components/fleet/orgchart/CrewOrgChart.tsx:2230         aria-label="Remove this departure"
components/fleet/orgchart/MaintenanceOrgChart.tsx:157   aria-label={`Delete the ${sec.label} section`}
components/fleet/orgchart/MaintenanceOrgChart.tsx:247   aria-label={`Remove ${r.name}`}
components/fleet/orgchart/MaintenanceOrgChart.tsx:355   aria-label={`Delete the ${l} opening`}
components/fleet/orgchart/TrainingTab.tsx:402           aria-label={`Show ${row.name} on the chart`}
components/fleet/orgchart/TrainingTab.tsx:512           aria-label={`Delete the training record for ${row.name}`}
```
Exact precedent in the same feature: `components/fleet/orgchart/CrewOrgChart.tsx:478` is the
identical `×` button *with* `aria-label={`Remove the ${l} opening`}`.

**C16. `components/people/OnboardingGridTab.tsx:41-52` — grid status is shape + colour with no text.**
Give each branch of `Glyph` a text equivalent. Minimal edit, one `sr-only` span per branch:
```
DONE  : <span className="…bg-emerald-100 text-emerald-700…"><svg …/><span className="sr-only">done</span></span>
TODO  : <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-brand-grey/40"><span className="sr-only">to do</span></span>
else  : <span className="text-brand-grey/50">–<span className="sr-only">not applicable</span></span>
```
and give the wrapping cell button at `:327-332` a real name instead of
`title="Click to change"`:
`aria-label={`${def.label} for ${h.name} — ${task.status.toLowerCase()}, click to change`}`.
Also add `aria-hidden="true"` to the inline `<svg>` at :45 so the check is not announced twice.

**C17. `components/people/OnboardingGridTab.tsx:321` — the row header is a `<td>`.**
This table has headers on both axes (`<th>` for hires at :256 and :265) so the task column
must be a row header.
Before: `<td className="row-wash-sticky sticky left-0 z-10 border-b border-r border-brand-lea/10 bg-white px-3 py-1.5 text-right text-brand-black dark:border-white/10 dark:bg-brand-panel dark:text-slate-100">{def.label}</td>`
After: the same element as `<th scope="row" className="…">{def.label}</th>` — keep every
class, add `scope="row"`, and add `font-normal` if the default `<th>` bolding is unwanted.
While there, add `scope="col"` to the hire `<th>` at :265 and to the corner `<th>` at :256.

**C18. Five popover triggers with no disclosure semantics.** Add `aria-expanded` and
`aria-haspopup="true"`:
```
components/candidates/CandidateTagFilter.tsx:104        aria-expanded={open} aria-haspopup="true"
components/candidates/CandidateStatusFilter.tsx:73      aria-expanded={open} aria-haspopup="true"
components/candidates/CandidateDepartmentFilter.tsx:54  aria-expanded={open} aria-haspopup="true"
components/employees/EmployeesWorkspace.tsx:282         aria-expanded={filtersOpen} aria-haspopup="true"
components/employees/EmployeesWorkspace.tsx:348         aria-expanded={colsOpen} aria-haspopup="true"
```
Precedent: 18 existing `aria-expanded` sites, e.g. `components/recruiting-jobs/JobListsPanel.tsx:89`.

**C19. Three keyboard-unreachable controls.** Each needs `role="button"` (or
`role="columnheader"` + `aria-sort` for the `th`), `tabIndex={0}`, and an `onKeyDown`
activating on Enter and Space. The exact pattern to copy is already in this codebase at
`components/fleet/orgchart/CrewOrgChart.tsx:1454-1460`:
```
components/calendar/MonthCalendar.tsx:183      the interview chip (onClick={() => onInterviewClick(…)})
components/calendar/TimeGridCalendar.tsx:288   the same chip in the time grid
components/fleet/orgchart/TrainingTab.tsx:345  <th className="sortable" onClick={() => toggleSort(c.key)}>
                                               → wrap the header text in a real <button> instead; a th
                                                 cannot take role="button" without losing its header role.
```

**C20. Twelve `focus:outline-none` occurrences remove the only keyboard focus ring.**
The minimal, provably-correct fix is to **delete the `focus:outline-none` token** from each
class string, which restores the global gold ring (`app/globals.css:200`). The
`focus:border-brand-gold` already present stays as the extra cue. Lines, all verified to
carry no `focus:ring` replacement:
```
components/travel/TravelChecklist.tsx:349
components/feedback/FeedbackButton.tsx:396
components/candidates/CandidateDocuments.tsx:548
components/candidates/CandidateTagFilter.tsx:143
components/candidates/CandidateTagEditor.tsx:151
components/candidates/FlightProfilePanel.tsx:192, 218, 230, 268, 279, 337, 347
```
(Do **not** touch the 127 bare `outline-none` occurrences — 126 in `components/`, 1 at
`app/archive/page.tsx:17`. §1.3 proves from the compiled `layout.css` that they lose to
`:focus-visible` and are harmless. Changing them is churn. The only other `app/` hit is
`app/globals.css:206`, which is the `:focus:not(:focus-visible) { outline: none }` reset
itself and must stay.)
Note this restores a ring that is itself only 2.05:1 on white — see U1. The two fixes are
independent and this one is still strictly better than nothing.

**C21. Two colour-alone state indicators.**
```
components/orientation/OrientationOverview.tsx:100
  before: {m.sessionId ? <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500" /> : null}
  after:  {m.sessionId ? <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-500"><span className="sr-only">orientation session</span></span> : null}
components/candidates/CandidateDocuments.tsx:408
  before: {isMatch && <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", active ? … : "bg-brand-gold")} />}
  after:  add  <span className="sr-only">matches your search</span>  inside that span
```

**C22. The 40 `text-emerald-600` / `text-amber-600` uses that fail 4.5:1 on white.**
This one IS mechanical despite being a colour, because the replacement is already the
house-dominant shade and the ratio is computed: `emerald-600` 3.77:1 → `emerald-700`
5.48:1; `amber-600` 3.19:1 → `amber-700` 5.02:1. Keep any `dark:` variant on the line
untouched (dark `emerald-400` is 8.18:1 and `amber-400` 9.42:1 on panel — both already pass).
24 `text-emerald-600` + 16 `text-amber-600` occurrences; `text-red-600` (4.83:1) **passes
and must be left alone**. Per-file counts:
```
emerald-600/amber-600 live in, among others: components/widgets/registry.tsx (9 of the 114 -600 total),
components/travel/TravelPanel.tsx, components/scheduling/SchedulingAdmin.tsx,
components/new-hire-contacts/NewHireContactsAdmin.tsx, components/reports/ReportsWorkspace.tsx,
components/reports/ReportShareButton.tsx, components/people/BusinessCardPanel.tsx
— run `rg -n "text-(emerald|amber)-600" app components` for the exact 40.
```

**C23. Three `text-white` on `bg-brand-gold` chips at 2.05:1.** The fix is the existing
primitive's pairing, not a new colour: `components/ui/Button.tsx:31` uses
`bg-brand-gold text-brand-lea` (7.03:1).
```
components/candidates/CandidateTagFilter.tsx:24          "border-brand-gold bg-brand-gold text-white"  → "… text-brand-lea"
components/candidates/CandidateStatusFilter.tsx:136      same
components/candidates/CandidateDepartmentFilter.tsx:104  same
```

**C24. Fourteen `bg-brand-gold` + `dark:text-slate-100` pairs that go to 1.87:1 in dark mode.**
The background has no `dark:` variant, so the fix is to **delete the `dark:text-slate-100`
token** from each class string, leaving `text-brand-lea` (7.03:1) or `text-brand-black`
(6.50:1) in both themes. Files and lines listed in §1.1.

---

## UNCERTAIN - needs a human in the morning

**U1. The global focus ring colour.** Gold `#eaaa00` at 2.05:1 on white and 1.79:1 on the
page is below SC 1.4.11's 3:1 for a focus indicator. I will not propose a replacement
because gold-is-the-focus-ring is a locked design decision (`app/globals.css:196-204`, and
both shared primitives defer to it). Three directions, with arithmetic so the choice is
informed: (a) keep gold but add a second, dark ring — e.g. `outline` gold plus a
`box-shadow: 0 0 0 4px` in `brand-lea` — which satisfies 3:1 via the navy against white
(14.40:1) while keeping the gold read; (b) darken the ring only, to roughly `#8a6400` or
below, which no longer matches brand gold; (c) accept it as a documented exception.
**What would close it:** Aimee or Jonathan choosing between "gold stays and gets a dark
companion ring" and "the ring gets its own darker token". It is one rule in one file either
way.

**U2. The 110 + 7 gold eyebrows.** Same root cause, same reason it is not CERTAIN: any fix
either changes a brand colour or moves the kicker onto a navy band. Note that
`app/archive/page.tsx:187` already shows the passing version of this exact header (gold
eyebrow on `bg-brand-lea`, 7.03:1) — so there is in-house precedent for the
move-it-to-navy option. **What would close it:** a decision on whether the page-header
kicker keeps gold on white.

**U3. Field and card boundaries at 1.21-1.85:1.** `border-brand-lea/10` through `/30` are
all below 3:1, and they are the default in `components/ui/Input.tsx:10`. This is
deliberate-looking restraint, not an accident, and changing it touches every surface in the
app. **What would close it:** a decision on whether input boundaries should be visible to
SC 1.4.11, with a target alpha (brand-lea needs roughly 45-50% on white to reach 3:1 —
`#0d2c43` at 0.48 composites to about `#8796a2`, 3.1:1).

**U4. 246 form controls my scan could not clear, and the real number is lower.** The
`SchedulingAdmin.tsx:516` `Field` wrapper proves the method's limit: labels that wrap via
component composition are invisible to a per-file scan, and I found 4 such wrappers plus the
`components/ui/Input.tsx` primitive. I hand-verified only the unambiguous subsets (C5-C10,
13 controls). **What would close it:** a rendered-DOM pass — one axe run, or a Chrome-MCP
`document.querySelectorAll('input,select,textarea')` walk computing each control's accessible
name — which settles all 508 in one shot. This is the single highest-value thing the Chrome
driver could do for accessibility.
**Do not attempt it with `read_page`.** `docs/audit-2026-09-11/chrome-live.md:140` and
CLAUDE.md both record that this app's accessibility tree comes back showing only the sidebar
and that screenshots time out. What does work is `javascript_tool` with a targeted
`querySelector` returning counts or short strings — chrome-live.md used exactly that to read
`getComputedStyle` off the live org chart. So this pass has to be a small in-page script
that walks the controls and reports a count plus a list of selectors, not an
accessibility-tree dump.

**U5. Tab is not trapped in any of the 11 hand-rolled modals.** The fix exists and is 23
lines (`components/ui/Modal.tsx:105-127`), but the correct remedy is almost certainly to
**migrate those 11 to `<Modal>`** rather than copy a trap into each — and that is a
refactor with visual consequences per dialog, not a mechanical edit. 9 of the 11 also lack
`role="dialog"`/`aria-modal`, which *is* mechanical; I left it out of CERTAIN only because
adding `role="dialog"` without a focus trap or an accessible name is a half-fix that axe
will then flag differently. **What would close it:** a call on migrate-vs-patch. If
"patch", C-list it as: add `role="dialog" aria-modal="true" aria-label="…" tabIndex={-1}`
to the panel div and lift `onKeyDown={trapTab}` out of `Modal.tsx` into a shared hook.

**U6. 113 of 121 components give no audible confirmation of a save.** The per-file fix is
trivial (wrap the status string in `role="status" aria-live="polite"`), but 113 files is a
programme, not an edit, and the right shape is probably one shared `<StatusMessage>` that
every call site adopts — which is a design decision about where status text lives.
`components/imports/ImportActionCards.tsx` is the best in-house model. **What would close
it:** agreement on a shared component and a priority order. My suggested first five, by how
often they carry a consequential outcome: `components/candidates/OfferControl.tsx`,
`components/people/OnboardingChecklist.tsx`, `components/candidates/CandidateNotes.tsx`,
`components/travel/TravelPanel.tsx`, `components/settings/UsersManagementWorkspace.tsx`.

**U7. Per-route page titles — 65 of 67 share one.** Verified over HTTP, so the finding is
certain; the *fix* is not, because every title is a wording decision and several routes are
dynamic (`/candidates/[id]`, `/people/[id]`, `/jobs/[id]` want the person's or job's name
via `generateMetadata`). **What would close it:** a title convention — e.g.
`"<Page> · SkyShare Journey"`, and for detail routes `"<Name> · Candidates · SkyShare
Journey"` — after which it is 67 small mechanical edits.

**U8. No skip link.** Certain that none exists; the fix needs one decision I should not make
alone — where it lands. `components/layout/AppShell.tsx:68`'s `<main>` has no `id`, so the
change is: add `id="main-content"` there, and put a `sr-only focus:not-sr-only` anchor as
the first child of `<body>` in `app/layout.tsx:32`. That second part touches the root layout
on every route, which is why it is here and not in CERTAIN. **What would close it:** a yes
on adding one visible-on-focus link above the sidebar.

**U9. Two pages with no heading at all** — `app/fleet/crew/page.tsx` and
`app/fleet/maintenance/page.tsx`, confirmed by `rg -o "<h[1-6]"` returning nothing for both
org-chart components. The fix needs a wording and a placement decision (the charts have
their own tabstrip at `CrewOrgChart.tsx:1663` and a visually busy header area). **What would
close it:** the two h1 strings, e.g. "Crew org chart" and "Maintenance org chart", and
whether they are visible or `sr-only`.

**U10. 16 files whose shallowest heading is h3 or deeper.** I resolved one
(`TravelChecklist.tsx`, now C11) and left the rest, because each needs its parent page
traced to know whether h2 is supplied above it. List:
`components/compliments/ProgramSettingsForm.tsx`, `components/compliments/RewardCatalogAdmin.tsx`,
`components/interviews/DebriefQueue.tsx`, `components/job-editor/ContentSourceMap.tsx`,
`components/jobs/JobDismissedPairs.tsx`, `components/jobs/JobDuplicateClusters.tsx`,
`components/jobs/JobMergedHistory.tsx`, `components/pilot-requirements/CandidateTriagePanel.tsx`,
`components/pilot-requirements/FleetPositionEditor.tsx`,
`components/pilot-requirements/ManagedAircraftPanel.tsx`,
`components/pilot-requirements/PilotRequirementEditor.tsx`,
`components/pilot-requirements/PostingCheckPanel.tsx`,
`components/pilot-requirements/ScoringSetupForm.tsx`,
`components/recruiting-jobs/JobScreeningPanel.tsx`, `components/richtext/RichTextEditor.tsx`.
(`app/pilot-requirements/scoring/page.tsx:21` does supply an `<h1>`, so `ScoringSetupForm`'s
h3s are h1 → h3 — a skip, but I did not verify the other 14 the same way.) **What would
close it:** a rendered heading-outline dump per route, which is one Chrome-MCP
`querySelectorAll('h1,h2,h3,h4,h5,h6')` per page.

**U11. 102 scroll containers, none focusable.** For a region whose content is entirely
focusable, Tab scrolls it and there is no problem. For a region of non-focusable text there
is. I could not tell statically which is which. **What would close it:** identify the
containers whose children contain no focusable element — a rendered check, or a careful read
of the ~15 preview/log panes — then add `tabIndex={0}` and a `role="region"` with a name to
those only. Adding it to all 102 would make the tab order much worse, so this must not be
applied blindly.

**U12. `text-brand-grey/NN` — 66 sites below 4.5:1.** I am listing this here rather than in
CERTAIN for one reason: dropping the opacity modifier raises contrast but also changes the
visual hierarchy the author wanted (a /50 caption is deliberately quieter than body text).
The arithmetic is unambiguous (§1.5) and the mechanical fix is "delete the `/NN`", giving
5.77:1. **What would close it:** a yes on "quiet grey text goes back to the full token". If
yes, the 66 sites are:
```
app/archive/page.tsx:114,127                      app/compliments/budget/page.tsx:184
components/candidates/ApplicationNote.tsx:112     components/candidates/CandidateComparison.tsx:438,465
components/candidates/CandidateDocuments.tsx:92,125,487   components/candidates/CandidateRow.tsx:328
components/candidates/CandidateTagFilter.tsx:143  components/candidates/CurrencyPanel.tsx:31
components/candidates/DocumentIntake.tsx:142      components/candidates/FlightProfilePanel.tsx:312
components/candidates/ManageReasonList.tsx:188    components/calendar/MonthCalendar.tsx:245
components/calendar/ScheduleTimeline.tsx:350      components/calendar/TimeGridCalendar.tsx:320
components/content-blocks/BlockLibrary.tsx:221    components/final-review/FinalReviewWorkspace.tsx:18
components/interviews/InterviewDetailWorkspace.tsx:330    components/job-editor/JobDataEditor.tsx:130
components/job-editor/JobsSandboxWorkspace.tsx:103,105,214
components/new-hire-contacts/ContactPicker.tsx:82 components/new-hire-contacts/NewHireContactsView.tsx:86
components/orientation/OrientationSessionDetail.tsx:622,767,816
components/people/BusinessCardPanel.tsx:55,60,64  components/people/CardOrderHistory.tsx:52,56
components/people/ChecklistManagePanel.tsx:323,390
components/people/EmployeeJourney.tsx:338,464,472 components/people/NewHireDetailWorkspace.tsx:419,428,430,546
components/people/NewHireDetailWorkspaceClassic.tsx:516   components/people/OnboardingArchivedTab.tsx:122
components/people/OnboardingChecklist.tsx:227     components/people/OnboardingGridTab.tsx:51,324
components/pilot-requirements/MatchCard.tsx:114   components/pilot-requirements/PilotRequirementEditor.tsx:26
components/recruiting-jobs/BatchAddCandidatesToJob.tsx:310
components/recruiting-jobs/BulkPositionSkipBar.tsx:147    components/recruiting-jobs/JobScreeningPanel.tsx:520
components/reports/ReportsWorkspace.tsx:334,1069,1172     components/richtext/RichTextEditor.tsx:448
components/scheduling/SchedulingAdmin.tsx:197     components/shared/RichTextEditor.tsx:282
components/travel/TravelChecklist.tsx:349         components/travel/TravelHubCalendar.tsx:234,376,383
components/ui/EmptyState.tsx:26
```

**U13. 49 buttons named only by `title`.** These technically have a name, so they are not a
WCAG failure and I will not put them in CERTAIN — but most are destructive icon buttons
(Delete, Revoke link, Remove item) and `title` is invisible on touch and on keyboard focus.
**What would close it:** a decision to adopt "icon button ⇒ `aria-label` always, `title`
optional as the tooltip", after which it is 49 mechanical additions. The list is in §2.

**U14. 34 `overflow-y-auto` declarations with no paired `overflow-x`.** This is CLAUDE.md's
documented spec trap and it overlaps `ux.md`/`visual.md`'s remit, so I am recording only the
count (5 are paired correctly) rather than duplicating their per-site list. **What would
close it:** whoever owns that rule confirming whether their list already covers these 34.

**U15. `--danger`, `--card`, `--line`, `--sweet`.** The remedy is visual.md's to own — it
found it and proposed the definitions (`visual.md:930-942`). I am flagging only that the
four are not equal in severity: `--card` at 1.17:1 makes four screens unreadable and is
urgent; `--danger` at 2.22:1 is bad; `--line` (10.79:1) and `--sweet` (9.08:1) are cosmetic
in dark mode and should not be bundled into the same "contrast fix" commit, or the urgent
one gets lost in the diff.

---

## Counts

| What | Measured |
|---|---|
| gold `#eaaa00` on white / cool-mist page / cloudDancer | **2.05:1** / **1.79:1** / **1.77:1** |
| gold on navy / brand-panel / dark page | 7.03:1 / 7.67:1 / 8.90:1 |
| navy on gold fill / brand-black on gold fill | 7.03:1 / 6.50:1 |
| global `:focus-visible` ring vs white card | **2.05:1** (needs 3:1) |
| `text-brand-gold` total / the uppercase eyebrow idiom | 251 / 150 |
| eyebrows on opaque white / cloudDancer / navy / unclassified | **110** / **7** / 7 / 25+1 |
| `text-white` on `bg-brand-gold` (2.05:1) | 3 |
| `bg-brand-gold` + `dark:text-slate-100` (1.87:1 in dark) | 14 in 11 files |
| `text-brand-grey` bare (5.77:1) vs `/NN` (1.78-3.71:1) | 1789 / **66** |
| `text-emerald-600` (3.77:1) vs `-700` (5.48:1) | 24 / 69 |
| `text-amber-600` (3.19:1) vs `-700` (5.02:1) | 16 / 52 |
| `text-red-600` (4.83:1, passes) vs `-700` (6.47:1) | 89 / 120 |
| bare `text-slate-400` in light mode (2.56:1) | **0** (1729 are `dark:`-gated) |
| `border-brand-lea/10 /15 /20 /25 /30` on white | 1.21 / 1.34 / 1.48 / 1.66 / 1.85 : 1 |
| org-chart `--ink` on undefined `--card`, dark mode | **1.17:1** (visual.md said ≈1.1:1) |
| org-chart `--danger` on panel | **2.22:1** (visual.md said ~2.5:1) |
| `<button>` total | 806 |
| — with `aria-label`/`aria-labelledby`/`sr-only` | 156 |
| — with literal text | 505 |
| — named only by `title` | 49 |
| — **genuinely nameless** | **4** (+1 false positive, `ui/Button.tsx:69`) |
| — glyph content (`✕`/`◎`) overriding a useful `title` | **7** |
| `<Link>` / `<a>` total | 170 / 35 |
| `<img>` elements / without `alt` | 15 / **0** |
| `next/image` usages | 0 |
| non-interactive elements with `onClick` | 50 |
| — no role, no tabIndex, no key handler | 45 (41 are backdrops or stopPropagation guards) |
| — **genuinely keyboard-unreachable controls** | **3** |
| — with role + tabIndex + onKeyDown | 4 |
| `focus:outline-none` (kills the global ring) | **12**, none with a `focus:ring` replacement |
| bare `outline-none` (harmless — proved from `layout.css`) | 126 in `components/`, 1 in `app/` (`app/archive/page.tsx:17`) |
| `focus:ring*` / `focus:shadow-glow` call sites | 51 in 36 files |
| Tailwind `focus-visible:` variant uses | **0** |
| `<input>`/`<select>`/`<textarea>` (non-hidden) | 508 |
| — labelled by aria-label / htmlFor / `<label>` nesting | 85 / 5 / 176 |
| — `aria-labelledby` | 0 |
| — not cleared by the static scan (an overcount, see U4) | 246 |
| — hand-verified nameless (sliders, file inputs) | **13** |
| `<label>` with `htmlFor` vs without | 5 / 271 |
| `aria-invalid` / `aria-describedby` / `aria-required` | **0** / **0** / **0** |
| `<Modal>` call sites vs hand-rolled modal shells | 28 / 11 |
| hand-rolled modals with Escape / `role=dialog`+`aria-modal` / Tab trap | 12 of 12 / 3 of 12 / **0 of 12** |
| `aria-hidden` on a focusable `<button>` | **2** |
| popover triggers with no `aria-expanded`/`aria-haspopup` | **5** (vs 18 correct `aria-expanded` sites) |
| `aria-haspopup` / `role=menu` / `role=listbox` / `role=option` | 0 / 0 / 0 / 0 |
| `aria-pressed` / `aria-expanded` / `role=tablist` / `aria-selected` | 23 / 18 / 3 / 3 |
| positive `tabIndex` values | **0** |
| `<html lang>` / `<main>` in AppShell | present / present |
| nested duplicate `<main>` landmarks | **2** |
| skip links | **0** (`sr-only` is used 7× elsewhere) |
| sidebar `<nav>` with `aria-label` / with `aria-current` | 0 of 2 / **0** (5 elsewhere do it) |
| headings h1 / h2 / h3 / h4 / h5 / h6 | 71 / 168 / 65 / 3 / 0 / 0 |
| routes with h1 at depth 1 / via layout / redirect-only / **no heading at all** | 56 / 7 / 2 / **2** |
| confirmed heading-level skips | 1 (`TravelChecklist.tsx:89`, h2→h4) |
| files with `<table>` / `<th>` / `scope=` / `<caption>` | 22 / 123 / **0** / **0** |
| coloured status dots / genuinely colour-alone | 16 / **2** (+ the `OnboardingGridTab` Glyph) |
| routes with their own `<title>` (HTTP-verified) | **2 of 67** |
| components rendering an async outcome / with a live region | 121 / **8** |
| scroll containers / with `tabIndex` | 102 / **0** |
| `overflow-y-auto\|scroll` with no paired `overflow-x` | 34 (5 paired) |
| elements using `.no-scrollbar` | **0** |

---

## Ranked by how completely each one blocks somebody

1. **Org-chart dark mode at 1.17:1** (visual.md's find; computed here, and measured live by
   chrome-live.md) — four surfaces unreadable, two of them observed in a browser. The "Find
   a person" index is the chart's only search, so a dark-mode user cannot look anybody up.
   Nothing below stops a task outright the way this does.
2. **Two pages with no heading and a status grid with no text** — `/fleet/crew`,
   `/fleet/maintenance`, and the onboarding grid (C16, C17, U9). A screen-reader user cannot
   orient or read state.
3. **The focus ring at 2.05:1, plus 12 elements that suppress it** (U1, C20) — a
   keyboard-only user cannot reliably see where they are, app-wide.
4. **No skip link** (U8) — the full sidebar before content, on every navigation.
5. **65 of 67 routes share one `<title>`** (U7) — no way to tell pages apart.
6. **No focus trap in 11 hand-rolled dialogs** (U5) — Tab escapes into the page behind.
7. **113 of 121 components give no audible save/error confirmation** (U6).
8. **13 hand-verified nameless form controls** (C5-C10) — 4 sliders and 8 file inputs.
9. **110 + 7 gold eyebrows at 2.05:1 / 1.77:1, and 66 diluted greys** (U2, U12) — readable
   with effort, which is what makes them easy to leave.
10. Everything else: nameless buttons (4), glyph buttons (7), `aria-hidden` focusables (2),
    nested `main` (2), popover semantics (5), colour-alone dots (2), missing `scope`,
    missing `aria-current`.
