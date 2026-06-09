# SkyShare Job Builder Integration Handoff

This document is the practical handoff for moving the SkyShare Job Post Builder into another Next.js app while keeping it as one unified product area.

Recommended structure: the host app should have one main navigation item called **Job Builder**. Inside that area, Job Builder should keep its own sidebar for its recruiting-specific workflow.

## Recommended UX Structure

Use a nested app area:

```text
Host App
  Main sidebar
    Dashboard
    Sales
    Aircraft
    Job Builder  -> /job-builder/jobs
    Settings

Job Builder area
  Job Builder sidebar
    Job Posts
    Final Review
    Templates
    Content Blocks
    Changes
    Approvals
    Settings
    Sandbox Lab
```

Why this is best:

- The host app stays clean with one entry point.
- Recruiting-specific pages stay grouped together.
- The Job Builder workflow can evolve without cluttering the main app navigation.
- Sandbox Lab can stay visible to builders but clearly separated from daily work.
- Future permissions can hide the whole Job Builder module or individual Job Builder sidebar items.

## Mount Path

Use this path in the other app:

```text
/job-builder
/job-builder/jobs
/job-builder/review
/job-builder/templates
/job-builder/blocks
/job-builder/changes
/job-builder/approvals
/job-builder/settings
/job-builder/sandbox
```

The current local app uses:

```text
/jobs
/review
/templates
/blocks
/changes
/approvals
/settings
/jobs-sandbox
```

When integrating, move those routes under `/job-builder`.

## Dependencies To Add

Add these to the other app if they are not already installed:

```json
{
  "@dnd-kit/core": "^6.1.0",
  "@dnd-kit/sortable": "^8.0.0",
  "@dnd-kit/utilities": "^3.2.2",
  "@hookform/resolvers": "^3.9.0",
  "@prisma/adapter-better-sqlite3": "^7.8.0",
  "@prisma/client": "^7.8.0",
  "clsx": "^2.1.1",
  "dotenv": "^17.4.2",
  "lucide-react": "^0.468.0",
  "react-hook-form": "^7.53.2",
  "zod": "^3.23.8"
}
```

Dev dependencies:

```json
{
  "@types/better-sqlite3": "^7.6.13",
  "prisma": "^7.8.0",
  "tsx": "^4.19.2"
}
```

If the host app already uses Prisma, do not create a second Prisma setup. Merge the models below into the host app schema instead.

## Environment

For local SQLite development:

```env
DATABASE_URL="file:./prisma/dev.db"
```

For a shared production database later, change `DATABASE_URL` to that database connection string and convert the Prisma datasource if needed.

## Prisma Models To Merge

Add these models to the host app Prisma schema. If the host app already has a `User`, `Company`, or `Department` model, these can later be related to those models.

```prisma
model JobPost {
  id                  String             @id @default(cuid())
  title               String
  internalName        String?
  department          String?
  category            String?
  location            String?
  secondaryLocation   String?
  positionType        String?
  salaryRange         String?
  reportsTo           String?
  positionCode        String?
  seatCode            String?
  travelPercentage    String?
  educationLevel      String?
  workSchedule        String?
  summary             String?
  keyResponsibilities String?
  qualificationsText  String?
  benefitsText        String?
  postedDate          DateTime?
  status              String             @default("DRAFT")
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  paycom              PaycomConfig?
  blockInstances      JobBlockInstance[]
}

model PaycomConfig {
  id                  String   @id @default(cuid())
  jobPostId           String   @unique
  workflow            String?
  externalApplication String?
  externalKnockout    String?
  externalGlobal      String?
  externalJobLevel    String?
  externalFollowUps   String?
  internalApplication String?
  internalKnockout    String?
  internalGlobal      String?
  internalJobLevel    String?

  jobPost             JobPost  @relation(fields: [jobPostId], references: [id], onDelete: Cascade)
}

model ContentBlock {
  id               String                @id @default(cuid())
  name             String
  description      String?
  category         String
  scope            String
  placement        String                @default("OPTIONAL")
  currentVersionId String?
  archivedAt       DateTime?
  createdAt        DateTime              @default(now())
  updatedAt        DateTime              @updatedAt

  versions         ContentBlockVersion[] @relation("BlockVersions")
  usages           JobBlockInstance[]
}

model ContentBlockVersion {
  id             String             @id @default(cuid())
  contentBlockId String
  versionNumber  Int
  title          String
  body           String
  plainText      String?
  bodyFormat     String             @default("BULLET_LIST")
  textWeight     String             @default("NORMAL")
  textColor      String             @default("BLACK")
  createdAt      DateTime           @default(now())
  changeNote     String?

  contentBlock   ContentBlock       @relation("BlockVersions", fields: [contentBlockId], references: [id], onDelete: Cascade)
  jobInstances   JobBlockInstance[]

  @@unique([contentBlockId, versionNumber])
}

model JobBlockInstance {
  id             String               @id @default(cuid())
  jobPostId      String
  contentBlockId String?
  blockVersionId String?
  sortOrder      Int
  sectionKey     String
  mode           String               @default("LINKED")
  customTitle    String?
  customBody     String?
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  jobPost        JobPost              @relation(fields: [jobPostId], references: [id], onDelete: Cascade)
  contentBlock   ContentBlock?        @relation(fields: [contentBlockId], references: [id], onDelete: SetNull)
  blockVersion   ContentBlockVersion? @relation(fields: [blockVersionId], references: [id], onDelete: SetNull)
}

model Template {
  id        String          @id @default(cuid())
  name      String
  isLocked  Boolean         @default(true)
  version   Int             @default(1)
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  tokens    TemplateToken[]
}

model TemplateToken {
  id         String   @id @default(cuid())
  templateId String
  key        String
  value      String
  locked     Boolean  @default(true)

  template   Template @relation(fields: [templateId], references: [id], onDelete: Cascade)
}
```

## Files To Copy

Copy these folders into the host app:

```text
components/content-blocks
components/final-review
components/job-editor
components/job-preview
components/shared
components/template-tokens
lib/blocks
lib/data
lib/formatting
lib/seed
lib/validation
lib/types.ts
lib/prisma.ts
prisma/seed.ts
prisma/ensure-dev-db.ts
prisma/import-master-jobs.ts
prisma/schema-sql.ts
```

Do not copy these generated/local files unless you intentionally want the local development database:

```text
prisma/generated
prisma/dev.db
.next
node_modules
```

## Routes To Move

Create this route structure in the host app:

```text
app/job-builder/layout.tsx
app/job-builder/page.tsx
app/job-builder/jobs/page.tsx
app/job-builder/review/page.tsx
app/job-builder/templates/page.tsx
app/job-builder/blocks/page.tsx
app/job-builder/changes/page.tsx
app/job-builder/approvals/page.tsx
app/job-builder/settings/page.tsx
app/job-builder/sandbox/page.tsx
```

Move the current page contents like this:

```text
app/jobs/page.tsx          -> app/job-builder/jobs/page.tsx
app/review/page.tsx        -> app/job-builder/review/page.tsx
app/templates/page.tsx     -> app/job-builder/templates/page.tsx
app/blocks/page.tsx        -> app/job-builder/blocks/page.tsx
app/changes/page.tsx       -> app/job-builder/changes/page.tsx
app/approvals/page.tsx     -> app/job-builder/approvals/page.tsx
app/settings/page.tsx      -> app/job-builder/settings/page.tsx
app/jobs-sandbox/page.tsx  -> app/job-builder/sandbox/page.tsx
```

Move API routes under the same app unchanged:

```text
app/api/blocks
app/api/job-block-instances
app/api/jobs
```

These API paths can stay global because they are backend endpoints, not navigation pages.

## Job Builder Layout With Its Own Sidebar

Create this file in the host app:

```tsx
// app/job-builder/layout.tsx
import { JobBuilderSidebar } from "@/components/job-builder-layout/JobBuilderSidebar";

export default function JobBuilderLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-brand-cloudDancer text-brand-black">
      <div className="flex min-h-screen">
        <JobBuilderSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
```

Create a Job Builder specific sidebar:

```tsx
// components/job-builder-layout/JobBuilderSidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Blocks,
  ClipboardList,
  FileCheck2,
  FileClock,
  FileText,
  LayoutPanelTop,
  Settings,
  ShieldCheck,
  Stamp
} from "lucide-react";
import { clsx } from "clsx";

const navItems = [
  { href: "/job-builder/jobs", label: "Job Posts", icon: ClipboardList },
  { href: "/job-builder/review", label: "Final Review", icon: FileCheck2 },
  { href: "/job-builder/templates", label: "Templates", icon: Stamp },
  { href: "/job-builder/blocks", label: "Content Blocks", icon: Blocks },
  { href: "/job-builder/changes", label: "Changes", icon: FileClock },
  { href: "/job-builder/approvals", label: "Approvals", icon: ShieldCheck },
  { href: "/job-builder/settings", label: "Settings", icon: Settings },
  { href: "/job-builder/sandbox", label: "Sandbox Lab", icon: LayoutPanelTop }
];

export function JobBuilderSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-brand-lea text-white lg:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-white/10">
              <FileText className="h-5 w-5 text-brand-gold" />
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-sweet">
                SkyShare
              </div>
              <div className="text-lg font-semibold leading-tight">Job Builder</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-white text-brand-lea shadow-sm"
                    : "text-white/78 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-white/60">
          Job Builder
          <br />
          Template locked
        </div>
      </div>
    </aside>
  );
}
```

Redirect the module root to Job Posts:

```tsx
// app/job-builder/page.tsx
import { redirect } from "next/navigation";

export default function JobBuilderHomePage() {
  redirect("/job-builder/jobs");
}
```

## Update Route Links In Existing Components

Search for hardcoded route links and change them:

```text
/jobs          -> /job-builder/jobs
/review        -> /job-builder/review
/templates     -> /job-builder/templates
/blocks        -> /job-builder/blocks
/changes       -> /job-builder/changes
/approvals     -> /job-builder/approvals
/settings      -> /job-builder/settings
/jobs-sandbox  -> /job-builder/sandbox
```

Current components most likely affected:

```text
components/layout/Sidebar.tsx
app/page.tsx
```

If you use the new `JobBuilderSidebar`, you do not need to copy the old `components/layout/Sidebar.tsx` or `components/layout/AppShell.tsx`.

## Brand Tokens

Add these Tailwind tokens to the host app:

```ts
// tailwind.config.ts
colors: {
  brand: {
    red: "#ba0c2f",
    cloudDancer: "#f0eee9",
    gold: "#eaaa00",
    sweet: "#a6c9e7",
    eden: "#466481",
    lea: "#0d2c43",
    grey: "#76787b",
    black: "#302f31"
  }
},
boxShadow: {
  panel: "0 18px 45px rgba(13, 44, 67, 0.10)"
}
```

Add or merge these global styles:

```css
:root {
  --skyshare-red: #ba0c2f;
  --skyshare-cloud-dancer: #f0eee9;
  --skyshare-gold: #eaaa00;
  --skyshare-sweet: #a6c9e7;
  --skyshare-eden: #466481;
  --skyshare-lea: #0d2c43;
  --skyshare-grey: #76787b;
  --skyshare-black: #302f31;
}

body {
  font-family: Verdana, Geneva, sans-serif;
}

button,
code,
input,
pre,
select,
textarea {
  font: inherit;
}

.preview-paper {
  background:
    linear-gradient(180deg, rgba(13, 44, 67, 0.02), rgba(13, 44, 67, 0)),
    #fff;
}
```

## Prisma Client Import Note

This app currently generates Prisma Client to:

```prisma
generator client {
  provider = "prisma-client"
  output   = "./generated/client"
}
```

That means `lib/prisma.ts` imports:

```ts
import { PrismaClient } from "../prisma/generated/client/client";
```

If the host app uses the normal Prisma output, change `lib/prisma.ts` to:

```ts
import { PrismaClient } from "@prisma/client";
```

Keep the better-sqlite adapter only if the host app stays on SQLite.

## Scripts To Add

Add whichever scripts fit the host app:

```json
{
  "db:generate": "prisma generate",
  "db:push": "prisma db push",
  "db:seed": "prisma generate && tsx prisma/seed.ts",
  "db:import-master": "prisma generate && tsx prisma/import-master-jobs.ts"
}
```

If the host app has its own seed file, call the Job Builder seed function from that seed instead of replacing it.

## Seed / Data Notes

The current app seeds:

- 79 job posts from the master catalog/import process
- reusable content blocks
- block versions
- job/block relationships
- locked template tokens

For the other app, choose one of these:

1. Copy local data for development only by copying `prisma/dev.db`.
2. Run `npm run db:seed` for a clean seeded database.
3. Run `npm run db:import-master` if the master PDF/import data source is present and you want the larger catalog.

For production, use seed/import scripts rather than copying `dev.db`.

## Current Main Live Component

The live Job Posts page is powered by:

```text
components/job-editor/JobsSandboxWorkspace.tsx
```

Use it like this:

```tsx
// app/job-builder/jobs/page.tsx
import { JobsSandboxWorkspace } from "@/components/job-editor/JobsSandboxWorkspace";
import { getContentBlocks, getJobPosts } from "@/lib/data/jobs";

export default async function JobsPage() {
  const [jobs, blocks] = await Promise.all([getJobPosts(), getContentBlocks()]);

  return <JobsSandboxWorkspace initialJobs={jobs} initialBlocks={blocks} mode="live" />;
}
```

Sandbox uses the same component with temporary browser-state behavior:

```tsx
// app/job-builder/sandbox/page.tsx
import { JobsSandboxWorkspace } from "@/components/job-editor/JobsSandboxWorkspace";
import { getContentBlocks, getJobPosts } from "@/lib/data/jobs";

export default async function JobBuilderSandboxPage() {
  const [jobs, blocks] = await Promise.all([getJobPosts(), getContentBlocks()]);

  return <JobsSandboxWorkspace initialJobs={jobs} initialBlocks={blocks} mode="sandbox" />;
}
```

## API Endpoints The UI Expects

The UI currently calls these endpoints:

```text
PATCH /api/jobs/[id]
PATCH /api/jobs/bulk-status
POST  /api/jobs/[id]/blocks
PATCH /api/jobs/[id]/blocks
PATCH /api/job-block-instances/[id]
DELETE /api/job-block-instances/[id]
POST  /api/blocks
PATCH /api/blocks/[id]
POST  /api/blocks/[id]/duplicate
POST  /api/blocks/[id]/apply
PATCH /api/blocks/[id]/placement
POST  /api/blocks/[id]/retire
```

Keep these API routes intact unless you intentionally rename the backend paths.

## Integration Checklist

1. Add dependencies.
2. Merge Prisma models.
3. Add or merge `DATABASE_URL`.
4. Copy components and libs listed above.
5. Create `/job-builder` nested routes.
6. Create `JobBuilderSidebar`.
7. Update hardcoded links to `/job-builder/...`.
8. Add Tailwind brand tokens and global Verdana style.
9. Run `npm run db:generate`.
10. Run `npm run db:push` or the host app migration process.
11. Run seed/import.
12. Start the host app and open `/job-builder/jobs`.

## Best Long-Term Permissions Model

When auth/permissions are added later:

- Main app controls whether a user can see **Job Builder** at all.
- Job Builder controls access to:
  - `jobs.read`
  - `jobs.write`
  - `jobs.archive`
  - `blocks.write`
  - `templates.unlock`
  - `sandbox.access`

Default daily users should not have `templates.unlock`.

