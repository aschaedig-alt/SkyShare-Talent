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
- **`npx tsc --noEmit` OOMs too, and it FAILS SILENTLY IF YOU PIPE IT.** The crash
  message goes to stderr and the type errors never print, so
  `npx tsc --noEmit | grep MyFile` returns nothing and looks like a pass. Two real
  errors hid behind a "clean" typecheck this way. Always run it as
  `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`, and
  read the whole output rather than grepping for the file you touched.
- **Use `npm run build:check`, never bare `npm run build`.** The build output
  directory belongs to the DIRECTORY, not the git branch, so a build and a live
  dev server were writing the same `.next` and corrupting it. The errors point
  nowhere near the cause — `Failed to collect page data for /api/book/[slug]`,
  then `Cannot find module for page: /_document` — and the only cure was deleting
  `.next`. `build:check` sets `NEXT_DIST_DIR=.next-check` so it lands elsewhere
  and the dev server keeps `.next`. Verified: a `build:check` completes cleanly
  with a dev server live. Bare `npm run build` still collides — don't use it.
- **Lint is a push gate now.** `.githooks/pre-push` runs `npm run lint` (~28s) and
  blocks the push on errors; warnings pass. This exists because three
  `no-explicit-any` errors reached main on Jul 28 and every Vercel deploy after
  them failed silently for hours while sessions believed their work was live.
  Enabled via `git config core.hooksPath .githooks` — already set in this tree,
  and inherited by worktrees. `--no-verify` is the human's escape hatch; agents
  must not use it.
- **Don't start a second dev server just to look at something.** Ports are taken
  by other sessions' servers; `autoPort` in `.claude/launch.json` will hand you a
  fresh one, which is fine, but two servers still share `node_modules` and the
  Prisma client. Prefer verifying over HTTP against whatever is already running.
- **Secrets are split across TWO env files, and `.env` is the smaller one.**
  `.env` holds only `DATABASE_URL`; `.env.local` holds `NEXTAUTH_URL`,
  `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_ENV`, `ANTHROPIC_API_KEY` and
  `FRONT_API_TOKEN`. Next.js loads both (`.env.local` wins), so the app is fine —
  but `import "dotenv/config"` reads **`.env` only**, so an ad-hoc script silently
  sees no Front/Anthropic token. Prisma scripts appear to work purely because
  `DATABASE_URL` happens to live in `.env`. For scripts use
  `node --env-file=.env.local …`, or load both paths explicitly (`.env.local`
  first, so it takes precedence). **Do not "fix" this by copying vars between the
  files** — duplicated secrets drift on the next rotation. This already produced one
  confidently wrong "the token is missing" claim.
- **The Browser pane cannot read this app's rendered content.** Worse than it sounds,
  and re-confirmed on `/travel` 2026-07-16: `body.innerText` returns ~136 chars,
  `main` holds ~74, `read_page`'s accessibility tree shows **only the sidebar**, and
  **screenshots time out everywhere** (not just PDF pages). `body.textContent` looks
  huge but is mostly `<script>` payload — it will blow your context, not inform you.
  The one thing that does work is a **targeted `querySelector`** returning counts or
  short strings (`querySelectorAll('button')` correctly found the page's rows).
  So: verify **over HTTP** (request the page and grep the HTML) — that catches render
  failures and error boundaries. **Client-side interaction is effectively unverifiable
  here**; say so plainly rather than implying a click path was tested.
- **EditableGrid** (`components/shared/EditableGrid.tsx`) re-runs its layout init
  whenever the SET of panel ids changes or the `panels` array identity churns —
  which collapses/overlaps the layout. Always render a **stable panel set** (show
  placeholders instead of conditionally adding/removing panels) and **memoize** the
  array.
