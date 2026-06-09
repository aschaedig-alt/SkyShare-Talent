import { DuplicateReviewWorkspace } from "@/components/duplicate-review/DuplicateReviewWorkspace";
import { getDuplicateReviewData } from "@/lib/data/duplicate-review";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

export default async function DuplicateReviewPage() {
  await requireModulePageAccess("duplicate-review");
  const data = await getDuplicateReviewData();

  return <DuplicateReviewWorkspace data={data} />;
}
