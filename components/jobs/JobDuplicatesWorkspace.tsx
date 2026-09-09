import { JobDuplicateClusters } from "@/components/jobs/JobDuplicateClusters";
import { JobDismissedPairs } from "@/components/jobs/JobDismissedPairs";
import type { DismissedPair, DuplicateCluster } from "@/lib/jobs/duplicate-detection";

interface JobDuplicatesWorkspaceProps {
  clusters: DuplicateCluster[];
  /** One pair named in the URL, pinned above the scan. See the page's comment. */
  pinnedCluster?: DuplicateCluster | null;
  /** Every "not duplicates" decision on record, so it can be read back and undone. */
  dismissedPairs?: DismissedPair[];
}

export function JobDuplicatesWorkspace({
  clusters,
  pinnedCluster = null,
  dismissedPairs = []
}: JobDuplicatesWorkspaceProps) {
  return (
    <div className="space-y-6 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Job Management</p>
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Duplicate Jobs</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
          Pick the job to keep in each cluster, check the ones that are truly the same role, expand any job to inspect
          details, then merge — applications and interviews move automatically.
        </p>
      </section>

      <JobDuplicateClusters initialClusters={clusters} pinnedCluster={pinnedCluster} />

      <JobDismissedPairs initialPairs={dismissedPairs} />
    </div>
  );
}
