import { prisma } from "@/lib/prisma";
import { currentPoolWhere, archivePoolWhere } from "@/lib/candidates/scan-pool";

export type ScanPoolCounts = {
  /** Live pipeline candidates considered. */
  current: number;
  /** Historical (archived Jazz) candidates considered. */
  archive: number;
  /** Everyone considered in the scan. */
  total: number;
};

/**
 * How many people a scan actually looked at, split so the UI can say "200
 * current + 3,143 archived" instead of one number that hides which pool the
 * results came from.
 */
export async function getScanPoolCounts(includeExcluded = false): Promise<ScanPoolCounts> {
  const [current, archive] = await Promise.all([
    prisma.candidate.count({ where: currentPoolWhere(includeExcluded) }),
    prisma.candidate.count({ where: archivePoolWhere(includeExcluded) })
  ]);
  return { current, archive, total: current + archive };
}
