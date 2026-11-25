import { EventPage } from "@/components/events/EventPage";

export const dynamic = "force-dynamic";

// A company event, in tabs (?tab=guests|todos|store|activities). A career fair
// opened here is sent to /events/[id].
export default async function CompanyEventPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <EventPage id={id} servedAt="INTERNAL" searchParams={sp} />;
}
