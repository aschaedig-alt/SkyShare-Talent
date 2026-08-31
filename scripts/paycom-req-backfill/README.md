# Paycom requisition backfill — undo record (2026-08-30)

Review and undo record for moving a Paycom requisition **number** out of the
Jazz-code column into its own. **This was applied to the shared live database.**
The undo record here is the only way to reverse it, which is why it is committed
rather than left in a gitignored output directory.

The script is `scripts/backfill-paycom-req.ts`. Dry run by default; it writes
`review-paycom-req.txt` on every run and `undo-paycom-req.json` only on `--apply`.

## Why

`Job` carries two requisition columns on purpose. `jobReqId` holds the Jazz-era
codes (`AMA.1`, `CJ2PIC.2`); `paycomReqId` holds Paycom's plain numbers (`3296`).
They are different schemes and will never match each other, so a Paycom number
filed under `jobReqId` is a key nothing can match against — and Paycom's "Offer
Accepted" notice quotes that number, which is one of only two exact keys we get.

## What was applied

One row.

| Job | Was | Now |
|---|---|---|
| `Maintenance Technician` (RETIRED) | `jobReqId=2619`, `paycomReqId=null` | `jobReqId=null`, `paycomReqId=2619` |

Confirmed by the user on 2026-08-30 as a genuine Paycom requisition. Its `source`
is `Created in app`, so it was typed into the wrong box on the new-job form — the
importer never wrote it.

State read back immediately afterwards, read-only: of 45 unmerged job rows
carrying a requisition, **0** now have an all-digits `jobReqId` (was 1) and **4**
have `paycomReqId` populated (was 3). The 44 genuine Jazz codes were untouched.

## Not a blanket rule

A numeric `jobReqId` is not proof of anything on its own — a Jazz code could be
numeric too. The script therefore moves **only** values listed in its `CONFIRMED`
set, each confirmed by a human. Anything else numeric is reported in the review
file and left alone. To backfill another one, add its number to `CONFIRMED` with
a note saying who confirmed it, then dry run first.

## The importer bug this does not fix

The reason a Paycom number could reach `jobReqId` at all from an import is fixed
separately in `lib/imports/job-import.ts` (`splitRequisitionId`), which routes a
requisition by the shape of its value. That fix and this cleanup are independent:
no Paycom CSV had ever been imported, so the importer had not yet mis-filed
anything.

## Undoing

```bash
npx tsx scripts/backfill-paycom-req.ts --undo
```

Reads `undo-paycom-req.json` from this directory and restores both columns to
what they held before. Undo writes to the shared live database exactly as
`--apply` does — there is no dry run for it.
