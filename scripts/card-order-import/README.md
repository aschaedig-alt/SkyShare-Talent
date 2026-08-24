# Business-card order import

Brings the order history out of `SkyShare Business Cards Orders.xlsx` (the
`DataStatus` tab) into `BusinessCardOrder` / `BusinessCardOrderLine`.

```bash
# dry run — writes review.md, touches nothing
npx tsx scripts/card-order-import/import.ts --file "<path to the .xlsx>"

# the first batch only, to check it before the rest
npx tsx scripts/card-order-import/import.ts --file "<path>" --apply --limit 1

# everything
npx tsx scripts/card-order-import/import.ts --file "<path>" --apply

# lift the whole import back out
npx tsx scripts/card-order-import/import.ts --undo
```

## What it does and does not touch

It **only creates rows** in the two order tables. It never updates a `NewHire`,
and in particular it never touches `businessCardStatus` — that field still
answers "does this person have cards", which is a different question from "how
many times have we ordered for them".

Every id it writes goes into `UNDO.json`, so `--undo` removes exactly what this
script added and nothing else. If `UNDO.json` is missing there is nothing to
undo; if SHEET_IMPORT orders already exist the script refuses to run rather than
duplicating them.

## What was imported, 2026-08-24

9 orders, 71 lines, 70 of them matched to a person.

| Ordered | People | Received | Turnaround |
| --- | --- | --- | --- |
| 2025-07-14 | 6 | — | — |
| 2025-08-20 | 3 | — | — |
| 2025-09-15 | 4 | — | — |
| 2025-11-10 | 11 | 2025-11-17 | 7 days |
| 2025-12-29 | 6 | 2026-01-12 | 14 days |
| 2026-01-08 | 4 | 2026-01-12 | 4 days |
| 2026-02-20 | 19 | "2026" (not a date) | — |
| 2026-05-12 | 11 | — | — |
| (undated) | 7 | — | — |

Four people have been ordered more than once: Jared Esselman ×3, Case May ×2,
Jordan Wayment ×2, Chantil Hughes ×2.

## Three things the sheet does that a naive importer gets wrong

1. **Twelve of the 71 name cells carry invisible or edge whitespace** — a
   zero-width space (U+200B) on one Jared Esselman row, a tab on Jonathan
   Delgado, trailing spaces on seven more. Counting without stripping them
   reports Jared as ordered twice; he has been ordered three times.
2. **`Rich Vance` is `Richard Vance`** in the roster. Handled by an explicit
   entry in `ALIASES` rather than fuzzy matching — a wrong fuzzy match silently
   attributes one person's cards to another.
3. **`South Valley Regional` is not a person.** It is an FBO (Jared Esselman is
   its manager). Its line is imported with a null `newHireId` rather than being
   dropped, because the order really happened.

## What was deliberately left out

`Order Received By` and `Date Distributed to the Employee` are columns in the
sheet but are **empty on all 71 rows**, so there is nothing to import and no
column for them here yet. The wider after-order lifecycle (approve, pay via
Ramp, confirm SLC received the box, ship if remote) is deferred by the user's
decision on 2026-08-24 — it is documented in the Business Cards SOP and stays
there until a few more orders have gone through the manual flow.
