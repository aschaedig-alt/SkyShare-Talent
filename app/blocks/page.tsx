import { BlockLibrary } from "@/components/content-blocks/BlockLibrary";
import { getContentBlocks, getJobPosts } from "@/lib/data/jobs";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function BlocksPage() {
  await requireModulePageAccess("blocks");
  const [blocks, jobs] = await Promise.all([getContentBlocks(), getJobPosts()]);

  return <BlockLibrary blocks={blocks} jobs={jobs} />;
}
