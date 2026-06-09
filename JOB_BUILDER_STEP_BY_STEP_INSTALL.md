# Step-By-Step: Add SkyShare Job Builder To Another App

These instructions assume the other app is a Next.js app using the App Router. If the other app uses a different framework, use `JOB_BUILDER_INTEGRATION_HANDOFF.md` as the architecture guide and translate the route/API pieces.

## 1. Make A Safe Copy First

In the other app, create a branch or backup before copying files.

```powershell
git checkout -b add-job-builder
```

If the other app is not using git, copy the whole app folder somewhere safe first.

## 2. Confirm The Other App Stack

The easiest integration is when the other app already uses:

```text
Next.js
TypeScript
Tailwind CSS
Prisma
```

If the other app does not use Prisma yet, add Prisma before moving the Job Builder data model.

## 3. Install Missing Packages

From the other app folder:

```powershell
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @hookform/resolvers @prisma/adapter-better-sqlite3 @prisma/client clsx dotenv lucide-react react-hook-form zod
npm install -D @types/better-sqlite3 prisma tsx
```

If the other app already has some of these packages, npm will keep or update them as needed.

## 4. Add The Job Builder Database Models

Open the other app's Prisma schema:

```text
prisma/schema.prisma
```

Copy the Job Builder models from:

```text
C:\Users\Recruiter\Documents\Job Posting Details\JOB_BUILDER_INTEGRATION_HANDOFF.md
```

Add these models to the bottom of the other app schema:

```text
JobPost
PaycomConfig
ContentBlock
ContentBlockVersion
JobBlockInstance
Template
TemplateToken
```

Important: merge the models into the existing schema. Do not replace the other app's schema.

## 5. Decide Prisma Client Import Style

If the other app uses normal Prisma Client, use this in the Job Builder `lib/prisma.ts`:

```ts
import { PrismaClient } from "@prisma/client";
```

If you keep this app's custom Prisma output, use:

```ts
import { PrismaClient } from "../prisma/generated/client/client";
```

Most existing apps should use the normal `@prisma/client` import.

## 6. Copy Job Builder Source Folders

From this project:

```text
C:\Users\Recruiter\Documents\Job Posting Details
```

Copy these folders/files into the other app:

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
prisma/seed.ts
prisma/ensure-dev-db.ts
prisma/import-master-jobs.ts
prisma/schema-sql.ts
```

Do not copy:

```text
.next
node_modules
prisma/generated
```

Only copy `prisma/dev.db` if you intentionally want the exact local test database.

## 7. Add A Dedicated Job Builder Sidebar

In the other app, create:

```text
components/job-builder-layout/JobBuilderSidebar.tsx
```

Use the sidebar code from:

```text
JOB_BUILDER_INTEGRATION_HANDOFF.md
```

This gives Job Builder its own internal sidebar instead of filling the main app sidebar with every Job Builder page.

## 8. Create The Job Builder Route Group

Create these folders in the other app:

```text
app/job-builder
app/job-builder/jobs
app/job-builder/review
app/job-builder/templates
app/job-builder/blocks
app/job-builder/changes
app/job-builder/approvals
app/job-builder/settings
app/job-builder/sandbox
```

## 9. Add The Job Builder Layout

Create:

```text
app/job-builder/layout.tsx
```

Use:

```tsx
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

## 10. Add The Job Builder Home Redirect

Create:

```text
app/job-builder/page.tsx
```

Use:

```tsx
import { redirect } from "next/navigation";

export default function JobBuilderHomePage() {
  redirect("/job-builder/jobs");
}
```

## 11. Move The Page Routes Under `/job-builder`

Copy page contents like this:

```text
Current app file                  Other app file
app/jobs/page.tsx                 app/job-builder/jobs/page.tsx
app/review/page.tsx               app/job-builder/review/page.tsx
app/templates/page.tsx            app/job-builder/templates/page.tsx
app/blocks/page.tsx               app/job-builder/blocks/page.tsx
app/changes/page.tsx              app/job-builder/changes/page.tsx
app/approvals/page.tsx            app/job-builder/approvals/page.tsx
app/settings/page.tsx             app/job-builder/settings/page.tsx
app/jobs-sandbox/page.tsx         app/job-builder/sandbox/page.tsx
```

The live Job Posts page should look like this:

```tsx
import { JobsSandboxWorkspace } from "@/components/job-editor/JobsSandboxWorkspace";
import { getContentBlocks, getJobPosts } from "@/lib/data/jobs";

export default async function JobsPage() {
  const [jobs, blocks] = await Promise.all([getJobPosts(), getContentBlocks()]);

  return <JobsSandboxWorkspace initialJobs={jobs} initialBlocks={blocks} mode="live" />;
}
```

The sandbox page should look like this:

```tsx
import { JobsSandboxWorkspace } from "@/components/job-editor/JobsSandboxWorkspace";
import { getContentBlocks, getJobPosts } from "@/lib/data/jobs";

export default async function JobBuilderSandboxPage() {
  const [jobs, blocks] = await Promise.all([getJobPosts(), getContentBlocks()]);

  return <JobsSandboxWorkspace initialJobs={jobs} initialBlocks={blocks} mode="sandbox" />;
}
```

## 12. Copy API Routes

Copy these API folders into the other app:

```text
app/api/jobs
app/api/blocks
app/api/job-block-instances
```

These can stay under `/api/...`. They do not need to be under `/job-builder`.

## 13. Add One Main App Link

In the other app's main sidebar/navigation, add only one link:

```tsx
<Link href="/job-builder/jobs">Job Builder</Link>
```

Do not add Job Posts, Blocks, Templates, etc. to the main app sidebar. Those belong in the Job Builder sidebar.

## 14. Add Brand Tokens To Tailwind

In the other app's `tailwind.config.ts`, merge this into `theme.extend`:

```ts
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

Make sure Tailwind scans these paths:

```ts
content: [
  "./app/**/*.{js,ts,jsx,tsx,mdx}",
  "./components/**/*.{js,ts,jsx,tsx,mdx}",
  "./lib/**/*.{js,ts,jsx,tsx,mdx}"
]
```

## 15. Add The Verdana Global Style

In the other app's global CSS, merge:

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

## 16. Update Hardcoded Links

Search the other app for old Job Builder links:

```powershell
rg '"/jobs"|"/review"|"/templates"|"/blocks"|"/changes"|"/approvals"|"/settings"|"/jobs-sandbox"'
```

Replace:

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

## 17. Generate Prisma Client

From the other app folder:

```powershell
npx prisma generate
```

## 18. Update The Database

For local development with Prisma push:

```powershell
npx prisma db push
```

If the other app uses migrations, create a migration instead:

```powershell
npx prisma migrate dev --name add-job-builder
```

## 19. Seed Job Builder Data

If you copied `prisma/seed.ts`, run:

```powershell
npx tsx prisma/seed.ts
```

If the other app already has a seed file, merge the Job Builder seed logic into the existing seed instead of replacing it.

## 20. Run The Other App

From the other app folder:

```powershell
npm run dev
```

Open:

```text
http://localhost:3000/job-builder/jobs
```

## 21. Test The Important Workflows

Check these before calling it done:

- Job Builder appears as one item in the main app.
- Job Builder has its own sidebar.
- `/job-builder/jobs` loads.
- You can select a job.
- You can edit job fields.
- Save Draft shows progress and saves.
- Archive Role works.
- Bulk archive works.
- Preview updates immediately.
- Export PDF opens.
- Copy basic HTML works.
- Copy formatted post works.
- Content Blocks page loads.
- Existing main app pages still work.

## 22. Common Fixes

If imports fail with `@/...`:

- Make sure the other app has path aliases configured in `tsconfig.json`.
- Or change imports to relative paths.

If Prisma Client import fails:

- Use `import { PrismaClient } from "@prisma/client";`
- Run `npx prisma generate`.

If Tailwind classes do not style correctly:

- Confirm `components/**/*` and `lib/**/*` are in Tailwind `content`.
- Confirm the `brand` color tokens were merged.

If database tables are missing:

- Run `npx prisma db push` or `npx prisma migrate dev`.

If Job Builder pages show but API saves fail:

- Confirm `app/api/jobs`, `app/api/blocks`, and `app/api/job-block-instances` were copied.
- Confirm `DATABASE_URL` points to the database with the Job Builder tables.

