import { requireModulePageAccess } from "@/lib/data/module-access";
import { getJobPosts, getContentBlocks } from "@/lib/data/jobs";
import { buildJobPostHtml } from "@/lib/formatting/job-post-code";
import { LayoutLab } from "@/components/job-editor/LayoutLab";

export const dynamic = "force-dynamic";

export default async function LayoutLabPage() {
  await requireModulePageAccess("jobs");
  const [jobs, blocks] = await Promise.all([getJobPosts(), getContentBlocks()]);

  // Use the Gulfstream G450 & GV Captain post as the live sample.
  const job =
    jobs.find((j) => /gulfstream\s*g?450/i.test(j.title) && /\bgv\b/i.test(j.title) && /captain/i.test(j.title)) ??
    jobs.find((j) => /gulfstream/i.test(j.title) && /captain/i.test(j.title)) ??
    jobs[0] ??
    null;

  const limitedHtml = job ? buildJobPostHtml(job) : "";

  return <LayoutLab job={job} blocks={blocks} limitedHtml={limitedHtml} />;
}
