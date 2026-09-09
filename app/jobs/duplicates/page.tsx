import { JobDuplicatesWorkspace } from "@/components/jobs/JobDuplicatesWorkspace";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { buildPairCluster, findAllDuplicateClusters, listDismissedPairs } from "@/lib/jobs/duplicate-detection";

export const dynamic = "force-dynamic";

/**
 * ?pair=<jobId>,<jobId> pins one named pair at the top of the page.
 *
 * The rename clash links here. Refusing a rename because another job already holds
 * the name, and then saying "merge them instead", is only useful if there is a way
 * to reach that merge — and the pair is often one the scan itself will not show,
 * either because it is under the similarity threshold or because somebody once
 * dismissed it. So an explicitly named pair bypasses both.
 */
export default async function JobDuplicatesPage({
  searchParams
}: {
  searchParams?: Promise<{ pair?: string }>;
}) {
  await requireModulePageAccess("recruiting-jobs");

  const params = (await searchParams) ?? {};
  const [pairA, pairB] = (params.pair ?? "").split(",").map((s) => s.trim());

  const [clusters, pinnedCluster, dismissedPairs] = await Promise.all([
    findAllDuplicateClusters(60),
    pairA && pairB ? buildPairCluster(pairA, pairB) : Promise.resolve(null),
    listDismissedPairs()
  ]);

  return (
    <JobDuplicatesWorkspace
      clusters={clusters}
      pinnedCluster={pinnedCluster}
      dismissedPairs={dismissedPairs}
    />
  );
}
