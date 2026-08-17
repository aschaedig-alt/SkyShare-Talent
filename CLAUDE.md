# SkyShare Journey — working agreements

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

Other Claude sessions edit this same working tree concurrently. There is ONE repo,
ONE branch, one checkout — no worktrees. Everything below exists because that is
the constraint.

**There are two roles. You are almost always the first one.**

### If you are a working agent (the default)

- **Do not commit. Do not push.** Not even when the work is finished and verified.
  You hand off instead — see "The handoff block" below.
- **Do not edit `lib/roadmap/roadmap.ts`.** Every session used to edit it, which
  made it the one file guaranteed to collide, and it let roadmap text reach the
  live site hours before the code it described. You write roadmap lines into your
  handoff block instead; the commit-and-push agent applies them.
- **Do not switch branches.** You share this working tree; changing the checked-out
  branch yanks it out from under whoever else is working.
- **Do not let a subagent run git.**
- **Claim the files you are about to work on, before your first edit** — see
  "Claiming what you are working on" below.
- Run `git status` before you finish. If you see changes you did not make, leave
  them alone and name them in your handoff so they are not staged by mistake.

### Claiming what you are working on

You cannot see the other sessions, so say out loud what you are about to touch.

**Your first action, before any edit:** list `.claude/claims/`, read what is
there, and run `git status`. The two answer different questions — a claim tells
you what somebody *intends* to touch and why, `git status` tells you what is
*already* dirty. You need both.

Then write your own claim, **before** you edit anything:

```
.claude/claims/<short-label>-<8 chars of your session id>.md
```

```
session:  paycom-gmail-scan
started:  2026-08-16 13:42 MT
status:   active          # active | handed-off
what:     Gmail-based Paycom notice scanning

paths:
  lib/paycom/scan.ts
  lib/google/user-gmail.ts          (new)
  auth.ts                           (SHARED — adding one provider scope only)

notes:
  auth.ts is shared. If you need it, say so in your claim rather than both
  editing it, and we sequence through the commit agent.
```

**One file per session, never a shared one.** A single `WORKING-ON.md` that every
session appends to would become exactly what `roadmap.ts` was — the one file
guaranteed to collide, because it is the one file everybody writes. A directory of
per-session files cannot collide. The directory is gitignored: it describes this
working tree, not the repo, and it must never be stageable by accident.

The `what:` line earns its place — it lets the next agent judge overlap by meaning,
not just by filename.

Four rules that make it work:

1. **If your paths overlap an active claim, do not just proceed.** Pick different
   work, or say so in your `notes:` AND in your handoff, so the commit agent knows
   to expect it and can sequence the commits.
2. **Scope grows — update your claim when it does.** This is the rule most likely
   to get skipped and the one that matters most. A claim that is stale by an hour
   is worse than no claim, because it is believed.
3. **At handoff**, set `status: handed-off` and name the claim file in the block.
4. **The commit agent deletes your claim when it commits your handoff.** Committing
   is what releases the files. Nobody has to tidy up.

A claim is **advisory, not a lock.** Nothing enforces it. It does not protect you
from a destructive git command, which is why "do not let a subagent run git" stays
absolute. And it cannot help when two pieces of work genuinely need the same shared
file — what it buys there is that the second agent finds out *before* editing
rather than at commit time.

If a WORKING agent's claim is hours old and `git status` shows none of its files
dirty, that session died. The commit agent clears it and says so. A dead claim must
never block live work.

**That test does not apply to the commit-and-push agent's own claim, and this
already caught somebody out.** That session keeps ONE standing claim for its whole
life, holds `lib/roadmap/roadmap.ts` by definition, and goes quiet between handoffs
rather than finishing — so "hours old with nothing dirty" is its normal resting
state, not evidence it died. Its claim says `session: commit-push-...` and names
`roadmap.ts`. Leave it alone; it clears its own when it is done, and refreshes it
rather than letting it look abandoned.

The asymmetry is real rather than a special case: a working agent with no dirty
files has either died or already been committed, and either way its claim should
go. The commit agent with no dirty files is simply waiting for you.

### If you are the commit-and-push agent

You only have this role when the user pastes handoff blocks and asks you to commit
and push. Then, and only then, see "The commit-and-push agent" below.

### The handoff block

End any turn that produced committable work by printing this, ready to copy. Keep
it in one fenced block so it survives a copy-paste, and **use no backtick
characters inside the ROADMAP lines** — they end up in a template literal that a
stray backtick will break.

```
[label — what this work was]

claim: .claude/claims/<your claim file>   (or "none" if you made no edits)

paths:
  <exact paths you touched, one per line>

do NOT stage:
  <paths modified by other sessions, or your own scratch files>

message:
  <commit subject>

  <commit body>

ROADMAP: <exact ## Section name from roadmap.ts>
- [x] <entry, in the format described under "The roadmap" below — NO DATE>
      <the commit-and-push agent stamps (MonDD) when it applies this>
      <do not touch the dates on entries that are already there>

RECORD: <facts the user told you that are not in the code — a decision they
made, a process they confirmed, a name, an address, a number. One line each.
Omit this section entirely if there are none.>

verified: lint <pass/fail>, tsc <pass/fail>, <anything you could not verify>
  <for any claim about LIVE DATA or scheduled behaviour: the query you ran and
   the raw output it returned, not your conclusion from it>
```

If you found something worth recording but produced **no** committable code — a
bug, a data problem, an idea — still emit a handoff block with `paths: none` and
just the `ROADMAP:` section. Findings must not evaporate because no code
accompanied them.

## Claims about live data: show the evidence, not the conclusion

Two sessions on Aug 2 wrote confident, false claims into handoffs. One rewrote 28
roadmap dates onto "today" — on lines citing their own commit hashes, which
disproved it in one command. The other announced that the next morning's
orientation reminder WOULD NOT SEND because the armed-sessions row "does not
exist". The row existed, held both upcoming sessions, and the cron's own log
showed it running daily. Both would have reached the team as fact.

**Both were ABSENCE claims, and that is the pattern to distrust.** A query that
returns nothing looks identical whether the thing is absent or your query was
wrong — wrong scope, wrong key, wrong table, wrong spelling. Empty is not proof.

Three rules:

1. **Paste the command and its raw output**, not your reading of it. "Checked
   read-only against the live database — the row does not exist" is unfalsifiable
   prose. The query plus what it returned is checkable by whoever reads it.
2. **A negative claim needs a positive control.** If you are asserting something
   is missing, show something from the SAME query that IS there. Do not ask "is
   `reminder-armed` present" — list every row in that scope and show the four you
   got back. That one habit would have caught the Aug 2 false alarm before it was
   written.
3. **If your claim would change what somebody does today** — a send will not
   happen, data is missing, a deploy is broken — say so explicitly in the handoff
   so the commit-and-push agent re-checks it against the live source before it
   reaches `roadmap.ts`. Being wrong in that direction is expensive: it sends
   somebody to fix what is not broken and teaches them to distrust the instrument.

This applies to the commit-and-push agent too: verify any load-bearing claim about
live data or scheduled behaviour before writing it into the roadmap, and say in
the commit message that you did.

**`RECORD:` is for what the user told you, not what you built.** Answers arrive
in chat and die there: a decision ("contractors stay excluded"), a confirmed
process ("HR emails payables@ with the receipts"), a name, an address, a number.
None of it is in the code, none of it is in git, and the next session has no way
to reach your conversation. Put each one on its own line and the commit-and-push
agent writes it into the roadmap alongside the work. If a question you asked got
answered, that answer belongs here — including "no" and "leave it as it is",
which are the ones most often lost and most often re-asked.

## The roadmap

The development roadmap lives in `lib/roadmap/roadmap.ts` (the `ROADMAP_MARKDOWN`
string) and renders as the checklist on the **Command Center** page. It is how the
team sees what is done versus what is left, so it is only useful if it is true.

**Keeping it current is still part of finishing work — but you do not edit the
file.** You write the entry into your handoff block; the commit-and-push agent
writes it into `roadmap.ts` as the last commit before the push. The entry therefore
ships in the same push as the code it describes, which is the point: the roadmap can
no longer claim something is live before it is.

**Not every thought belongs on it.** A passing idea, a maybe-someday, a preference —
leave those out. It records work: shipped, in progress, genuinely queued, or a real
problem found. If it would not change what somebody does next, it is noise.

**Do NOT put a date in your handoff's ROADMAP lines.** Write the entry with no
`(MonDD)` at all; the commit-and-push agent stamps it at commit time. A working
session cannot know the date the entry actually ships — it may sit in a handoff
for hours, or overnight, and a session that computes "today" in UTC gets it wrong
after 6pm Mountain. This has now gone wrong in both directions: correct dates were
"corrected" to the day before, and a later pass rewrote a week of Jul 28–30 entries
to Aug 2, on lines that cited their own commit hashes. Leave the date out and it
cannot drift.

Write entries in this form:

- **Shipped it** → `[x]` and what actually shipped — including the honest caveats
  (what is untested, what was skipped, what is still open). No date; it is added
  for you.
- **Started but not finished** → `[~]`.
- **Something real surfaced** → `[ ]`.
- **Dropped / turned out stale** → say plainly that it is dead, or have it removed.
  Do not leave finished or abandoned work sitting as an open item.
- The same feature is sometimes listed in more than one section — say so in the
  handoff so every copy gets updated.

**Syntax rule — do not break this:** no backtick characters anywhere inside the
`ROADMAP_MARKDOWN` string, which means none in the ROADMAP lines of your handoff
either. A stray backtick terminates the template literal and breaks the build.
(This has already happened once; see commit e609977.)

The format is documented in the comment block at the top of the file: `## Section`,
then `- [x]` done / `- [~]` in progress / `- [ ]` to do, and text after ` — ` renders
as a small note.

## The commit-and-push agent

One session commits and pushes. It is the only one that touches git history or
`lib/roadmap/roadmap.ts`. You are in this role **only** when the user pastes handoff
blocks and asks for it.

Work through them one at a time, in the order given:

1. `git status` first, then read `.claude/claims/`. Anything modified that no
   handoff block claims belongs to a session still working — **leave it alone**,
   and say so rather than guessing. The claims directory usually tells you whose
   it is and what they are doing, which beats guessing from filenames.
2. For each block, stage **only** its listed paths — `git add path/to/file`, one
   path at a time. **NEVER `git add -A`, `git add .`, or `git commit -a`.** A
   previous session clobbered a sibling's uncommitted work doing exactly that.
3. `git diff --cached --stat` before each commit. If the shape does not match what
   the block described, stop and report.
4. Commit that block with its own message. **One commit per handoff block** — a
   single mixed commit cannot be reviewed or reverted per-agent.
5. Delete that block's claim file from `.claude/claims/` once its commit lands.
   Committing is what releases the files, so the directory stays honest without
   anyone tidying up. Also clear any WORKING agent's claim whose session has plainly
   died — hours old and none of its files dirty — and say that you cleared it.
   **Not your own**: yours is a standing claim held for the whole session and it
   looks identical to a dead one between handoffs. Keep it, and refresh it so the
   next reader is not left wondering.
6. Repeat for the next block. Do not batch.

Then, once all the work is committed:

7. Apply every `ROADMAP:` section into `lib/roadmap/roadmap.ts` — into the named
   section, in the stated format, **no backticks**. Flip any existing `[~]` whose
   only remaining step was shipping. Commit that on its own.
   - **You add the date, and only you.** Handoff blocks arrive without one. Take
     it from the system clock in **Mountain time** (`Get-Date`), not from a UTC
     timestamp and not from memory — after 6pm Mountain, UTC is already tomorrow.
     Stamp `(MonDD)` on each `[x]` as you write it in.
   - **Never bulk-rewrite existing dates.** A dated entry is a record of when
     something shipped, not a field to refresh. If one looks wrong and it cites a
     commit, check it — `git log -1 --format=%ad <hash>` settles it — and correct
     only that entry, saying so. Two separate passes have collapsed a week of real
     dates onto "today"; both were caught only because the hashes disproved them.
   - **Write every `RECORD:` line into the roadmap too**, in the section the work
     belongs to. These are the user's own answers — a decision, a confirmed
     process, a name or a number — and the roadmap is the only place they survive
     the session that heard them.
8. Verify the COMBINED tree, because what gets pushed is everyone's work merged and
   no single agent tested that state: `npm run lint` and
   `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`
   (unpiped — piping hides an OOM crash as a false pass).
9. Push once, only if both are clean.

Pushing to `main` auto-deploys to the live site, so one push is one deploy. If the
batch is large, that is a reason to split it across pushes, not to trust it.

**Do not let a subagent run git**, in this role either.

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

Local dev **bypasses auth**. `canEdit`/admin is role-gated in prod, so a control you
can click locally may be hidden for a real user.

**File storage is no longer local (changed Jul 30).** `.env.local` now sets
`FILE_STORAGE_PROVIDER=s3` with real AWS keys, so **a file written from `npm run dev`
lands in the live production bucket**. Together with the shared database above, that
means localhost is live on *both* axes — a test upload is a real object next to real
candidate documents.

It was changed deliberately, to fix this: the Jul 27 Adobe Sign backfill was run from
the laptop, and local-disk storage against a shared database wrote **411 rows into the
live database pointing at S3 keys that were never uploaded**. Every one showed on a
profile, failed to open, and still counted as satisfying the document checklist — so a
recruiter believed a signed application was on file when it could not be produced. 308
were on active candidates; one was already Hired. All were repaired Jul 30 (the bytes
were still on the dev machine). See `scripts/candidate-file-audit.ts`.

Because `.env.local` is gitignored, none of this is visible in the repo — do not infer
storage behaviour from the code alone.

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
