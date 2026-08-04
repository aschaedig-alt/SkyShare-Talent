import { notFound } from "next/navigation";
import { CommandCenterWorkspace } from "@/components/command-center/CommandCenterWorkspace";
import { getCommandCenterData } from "@/lib/data/command-center";
import { requireModulePageAccess } from "@/lib/data/module-access";

export const dynamic = "force-dynamic";

/**
 * The Command Center, moved under Admin > Settings and restricted to admins
 * (Aug 3, at the user's request). It used to be the app's landing page at
 * /command-center; that route still exists and redirects here so bookmarks and
 * shared links keep working.
 *
 * TWO GATES ON PURPOSE, and the second is not redundant:
 *
 *  1. requireModulePageAccess("settings") — the same gate every other Admin >
 *     Settings page uses, so this page appears and disappears with the rest of
 *     the section rather than inventing its own visibility rule.
 *
 *  2. An explicit ADMIN check. The "settings" module is only admin-locked by
 *     DEFAULT: getModuleAccessRule() reads a stored policy first and falls back
 *     to the default, so an edit in the Module Visibility panel could hand this
 *     page to another role. The request was that only an admin sees it, so that
 *     is enforced here in code where a policy edit cannot reach it.
 *
 * This page also renders the roadmap, which carries candidate contact details
 * and internal engineering prose in its notes — a further reason it should not
 * be the first thing the whole team lands on.
 */
export default async function CommandCenterPage() {
  const { role } = await requireModulePageAccess("settings");
  if (role !== "ADMIN") {
    notFound();
  }

  const data = await getCommandCenterData();

  return <CommandCenterWorkspace data={data} />;
}
