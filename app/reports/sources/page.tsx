import { SourcesWorkspace } from "@/components/sources/SourcesWorkspace";
import { getSourceAudit } from "@/lib/data/sources";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

// Reports > Sources: how people found SkyShare, and the audit of how each source
// has been spelled (asked for 2026-09-29). Behind Reports' own access; changing a
// name needs what the save route checks - admin or recruiter always, anyone else
// only with EDIT on Reports (app/api/sources/names).
export default async function SourcesPage() {
  const { role, rule } = await requireModulePageAccess("reports");
  const canEdit = role === "ADMIN" || role === "RECRUITER" || rule.accessLevel === "EDIT" || rule.accessLevel === "FULL_ACCESS";
  const audit = await getSourceAudit();
  return <SourcesWorkspace audit={audit} canEdit={canEdit} />;
}
