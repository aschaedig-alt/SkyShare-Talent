import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { requireModulePageAccess } from "@/lib/data/module-access";

export default async function ApprovalsPage() {
  await requireModulePageAccess("approvals");
  return (
    <PagePlaceholder
      eyebrow="Workflow"
      title="Approvals"
      description="Approval routing is staged for controlled rollout, with review steps separated from daily recruiting workflows."
      cards={["Draft review", "Publish approval", "Block adoption", "Retired posting review"]}
    />
  );
}
