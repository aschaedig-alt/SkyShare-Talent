# Resurrected merged-away candidate — undo record (2026-08-31)

Undo and review records for re-archiving a candidate that had been merged away and
was then brought back into the live pool by a job link. **Applied to the shared
live database.** This file is the only way to reverse it.

## What happened

`app/api/candidate-applications/route.ts` un-archived **any** archived candidate
attached to a job. It excluded employed hires but not merged-away rows, so linking
a job to a tombstone flipped it back to `ACTIVE`.

Found via feedback `cmthjmp2y`, which reported the duplicate scan showing "3
possible pairs" while displaying nobody. That symptom was a display fault; this was
the data fault underneath it.

| row | status before | files | metrics |
|---|---|---|---|
| `cmqjupt5b000504l2q6ozjcz7` (merged away 2026-06-27) | **ACTIVE** | 0 | 0 |
| `cmqvr4z3r0fknxcrmnt8p5a4q` (the keeper) | ARCHIVED | 3 | 21 |

Both rows are the same Matthew Smith, on one email and one normalized phone. The
hollow shell was in the scan pool; the record holding the evidence was not.

## What was changed

One row, and only the two fields the route had changed:

- `status` — `ACTIVE` → `MERGED`
- `archivedAt` — `null` → `2026-06-27T04:40:18.367Z`, the `mergedAt` recorded in
  its own `mergeHistoryJson`

Nothing else. `stage`, contacts and applications were left exactly as they were.

**The application was deliberately not touched.** The resurrection created one on
the shell, but the keeper already has an application to the same job (Pilatus PC-12
Captain, 2026-06-19). Moving it would duplicate; deleting it would be destructive.
Archiving the shell takes it out of view with nothing destroyed.

## The guard ships with this

`app/api/candidate-applications/route.ts` now excludes rows carrying
`mergeHistoryJson` from reactivation. **Running this script without that guard
fixes nothing** — the next job link would undo it. Fix order was: guard first, row
second.

## Undoing

```bash
npx tsx scripts/fix-resurrected-candidate.ts --undo
```

Restores `status` and `archivedAt` to the values in `UNDO.json`, which was written
before anything changed.

The script is dry-run by default and prints its resolved undo path, so it can be
inspected without writing. It scans for the whole condition — every candidate
carrying merge history that is not archived — rather than a hardcoded id, so it
also covers any future recurrence.

## Verified after applying

Read back independently, not from the script's own output: 32 candidates carry
merge history, **0 are live**, and all 32 are `MERGED`. The keeper is untouched at
3 files and 21 metrics.

## One trap, recorded because it cost time

`mergeHistoryJson` is a **`String` column, not `Json`** — it arrives as raw text and
must be parsed. The first version of this script used an object-shaped check, found
the row, and silently skipped it while reporting "nothing to do". The dry run is
what caught it.
