# SkyShare Talent-Ops — working agreements

## Keep the roadmap current. Every time. Without being asked.

The development roadmap lives in `lib/roadmap/roadmap.ts` (the `ROADMAP_MARKDOWN`
string) and renders as the checklist on the **Command Center** page. It is how the
team sees what is done versus what is left, so it is only useful if it is true.

**Updating it is part of finishing the work — not a follow-up task, not something to
wait to be asked for.** If you ship, change, or drop anything that is on the roadmap
(or that should be), update `lib/roadmap/roadmap.ts` in the same change as the work.

In practice:

- **Shipped it** → mark `[x]` with a short `(MonDD)` note of what actually shipped —
  including the honest caveats (what is untested, what was skipped, what is still open).
- **Started it** → flip to `[~]`.
- **Something new surfaced** → add it as `[ ]`.
- **Dropped / turned out stale** → remove it, or say plainly that it is dead. Do not
  leave finished or abandoned work sitting as an open item.
- The same feature is sometimes listed in more than one section — update every copy.

Before you say a task is done, check whether the roadmap still tells the truth.

**Syntax rule — do not break this:** no backtick characters anywhere inside the
`ROADMAP_MARKDOWN` string. A stray backtick terminates the template literal and
breaks the build. (This has already happened once; see commit e609977.)

The format is documented in the comment block at the top of `lib/roadmap/roadmap.ts`:
`## Section`, then `- [x]` done / `- [~]` in progress / `- [ ]` to do, and text after
` — ` renders as a small note.
