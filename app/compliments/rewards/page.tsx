import { getComplimentsRoster, getRewards } from "@/lib/data/compliments";
import { getComplimentsSettings } from "@/lib/compliments/settings";
import { RewardsWorkspace } from "@/components/compliments/RewardsWorkspace";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const [roster, rewards, settings] = await Promise.all([
    getComplimentsRoster(),
    getRewards(),
    getComplimentsSettings()
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-brand-lea">Rewards catalog</h2>
        <p className="text-sm text-brand-grey">
          Redeem points for rewards new hires love. {settings.pointsPerDollar} points = $1.
        </p>
      </div>
      <RewardsWorkspace roster={roster} rewards={rewards} pointsPerDollar={settings.pointsPerDollar} />
    </div>
  );
}
