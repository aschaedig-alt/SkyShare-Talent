import { JobsSandboxWorkspace } from "@/components/job-editor/JobsSandboxWorkspace";
import { getContentBlocks, getJobPosts } from "@/lib/data/jobs";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function JobsSandboxPage() {
  await requireModulePageAccess("jobs-sandbox");
  const [jobs, blocks] = await Promise.all([getJobPosts(), getContentBlocks()]);

  return <JobsSandboxWorkspace initialJobs={jobs} initialBlocks={blocks} />;
}
