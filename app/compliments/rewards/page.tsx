import { getComplimentsRoster, getRewards } from "@/lib/data/compliments";
import { RewardsWorkspace } from "@/components/compliments/RewardsWorkspace";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const [roster, rewards] = await Promise.all([getComplimentsRoster(), getRewards()]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-brand-lea">Rewards catalog</h2>
        <p className="text-sm text-brand-grey">Redeem points for rewards new hires love. 100 points = $1.</p>
      </div>
      <RewardsWorkspace roster={roster} rewards={rewards} />
    </div>
  );
}
