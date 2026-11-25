import { BlockLibrary } from "@/components/content-blocks/BlockLibrary";
import { getContentBlocks, getJobPosts } from "@/lib/data/jobs";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  const { role } = await requireModulePageAccess("blocks");
  const [blocks, jobs] = await Promise.all([getContentBlocks(), getJobPosts()]);

  // The Manage tab (archive, delete, where a block is used) was Admin > Settings >
  // Block management until Nov 25 2026, so it stays admins-only, as that page was.
  return <BlockLibrary blocks={blocks} jobs={jobs} canManage={role === "ADMIN"} />;
}
