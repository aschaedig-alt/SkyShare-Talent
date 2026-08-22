import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getResolvedNewHireContacts } from "@/lib/data/new-hire-contacts";
import { isValidShareToken } from "@/lib/new-hire-contacts/share-link";
import { NewHireContactsView } from "@/components/new-hire-contacts/NewHireContactsView";

// PUBLIC page (see middleware.ts / AppShell bare-render) — a new hire opens this
// from a texted/emailed link, no login required.
//
// The link now carries a share token (?t=). Without a valid one this renders
// welcome/not-found.tsx and no contact data is fetched at all, so the curated
// staff directory is no longer served to anyone who simply types the URL.
// Rotate the token from Settings → New hire contacts to invalidate every link
// already sent.
//
// Note the status is 200 rather than 404 — see the comment in not-found.tsx for
// why, and why the robots tag below is what carries the indexing protection.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Welcome to SkyShare — Your Contacts",
  description: "Add your key SkyShare contacts to your phone.",
  // Belt and braces alongside the token: a link forwarded into something that
  // publishes it should not end up indexed.
  robots: { index: false, follow: false }
};

export default async function WelcomePage({
  searchParams
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const token = (await searchParams).t;
  if (!(await isValidShareToken(token))) notFound();

  const resolved = await getResolvedNewHireContacts();
  const groups = resolved.groups.filter((g) => g.contacts.length > 0);

  // The token rides through to the view because every "Add" button calls the
  // vCard endpoint, which checks it too.
  return <NewHireContactsView intro={resolved.intro} groups={groups} token={token as string} />;
}
