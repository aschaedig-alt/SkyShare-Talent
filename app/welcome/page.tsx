import type { Metadata } from "next";
import { getResolvedNewHireContacts } from "@/lib/data/new-hire-contacts";
import { NewHireContactsView } from "@/components/new-hire-contacts/NewHireContactsView";

// PUBLIC page (see middleware.ts / AppShell bare-render) — a new hire opens this
// from a texted/emailed link, no login required.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Welcome to SkyShare — Your Contacts",
  description: "Add your key SkyShare contacts to your phone."
};

export default async function WelcomePage() {
  const resolved = await getResolvedNewHireContacts();
  const groups = resolved.groups.filter((g) => g.contacts.length > 0);

  return <NewHireContactsView intro={resolved.intro} groups={groups} />;
}
