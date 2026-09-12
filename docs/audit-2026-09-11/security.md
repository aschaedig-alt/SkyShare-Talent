# Security and permissions audit — 2026-09-11

Round 1, read-only. Role key `security`. Claim: `.claude/claims/r1-security-afdc0817.md`.
No git was run. No database writes. No file uploads. No email paths invoked. No browser tool.
Evidence is the code path plus read-only SELECTs and four non-mutating GETs against the
dev server already running on `http://localhost:3000`.

**READ THIS BEFORE BELIEVING ANY HTTP RESULT IN THIS FILE.** Local dev bypasses auth
entirely — `lib/auth/auth-config.ts:28 isAuthRequired()` returns false when
`NODE_ENV === "development"` with no `VERCEL_ENV`/`VERCEL`, and `lib/auth/route-auth.ts:80
localBypassUser()` then hands every request an **ADMIN with `viewer: null`**, which every
scoping helper reads as unrestricted. So a 200 from localhost proves nothing at all about
production authorization, and I have not used one that way anywhere below. The four HTTP
checks I did run are all ones whose gate does **not** depend on auth (a share token), which
is why they are worth something.

---

## Headline

The API surface is in much better shape than the project's own history suggests: **235 of
245 exported HTTP handlers call a canonical auth helper in their own body**, every one of
those 235 branches on the result, and after tracing all 19 candidates I found **zero
unauthenticated write routes and zero unauthenticated PII reads that are not public by
design**. The real exposure is one layer down, in *object-level* authorization, and it has
a live holder today: **the department restriction (`restrictCandidatesToDepartment`) is
enforced at only 4 places, all of them list-shaped queries, and at none of the 28
per-record gates.** `getCandidateProfileData` (`lib/data/candidates.ts:1608`) checks the
hand-picked allowlist and nothing else, so the one live department-scoped HIRING_MANAGER —
`rp***@skyshare.com`, `restrictCandidatesToDepartment = true`, read out of the live
database below — is narrowed on `/candidates`, on Compare and on saved views, and can then
open **any** candidate's full profile by id, and download **any** of the 6,558 candidate
files (5,768 of them PDFs, including signed pilot applications) through
`app/api/candidate-files/[id]/route.ts:53`. The restriction is a control that currently
hides the list and not the data.

Second: **two server actions have no authorization check of any kind** —
`createRecognition` and `redeemReward` in `app/compliments/actions.ts` — so any signed-in
account, including a VIEWER, can attribute a recognition to any employee as the giver and
spend any employee's points balance. Those are the only 2 of 60 exported server actions
with no gate; the other 58 are guarded, which is what makes these two a slip rather than a
pattern.

Third, and the reason the prospective items below matter more than they normally would:
**the app still sets no security headers at all** — no CSP, no `X-Frame-Options`, no
`X-Content-Type-Options`. That is already open on the roadmap (`lib/roadmap/roadmap.ts:237`)
and I re-confirmed it. It removes the mitigation for the three file-serving routes that
echo a stored `mimeType` into `Content-Type` with `Content-Disposition: inline` while
`.html` sits in the accepted-upload extension list.

---

## What I checked, and how

### 1. The auth foundation, read in full

`auth.ts` (275 lines), `middleware.ts` (323 lines), `app/api/auth/[...nextauth]/route.ts`,
and every file in `lib/auth/`:

```
$ ls lib/auth lib/permissions
lib/auth:
api-module-access.ts   auth-config.ts   blocklist.ts   candidate-scope.ts
invites.ts   module-write-access.ts   permissions.ts   roles.ts
route-auth.ts   scoping-options.ts   user-module-access.ts   viewer-scope.ts
(lib/permissions does not exist)
```

**The canonical way a route authorizes** is `lib/auth/route-auth.ts`. Two entry points,
both returning a discriminated union rather than throwing:

```ts
// lib/auth/route-auth.ts:127
/** Allow any authenticated user (any role). Used for actions every user may take, e.g. feedback. */
export async function requireApiUser(): Promise<ApiAuthResult> {
  if (!isAuthRequired()) {
    return { ok: true, user: localBypassUser() };
  }
  return resolveSessionUser();
}

// lib/auth/route-auth.ts:135
export async function requireApiPermission(permission: Permission): Promise<ApiAuthResult> {
  if (!isAuthRequired()) {
    return { ok: true, user: localBypassUser() };
  }
  const resolved = await resolveSessionUser();
  if (!resolved.ok) {
    return resolved;
  }
  if (!hasPermission(resolved.user.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 })
    };
  }
  return resolved;
}
```

`resolveSessionUser()` (line 89) does four things in order, and this is the behaviour
everything else is measured against: `getServerSession` → reject with 401 if no
`session.user.id` or no valid role → **`isEmailBlocked(email)` → 403 revoked** →
`resolveViewerScope(role, id, email)` → **`checkUserModuleAccess(viewer)` → 403 module
blocked**. A failed call is turned into a response by `authFailureResponse(auth)` (line 68),
which exists because `tsconfig.json` sets `"strict": false` and TypeScript will not narrow
the union through `if (!auth.ok)` without `strictNullChecks`.

The enforced permission vocabulary is `lib/auth/roles.ts`, 16 permissions over 4 roles.
What HIRING_MANAGER and VIEWER actually hold (lines 65–81) is the load-bearing fact for
everything below:

```ts
  HIRING_MANAGER: [ "candidates:read", "files:read", "jobs:read",
                    "requirements:read", "calendar:read", "events:read" ],
  VIEWER:         [ "candidates:read", "files:read", "jobs:read",
                    "requirements:read", "calendar:read", "events:read" ]
```

Identical, and read-only. So any write handler gated on a `:write`, `imports:write`,
`duplicates:write`, `publishing:write` or `settings:admin` permission is already closed to
both of those roles, and a write handler gated only on `requireApiUser` or on a `:read`
permission is the thing to look at.

`middleware.ts` is the second layer. It protects a **whitelist of 27 page prefixes and 19
API prefixes** (lines 10–69), not everything; the comment at line 22 records exactly why
that list is dangerous — `/handbook` was missing from it, and
`app/handbook/[slug]/raw/route.ts` served every internal SOP unauthenticated until Aug 22.
It also sets `x-pathname` with `.set()` (line 263, overwrite, not append), which is what
makes the per-user module gate unspoofable — see §4.

**Patterns I searched for**, so a reader can judge whether my greps worked:
`requireApiUser`, `requireApiPermission`, `getServerSession`, `requireUser`,
`requireAdmin`, `isAuthRequired`, `authFailureResponse`, `requireModulePageAccess`,
`canWriteModule`, `hasPermission`, `isCandidateVisible`, `canAnnotateCandidate`,
`isCandidateAllowlisted`, `CRON_SECRET`, `FRONT_WEBHOOK_SECRET`, `isValidShareToken`,
`signatureMatches`, `verifySignature`, plus per-file local guard helpers found by looking
for any function in the file whose own body touches that machinery. `requireUser` and
`requireAdmin` returned **0** — they do not exist in this repo; if you grep for them you
will get an empty result that means "wrong name", not "no auth".

```
$ for p in requireApiUser requireApiPermission getServerSession requireUser requireAdmin \
           isAuthRequired authFailureResponse requireModulePageAccess verifyFrontSignature \
           CRON_SECRET resolveViewerScope; do
    echo "$p : $(grep -rl "$p" app/api --include=route.ts | wc -l)"; done
requireApiUser : 17
requireApiPermission : 138
getServerSession : 1
requireUser : 0
requireAdmin : 0
isAuthRequired : 0
authFailureResponse : 11
requireModulePageAccess : 0
verifyFrontSignature : 0
CRON_SECRET : 5
resolveViewerScope : 1
```

### 2. All 162 API routes, enumerated per handler

```
$ find app/api -name "route.ts" | wc -l
162
```

I parsed every file for `export async function GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS`,
`export const GET = …`, and `export { handler as GET }`, sliced each handler's body to the
next handler, and tested each body for an auth/cron/signature call:

```
total handler exports: 245
files: 162
by method: {"GET":60,"DELETE":40,"POST":99,"PATCH":41,"PUT":5}
handlers with NO auth/cron/sig in their own body: 10
--- of those, in a file that DOES call auth somewhere (mixed):
   app/api/workspace-settings/branding/route.ts GET line 16
   app/api/workspace-settings/department-colors/route.ts GET line 7
   app/api/workspace-settings/fleet-crew-roster/route.ts GET line 11
   app/api/workspace-settings/fleet-mx-roster/route.ts GET line 10
   app/api/workspace-settings/new-hire-contacts/route.ts GET line 11
--- of those, in a file with NO auth anywhere:
   app/api/auth/[...nextauth]/route.ts GET line 6
   app/api/auth/[...nextauth]/route.ts POST line 6
   app/api/book/[slug]/route.ts GET line 12
   app/api/book/[slug]/route.ts POST line 29
   app/api/book/[slug]/slots/route.ts GET line 5
```

File-level cross-check, which agrees:

```
$ grep -rL -E "requireApiUser|requireApiPermission|getServerSession" app/api --include=route.ts
app/api/auth/[...nextauth]/route.ts
app/api/book/[slug]/route.ts
app/api/book/[slug]/slots/route.ts
app/api/contacts/vcard/route.ts
app/api/cron/calendar-sync/route.ts
app/api/cron/orientation-reminder/route.ts
app/api/cron/paycom-scan/route.ts
app/api/cron/pilot-app-scan/route.ts
app/api/front/webhook/route.ts
```

9 files of 162. Every one of the 9 is a surface I then read in full and established as
either public by design with its own non-session gate, or NextAuth's own handler. There is
no tenth.

**Every auth call's result is actually checked.** This is the bug class where a route calls
the helper and ignores it, so I tested for it directly:

```
$ node scratchpad/checkok.js
auth calls whose following 12 lines never mention .ok : 0
```

#### 2a. Routes with NO auth check that export POST / PUT / PATCH / DELETE

**Three handlers**, and after reading all three there are **no unauthenticated writes that
are not deliberate**:

| Handler | Gate | What it writes | What an anonymous caller can do |
|---|---|---|---|
| `app/api/auth/[...nextauth]/route.ts:6` POST | NextAuth itself | `Account`, `Session`, `User` via PrismaAdapter | Nothing beyond the OAuth flow. `auth.ts:239 signIn` callback rejects any email not on `AUTH_ADMIN_EMAILS`/`AUTH_ALLOWED_EMAILS`/`AUTH_ALLOWED_DOMAINS`, and rejects a blocked email first. |
| `app/api/book/[slug]/route.ts:29` POST | none — **public by design**, named as such in `middleware.ts:48` | `Candidate`, `Interview`, `Booking` rows; pushes a Google Calendar event | Create a real `Candidate` + `Interview` + `Booking` against the live database for an active host slug. Fenced by: `publicBookingSchema` (zod), a hidden-field honeypot (line 51), a slot re-check (line 67), and `rateLimit("book:"+clientIp, 8, 10*60*1000)` (line 33). Not a finding — it is the product — but see UNCERTAIN 3 for the rate limiter's real strength. |
| `app/api/user-home/route.ts:10` POST | `getServerSession` directly (so my per-handler regex for the *canonical* helpers shows "NONE" for it in the table below — read this row, not the table) | `WorkspaceSetting user-pref/home:<userId>` | Nothing. 401 without a session; the value must match `visibleHomeChoices(policy, role)` (line 29), and it only writes the caller's own preference. |

#### 2b. Routes with NO auth check that export only GET

**Seven handlers.** Five are sensitive and rely on one layer; two are public by design.

| Handler | Gate | Data returned | Sensitive? |
|---|---|---|---|
| `app/api/book/[slug]/route.ts:12` GET | none, public by design | `toPublicHost(host)` | **No.** I checked the projection at `lib/data/booking.ts:222` — it emits id, name, slug, title, avatarUrl, role, timezone, buffer/notice/window/maxPerDay, isActive, booking types. **No host email.** |
| `app/api/book/[slug]/slots/route.ts:5` GET | none, public by design | free/busy slots + the same public host | No. Busy times only, no event titles. |
| `app/api/contacts/vcard/route.ts:22` GET | `isValidShareToken(?t=)` — see §6 | curated staff names, titles, **phone numbers, email addresses** | Yes, and correctly gated. 404 on a wrong or missing token, verified live below. |
| `app/api/workspace-settings/new-hire-contacts/route.ts:11` GET | **middleware prefix only** | the full curated contacts config (live row is 3,955 chars) — staff names, titles, **phones, emails** | **Yes.** Any signed-in account, any role, no permission check, and `/api/workspace-settings` is **unmapped** in the module gate so a per-user module override cannot block it either. CERTAIN 3. |
| `app/api/workspace-settings/fleet-crew-roster/route.ts:11` GET | **middleware prefix only** | the crew org chart roster (live row is **40,336 chars**) — pilot names against tail numbers and seats | Internal, not PII-grade. Same single-layer problem. CERTAIN 3. |
| `app/api/workspace-settings/fleet-mx-roster/route.ts:10` GET | **middleware prefix only** | maintenance roster (3,346 chars) | Same. CERTAIN 3. |
| `app/api/workspace-settings/branding/route.ts:16` GET | **middleware prefix only** | logo data URLs (220,226 chars) | No. Size only. |
| `app/api/workspace-settings/department-colors/route.ts:7` GET | **middleware prefix only** | hex colours (live row is `{}`) | No. |

All five `workspace-settings` GETs are **deliberately** middleware-only and say so —
`app/api/workspace-settings/fleet-crew-roster/route.ts:5`: *"Lives under
/api/workspace-settings so the existing middleware auth wall covers it; POST additionally
requires the settings:admin permission."* The POST side of each of the five **is**
`settings:admin` gated, which is the positive control that the author understood the gate
and chose to leave the read on one layer. The problem is that this is the exact shape of
the Aug 22 SOP leak: correctness depends entirely on a hand-maintained prefix list in
another file.

#### 2c. Routes WITH an auth check — the positive control

**153 of 162 files; 235 of 245 handlers.** Permission distribution across the 185 write
handlers, which is the number that tells you the grep found real gates and not noise:

```
=== permission strings used on write handlers ===
  candidates:write : 65
  settings:admin : 20
  jobs:write : 19
  events:write : 19
  calendar:write : 17
  files:write : 13
  requirements:write : 4
  duplicates:write : 3
  imports:write : 3
  (subtotal 163)
  + 19 handlers on requireApiUser with a secondary gate (traced individually, below)
  + 3 with no canonical helper (2b/2a above)
  = 185
```

The full per-file table (gate per exported method) is at the end of this file so it can be
read without re-deriving it.

**The 19 `requireApiUser` write handlers, every one traced.** My first pass flagged these
as "a VIEWER would pass". That was wrong, and I am recording the correction because the
wrong version is the one that would have cost somebody a morning. Nine of them call
`canWriteModule(auth.user, module, action)` (`lib/auth/module-write-access.ts:15`), which
reads the live per-role Module Visibility policy and allows delete/merge only at
`FULL_ACCESS`:

```
$ grep -rn "canWriteModule" app/api --include=route.ts | grep -v "^.*:[0-9]*:import"
app/api/candidates/[id]/route.ts          -> canWriteModule(auth.user, "candidates", "edit")
app/api/new-hires/[id]/route.ts           -> canWriteModule(auth.user, "people", "edit")
app/api/new-hires/[id]/route.ts           -> canWriteModule(auth.user, "people", "delete")
app/api/new-hires/[id]/tasks/route.ts     -> canWriteModule(auth.user, "people", "edit")
app/api/new-hires/[id]/onboarding-rounds/route.ts                      -> ("people","edit")
app/api/new-hires/[id]/onboarding-rounds/[archiveId]/route.ts          -> ("people","edit")
app/api/new-hires/[id]/onboarding-rounds/[archiveId]/restore/route.ts  -> ("people","edit")
app/api/new-hires/bulk-delete/route.ts    -> canWriteModule(auth.user, "people", "delete")
app/api/new-hires/merge/route.ts          -> canWriteModule(auth.user, "people", "delete")
```

The other ten are the candidate-annotation paths, and each checks the permission **first**
and falls back to the narrow allowlist grant — e.g.
`app/api/candidates/[id]/notes/route.ts:39`:

```ts
  if (!hasPermission(auth.user.role, "candidates:write") && !canAnnotateCandidate(auth.user.viewer, id)) {
    return forbidden();
  }
```

`canAnnotateCandidate` (`lib/auth/candidate-scope.ts:113`) returns false unless
`restrictCandidatesToAllowlist && allowlistCanAnnotate`, which is false for all 5 live
accounts. The note/interview/scorecard edit paths additionally require authorship —
`app/api/candidates/[id]/notes/[noteId]/route.ts:62` `wroteIt(auth.user.id, note.authorId)`,
`.../interviews/[interviewId]/route.ts:110` `ranIt(auth.user.email, existing.interviewerEmail)`.
`app/api/candidates/[id]/notes/route.ts:48` even blocks a non-HR caller from setting
`hrOnly: true`, with the reason written down. **So: after tracing all 19, the only write
handlers a plain signed-in VIEWER passes with no further gate are
`app/api/feedback/route.ts:46` POST and `app/api/user-home/route.ts:10` POST, both of which
are any-user by design.**

### 3. Object-level authorization — the highest-value part, and where the real gap is

Two narrowing mechanisms exist, and the repo is explicit that they are different
(`lib/auth/candidate-scope.ts:18`): the hand-picked **allowlist** (a set of ids) and the
**department restriction** (a join through `applications → job → department`).

```
$ grep -rn "isCandidateVisible(" app lib --include=*.ts --include=*.tsx | grep -v lib/auth/candidate-scope.ts | wc -l
30
```

All 30, and which mechanism each applies:

```
app/api/candidate-files/[id]/route.ts:53     GET     allowlist only
app/api/candidate-files/[id]/route.ts:107    PATCH   allowlist only
app/api/candidate-files/[id]/route.ts:208    DELETE  allowlist only
app/api/candidates/[id]/ai-summary/route.ts:18,38    allowlist only
app/api/candidates/[id]/employee/route.ts:30         allowlist only
app/api/candidates/[id]/extract-metrics/route.ts:30  allowlist only
app/api/candidates/[id]/interviews/[interviewId]/route.ts:99,225   allowlist only
app/api/candidates/[id]/interviews/route.ts:76       allowlist only
app/api/candidates/[id]/metrics/route.ts:32          allowlist only
app/api/candidates/[id]/notes/[noteId]/route.ts:43,135             allowlist only
app/api/candidates/[id]/notes/route.ts:35            allowlist only
app/api/candidates/[id]/route.ts:55,250              allowlist only
app/api/candidates/[id]/tags/route.ts:55,145         allowlist only
app/matching/matchboard-actions.ts:54,68,90,93       allowlist only
app/pilot-requirements/scoring-actions.ts:371        allowlist only
lib/data/interview-detail.ts:92                      allowlist only
lib/matching/matchboard.ts:369,447                   allowlist only
lib/notifications/mentions.ts:203                    allowlist only
lib/data/candidates.ts:1608 (getCandidateProfileData) allowlist only   <-- the chokepoint
lib/data/candidates.ts:1359 + :1364                  allowlist AND department
lib/data/candidates.ts:1484 + :1489                  allowlist AND department
```

And the department restriction's complete enforcement set — **4 call sites, all
list-shaped**:

```
$ grep -rn "departmentScopeWhere\|isDepartmentRestricted" lib/data/candidates.ts
78:  function isDepartmentRestricted(viewer)            <- the predicate
87:  async function departmentScopeWhere(viewer)        <- the where-fragment
90:    if (!isDepartmentRestricted(viewer)) return null;
128:  isCandidateScopeNarrowed = isCandidateAllowlisted(viewer) || isDepartmentRestricted(viewer)
162:  const department = await departmentScopeWhere(viewer);   <- visibleCandidateIdsFor
827:  const departmentBranch = await departmentScopeWhere(viewer);  <- getCandidateListData
1364: const byIdsDepartment = await departmentScopeWhere(viewer);  <- getCandidatesByIds
1489: const comparisonDepartment = ...                             <- getCandidateComparisonData
```

`departmentScopeWhere` is referenced nowhere outside `lib/data/candidates.ts`. So
**28 per-record gates are department-blind**, against **4 list queries that are not**.
That is the ratio, and it is the finding.

The chokepoint, read in full:

```ts
// lib/data/candidates.ts:1604
export async function getCandidateProfileData(
  id: string,
  viewer: ViewerScope | null
): Promise<CandidateProfileData | null> {
  if (!isCandidateVisible(viewer, id)) {     // <-- line 1608: ALLOWLIST ONLY
    return null;
  }
  const candidate = await prisma.candidate.findUnique({ where: { id }, include: { contacts …, files …, metrics …, notes …, applications …, interviews …, aiSummary …, candidateTags …, communications … } });
```

and its two callers:

```
$ grep -rn "getCandidateProfileData" app lib --include=*.ts --include=*.tsx
app/api/candidates/[id]/route.ts:26    const candidate = await getCandidateProfileData(id, auth.user.viewer);
app/api/candidates/[id]/route.ts:208   const updated = await getCandidateProfileData(id, auth.user.viewer);
app/candidates/[id]/page.tsx:19        getCandidateProfileData(id, viewer)
```

Both the page and `GET /api/candidates/[id]` go through it. Note masking *is* applied
inside it for a non-matching department (lines 1681–1700, `PRIVATE_NOTE_PLACEHOLDER`), so
interview write-ups and note bodies are protected — but the record itself, `contacts`
(emails and phones), the `files` list, `metrics`, `applications` and the last 100
`communications` are not.

The fix already exists in the same file and costs zero queries for an unrestricted viewer:
`visibleCandidateIdsFor(ids, viewer)` at line 152 applies **both** mechanisms and
short-circuits when neither is on. See CERTAIN 1.

**Live context, measured, not assumed** (`scripts/_r1-security-probe.ts`, since deleted):

```
=== ALL User rows (5) ===
as***@skyshare.com  role=ADMIN            restrictDept=false  restrictAllowlist=false  moduleAccessJson=null
hb***@skyshare.com  role=ADMIN            restrictDept=false  restrictAllowlist=false  moduleAccessJson=null
ks***@skyshare.com  role=RECRUITER        restrictDept=false  restrictAllowlist=false  moduleAccessJson=null
jo***@skyshare.com  role=HIRING_MANAGER   dept=maintenance  restrictDept=false  restrictAllowlist=false  moduleAccessJson=null
rp***@skyshare.com  role=HIRING_MANAGER   dept=maintenance  restrictDept=TRUE   restrictAllowlist=false  moduleAccessJson=null

=== UserCandidateAccess rows: 0
```

That is the whole table, not a filter — the positive control is that the query returns
`true` where `true` exists (`rp***`) and `false` elsewhere. So:

- The **allowlist** mechanism has **no live subject** (0 of 5 restricted, 0 grant rows).
  Every allowlist-bypass I could have reported has no victim today. I have not reported
  any as high severity for that reason.
- The **department** restriction has **exactly one live subject**, and it is the mechanism
  with the 28-site gap. That is why CERTAIN 1 is first.
- `moduleAccessJson` is null for all 5, so the per-user module gate
  (`lib/auth/api-module-access.ts:154`) short-circuits to "allowed" for everyone today —
  it is inert, not broken.

One more unscoped authenticated read, reachable by both HIRING_MANAGERs:
`app/api/fleet/people-search/route.ts:12` is gated on `candidates:read` and runs
`prisma.candidate.findMany` with **no scope fragment at all** (lines 38–47), returning
`displayName`, `currentTitle`, `archivedAt` for up to 60 matches on any ≥2-character token,
plus active employee names and positions. It is mapped to the **`fleet`** module, not
`candidates` (`lib/auth/api-module-access.ts:90`), so switching somebody's Candidates
module off would not close it. Today that leaks nothing the two HIRING_MANAGERs cannot
already see by name; it matters the moment anyone is allowlist- or department-restricted,
which one person already is. CERTAIN 2.

### 4. The permission matrix

There are **two** permission tables, and only one is enforced.

- **Enforced:** `lib/auth/roles.ts` — `rolePermissions`, 16 permissions, 43 importers.
- **Not enforced:** `lib/auth/permissions.ts` — `ROLE_PERMISSIONS` with a *different*
  vocabulary (`candidates:delete`, `pilots:read`, `users:read`, `permissions:admin`,
  `activity:read`, `imports:read`, `duplicates:resolve`, `calendar:sync`), none of which
  exist in the `Permission` union, plus `MODULE_ACCESS_MATRIX`, `canAccessModule()`,
  `getUserPermissions()` and a second `hasPermission()`.

```
$ grep -rn "MODULE_ACCESS_MATRIX\|canAccessModule\|getUserPermissions\|ROLE_PERMISSIONS" app lib components --include=*.ts --include=*.tsx
components/settings/UsersManagementWorkspace.tsx:5:   import { VALID_ROLES, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
components/settings/UsersManagementWorkspace.tsx:561: {ROLE_PERMISSIONS[role].map((perm) => (
lib/auth/permissions.ts:2,65,70,75,76,79,80,85        (its own definitions)
```

`MODULE_ACCESS_MATRIX`, `canAccessModule` and `getUserPermissions` have **zero call sites
outside the file**. The only live consumer is the Settings → Role Permissions panel, which
renders the non-enforced list to an admin.

**And the screen already admits it** — `components/settings/UsersManagementWorkspace.tsx:553`:
*"Reference only. This table comes from lib/auth/permissions.ts, which is not the list the
app enforces — the live one is lib/auth/roles.ts."* I am recording that rather than
reporting a screen that lies, because the first version of this finding was "the Settings
page shows a permission matrix that is not enforced" and the disclaimer makes that
materially less serious. What remains is real but small: the panel still *shows* a
recruiter `candidates:delete` and shows VIEWER nothing about `files:read`, so an admin
reading it would not learn that a VIEWER can download every candidate file and every
travel receipt. CERTAIN 7.

**Hidden-button vs open-API sweep.** I looked for the shape "the UI hides a control for a
role but the route still accepts it" and found the opposite of a problem on the routes: the
19 `requireApiUser` writes all carry a server-side gate (§2c). The place the shape *does*
hold is server actions, which are POSTs to the page path and bypass both the API gate and
the page gate by construction — `lib/auth/api-module-access.ts:13` says so. So I audited
them:

```
$ grep -rln '"use server"' app lib components | wc -l
9
TOTAL exported server actions: 60; guarded: 58; UNGUARDED: 2
  app/compliments/actions.ts:29  createRecognition()
  app/compliments/actions.ts:79  redeemReward()
```

(My first pass said 58 unguarded, then 15. Both were wrong — the detector missed guard
helpers defined in the file (`canEditTravel`, `canSend`, `canEditPeople`, `readAccess`,
`readGuard`) and then missed imported ones (`isComplimentsAdmin`, `canEditScoring`). I read
every flagged action individually; 58 are genuinely guarded. The two that are not, are not:
`createRecognition` at line 29 goes straight from `createRecognitionSchema.safeParse(input)`
to `prisma.recognition.create` + `prisma.newHire.update({ pointsBalance: { increment } })`
with `giverId` taken from the input, and `redeemReward` at line 79 spends `newHireId`'s
points with no check that the caller is that person or an admin. `toggleLike` in the same
file *does* read the session at line 116, which is how I know the omission is local to
those two.) CERTAIN 4.

Separately, the 6 local server-action guards resolve the role straight off the JWT and
**never consult the blocklist**:

```
$ grep -rn "^async function canEdit\|^async function canSend\|^async function readAccess\|^export async function getScoringRole\|^export async function getComplimentsRole" app lib --include=*.ts
app/business-cards/actions.ts:15        async function canEditPeople()
app/matching/matchboard-actions.ts:22   async function readAccess()          <- uses requireApiPermission
app/orientation/actions.ts:52           async function canSend()
app/people/actions.ts:68                async function canEditPeople()
app/pilot-requirements/scoring-actions.ts:53  async function readGuard()     <- uses requireApiPermission
app/travel/actions.ts:53                async function canEditTravel()
lib/compliments/settings.ts:70          async function getComplimentsRole()
lib/matching/scoring-config.server.ts:52 async function getScoringRole()

$ for f in app/travel/actions.ts app/orientation/actions.ts app/people/actions.ts \
           app/business-cards/actions.ts app/matching/matchboard-actions.ts \
           lib/matching/scoring-config.server.ts lib/compliments/settings.ts; do
    echo "$f isEmailBlocked=$(grep -c isEmailBlocked $f) requireApiPermission=$(grep -c requireApiPermission $f)"; done
app/travel/actions.ts                     isEmailBlocked=0  requireApiPermission=0
app/orientation/actions.ts                isEmailBlocked=0  requireApiPermission=0
app/people/actions.ts                     isEmailBlocked=0  requireApiPermission=0
app/business-cards/actions.ts             isEmailBlocked=0  requireApiPermission=0
app/matching/matchboard-actions.ts        isEmailBlocked=0  requireApiPermission=4
lib/matching/scoring-config.server.ts     isEmailBlocked=0  requireApiPermission=0
lib/compliments/settings.ts               isEmailBlocked=0  requireApiPermission=0
```

`isEmailBlocked` is consulted in exactly two places in the whole app:

```
$ grep -rn "isEmailBlocked" app lib --include=*.ts --include=*.tsx | grep -v lib/auth/blocklist.ts
app/api/admin/invites/route.ts:178   (invite creation)
lib/auth/route-auth.ts:100           (the API gate)
lib/data/module-access.ts:100        (the page gate)
```

Two matched gates (plus an invite check), and zero on the server-action surface — and
`app/matching/matchboard-actions.ts` / `scoring-actions.ts` already show the right pattern
by calling `requireApiPermission`, which is the positive control that the fix is available
and already in use in this directory. CERTAIN 6.

Live: `workspace/auth-blocklist` is `[]` — parsed, an array, **0 entries** — so nobody is
revoked today and this gap has no current victim.

### 5. Input and injection

**Raw SQL.** Zero in application code:

```
$ grep -rn "queryRaw\|executeRaw" app lib --include=*.ts --include=*.tsx
(no output)
```

Positive control — the same pattern repo-wide, excluding `node_modules`, finds 15 hits: 14
in `prisma/generated/client/**` (the client's own type declarations) and exactly one real
call site, in a dev script:

```
scripts/review-pdf-form-extract.ts:54
  const rows = await prisma.$queryRawUnsafe<…>(
    `SELECT c."displayName" … LIMIT ${Math.max(1, Math.min(400, limit))}`
  );
```

The single interpolation is a CLI integer clamped to 1–400. Not reachable from the web app,
not injectable. Nothing to fix.

**Mass assignment.** Nothing spreads a parsed body into a Prisma `data`:

```
$ grep -rn "\.\.\.body\b\|\.\.\.payload\b\|\.\.\.json\b\|\.\.\.parsed\b" app/api --include=route.ts
app/api/pilot-requirements/[id]/route.ts:132   newValuesJson: JSON.stringify({ ...payload, gates: normalizedGates }),
```

— and that one spreads into a JSON audit column, not into columns. The role-setting route
`app/api/admin/users/[id]/route.ts` uses two hand-maintained whitelists with a comment
saying so (line 17) and validates `body.role` against `VALID_ROLES` (line 45). No route
lets a caller set their own role.

**Unvalidated bodies.** zod is used on 23 of 162 API route files. The rest hand-validate
with `typeof` guards, which is the prevailing style and was correct everywhere I read it —
with one real exception, which is the only input finding I consider certain:
`app/api/imports/files/complete/route.ts:53` writes `storageKey: upload.storageKey`
**verbatim from the request body**, with no check that it is one of the keys this batch's
presign call issued and no prefix check. CERTAIN 5.

**File paths.** `resolveCandidateStoragePath` (`lib/files/candidate-file-storage.ts:51`)
has a real traversal guard (`path.relative` + `..`/absolute rejection). It is only used by
the local-dev adapter; the S3 adapter passes the key straight to `GetObjectCommand`, where
traversal is not a concept but *prefix escape* is — which is what CERTAIN 5 is about. Live
check: 6,515 of 6,558 `CandidateFile.storageKey` values start with `candidate-files/`, 43
are null, **0 are anything else** — so the gap has not been exercised.

**Redirects.** `app/login/page.tsx:141` takes `callbackUrl` from `?next=` and hands it to
`signIn("google", { callbackUrl })`. **Not an open redirect:** `auth.ts` defines only
`signIn`, `jwt` and `session` callbacks — there is no custom `redirect` callback, so
next-auth v4's default applies, which returns `baseUrl` for anything not same-origin or
relative. The value is also rendered at line 188 through JSX, so it is escaped. Stating the
reason because "we checked the redirect" is unfalsifiable and the absence of a `redirect`
callback is the checkable fact.

**Shell.** No `child_process`, no `exec`/`spawn` anywhere in `app/` or `lib/` — the only
`.exec(` hits are `RegExp.prototype.exec` in 10 parsing helpers.

**Email recipients.** Every send goes through `lib/front/messages.ts` → `lib/front/send-guard.ts`,
which outside production rewrites every recipient to `FRONT_TEST_INBOX` and refuses if that
is unset. I did not invoke it.

**HTML sinks.** `sanitizeRichText` (`lib/richtext/sanitize.ts`) is a genuine **emit**
allowlist — it writes out only recognised tags with only recognised attributes, escapes all
text, and permits `style` only when the value reduces to a token from
`lib/richtext/tokens.ts`; `safeHref` (line 100) allows `http`, `https`, `mailto` only.
8 `dangerouslySetInnerHTML` sites exist; 2 render third-party HTML with no sanitizer
(`components/orientation/OrientationEmailPanel.tsx:1253` rendering `state.html`, which comes
from `res.sampleHtml`, and `components/orientation/OrientationCalendarPanel.tsx:226`
rendering `preview.draft.description`). That is already on the roadmap — but the roadmap's
line numbers are now wrong, which is CERTAIN 8.

### 6. Secrets, headers, cookies, CORS

**Committed secrets: none found, and the grep demonstrably works.**

```
$ grep -rInE "AKIA[0-9A-Z]{16}|sk-ant-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|postgres(ql)?://[^\"'[:space:]]*:[^@\"'[:space:]]{6,}@" . \
  | grep -vE "^\./(node_modules|\.next|\.next-check|prisma/generated|storage)/" | grep -vE "^\./\.env"
./FREE_HOSTED_PROTOTYPE_SETUP.md:57
./FREE_HOSTED_PROTOTYPE_SETUP.md:66
./GOOGLE_CALENDAR_SETUP.md:35
```

All three are documentation. I opened each with the userinfo redacted: the first two are
`postgresql://<userinfo>@HOST/neondb?sslmode=require` with the literal word `HOST`, and the
third is the sentence telling you which JSON field is the private key. **Positive control**
— the identical pattern, pointed at the gitignored env files, does fire:

```
$ grep -rInE "AKIA…|sk-ant-…|postgres(ql)?://…:…@" .env .env.local
.env:1         <MATCH FOUND — REDACTED>
.env.local:36  <MATCH FOUND — REDACTED>
.env.local:39  <MATCH FOUND — REDACTED>
```

So the empty result outside `.env*` means the pattern works and finds nothing, not that the
pattern is wrong. I also dumped every env file's **keys and value lengths only** (no
values): the `.example` files' `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`NEXTAUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` all begin `replace-wit…`, so they
are genuine placeholders. `.gitignore:19` is a bare `.env*`, which covers all six env files
including the explicitly-named `.env.local` (line 13) and `.env.vercel.local` (line 14).

One thing I could not close: **`.env.vercel.production` exists and holds a real-looking
`VERCEL_OIDC_TOKEN` of 1,268 characters.** It matches `.gitignore`'s `.env*`, but gitignore
does not untrack an already-tracked file, and **settling that requires git, which I am
forbidden to run tonight.** UNCERTAIN 1.

**Security headers: none. Re-confirmed, four places.**

```
$ cat next.config.mjs        # 35 lines; only async function is redirects()
$ cat vercel.json            # only $schema, buildCommand, crons (4)
$ grep -rn "Content-Security-Policy|Strict-Transport-Security|X-Frame-Options|\
X-Content-Type-Options|Referrer-Policy|Permissions-Policy|async headers" \
    next.config.mjs vercel.json middleware.ts app lib
lib/roadmap/roadmap.ts:237   (the roadmap entry describing the absence)
```

The only hit in the entire app is the roadmap entry recording it. `next.config.mjs` has
`distDir`, `outputFileTracingIncludes` and `redirects()` and nothing else. Already open on
the roadmap at line 237; I am not re-reporting it as new, but CERTAIN 5 and the
`Content-Type` item below both lose their mitigation because of it.

**CORS: clean.** `grep -rn "Access-Control-Allow" app lib` returns nothing. No route
reflects an `Origin`, and only two places read a header that could be attacker-influenced:

```
$ grep -rn 'get("origin")|get("referer")|get("x-forwarded-host")|get("host")|headers().get' app lib
app/api/workspace-settings/new-hire-contacts/share-token/route.ts:28   host  (builds a display URL for an admin)
app/settings/new-hire-contacts/page.tsx:27                            host  (same)
lib/auth/api-module-access.ts:135                                      x-pathname
```

`x-pathname` is the one that would matter, and it is safe: `middleware.ts:263` uses
`forwardHeaders.set("x-pathname", pathname)` — `.set()`, which overwrites any client-supplied
value — and the pathname comes from `request.nextUrl`, not from a header.

**`NEXTAUTH_SECRET` / cookies.** `authSecret()` is `NEXTAUTH_SECRET ?? AUTH_SECRET`
(`auth.ts:32`, duplicated in `middleware.ts:100`). If neither is set, `middleware.ts:278
hasAuthRuntimeConfig()` fails and every protected API path answers 401 and every protected
page redirects — it fails closed. `authOptions` defines **no `cookies` block**, so
next-auth v4 defaults apply: `httpOnly`, `sameSite: "lax"`, and `secure` + a `__Secure-`
prefix whenever `NEXTAUTH_URL` is https (which production's is — `middleware.ts:104`
canonicalises every request to that host). Not explicitly pinned, which is worth knowing,
but the defaults are right. No `session.maxAge` is set, so the JWT lives the default 30
days — the number that sets the window on CERTAIN 6.

The one cookie the app sets itself is deliberately unprotected and says why
(`middleware.ts:240`): the candidate-view preference carries no `secure` and no `httpOnly`
because it holds a display preference. Agreed, not a finding.

### 7. The Front webhook

`app/api/front/webhook/route.ts:185` POST. Signature **is** verified before the body is
trusted, and the order is correct — `request.text()` (line 196, raw, before any parse),
extract header (197), `signatureMatches` (199) → 401, and only then `JSON.parse` (212).
Fails closed with no `FRONT_WEBHOOK_SECRET` (line 187 → 503). The comparison **is**
timing-safe:

```ts
// line 62
function signatureMatches(rawBody: string, secret: string, presented: string): boolean {
  const offered = presented.replace(/^sha(1|256)=/i, "").trim();
  for (const algorithm of ["sha1", "sha256"] as const) {
    const mac = createHmac(algorithm, secret).update(rawBody, "utf8").digest();
    for (const encoding of ["base64", "hex"] as const) {
      const expected = mac.toString(encoding);
      if (expected.length !== offered.length) continue;
      try { if (timingSafeEqual(Buffer.from(expected), Buffer.from(offered))) return true; } catch {}
    }
  }
  return false;
}
```

**There is no replay window.** No timestamp is read and no delivery id is recorded, so a
captured valid `(body, signature)` pair can be re-POSTed indefinitely. The blast radius is
genuinely small — the three downstream handlers are documented as idempotent
(`processMentionReply`, `processTravelConversation`, `processConversationById` with the
"only ticks forward" note at `app/api/cron/paycom-scan/route.ts:19`) — so I have this as
hardening, not a hole. UNCERTAIN 4.

The four cron routes all verify `Authorization: Bearer ${CRON_SECRET}` and all four fail
closed (503) when the secret is unset, including the older `calendar-sync` one whose comment
used to describe the opposite. The comparison is a plain `!==` rather than `timingSafeEqual`
— theoretically a byte-at-a-time oracle, practically not over HTTP against Vercel. Noted,
not reported.

### 8. File access

Storage is a server-side proxy, not public objects and not presigned GETs:
`lib/files/storage-adapter.ts` — `S3FileStorageAdapter.read()` (line 77) pulls bytes
server-side with `GetObjectCommand`, and `getSignedUrl` is used **only** for `PutObject`
uploads with a 900-second default (line 104). So every download is authorized by app code.
Writes set `ServerSideEncryption: "AES256"`.

The candidate document proxy **does** authorize the caller against the file's owner, and is
the best-written gate in the repo:

```ts
// app/api/candidate-files/[id]/route.ts:19
const auth = await requireApiPermission("files:read");
…
// :53  — before the bytes come out of storage
if (!file || !isCandidateVisible(auth.user.viewer, file.candidateId)) {
  return NextResponse.json({ message: "File not found." }, { status: 404 });
}
…
// :61  only now
const { bytes } = await getFileStorageAdapter().read(file.storageKey);
// :63  and it writes an AuditEvent CANDIDATE_FILE_OPEN
```

404 not 403, so ids cannot be walked to prove a person exists; PATCH (line 107) and DELETE
(line 208) carry the same check. The two feedback image routes pin the served content type
through `safeFeedbackImageContentType` and are gated on `settings:admin` *because* a
screenshot of this app contains candidate PII — both documented. That is the positive
control for this whole area: the right pattern exists here.

What it leaves open is the **department** blindness (§3, CERTAIN 1 — `isCandidateVisible`
is allowlist-only) and the served `Content-Type`:

```
$ grep -rn '"Content-Type": [a-zA-Z_.]*\.\(mimeType\|mime\|contentType\)' app/api --include=route.ts
app/api/candidate-files/[id]/route.ts:81          file.mimeType ?? "application/octet-stream"
app/api/travel/receipts/[id]/route.ts:29          receipt.mimeType ?? "application/octet-stream"
(+ app/api/orientation/sessions/[id]/lunch-file/route.ts:107  session.lunchFileMime || "application/octet-stream")
```

All three pair that with `Content-Disposition: inline`. The stored `mimeType` is
client-supplied (`file.type` off the multipart `File` at
`app/api/candidates/[id]/files/route.ts:114`, `app/api/resume-intake/route.ts:176`,
`app/api/document-intake/route.ts:180,210`, `app/api/imports/files/route.ts:74`, and
straight from the JSON body at `app/api/imports/files/complete/route.ts:54`), and `.html`
and `.htm` are in the accepted extension set (`lib/files/candidate-file-storage.ts:18-19`).
With no CSP that is stored XSS in the app origin. **It is prospective, not realised** — the
live distribution has no HTML in it:

```
=== CandidateFile rows by mimeType (ALL values) ===
  application/pdf  5768
  image/jpeg  354
  application/vnd.openxmlformats-officedocument.wordprocessingml.document  338
  application/msword  36
  null  33
  image/png  18
  text/plain  10
  application/vnd.openxmlformats-officedocument.spreadsheetml.sheet  1
```

CERTAIN 9.

### 9. Which surfaces are public BY DESIGN, and whether their tokens are real gates

| Surface | Gate | Validated? | Unguessable? | Revocable? | Expirable? |
|---|---|---|---|---|---|
| `/login` | — | n/a | n/a | n/a | n/a |
| `/book/[slug]`, `/api/book/[slug]`, `/api/book/[slug]/slots` | none (named in `middleware.ts:48`) | n/a | **no — a slug is guessable, and it is meant to be** | host `isActive: false` | n/a |
| `/welcome`, `/api/contacts/vcard` | `?t=` share token | **yes** | **yes** — `randomBytes(12).toString("base64url")`, 96 bits, live value is 16 chars | **yes** — `rotateShareToken()` | **no** |
| `/r/[token]` | path token | **yes** | **yes** — same 12-byte recipe, live token is 16 chars | **yes** — `revokedAt` | **no** |
| `/api/auth/[...nextauth]` | NextAuth + email allowlist | yes | n/a | blocklist | n/a |
| `/api/cron/*` (4) | `Authorization: Bearer CRON_SECRET` | yes, fail-closed | yes | rotate the env var | n/a |
| `/api/front/webhook` | HMAC-SHA1/256 over the raw body | yes, fail-closed, timing-safe | yes | rotate the secret | **no replay window** |

The share-token comparison is correct and the reason is written down
(`lib/new-hire-contacts/share-link.ts:88`): both sides are SHA-256'd first so
`timingSafeEqual` cannot throw on a length mismatch, and it fails closed when no token is
stored. `/r/[token]` is a plain `findFirst` equality on a 96-bit value, which is fine.

**Verified live over HTTP** — these four are the only HTTP results in this file that mean
anything, because their gate does not depend on auth and so is not affected by the local
bypass:

```
$ curl -s -o /dev/null -w "status=%{http_code} bytes=%{size_download}\n" "http://localhost:3000/api/contacts/vcard"
status=404 bytes=10
$ curl -s -w "\nstatus=%{http_code}\n" "http://localhost:3000/api/contacts/vcard?t=wrongtoken123"
Not found.
status=404
$ curl -s "http://localhost:3000/r/not-a-real-token" | grep -o "This link\|isn&#x27;t active"
This link
isn&#x27;t active
$ curl -s -o /dev/null -w "status=%{http_code}\n" "http://localhost:3000/welcome"
status=200
```

`/welcome` answering **200** without a token is expected and documented
(`app/welcome/page.tsx:16` — a `notFound()` inside a rendered page cannot change the status
once the layout has begun streaming; the `robots: { index: false }` tag carries the
indexing protection). I checked it leaks nothing rather than trusting the comment:

```
$ curl -s http://localhost:3000/welcome > /tmp/_welcome.html ; wc -c < /tmp/_welcome.html
56394
  tel:                     0
  mailto:                  0
  /api/contacts/vcard      0
  skyshare.com             0
$ grep -o "Page not found" /tmp/_welcome.html | head -1
Page not found
```

56 KB of app shell, "Page not found" rendered, and **zero** contact markers. The gate holds.

**The SOP-leak class, re-checked specifically.** `app/handbook/[slug]/raw/route.ts` is the
only non-API route handler in the app:

```
$ find app -name "route.ts" -not -path "app/api/*"
app/handbook/[slug]/raw/route.ts
```

It now has its own gate (`requireApiUser` at line 19) **and** `/handbook` is in
`middleware.ts:30`. Both ends, which is the right answer. But the same structural question
applies to the pages, so I checked all 67 against the middleware list. Five page prefixes
are **not** in `protectedPagePrefixes`: `/fleet/*`, `/offers`, `/travel`, `/archive/*`,
`/account`. All of them gate themselves:

```
app/fleet/crew/page.tsx            requireModulePageAccess("fleet")
app/fleet/maintenance/page.tsx     requireModulePageAccess("fleet")
app/fleet/positions/page.tsx       requireModulePageAccess("fleet")
app/offers/page.tsx                requireModulePageAccess("candidates")
app/travel/page.tsx                requireModulePageAccess("people")
app/archive/page.tsx               requireModulePageAccess("archive")
app/archive/reports/page.tsx       requireModulePageAccess("archive")
app/account/page.tsx               getServerSession + redirect("/login")   (self-scoped prefs only)
```

and `requireModulePageAccess` (`lib/data/module-access.ts:89`) checks session, **blocklist**
(line 100) and the module rule. So there is no live second SOP leak. What there is, is a
standing structural risk: add a `route.ts` under any of those five prefixes and it gets no
middleware protection, which is precisely how Aug 22 happened. CERTAIN 10.

### 10. Things I checked that are fine, recorded so nobody re-checks them

- `/api/admin/users/[id]` DELETE and `/api/users/[id]` DELETE are fenced five ways each
  (admin only, not self, not the last admin, exact-email confirmation, and for `/api/users`
  a test-email marker). The **PATCH** on the first is not — CERTAIN 11.
- `prisma.user.update` is reachable only from `settings:admin`, through two hand-maintained
  whitelists, with `body.role` checked against `VALID_ROLES`. No self-escalation path.
- `auth.ts:113` sets `allowDangerousEmailAccountLinking: false`. Google scope list carries
  **no Gmail scope**, and the live `Account` rows confirm it: 5 rows, 5 with
  `calendar.events`, 5 with a refresh token, **0 with any gmail scope** — the positive
  control the file's own comment asks for.
- `app/r/[token]/page.tsx:28` calls `getReportsData()` with **no viewer**, computing four
  datasets (including `getDocumentCurrency`, which lists candidate names) and rendering only
  `pilotUpgrades`. Server Component, so the discarded four never reach the client — no leak
  today. It is wasted work on an unauthenticated path and one careless refactor from being
  a leak; worth a note, not a finding.
- The public report does expose pilot **names** plus full seat/aircraft/date progressions
  (`UpgradePilot`, `lib/data/employee-journey.ts:244`). Intended. See UNCERTAIN 2 for the
  expiry.
- `NewHire` holds `phone`, `ssEmail`, `personalEmail`, `supervisorEmail`, `birthday`. **No
  SSN column, no salary column** anywhere in `prisma/schema.prisma` — so the worst
  authenticated read in this app is contact details and documents, not identity numbers.

---

## CERTAIN — safe for a later agent to fix without re-deriving

### 1. The department restriction is not applied to any single-candidate read, so the one live department-scoped hiring manager can open every candidate profile and download every candidate file — HIGH

**File/line:** `lib/data/candidates.ts:1608` (the chokepoint), and consequently
`app/api/candidates/[id]/route.ts:26`, `app/candidates/[id]/page.tsx:19`,
`app/api/candidate-files/[id]/route.ts:53`.

**Problem:** `getCandidateProfileData` gates on `isCandidateVisible`, which implements the
hand-picked allowlist only (`lib/auth/candidate-scope.ts:72`). `restrictCandidatesToDepartment`
is enforced at 4 list-shaped sites and at none of the 28 per-record sites.
`rp***@skyshare.com` has it set to `true` in the live database today.

**Attack, one sentence:** a department-scoped hiring manager pastes or enumerates any
candidate id into `/candidates/<id>` or `GET /api/candidates/<id>` and receives that
person's full record — contacts, emails, phones, file list, metrics, applications, last 100
communications — and then fetches any of the 6,558 candidate files by file id through
`/api/candidate-files/<id>`, which only re-checks the allowlist.

**Fix — before (`lib/data/candidates.ts:1604-1610`):**

```ts
export async function getCandidateProfileData(
  id: string,
  viewer: ViewerScope | null
): Promise<CandidateProfileData | null> {
  if (!isCandidateVisible(viewer, id)) {
    return null;
  }
```

**after:**

```ts
export async function getCandidateProfileData(
  id: string,
  viewer: ViewerScope | null
): Promise<CandidateProfileData | null> {
  // BOTH narrowing mechanisms. isCandidateVisible is the allowlist only;
  // visibleCandidateIdsFor also applies departmentScopeWhere, and costs no query
  // at all for a viewer under neither restriction.
  if ((await visibleCandidateIdsFor([id], viewer)).length === 0) {
    return null;
  }
```

`visibleCandidateIdsFor` is already exported from this same file (line 152) and already
short-circuits with zero queries when neither restriction applies, so ADMIN, RECRUITER and
the local bypass are unaffected. `isCandidateVisible` may then be dropped from this
function's imports only if nothing else in the file uses it (lines 1359 and 1484 do — leave
the import).

**Second half of the same fix, `app/api/candidate-files/[id]/route.ts:53`** — before:

```ts
    if (!file || !isCandidateVisible(auth.user.viewer, file.candidateId)) {
```

after:

```ts
    const fileVisible =
      file?.candidateId != null &&
      (await visibleCandidateIdsFor([file.candidateId], auth.user.viewer)).length === 1;
    if (!file || !fileVisible) {
```

(importing `visibleCandidateIdsFor` from `@/lib/data/candidates`). Keep the `candidateId ==
null → not visible` behaviour the current code has via `isCandidateVisible`, which the
`!= null` guard preserves. Apply the same change at lines 107 and 208 of that file for
consistency — both are already unreachable for a restricted viewer via `files:write`, and
the file's own comment at line 205 says it should not carry one handler that checks and two
that do not.

**Scope note for whoever does this:** the other 25 department-blind sites listed in §3 are
the same bug. Per the repo's own rule about fixing the pattern rather than the instance,
the right shape is to make `isCandidateVisible` itself department-aware — but it is
currently **synchronous** and `departmentScopeWhere` is **async** (it queries `Job`), so
that is a signature change across 30 call sites and does not belong in a one-line fix.
Do the two above first; treat the remaining 25 as a follow-up with its own handoff.

### 2. `/api/fleet/people-search` searches every candidate with no scope and is gated on the wrong module — MEDIUM

**File/line:** `app/api/fleet/people-search/route.ts:38-47`.

**Problem:** gated on `candidates:read` (held by VIEWER and HIRING_MANAGER) and runs
`prisma.candidate.findMany` with no `candidateScopeWhere` / `departmentScopeWhere`
fragment. It is also mapped to the `fleet` module (`lib/auth/api-module-access.ts:90`), so
turning somebody's Candidates module off does not close it.

**Attack:** a restricted hiring manager (or any VIEWER) searches two-character tokens and
enumerates candidate names, titles and archived status across the whole pipeline — directly
defeating the property `lib/auth/route-auth.ts:17` says the design protects ("so that a
restricted viewer cannot learn a given person exists").

**Fix — before (line 38):**

```ts
    prisma.candidate.findMany({
      where: {
        status: { not: "MERGED" },
        OR: [...nameOr, { primaryEmail: { contains: q, mode: "insensitive" } }]
      },
```

**after:**

```ts
    prisma.candidate.findMany({
      where: withCandidateScope(auth.user.viewer, {
        status: { not: "MERGED" },
        OR: [...nameOr, { primaryEmail: { contains: q, mode: "insensitive" } }]
      }),
```

adding `import { withCandidateScope } from "@/lib/auth/candidate-scope";`.
`withCandidateScope` (line 131 of that file) appends to `AND` rather than assigning a
top-level key, which is the documented way not to silently drop the `OR`. That closes the
allowlist half. The department half needs `departmentScopeWhere`, which is module-private —
fold it in with the CERTAIN 1 follow-up rather than exporting it ad hoc here.

### 3. Five `workspace-settings` GETs are protected only by the middleware prefix list — MEDIUM

**Files/lines:** `app/api/workspace-settings/new-hire-contacts/route.ts:11`,
`.../fleet-crew-roster/route.ts:11`, `.../fleet-mx-roster/route.ts:10`,
`.../branding/route.ts:16`, `.../department-colors/route.ts:7`.

**Problem:** no in-handler auth call at all. `/api/workspace-settings` is in
`middleware.ts:68`, so an anonymous caller is stopped in production — but that is one layer,
maintained in a different file, and `/api/workspace-settings` is **unmapped** in
`PATH_MODULES` so no per-user module override can narrow it either. The contacts one serves
staff phone numbers and email addresses to any signed-in account.

**Attack:** remove or mistype that one prefix (the exact Aug 22 failure) and the curated
staff directory, the crew roster and the maintenance roster are unauthenticated. Today, any
signed-in VIEWER reads all three with no permission check.

**Fix** — in each of the five files, before:

```ts
export async function GET() {
```

after:

```ts
export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
```

Each file already imports from `@/lib/auth/route-auth` for its POST, so extend that import
to `{ requireApiPermission, requireApiUser, authFailureResponse }`. Use `requireApiUser`
rather than a permission so no role loses a read it has today — this closes the
single-layer problem without changing who can read. If the intent is narrower, the contacts
and roster reads should be `requireApiPermission("candidates:read")`, but that is a
product call, not a mechanical fix.

### 4. Two server actions write to the live database with no authorization at all — HIGH

**File/lines:** `app/compliments/actions.ts:29` (`createRecognition`) and
`app/compliments/actions.ts:79` (`redeemReward`).

**Problem:** neither reads the session. `createRecognition` takes `giverId` straight from
the input and writes a `Recognition` plus `newHire.pointsBalance: { increment: points }`;
`redeemReward` takes `newHireId` from the input and decrements that person's balance.
`toggleLike` in the same file (line 112) does read the session, which is the positive
control that this is an omission rather than a design.

**Attack:** any signed-in account, including a VIEWER, posts a recognition attributed to
any employee as the giver (impersonation in a peer-recognition record) and awards points;
or spends any employee's points balance on any available reward, draining the monthly
budget. Middleware covers `/compliments`, so an anonymous caller is blocked — this is an
authenticated-but-unauthorized write.

**Fix — before (line 29):**

```ts
export async function createRecognition(input: unknown): Promise<ActionResult> {
  const parsed = createRecognitionSchema.safeParse(input);
```

**after:**

```ts
export async function createRecognition(input: unknown): Promise<ActionResult> {
  const auth = await requireApiUser();
  if (!auth.ok) return { ok: false, error: "Sign in to give recognition." };

  const parsed = createRecognitionSchema.safeParse(input);
```

and the same three lines at the top of `redeemReward` (line 79), with
`import { requireApiUser } from "@/lib/auth/route-auth";` added. `requireApiUser` is the
right helper here rather than a permission, because peer recognition is deliberately open
to every role — it brings the blocklist and module checks with it.

**Stated plainly as NOT fixed by that change:** it closes "anyone signed in" but not
"acting as somebody else". `giverId` is still caller-supplied, and there is no link between
a `User` login and a `NewHire` roster row (the roadmap records that gap at line 259), so
"is `giverId` really you" cannot be answered from the code as it stands. Requiring
`isComplimentsAdmin()` would be wrong (it would break peer-to-peer, which is the feature).
Flagging the impersonation half as a design question, not applying a guess to it.

### 5. `imports/files/complete` writes a caller-supplied S3 key with no validation — MEDIUM

**File/line:** `app/api/imports/files/complete/route.ts:53`.

**Problem:** `storageKey: upload.storageKey` is taken verbatim from the JSON body. Nothing
checks that the key is one of the ones `imports/files/presign` issued for this batch, nor
even that it starts with `candidate-files/`.

**Attack:** a `files:write` holder POSTs `{batchId, uploads:[{storageKey:"<any key in the
bucket>", originalFilename:"x", displayFilename:"x"}]}`, gets a `CandidateFile` row with
`candidateId: null` pointing at that object, and then downloads the bytes through
`GET /api/candidate-files/<newId>` — which returns them because `isCandidateVisible(viewer,
null)` is `true` for any non-allowlisted viewer. That is an arbitrary-object read of the
**live production bucket** by someone whose legitimate access is candidate files only.
Not exercised: all 6,515 non-null live `storageKey`s start with `candidate-files/`, 0 do not.

**Fix — before (lines 42-47):**

```ts
  for (const upload of uploads) {
    if (!upload.storageKey || !upload.originalFilename || !upload.displayFilename) {
      warnings += 1;
      continue;
    }
```

**after:**

```ts
  // The key must be one this app minted for an unassigned upload. Taken verbatim,
  // a caller could point a CandidateFile row at ANY object in the live bucket and
  // then read it back through /api/candidate-files/[id], which only re-checks the
  // candidate allowlist and passes a null candidateId.
  const UNASSIGNED_KEY = /^candidate-files\/unassigned\/[0-9]+-[0-9a-f-]{36}-[^/]+$/;
  for (const upload of uploads) {
    if (!upload.storageKey || !upload.originalFilename || !upload.displayFilename) {
      warnings += 1;
      continue;
    }
    if (!UNASSIGNED_KEY.test(upload.storageKey)) {
      warnings += 1;
      continue;
    }
```

The pattern mirrors exactly what `createCandidateStorageKey("unassigned", filename)`
produces (`lib/files/candidate-file-storage.ts:42`: `candidate-files/<id>/<Date.now()>-<randomUUID()>-<base><ext>`).
The stronger fix is to persist the issued keys on the `ImportBatch` at presign time and
accept only those; the regex is the version that needs no schema change.

### 6. The six server-action role guards never consult the blocklist, so offboarding does not reach that surface — MEDIUM

**Files/lines:** `app/travel/actions.ts:53`, `app/orientation/actions.ts:52`,
`app/people/actions.ts:68`, `app/business-cards/actions.ts:15`,
`lib/matching/scoring-config.server.ts:52`, `lib/compliments/settings.ts:70`.

**Problem:** each reads the role off the JWT via `getServerSession` and stops.
`isEmailBlocked` is consulted in exactly two gates in the whole app
(`lib/auth/route-auth.ts:100`, `lib/data/module-access.ts:100`). No `session.maxAge` is set,
so a token lives the next-auth default 30 days. `auth.ts:258` falls back to
`initialRoleForEmail(email)` when the `User` row is gone, which returns **ADMIN** for any
address in `AUTH_ADMIN_EMAILS` — so a revoked admin (the DELETE route blocks the email *and*
deletes the row) keeps a write-capable role on their existing token.

**Attack:** an offboarded admin, already blocked from every API route and every page, can
still drive the travel writes, the orientation and onboarding **email sends**, the people
email sends and the scoring config through server actions until their JWT expires.

**Fix — before (`app/travel/actions.ts:53`):**

```ts
async function canEditTravel(): Promise<boolean> {
  if (!isAuthRequired()) return true;
  const session = await getServerSession(authOptions).catch(() => null);
  const role = session?.user?.role;
  return isRoleName(role) && hasPermission(role, "candidates:write");
}
```

**after:**

```ts
async function canEditTravel(): Promise<boolean> {
  // requireApiPermission, not a hand-rolled session read: it also checks the
  // revocation blocklist and the per-user module gate, neither of which a bare
  // getServerSession knows about. A revoked account keeps a valid JWT for up to
  // 30 days, and server actions are the only surface that was not checking.
  const auth = await requireApiPermission("candidates:write");
  return auth.ok;
}
```

with `import { requireApiPermission } from "@/lib/auth/route-auth";`, and the now-unused
`getServerSession`/`authOptions`/`isAuthRequired`/`hasPermission`/`isRoleName` imports
trimmed only if nothing else in the file uses them (`actorLabel()` at line 60 still uses
`getServerSession` — leave those two). `requireApiPermission` honours the local bypass
itself, so the `isAuthRequired()` early-return is not lost.

Apply the same substitution to the other five, keeping each one's current permission:
`canSend` and `canEditPeople` → `requireApiPermission("candidates:write")` (verify against
each file's current expression before changing it); `getScoringRole`/`canEditScoring` →
`requireApiPermission("candidates:write")` then `isAdminOrRecruiter` as now;
`getComplimentsRole`/`isComplimentsAdmin` → `requireApiPermission("settings:admin")`.
`app/matching/matchboard-actions.ts:22` and `app/pilot-requirements/scoring-actions.ts:53`
already do exactly this and are the in-repo template.

### 7. The Settings → Role Permissions panel renders the permission table the app does not enforce — LOW

**File/line:** `components/settings/UsersManagementWorkspace.tsx:561`, reading
`ROLE_PERMISSIONS` from `lib/auth/permissions.ts:2`.

**Problem:** that table's vocabulary does not exist in the enforced union
(`lib/auth/roles.ts:13`). It shows RECRUITER holding `candidates:delete` and `calendar:sync`
and shows VIEWER nothing about `files:read` — so an admin reading this screen to decide
someone's role is not told that a VIEWER can download every candidate file and every travel
receipt. Severity is LOW **only because** line 553 already carries a disclaimer saying the
table is not the enforced one.

**Fix — before (line 561):**

```tsx
                {ROLE_PERMISSIONS[role].map((perm) => (
```

**after:**

```tsx
                {rolePermissions[role].map((perm) => (
```

changing the import at line 5 from
`import { VALID_ROLES, ROLE_PERMISSIONS } from "@/lib/auth/permissions";`
to
`import { VALID_ROLES } from "@/lib/auth/permissions";`
plus
`import { rolePermissions } from "@/lib/auth/roles";`
and replacing the "Reference only…" paragraph at line 553 with one sentence saying this is
the live enforced list. Then delete the now-dead `ROLE_PERMISSIONS`, `hasPermission`,
`getUserPermissions`, `canAccessModule` and `MODULE_ACCESS_MATRIX` exports from
`lib/auth/permissions.ts` (lines 2–63 and 79–133), keeping only `UserRole` and
`VALID_ROLES`, which are the two things `app/api/admin/users/[id]/route.ts:4` imports.
`VALID_ROLES` is derived from `ROLE_PERMISSIONS`'s keys at line 67, so re-declare it as a
literal `["ADMIN","RECRUITER","HIRING_MANAGER","VIEWER"]` or re-export `roleNames` from
`lib/auth/roles.ts:1`.

### 8. Roadmap line 238 cites five `dangerouslySetInnerHTML` sites that no longer exist — LOW (roadmap accuracy)

**File/line:** `lib/roadmap/roadmap.ts:238`. I may not edit that file; this is for the
commit-and-push agent.

**Problem:** the entry says *"five dangerouslySetInnerHTML sites with no sanitizing:
OrientationEmailPanel lines 662, 857, 1064 and 1184, and OrientationCalendarPanel line 201.
All five line numbers re-checked and current, no drift."* There are now **two**:

```
$ grep -n "dangerouslySetInnerHTML" components/orientation/OrientationEmailPanel.tsx      # 1814 lines
1253:            dangerouslySetInnerHTML={{ __html: state.html }}
$ grep -n "dangerouslySetInnerHTML" components/orientation/OrientationCalendarPanel.tsx   # 654 lines
226:                dangerouslySetInnerHTML={{ __html: preview.draft.description }}
$ grep -c "__html" components/orientation/OrientationEmailPanel.tsx components/orientation/OrientationCalendarPanel.tsx
components/orientation/OrientationEmailPanel.tsx:1
components/orientation/OrientationCalendarPanel.tsx:1
```

`__html` appears once per file, so this is not my grep missing a spelling.

**Fix:** replace the line-number clause in that entry with "two sites:
`components/orientation/OrientationEmailPanel.tsx:1253` (renders `state.html`, sourced from
`res.sampleHtml`) and `components/orientation/OrientationCalendarPanel.tsx:226` (renders
`preview.draft.description`); the three escaped sites the entry described have since been
refactored away, re-counted 2026-09-11." Leave the risk analysis in that entry alone — I
re-traced it and it is still right, including the caveat that `sanitizeRichText` would strip
the inline font styling these previews exist to reproduce.

### 9. Three file-serving routes echo a client-supplied `mimeType` into `Content-Type` with `Content-Disposition: inline`, and `.html` is an accepted upload — MEDIUM (prospective)

**Files/lines:** `app/api/candidate-files/[id]/route.ts:81`,
`app/api/travel/receipts/[id]/route.ts:29`,
`app/api/orientation/sessions/[id]/lunch-file/route.ts:107`.

**Problem:** the served type is the value recorded at upload, which came from the client
(`file.type`, or the raw JSON body in `imports/files/complete`). `.html`/`.htm` are in
`supportedExtensions` (`lib/files/candidate-file-storage.ts:18-19`). With no CSP
(`next.config.mjs`, re-confirmed) an HTML file stored against a candidate renders as a
document in the app's own origin when a recruiter opens it. **Prospective, not realised** —
the live mimeType distribution contains no `text/html`.

**Attack:** an HTML "resume" reaches the library through any upload path, a recruiter clicks
it in the profile, and the script runs with that recruiter's session in the app origin.

**Fix** — the pattern already exists in this repo at
`lib/files/feedback-file-storage.ts:49`:

```ts
export function safeFeedbackImageContentType(mimeType: string | null): string {
  const normalized = mimeType?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES.has(normalized) ? normalized : "application/octet-stream";
}
```

Add the general form beside it in `lib/files/document-types.ts`:

```ts
/**
 * A safe Content-Type to serve a STORED document back with. Never trust the value
 * recorded at upload: it came from the client. Anything off this list is served as
 * an opaque download rather than as something the browser will render or execute
 * in the app's origin. Mirrors safeFeedbackImageContentType.
 */
const INLINE_SAFE_MIME_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp",
  "image/heic", "image/heif", "image/tiff", "image/bmp", "text/plain"
]);

export function safeStoredContentType(mimeType: string | null | undefined): {
  contentType: string;
  disposition: "inline" | "attachment";
} {
  const normalized = mimeType?.toLowerCase().split(";")[0].trim() ?? "";
  return INLINE_SAFE_MIME_TYPES.has(normalized)
    ? { contentType: normalized, disposition: "inline" }
    : { contentType: "application/octet-stream", disposition: "attachment" };
}
```

Then at `app/api/candidate-files/[id]/route.ts:79-84`, before:

```ts
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mimeType ?? "application/octet-stream",
        "Content-Disposition": contentDisposition(file.displayFilename || file.originalFilename),
        "Cache-Control": "private, no-store"
      }
    });
```

after:

```ts
    const served = safeStoredContentType(file.mimeType);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": served.contentType,
        "Content-Disposition": contentDisposition(
          file.displayFilename || file.originalFilename,
          served.disposition
        ),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
```

widening the local `contentDisposition` helper (line 12) to take the disposition:

```ts
function contentDisposition(filename: string, disposition: "inline" | "attachment" = "inline") {
  const safeFilename = filename.replace(/"/g, "'");
  return `${disposition}; filename="${safeFilename}"`;
}
```

Make the identical change at `app/api/travel/receipts/[id]/route.ts:8-10,27-33` and
`app/api/orientation/sessions/[id]/lunch-file/route.ts:105-112`. **Behaviour change to
expect:** the 338 `.docx`, 36 `.doc` and 1 `.xlsx` rows move from `inline` (which the
browser downloads anyway, since it cannot render them) to an explicit `attachment` — so no
user-visible regression, and PDFs and images keep previewing.

### 10. Five page prefixes are outside the middleware protected list, which is the exact shape of the Aug 22 SOP leak — LOW (structural)

**File/line:** `middleware.ts:10-46`.

**Problem:** `/fleet`, `/offers`, `/travel`, `/archive` and `/account` are not in
`protectedPagePrefixes`. Every page under them gates itself today (listed in §9), so there
is no live leak — but any `route.ts` added under those prefixes gets no middleware
protection, and a route handler is exactly what leaked every SOP until Aug 22, because
(per the comment at line 22) handlers do not stream and so a thrown redirect cannot blank
their body.

**Fix — before (`middleware.ts:11-14`):**

```ts
const protectedPagePrefixes = [
  "/approvals",
  "/blocks",
  "/business-cards",
```

**after:**

```ts
const protectedPagePrefixes = [
  "/account",
  "/approvals",
  "/archive",
  "/blocks",
  "/business-cards",
```

and insert `"/fleet",` after `"/events",`, `"/offers",` after `"/matching",`, and
`"/travel",` after `"/templates",` — the list is alphabetical and should stay that way.
**Check before shipping:** `/account` and `/fleet/positions` are reached by every role, and
adding a prefix here only requires a *session*, not a permission, so no role loses access —
but confirm no unauthenticated link in an outbound email points at any of these five.
`/book`, `/login`, `/r` and `/welcome` must stay out of the list; they are public by design.

### 11. `PATCH /api/admin/users/[id]` can demote the last admin, or yourself — LOW (availability)

**File/line:** `app/api/admin/users/[id]/route.ts:44-49`.

**Problem:** both DELETE paths guard against removing yourself and against removing the last
admin (`app/api/admin/users/[id]/route.ts:208-210`, `app/api/users/[id]/route.ts:41-43` —
the positive control that the guard exists and is known). PATCH has neither, and PATCH is
what changes `role`.

```
$ sed -n '10,178p' "app/api/admin/users/[id]/route.ts" | grep -n "adminCount|auth.user.id|last remaining"
(no match — PATCH has neither a self-demotion nor a last-admin guard)
```

**Attack:** an admin (or an admin's mistyped click) PATCHes the only remaining ADMIN to
VIEWER and nobody can reach Settings again. Two ADMINs exist live today, so it is not
currently a one-click lockout.

**Fix** — in the PATCH handler, after the role validation at lines 44-49, insert:

```ts
  // Mirrors the DELETE path below: you cannot strip the last admin, and you cannot
  // demote yourself by accident. Without this, one PATCH locks everyone out of
  // Settings and there is no in-app way back.
  if (data.role && data.role !== "ADMIN") {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (target?.role === "ADMIN") {
      if (auth.user.id != null && id === auth.user.id) {
        return NextResponse.json({ message: "You cannot remove your own admin access." }, { status: 400 });
      }
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        return NextResponse.json({ message: "Cannot demote the last remaining admin." }, { status: 400 });
      }
    }
  }
```

Place it after line 49 (`data.role = body.role;`) and before the `department` block, so it
runs before any write.

---

## UNCERTAIN — needs a human in the morning

1. **Is `.env.vercel.production` tracked in git?** It exists (1,313 bytes) and holds a
   `VERCEL_OIDC_TOKEN` of 1,268 characters, which is not a placeholder. `.gitignore:19` is a
   bare `.env*` so it is ignored *now*, but gitignore does not untrack a file that was added
   before the rule — and `.claude/settings.local.json` spent ten weeks tracked in exactly
   that way (`.gitignore:43-50`). **I could not close this because running git is forbidden
   tonight, absolutely.** *One thing that closes it:* `git ls-files --error-unmatch
   .env.vercel.production`. If it is tracked, that OIDC token must be treated as exposed and
   rotated, and the file removed from the index.

2. **The live report share link has no expiry and is 66 days old.**
   `model ReportShareLink` (`prisma/schema.prisma:247`) has `revokedAt` and **no
   `expiresAt`**. One live row: `report=fleet-progression`, `revoked=false`, 16-character
   token, created 2026-07-07. `/r/[token]` serves pilot names plus full seat/aircraft/date
   progressions to anyone holding the URL, forever, until somebody remembers to revoke it.
   Same for the `new-hire-contacts/share-token` (present, 16 chars, rotatable but never
   expiring) — and that one is in texted links to new hires, which live in those inboxes
   permanently. I cannot close this because "should a share link expire, and after how long"
   is a product decision, not a code fact. *One thing that closes it:* the user saying
   whether these links should expire (and at what age), after which `expiresAt` on
   `ReportShareLink` plus a stored issue date on the contacts token are both small changes.

3. **The public booking rate limiter is per-instance and keyed on a spoofable header.**
   `lib/rate-limit.ts:5` holds buckets in a module-level `Map`, so on Vercel the 8-per-10-min
   cap is per warm lambda, not global — the file says so itself. `clientIp()` (line 32) takes
   the first value of `x-forwarded-for`, which Vercel sets and is trustworthy there, but the
   code would also trust a client-supplied header on any other host. So
   `POST /api/book/[slug]` — which creates real `Candidate`, `Interview` and `Booking` rows
   — has weaker burst protection than 8/10min suggests. I cannot quantify how much weaker
   without load-testing a live mutating endpoint, which I will not do. *One thing that closes
   it:* decide whether the booking surface needs a durable counter (a `WorkspaceSetting` or a
   table keyed by ip+window) or whether the honeypot plus the slot re-check are considered
   enough; the existing `Booking.source = "public-booking"` makes it cheap to measure whether
   any abuse has happened, which I did not do.

4. **The Front webhook has no replay protection, and I could not establish whether Front
   sends a timestamp.** `app/api/front/webhook/route.ts` reads only the signature header; no
   timestamp and no delivery-id dedupe. A captured valid `(body, signature)` pair replays
   forever. The three downstream handlers are documented as idempotent, so I rate this
   hardening — but "documented as idempotent" is not the same as proven, and I did not
   exercise them. *One thing that closes it:* the header dump from one real delivery
   (the route already logs `[...request.headers.keys()]` on a rejection, line 204). If Front
   sends a timestamp header, add a ±5-minute window; if it does not, dedupe on the Front
   message id in a `WorkspaceSetting` ring buffer the way `front/orientation-sends` already
   records sends.

5. **`lib/auth/blocklist.ts` deliberately fails OPEN on a corrupt row, and nothing watches
   it.** Lines 25-53 explain the trade honestly: a corrupt `workspace/auth-blocklist` returns
   `[]`, so nobody is revoked, rather than locking the whole company out. The mitigation is
   `console.error`. The live row is valid (`parsed isArray=true count=0`), so nothing is wrong
   today. But the only alarm is a Vercel log line, and the app has no other place where a
   silent fail-open is covered by a log nobody reads. *One thing that closes it:* decide
   whether the Monday check-in should assert this row parses as an array, which would turn an
   unwatched fail-open into a weekly check.

6. **Whether any role other than the five live accounts will exist.** Every
   "a VIEWER could do X" assessment above is bounded by the live table: 2 ADMIN, 1 RECRUITER,
   2 HIRING_MANAGER, 0 VIEWER, 0 allowlist-restricted, 0 module-restricted. Several findings
   (CERTAIN 3, 4, 7) are ranked on the assumption that a VIEWER account is a thing that will
   exist. `auth.ts:70` returns `VIEWER` for every new team member by default, so the first
   person who signs in from an allowed domain *is* one. *One thing that closes it:* confirming
   whether anyone outside the five is expected to sign in, which moves CERTAIN 4 from
   "theoretical today" to "live".

7. **No role gate on travel receipts, employee vCards, or the supervisor search, and I
   cannot tell whether that is intended.** `app/api/travel/receipts/[id]/route.ts:14` is
   `files:read`, so any role can download any travel receipt (hotel folios, which carry
   addresses); `app/api/new-hires/[id]/vcard/route.ts` is `requireApiUser`, so any role gets
   any employee's phone and email; `app/api/new-hires/supervisor-search/route.ts` is
   `candidates:read`. None applies any object scope, and employee records have no scoping
   mechanism at all (the allowlist and department restriction are both candidate-side). This
   may be exactly right — VIEWER is documented as read-only-everything. *One thing that
   closes it:* the user saying whether a VIEWER should be able to download travel receipts
   and employee contact cards. If no, employees need a scoping mechanism, which is a feature,
   not a fix.

---

## Counts

| Measure | Number |
|---|---|
| `app/api/**/route.ts` files | 162 |
| Exported HTTP handlers across them | 245 |
| — GET / POST / PATCH / DELETE / PUT | 60 / 99 / 41 / 40 / 5 |
| Route files referencing a canonical auth helper | 153 |
| Route files referencing none | 9 (all traced: 2 NextAuth/public-by-design files, 3 public booking, 4 cron) |
| Handlers with an in-body auth / cron / signature gate | 235 |
| Handlers with none | 10 (2 NextAuth, 3 public booking, 5 `workspace-settings` GETs on middleware only) |
| Auth calls whose `.ok` result is never checked | **0** |
| Write handlers (POST/PUT/PATCH/DELETE) | 185 |
| — gated on an explicit permission string | 163 |
| — `requireApiUser` + `canWriteModule` | 9 |
| — `requireApiUser` + permission-or-annotate (+ authorship on edits) | 10 |
| — no role gate beyond "signed in" | **2**, both by design (`feedback` POST, `user-home` POST) |
| Unauthenticated write handlers | **1**, by design (`POST /api/book/[slug]`) |
| Middleware protected page prefixes / API prefixes | 27 / 19 |
| Page routes (`page.tsx`) | 67 |
| Page routes with neither a self-gate nor a middleware prefix | **0** |
| Non-API route handlers under `app/` | 1 (`app/handbook/[slug]/raw/route.ts`, now double-gated) |
| Exported server actions | 60, in 9 files |
| — guarded | 58 |
| — **unguarded** | **2** (`app/compliments/actions.ts:29, :79`) |
| Server-action guard helpers that skip the blocklist | 6 (+2 in `lib/`) |
| `isEmailBlocked` enforcement points in the whole app | **2** (`route-auth.ts:100`, `module-access.ts:100`) |
| `isCandidateVisible` call sites outside the scope module | 30 |
| — department-aware candidate gates | **4** (all list-shaped, all in `lib/data/candidates.ts`) |
| — department-blind per-record gates | **28** |
| `canWriteModule` call sites | 9 (2 modules: `candidates`, `people`) |
| `$queryRaw` / `$executeRaw` in `app/` + `lib/` | **0** (1 repo-wide, in a dev script, clamped integer) |
| API route files using zod | 23 of 162 |
| Bodies spread into a Prisma `data` object | **0** |
| Security headers set by the app (CSP, XFO, XCTO, HSTS, Referrer-Policy, Permissions-Policy) | **0** |
| `Access-Control-Allow-*` headers anywhere | **0** |
| Routes reflecting an `Origin` | **0** |
| `dangerouslySetInnerHTML` sites | 8 (2 render unsanitized third-party HTML) |
| Routes echoing a stored `mimeType` into `Content-Type` | 3 (2 routes pin it safely — the positive control) |
| Committed secrets found outside `.env*` | **0** (3 grep hits, all documentation placeholders; pattern proven to fire on `.env`/`.env.local`) |
| **Live:** `User` rows | 5 — 2 ADMIN, 1 RECRUITER, 2 HIRING_MANAGER, 0 VIEWER |
| **Live:** `restrictCandidatesToAllowlist` | 0 of 5 |
| **Live:** `restrictCandidatesToDepartment` | **1 of 5** (`rp***@skyshare.com`) |
| **Live:** `moduleAccessJson` set | 0 of 5 |
| **Live:** `UserCandidateAccess` rows | 0 |
| **Live:** `workspace/auth-blocklist` | valid JSON array, **0 entries** |
| **Live:** `CandidateFile` rows | 6,558 — 0 `text/html`; 6,515 keys under `candidate-files/`, 43 null, **0 elsewhere** |
| **Live:** `ReportShareLink` rows | 1 live, 16-char token, created 2026-07-07, never revoked, no expiry column |
| **Live:** `new-hire-contacts/share-token` | present, 16 chars |
| **Live:** `Account` rows | 5 — all 5 carry `calendar.events` + a refresh token, **0 carry any gmail scope** |

---

## Appendix — the gate on every exported method of all 162 API routes

Generated from the per-handler parse. `NONE` in this table means "no *canonical* helper in
that handler's body" — `user-home` POST uses `getServerSession` directly and the five
`workspace-settings` GETs rely on the middleware prefix; see §2a/§2b for what each actually
is. `requireApiUser` rows all carry a secondary gate documented in §2c.

| route (under `app/api/`) | method:gate |
|---|---|
| admin/access/route.ts | GET:settings:admin, DELETE:settings:admin |
| admin/invites/route.ts | GET:settings:admin, POST:settings:admin, DELETE:settings:admin |
| admin/users/[id]/route.ts | PATCH:settings:admin, DELETE:settings:admin |
| auth/[...nextauth]/route.ts | GET:NONE, POST:NONE |
| availability-overrides/[id]/route.ts | DELETE:calendar:write |
| availability-overrides/route.ts | GET:calendar:write, POST:calendar:write |
| blocks/[id]/apply/route.ts | POST:jobs:write |
| blocks/[id]/duplicate/route.ts | POST:jobs:write |
| blocks/[id]/placement/route.ts | PATCH:jobs:write |
| blocks/[id]/retire/route.ts | PATCH:jobs:write, DELETE:jobs:write |
| blocks/[id]/route.ts | PATCH:jobs:write |
| blocks/route.ts | POST:jobs:write |
| book/[slug]/route.ts | GET:NONE, POST:NONE |
| book/[slug]/slots/route.ts | GET:NONE |
| booking-hosts/[id]/availability/route.ts | PUT:calendar:write |
| booking-hosts/[id]/route.ts | GET:calendar:write, PATCH:calendar:write, DELETE:calendar:write |
| booking-hosts/route.ts | GET:calendar:write, POST:calendar:write |
| booking-types/[id]/route.ts | PATCH:calendar:write, DELETE:calendar:write |
| booking-types/route.ts | POST:calendar:write |
| calendar/sync/route.ts | POST:calendar:write |
| candidate-applications/[id]/route.ts | PATCH:candidates:write, DELETE:candidates:write |
| candidate-applications/batch/route.ts | POST:candidates:write |
| candidate-applications/route.ts | POST:candidates:write |
| candidate-files/[id]/route.ts | GET:files:read, PATCH:files:write, DELETE:files:write |
| candidate-files/unassigned/route.ts | GET:files:read |
| candidate-metrics/[id]/route.ts | PATCH:candidates:write, DELETE:candidates:write |
| candidate-stages/route.ts | GET:candidates:read, PUT:candidates:write |
| candidate-views/[id]/route.ts | GET:candidates:read, PATCH:candidates:write, DELETE:candidates:write |
| candidate-views/route.ts | GET:candidates:read, POST:candidates:write |
| candidates/[id]/ai-summary/route.ts | GET:candidates:read, POST:candidates:write |
| candidates/[id]/employee/route.ts | GET:candidates:read |
| candidates/[id]/extract-metrics/route.ts | POST:candidates:write |
| candidates/[id]/files/link/route.ts | POST:files:write |
| candidates/[id]/files/route.ts | POST:files:write |
| candidates/[id]/interviews/[interviewId]/route.ts | PATCH:requireApiUser, DELETE:requireApiUser |
| candidates/[id]/interviews/route.ts | POST:requireApiUser |
| candidates/[id]/metrics/route.ts | POST:candidates:write |
| candidates/[id]/notes/[noteId]/route.ts | PATCH:requireApiUser, DELETE:requireApiUser |
| candidates/[id]/notes/route.ts | POST:requireApiUser |
| candidates/[id]/route.ts | GET:candidates:read, PATCH:requireApiUser, DELETE:settings:admin |
| candidates/[id]/tags/route.ts | POST:candidates:write, DELETE:candidates:write |
| candidates/department/route.ts | PATCH:candidates:write |
| candidates/route.ts | GET:candidates:read, POST:candidates:write |
| contacts/vcard/route.ts | GET:share token |
| cron/calendar-sync/route.ts | GET:CRON_SECRET |
| cron/orientation-reminder/route.ts | GET:CRON_SECRET |
| cron/paycom-scan/route.ts | GET:CRON_SECRET |
| cron/pilot-app-scan/route.ts | GET:CRON_SECRET |
| disposition-reasons/route.ts | GET:candidates:read, PUT:candidates:write, POST:candidates:write |
| document-intake/route.ts | POST:files:write |
| duplicate-review/candidates/reopen/route.ts | POST:duplicates:write |
| duplicate-review/candidates/resolve/route.ts | POST:duplicates:write |
| duplicate-review/candidates/scan/route.ts | POST:duplicates:write |
| events/[id]/attendees/route.ts | POST:events:write |
| events/[id]/route.ts | PATCH:events:write, DELETE:events:write |
| events/[id]/supplies/route.ts | POST:events:write |
| events/[id]/tasks/route.ts | POST:events:write |
| events/attendees/[id]/route.ts | PATCH:events:write, DELETE:events:write |
| events/leads/import/route.ts | POST:events:write |
| events/leads/route.ts | GET:events:write, POST:events:write |
| events/leads/skip/route.ts | POST:events:write, DELETE:events:write |
| events/route.ts | POST:events:write |
| events/supplies/[id]/route.ts | PATCH:events:write, DELETE:events:write |
| events/supply-items/[id]/route.ts | PATCH:events:write, DELETE:events:write |
| events/supply-items/route.ts | POST:events:write |
| events/tasks/[id]/route.ts | PATCH:events:write, DELETE:events:write |
| feedback/[id]/image/[imageId]/route.ts | GET:settings:admin |
| feedback/[id]/image/route.ts | GET:settings:admin |
| feedback/[id]/route.ts | PATCH:settings:admin, DELETE:settings:admin |
| feedback/route.ts | POST:requireApiUser, GET:settings:admin |
| fleet/link-employee/route.ts | POST:candidates:write |
| fleet/people-search/route.ts | GET:candidates:read |
| fleet/seat-backups/route.ts | GET:candidates:read |
| front/scan-paycom/route.ts | POST:candidates:write |
| front/scan-pilot-apps/route.ts | POST:candidates:write+files:write |
| front/templates/route.ts | GET:candidates:write |
| front/webhook/route.ts | POST:HMAC signature |
| imports/candidates/route.ts | POST:imports:write |
| imports/files/complete/route.ts | POST:files:write |
| imports/files/presign/route.ts | POST:files:write |
| imports/files/route.ts | POST:files:write |
| imports/job-pdfs/route.ts | POST:imports:write |
| imports/jobs/route.ts | POST:imports:write |
| imports/requirements/route.ts | POST:requirements:write |
| interview-questions/[id]/route.ts | PATCH:calendar:write, DELETE:calendar:write |
| interview-questions/route.ts | GET:calendar:read, POST:calendar:write |
| interview-scorecards/[id]/route.ts | PATCH:requireApiUser, DELETE:requireApiUser |
| interview-scorecards/route.ts | POST:requireApiUser |
| interviews/[id]/route.ts | PATCH:calendar:write, DELETE:calendar:write |
| interviews/debrief/route.ts | GET:calendar:read, POST:candidates:write |
| interviews/debrief/schedule-marker/route.ts | POST:calendar:write |
| interviews/route.ts | POST:calendar:write |
| job-block-instances/[id]/route.ts | PATCH:jobs:write, DELETE:jobs:write |
| jobs/[id]/blocks/route.ts | POST:jobs:write, PATCH:jobs:write |
| jobs/[id]/route.ts | PATCH:jobs:write |
| jobs/bulk-status/route.ts | PATCH:jobs:write |
| jobs/duplicates/clusters/route.ts | GET:jobs:read |
| jobs/duplicates/dismiss/route.ts | GET:jobs:read, POST:jobs:write, DELETE:jobs:write |
| jobs/duplicates/route.ts | GET:jobs:read |
| jobs/merge/route.ts | POST:jobs:write |
| jobs/merged/route.ts | GET:jobs:read |
| jobs/unmerge/route.ts | POST:jobs:write |
| new-hires/[id]/cards/[cardId]/route.ts | PATCH:candidates:write, DELETE:candidates:write |
| new-hires/[id]/cards/route.ts | GET:requireApiUser, POST:candidates:write |
| new-hires/[id]/onboarding-rounds/[archiveId]/restore/route.ts | POST:requireApiUser |
| new-hires/[id]/onboarding-rounds/[archiveId]/route.ts | PATCH:requireApiUser |
| new-hires/[id]/onboarding-rounds/route.ts | GET:requireApiUser, POST:requireApiUser |
| new-hires/[id]/roles/route.ts | POST:candidates:write |
| new-hires/[id]/route.ts | PATCH:requireApiUser, DELETE:requireApiUser |
| new-hires/[id]/tasks/route.ts | POST:requireApiUser |
| new-hires/[id]/vcard/route.ts | GET:requireApiUser |
| new-hires/bulk-delete/route.ts | POST:requireApiUser |
| new-hires/bulk/route.ts | POST:candidates:write |
| new-hires/import/route.ts | POST:candidates:write |
| new-hires/merge/route.ts | POST:requireApiUser |
| new-hires/roles/[roleId]/route.ts | PATCH:candidates:write, DELETE:candidates:write |
| new-hires/route.ts | POST:candidates:write |
| new-hires/supervisor-search/route.ts | GET:candidates:read |
| offers/[applicationId]/route.ts | POST:candidates:write |
| offers/[applicationId]/steps/route.ts | POST:candidates:write |
| onboarding-grid/route.ts | PATCH:candidates:write, PUT:candidates:write, POST:candidates:write |
| onboarding-milestones/route.ts | GET:candidates:read, POST:candidates:write, PATCH:candidates:write, DELETE:candidates:write |
| onboarding-tasks/[id]/route.ts | PATCH:candidates:write |
| onboarding-tasks/bulk/route.ts | POST:candidates:write |
| onboarding/dashboard-hidden/route.ts | POST:candidates:write |
| orientation/attendees/[id]/move/route.ts | POST:candidates:write |
| orientation/attendees/[id]/route.ts | PATCH:candidates:write, DELETE:candidates:write |
| orientation/email-cc/route.ts | GET:candidates:write, POST:candidates:write |
| orientation/prep-defaults/route.ts | GET:candidates:write, POST:candidates:write |
| orientation/prep-tasks/[id]/route.ts | PATCH:candidates:write, DELETE:candidates:write |
| orientation/prep-tasks/route.ts | POST:candidates:write |
| orientation/reminder-health/route.ts | GET:candidates:write |
| orientation/sessions/[id]/attendees/route.ts | POST:candidates:write |
| orientation/sessions/[id]/calendar/route.ts | GET:candidates:write, POST:candidates:write |
| orientation/sessions/[id]/lunch-file/route.ts | POST:files:write, GET:files:read, DELETE:files:write |
| orientation/sessions/[id]/reminder/route.ts | GET:candidates:write, POST:candidates:write |
| orientation/sessions/[id]/route.ts | PATCH:candidates:write, DELETE:candidates:write |
| orientation/sessions/route.ts | POST:candidates:write |
| orientation/templates/route.ts | GET:candidates:read, POST:candidates:write, PATCH:candidates:write, DELETE:candidates:write |
| page-layout/[key]/route.ts | PUT:settings:admin |
| pilot-requirements/[id]/posting-check/route.ts | POST:requirements:write |
| pilot-requirements/[id]/route.ts | PATCH:requirements:write |
| pilot-requirements/route.ts | GET:requirements:read, POST:requirements:write |
| recruiting-jobs/[id]/route.ts | PATCH:jobs:write |
| recruiting-jobs/route.ts | GET:jobs:read, POST:jobs:write |
| reports-share/route.ts | GET:settings:admin, POST:settings:admin, DELETE:settings:admin |
| resume-intake/route.ts | POST:candidates:write |
| tags/archive/route.ts | GET:candidates:read, POST:candidates:write |
| tags/route.ts | GET:candidates:read, PATCH:candidates:write, DELETE:candidates:write, POST:candidates:write |
| travel/[tripId]/receipts/route.ts | POST:files:write |
| travel/receipts/[id]/route.ts | GET:files:read, DELETE:files:write |
| user-home/route.ts | POST:NONE (getServerSession directly — see §2a) |
| users/[id]/route.ts | DELETE:settings:admin |
| users/route.ts | GET:settings:admin |
| workspace-settings/branding/route.ts | GET:NONE (middleware only), POST:settings:admin |
| workspace-settings/department-colors/route.ts | GET:NONE (middleware only), POST:settings:admin |
| workspace-settings/employee-columns/route.ts | POST:settings:admin |
| workspace-settings/fleet-crew-roster/route.ts | GET:NONE (middleware only), POST:settings:admin |
| workspace-settings/fleet-mx-roster/route.ts | GET:NONE (middleware only), POST:settings:admin |
| workspace-settings/module-access/route.ts | POST:settings:admin |
| workspace-settings/new-hire-contacts/route.ts | GET:NONE (middleware only), POST:settings:admin |
| workspace-settings/new-hire-contacts/share-token/route.ts | POST:settings:admin |
