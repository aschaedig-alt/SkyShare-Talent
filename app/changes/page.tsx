import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { requireModulePageAccess } from "@/lib/data/module-access";

export default async function ChangesPage() {
  await requireModulePageAccess("changes");
  return (
    <PagePlaceholder
      eyebrow="Version history"
      title="Changes"
      description="Change tracking will compare job edits, block versions, formatting warnings, and review state across the master list."
      cards={["Recent job edits", "Block version changes", "Formatting warnings", "Jobs needing review"]}
    />
  );
}
