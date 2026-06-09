import { JobDuplicatesWorkspace } from "@/components/jobs/JobDuplicatesWorkspace";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { findAllDuplicateClusters } from "@/lib/jobs/duplicate-detection";

export const dynamic = "force-dynamic";

export default async function JobDuplicatesPage() {
  await requireModulePageAccess("recruiting-jobs");

  const clusters = await findAllDuplicateClusters(60);

  return <JobDuplicatesWorkspace clusters={clusters} />;
}
