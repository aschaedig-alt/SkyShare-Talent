import { getUpcomingCelebrations } from "@/lib/data/compliments";
import { CelebrationsWorkspace } from "@/components/compliments/CelebrationsWorkspace";

export const dynamic = "force-dynamic";

export default async function CelebrationsPage() {
  const data = await getUpcomingCelebrations();
  return <CelebrationsWorkspace data={data} />;
}
