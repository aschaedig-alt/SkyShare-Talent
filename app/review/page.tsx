import { FinalReviewWorkspace } from "@/components/final-review/FinalReviewWorkspace";
import { getJobPosts } from "@/lib/data/jobs";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  await requireModulePageAccess("review");
  const jobs = await getJobPosts();

  return <FinalReviewWorkspace jobs={jobs} />;
}
