# G450 & GV Captain — hour gate correction (2026-08-30)

Review and undo record for correcting the hour gates on the ACTIVE
**G450 & GV Captain** requirement. **This was applied to the shared live
database.** The undo record here is the only way to reverse it, which is why it is
committed rather than left in a gitignored output directory.

The script is `scripts/fix-g450-gates.ts`. Dry run by default; it writes
`review-g450-gates.txt` on every run and `undo-g450-gates.json` only on `--apply`.

## Why

The stored gates did not match the job posting, on a live role carrying **31
applications**. Found by reading the posting text stored on the requirement itself
and comparing it against the gates — the first real finding from the
check-against-posting work.

The two wrong numbers failed in opposite directions at the same time:

- `total_time` 4,000 was **too loose** — pilots with 4,000–4,999 hours passed a
  minimum the posting does not grant them.
- `jet_time` 2,000 was **too strict** — qualified pilots with 1,500–1,999 jet hours
  were screened out.

## What was applied

| Gate | Was | Now |
|---|---|---|
| Total Time | 4,000 | **5,000** |
| PIC Time | 3,000 | 3,000 (unchanged) |
| Multi-Engine Time | 2,000 | 2,000 (unchanged) |
| Jet Aircraft Time | 2,000 | **1,500** |
| Total Time in Type | 250 | **1,000** |
| PIC Time in Type | off | **250**, switched on |

Read back immediately afterwards, read-only: all six gates ON at 5,000 / 3,000 /
2,000 / 1,500 / 1,000 / 250. No boolean gate was touched, and nothing outside this
one ACTIVE requirement was touched.

## The numbers are the user's, and they differ from the posting

Supplied directly on 2026-08-30: 5,000 total / 3,000 PIC / 2,000 multi / 1,500 jet
/ 1,000 in type / 250+ PIC in type.

**This is not a literal reading of the posting**, which says "1000 PIC hours in the
G450/550 and/or GV" — that reads as PIC-in-type 1,000, not total-in-type 1,000 with
250 PIC. The user's figures were used because the user sets the hiring bar, and the
difference was flagged at the time.

The consequence is live and expected: running "Check against posting" on this role
now reports `PIC Time in Type: stored 250, posting 1000` and `Total Time in Type:
stored 1000, not mentioned in the posting`. That is the checker doing its job. It
will keep reporting it until either the posting wording or the gates change —
resolve it in one place or the other rather than by ignoring the finding.

## Undoing

```bash
npx tsx scripts/fix-g450-gates.ts --undo
```

Reads `undo-g450-gates.json` from this directory and restores each gate's previous
`enabled` and `numericValue`. Undo writes to the shared live database exactly as
`--apply` does — there is no dry run for it.
