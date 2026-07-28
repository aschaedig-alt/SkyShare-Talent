# Building a module that will merge into SkyShare Talent-Ops

Read this before writing any code. Following it means your app drops in as a
pull request that touches almost nothing anyone else owns. Ignoring it means
someone rewrites your work by hand at merge time.

The guiding rule: **your feature should be deletable.** If removing your folders
leaves the app working, you built it right.

---

## 1. Use exactly this stack

Do not substitute. A different router, ORM, or styling system cannot be merged —
it has to be rewritten.

| | |
|---|---|
| Framework | **Next.js 15.5, App Router** (not Pages Router) |
| Language | **TypeScript 5.7**, strict |
| React | **19.2** — Server Components by default |
| Database | **PostgreSQL** via **Prisma 7.8** |
| Styling | **Tailwind CSS 3.4** — no CSS modules, no styled-components, no MUI |
| Forms | `react-hook-form` + `zod` |
| Icons | `lucide-react` — no other icon set |
| Auth | `next-auth` v4 |

**Adding a dependency needs a reason.** Every new package is something we carry
forever. Check whether `clsx`, `zod`, `date-fns`-free date helpers, or an
existing `lib/` helper already does it. If you genuinely need one, list it in
your handover notes with a sentence on why.

---

## 2. Namespace everything under one feature name

Pick one short kebab-case name — say `crew-scheduling` — and put **everything**
under it:

```
app/crew-scheduling/          your pages
app/api/crew-scheduling/      your API routes
components/crew-scheduling/   your components
lib/crew-scheduling/          your logic, types, constants
```

Database tables get a **PascalCase prefix**: `CrewSchedulingShift`,
`CrewSchedulingBlackout`.

Do not create files at the top level of `components/` or `lib/`. Do not name a
table something generic like `Shift` or `Event` — those names are taken or will
be.

### Never edit shared files

Several people work in this repo at once. **Do not touch** any of these — if you
think you need to, write it in your handover notes instead and we will wire it:

- `prisma/schema.prisma` (see §4 for what to send us instead)
- `tailwind.config.ts`, `app/globals.css`
- `app/layout.tsx`, the navigation config, `middleware.ts`
- `lib/roadmap/roadmap.ts`
- anything under `lib/auth/`
- any existing file you did not create

---

## 3. Import with the `@/` alias

`@/` maps to the repo root. Always use it — never `../../../lib/thing`.

```ts
import { prisma } from "@/lib/prisma";
import { ShiftCard } from "@/components/crew-scheduling/ShiftCard";
```

**The Prisma client is generated to a non-default location.** In app code, always
import the shared instance from `@/lib/prisma` — never `new PrismaClient()`, and
never import from `@prisma/client` directly.

---

## 4. Database rules

### Use your own database. Not ours.

Our `DATABASE_URL` points at a **single Neon Postgres that both production and
local development share.** There is no staging copy. You will not be given
access, and you must not ask a teammate to paste theirs.

Run your own local Postgres, put it in your own `.env`, and develop against that.
Seed it with **invented** data. Never use real names, emails, phone numbers, or
resumes.

### Send us schema as a written spec, not an edit

Do not edit `prisma/schema.prisma` — you would conflict with everyone else. Keep
your models in a **separate file** in your folder, e.g.
`lib/crew-scheduling/schema.prisma.txt`, and we will merge them in.

### Three hard schema conventions

**No Prisma enums.** This repo has zero, deliberately — adding a value to an enum
needs a migration, and these lists change. Use `String` with the allowed values
in a comment above it, and a `const` list as the source of truth:

```prisma
model CrewSchedulingShift {
  id     String @id @default(cuid())
  // DRAFT | PUBLISHED | CANCELED
  status String @default("DRAFT")
}
```

```ts
// lib/crew-scheduling/constants.ts
export const SHIFT_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "CANCELED", label: "Canceled" }
] as const;

export function isShiftStatus(v: string): boolean {
  return SHIFT_STATUSES.some((s) => s.value === v);
}
```

**Every new column is nullable or has a default.** A required column without a
default cannot be added to a live table that already has rows.

**Store timestamps as `DateTime` (UTC), never a formatted string.** If you record
a wall-clock time that belongs to a place — a departure, a shift start — store
the instant *and* keep the location, and convert at the point of display. Do not
do timezone arithmetic by hand or by hardcoding an offset; this has caused real
bugs here.

---

## 5. The design system is locked

Match the surrounding app. Do not introduce a new visual language.

- **4px corners everywhere.** `tailwind.config.ts` collapses the whole radius
  scale to 4px, so any `rounded-*` class gives you 4px. Just use `rounded`.
- **`rounded-full` is for circles only** — avatars and icon chips.
  **Pills and badges are rectangles.** This is the single most common mistake.
- **Brand colours** (already in the Tailwind config — use the token, never a hex
  literal): `brand-lea` `#0d2c43` navy, `brand-gold` `#eaaa00`,
  `brand-eden` `#466481`, `brand-sweet` `#a6c9e7`,
  `brand-cloudDancer` `#f0eee9`, `brand-grey` `#63666a`,
  `brand-panel` `#10243a` (dark-mode surface).
- **Selected state = navy + gold. Hover = the gold glow** (`hover:shadow-glow`).
- **Dark mode ships and is class-based** (`darkMode: "class"`). Style both:
  every surface needs its `dark:` variant. Check your screens in both.

---

## 6. Anything that navigates must be a real link

Non-negotiable, and it comes up in review every time.

- Click changes the **whole screen** to another page → `<Link href="...">`, so it
  is ctrl-clickable and right-clickable into a new tab.
- Click only swaps a **pane on the same page** → `<button onClick>`.
- **Never `router.push()` for content navigation.**

---

## 7. Server and client components

Server Components are the default — about 20% of components here are client
components, and that ratio is intentional.

Add `"use client"` only when you need state, effects, or event handlers. Keep it
at the **leaf**: fetch data in a Server Component and pass it down, rather than
making a whole page client-side to get one interactive button.

Data fetching goes in `lib/crew-scheduling/data.ts` as plain async functions the
Server Component awaits. Do not `fetch()` your own API routes from a Server
Component.

---

## 8. Mutations: Server Actions, and always gate them

Prefer a Server Action in `app/crew-scheduling/actions.ts` over an API route. Use
an API route only for genuinely external callers (webhooks, uploads).

**Every action and route must check permission first.** There is no such thing as
a mutation that trusts the caller:

```ts
"use server";

import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

export type ShiftResult = { ok: boolean; error?: string; shiftId?: string };

export async function publishShift(id: string): Promise<ShiftResult> {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return { ok: false, error: "Not allowed" };

  // Validate input. Never trust a string from the client.
  if (!id) return { ok: false, error: "Missing id" };

  const shift = await prisma.crewSchedulingShift.update({
    where: { id },
    data: { status: "PUBLISHED" }
  });
  return { ok: true, shiftId: shift.id };
}
```

Return `{ ok, error? }` — do not throw across the boundary. Never return a raw
database row to the client; map it to a view type you define.

**Pick from the existing permission list — do not invent one.** The whole set is:
`candidates:read` `candidates:write` `files:read` `files:write` `jobs:read`
`jobs:write` `requirements:read` `requirements:write` `calendar:read`
`calendar:write` `imports:write` `duplicates:write` `events:read`
`events:write` `publishing:write` `settings:admin`. If none fits your feature,
use the closest one and flag it in your handover notes — adding a permission
means editing a shared file, which is ours to do.

**Local dev bypasses auth here.** A control you can click on your machine may be
hidden for a real user in production, so never assume a permission gate works
just because the page rendered.

---

## 9. Secrets and personal data

- Never commit a secret. `.env` files stay out of git. A database credential was
  committed to this repo once already.
- Read config through `process.env.SOMETHING` and **fail closed** if it is
  missing — refuse to run rather than falling back to something insecure.
- Do not log personal data — no names, emails, phones, or document contents in
  `console.log`.
- Do not add a third-party analytics or error-reporting service.

---

## 10. Comments: explain why, not what

The house style is comments that carry the reason, especially where something
looks odd. `// increment i` is noise. This is the standard:

```ts
// The signature covers the raw bytes, so the body must be read as text BEFORE
// being parsed — re-serialising the JSON would change it and never match.
const rawBody = await request.text();
```

If you hit a surprising constraint, leave the note. It saves the next person the
same hour you just lost.

---

## 11. Before you hand it over

Run these and make sure they are clean:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json
```

```bash
npm run lint
```

Note: the typecheck **fails silently if you pipe it** — an out-of-memory crash
goes to stderr and the errors never print, so `tsc --noEmit | grep MyFile` looks
like a pass when it is not. Run it exactly as above and read the whole output.

### Checklist

- [ ] Everything lives under my one feature name; nothing else was edited
- [ ] Tables are prefixed and my schema is a **separate spec file**
- [ ] No Prisma enums; new columns nullable or defaulted
- [ ] Typecheck and lint clean
- [ ] Works in **light and dark**; 4px corners; pills are rectangles
- [ ] Page-to-page navigation uses `<Link>`
- [ ] Every mutation checks permission and validates input
- [ ] No secrets, no real personal data, no new dependencies without a reason
- [ ] Deleting my folders leaves the app working

### Also send us

1. **What it does**, in a few plain sentences.
2. **Your schema spec** and whether it needs to reference existing tables (say
   which, and how — we will wire the relation).
3. **Any environment variable** you added, and what it is for.
4. **What is unfinished, untested, or known-broken.** Say it plainly. An honest
   list of gaps is worth more than a clean-looking handover, and we will find out
   anyway.
