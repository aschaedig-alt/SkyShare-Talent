import { EventPage } from "@/components/events/EventPage";

export const dynamic = "force-dynamic";

// A career fair. A company event opened here is sent to /company-events/[id].
export default async function CareerFairPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <EventPage id={id} servedAt="EXTERNAL" searchParams={sp} />;
}
