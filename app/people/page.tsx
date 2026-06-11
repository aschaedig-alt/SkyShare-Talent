import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { requireModulePageAccess } from "@/lib/data/module-access";

export default async function PeoplePage() {
  await requireModulePageAccess("people");
  return (
    <PagePlaceholder
      eyebrow="People"
      title="People & Onboarding"
      description="The People workspace will hold new-hire onboarding, orientation tracking, and recognition — coming soon."
      cards={["Orientation tracker", "Pre-onboarding sheet", "Recognition program", "Employee directory"]}
    />
  );
}
