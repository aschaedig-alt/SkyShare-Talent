import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The Command Center moved to /settings/command-center on Aug 3 and is now
 * admin-only. This route stays behind as a redirect rather than being deleted:
 * it was the app's landing page for months, so it is sitting in bookmarks, in
 * browser history and in links people have pasted to each other.
 *
 * The redirect is unconditional and the destination does its own gating, so a
 * non-admin who follows an old link lands on the destination's notFound()
 * rather than being told here that a page exists which they cannot see.
 */
export default function LegacyCommandCenterPage() {
  redirect("/settings/command-center");
}
