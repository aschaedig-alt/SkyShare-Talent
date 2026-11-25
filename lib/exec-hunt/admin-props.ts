import type { ComponentProps } from "react";
import { execHuntOrigin, getExecHuntConfig, getExecHuntStats } from "@/lib/exec-hunt/server";
import { execHuntScanPath } from "@/lib/exec-hunt/constants";
import type { ExecHuntAdmin } from "@/components/exec-hunt/ExecHuntAdmin";

/**
 * Everything the scavenger hunt's admin screen needs, serialised for the client.
 * Shared by its own page (/events/exec-hunt) and the Christmas party's Activities
 * tab, where the hunt lives since Nov 25 2026 (Aimee: the hunt is one activity
 * inside the party). There is still ONE hunt - ExecHuntConfig "default".
 */
export async function getExecHuntAdminProps(): Promise<ComponentProps<typeof ExecHuntAdmin>> {
  const [config, stats] = await Promise.all([getExecHuntConfig(), getExecHuntStats()]);
  const origin = execHuntOrigin();
  return {
    config: {
      enabled: config.enabled,
      opensAt: config.opensAt?.toISOString() ?? null,
      closesAt: config.closesAt?.toISOString() ?? null,
      showLeaderboard: config.showLeaderboard,
      showNames: config.showNames
    },
    origin,
    stats: {
      participants: stats.participants,
      discoveries: stats.discoveries,
      completed: stats.completed,
      locationsFound: stats.locationsFound,
      total: stats.total,
      executives: stats.executives.map((exec) => ({
        ...exec,
        pictures: exec.pictures.map((p) => ({ ...p, url: `${origin}${execHuntScanPath(p.publicKey)}` }))
      })),
      guests: stats.guests.map((g) => ({
        ...g,
        lastAt: g.lastAt?.toISOString() ?? null,
        firstAt: g.firstAt?.toISOString() ?? null
      })),
      activity: stats.activity.slice(0, 300).map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))
    }
  };
}
