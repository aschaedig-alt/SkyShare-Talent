# Open-roles reconciliation — undo records (2026-08-28)

Undo and review records for the four-step pass that reconciled Jobs, Pilot
Requirements and the Matchboard against the roles SkyShare is actually hiring
for. **These files were applied to the shared live database.** They are the only
way to reverse it, which is why they live here rather than in a gitignored
output directory.

The scripts themselves are `scripts/reconcile-open-roles.ts`,
`scripts/create-open-roles.ts`, `scripts/apply-job-post-requirements.ts` and
`scripts/apply-rotations-and-bases.ts`. Each is dry-run by default, writes its
review file, and only writes to the database with `--apply`.

## What was applied, in order

| # | Script | What it changed |
|---|---|---|
| 1 | `reconcile-open-roles` | 22 requirements ACTIVE → INACTIVE, 3 `operatorType` corrections, tail N787JS attached to the Henderson G450 First Officer |
| 2 | `create-open-roles` | 5 requirements, 6 jobs and 2 managed variants created; 4 job merges via `lib/jobs/merge.ts`; PC-12 First Officer repointed onto its open job; Aircraft Maintenance Apprentice job set RETIRED; Evergreen PDP requirement set INACTIVE |
| 3 | `apply-job-post-requirements` | 6 requirements rebuilt from the job-post PDFs |
| 4 | `apply-rotations-and-bases` | 53 rotations set as fleet policy, Praetor 600 rebased to Ogden |

State immediately afterwards, read back read-only:
`PilotRequirement` — ACTIVE 9, HISTORICAL 32, INACTIVE 25, total 66.
14 OPEN unmerged jobs.

## Undoing

**Reverse order.** Later steps were applied on top of earlier state, so undoing
forwards will not restore what you expect.

```bash
npx tsx scripts/apply-rotations-and-bases.ts --undo
npx tsx scripts/apply-job-post-requirements.ts --undo
npx tsx scripts/create-open-roles.ts --undo
npx tsx scripts/reconcile-open-roles.ts --undo
```

Each reads its own `undo-*.json` from this directory. Undo writes to the shared
live database exactly as `--apply` does — there is no dry run for it, so be as
sure as you would be before running the forward pass.

The step-2 merges are undone through `undoMerge` in `lib/jobs/merge.ts`, so the
applications move back with their `JobMergeRecord`. The other steps restore
recorded field values.

## Why this directory is not `scripts/_reconcile_output/`

That was the original location and `.gitignore` carries `scripts/_*_output/`, so
the undo records could not be committed and existed only on one laptop. Every
other live-data script in this repo commits its undo record under
`scripts/<work-name>/` — `bg-check-step`, `card-order-import`,
`contacts-link-step`, `requirement-consolidation`, `travel-time-fix`. This
directory follows that convention; the four scripts write here directly.
