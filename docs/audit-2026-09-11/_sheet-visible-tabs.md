# Recruiting Status Tracking — the VISIBLE sheet tabs

**Read directly from the Chrome sheet tab bar on 2026-09-12, ~02:10 MT, by the
chrome-live auditor. This is the authoritative list of NON-HIDDEN tabs.**

Workbook: `Recruiting Status Tracking`
`https://docs.google.com/spreadsheets/d/1ciM1uAWV1iN9Nqd2XIzj1dIt2m-tdp9bs0mNtzRpJ3U`

Read-only. I opened the workbook, read the tab bar, and scrolled it. I did not
select a cell, type anything, open a menu, or change anything.

## The answer

**21 tabs are visible in the tab bar. Zero are hidden.**

In bar order, left to right:

1. Master
2. Staffing Change Notes
3. Training Info
4. G450/G5
5. Legacy 650
6. Challenger 350
7. G200
8. 560XL
9. CJ2
10. PC-12
11. CJ3? Utah
12. CJ
13. M2
14. Phenom 100
15. Phenom 300e / Longitude
16. Referral Bonus Info
17. Sign-on/Relo Bonus
18. Training Events As Staffed
19. Budgeting Training Events
20. Pilot Mins Overview
21. Training Amount

## How I read it

The bar overflows: only **14 of the 21** fit on screen at a 1707px-wide window,
and it carries `‹ ›` scroll arrows at its right end. So counting from a
screenshot alone would have undercounted by seven. I read the DOM instead, which
holds every tab element regardless of scroll position, and then scrolled the bar
and screenshotted to corroborate.

```js
// read-only DOM query, Chrome javascript_tool
const tabs=[...document.querySelectorAll('.docs-sheet-tab')];
```

```json
{
 "totalTabElements": 21,
 "hiddenByCss": 0,
 "anyHiddenClass": 0,
 "names": ["Master","Staffing Change Notes","Training Info","G450/G5","Legacy 650",
  "Challenger 350","G200","560XL","CJ2","PC-12","CJ3? Utah","CJ","M2","Phenom 100",
  "Phenom 300e / Longitude","Referral Bonus Info","Sign-on/Relo Bonus",
  "Training Events As Staffed","Budgeting Training Events","Pilot Mins Overview",
  "Training Amount"]
}
```

Scroll check, after scrolling the bar right:

```json
{"total":21,"currentlyOnScreen":14,
 "onScreenNames":["Master","Staffing Change Notes","Training Info","G450/G5","Legacy 650",
  "Challenger 350","G200","560XL","CJ2","PC-12","CJ3? Utah","CJ","M2","Phenom 100"],
 "lastTab":"Training Amount"}
```

The visual capture of the bar shows, left to right:
`+ | [grid] | [hamburger] | (5) 🔒 Master ▾ | Staffing Change Notes ▾ | (6) Training Info ▾ |
G450/G5 ▾ | Legacy 650 ▾ | Challenger 350 ▾ | G200 ▾ | 560XL ▾ | CJ2 ▾ | PC-12 ▾ |
CJ3? Utah ▾ | C… | ‹ ›`

Two incidental details from that capture: **Master carries a padlock** (it is a
protected sheet), and Master and Training Info carry comment-count badges (5 and
6). Neither affects the tab list.

## What this settles, and the one step of reasoning it needs

The question was whether the July 2026 record of **32 tabs** — including PDP,
Pilot, On-Hold and Other tabs holding roughly 600 candidate rows — describes tabs
that are (a) hidden, (b) visible and missed, or (c) gone.

- The Drive API returned **21** sheets, and that read was proven not truncated.
  The Drive API enumerates *all* sheets in a spreadsheet, hidden ones included.
- The tab bar shows **21**, and the tab bar shows only *non-hidden* sheets.

Visible (21) equals total (21), therefore **the number of hidden sheets is zero.**
That conclusion needs both readings — the tab bar alone could never prove absence
of hidden sheets, and the API alone could never tell hidden from visible.

**Every one of the 21 names the Drive API returned is present in the bar, and the
bar contains no name that was not in that list.** I checked in both directions;
the two lists are identical, in the same order.

So the answer is **(c): those tabs are gone.** PDP, Pilot, On-Hold and Other do
not exist in this workbook in any form as of 2026-09-12. Either they were deleted
between July 2026 and now, or the July record described a different workbook.

**This is an absence claim, so here is the positive control:** the same query that
reports zero tabs named "PDP" reports 21 tabs that DO exist, listed above by name
and index. The query is not returning empty — it is returning a full, correct
roster that simply does not contain them.

## What I could NOT determine

Whether those four tabs were deleted or never lived here. Google Sheets version
history would settle it (File > Version history), but opening it is a menu action
and I was scoped to read the tab bar only. That is a question for a human with
the file open — and if ~600 candidate rows really were deleted, version history
is where they still are.
