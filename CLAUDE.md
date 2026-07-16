# SkyShare Talent-Ops — working agreements

Read this before changing anything. Most of these are here because ignoring them
has already caused real damage.

---

## The database is shared and live

There is ONE Neon Postgres database and **both local dev and production point at
it**. There is no test database. Any data you write — from a script, a seed, or a
"quick fix" — is immediately live for the whole team.

Before writing data:

- Prefer a **dry run that emits a review file** the user can read first.
- Make it **reversible** (an `--undo` path, a soft-archive, a recorded list of what
  you changed) rather than destructive.
- Try a **small batch**, verify it, then run the rest.

Read-only exploration is free. Writes are not. When in doubt, ask.

## Multiple agents work in this repo at the same time

Other Claude sessions edit this same working tree concurrently.

- **NEVER `git add -A`, `git add .`, or `git commit -a`.** Stage only the exact
  paths you touched: `git add path/to/file`.
- A previous session **clobbered a sibling's uncommitted work** doing exactly this.
- Run `git status` before staging. If you see changes you did not make, leave them
  alone — do not commit another session's half-finished work.
- **Do not let a subagent run git.**
- **Do not switch branches.** You share this working tree; changing the checked-out
  branch yanks it out from under whoever else is working.
- Commit or push only when the user asks. Pushing to `main` auto-deploys to the
  live site.

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

The format is documented in the comment block at the top of the file: `## Section`,
then `- [x]` done / `- [~]` in progress / `- [ ]` to do, and text after ` — ` renders
as a small note.

## The design system is locked

- **4px corners everywhere.** `tailwind.config.ts` collapses the whole radius scale
  to 4px, so any `rounded-*` class yields 4px. `rounded-full` is deliberately
  untouched and is for **circles only** (avatars, icon chips). **Pills are
  rectangles — never `rounded-full`.**
- **Page background:** cool-mist `#eaf0f7` (`--skyshare-page`, `app/globals.css`).
- **Brand tokens** (`tailwind.config.ts`): `lea #0d2c43` (navy), `gold #eaaa00`,
  `eden #466481`, `sweet #a6c9e7`, `cloudDancer #f0eee9`.
- **Selected state** = navy + gold. **Hover** = gold glow.
- **Dark mode ships** (opt-in toggle) — style both light and dark.

Match the surrounding components rather than inventing new styling.

## Anything that navigates must be a real link

The user's rule: if a click changes the **whole screen** to another page, use a real
`<Link href>` so it is ctrl/right-clickable into a new tab. If a click only swaps a
**detail pane on the same page**, a `<button onClick>` is correct. Do not use
`router.push` for content navigation.

## Local dev is not production

Local dev **bypasses auth** and writes files to **local disk**. Production uses real
auth and **S3** (`FILE_STORAGE_PROVIDER=s3`). `canEdit`/admin is role-gated in prod,
so a control you can click locally may be hidden for a real user. Never assume a
storage-backed feature works in prod just because it worked locally.

## Tooling gotchas that will waste your time

- **Prisma client is generated to `prisma/generated/client`**, not the default
  location. Import from `@/lib/prisma` in app code. Ad-hoc scripts need `npx tsx`
  (not plain node) and import from `prisma/generated/client/client`.
- **`npm run build` can OOM** after compiling. Use
  `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.
- **The Browser pane cannot read this app's rendered content** — the streamed DOM is
  not visible to `innerText` and screenshots time out on PDF pages. Verify **over
  HTTP** instead (request the page and grep the HTML), or read the accessibility
  tree via `read_page`.
- **EditableGrid** (`components/shared/EditableGrid.tsx`) re-runs its layout init
  whenever the SET of panel ids changes or the `panels` array identity churns —
  which collapses/overlaps the layout. Always render a **stable panel set** (show
  placeholders instead of conditionally adding/removing panels) and **memoize** the
  array.
