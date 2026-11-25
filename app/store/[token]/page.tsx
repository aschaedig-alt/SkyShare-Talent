import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLinkView } from "@/lib/party-store/server";
import { PreorderPage } from "@/components/party-store/PreorderPage";

// PUBLIC — an employee's personal pre-order link. No login: the token is the
// access, and it reaches only this person's own store credit. Rendered bare (no
// app sidebar) by components/layout/AppShell.tsx.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SkyShare holiday store",
  robots: { index: false, follow: false }
};

export default async function StoreLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getLinkView(token);
  if (!view) notFound();
  return <PreorderPage token={token} initial={view} />;
}
