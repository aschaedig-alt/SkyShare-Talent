import { notFound } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { execHuntOrigin, getExecHuntConfig, getExecHuntStats } from "@/lib/exec-hunt/server";
import { execHuntScanPath } from "@/lib/exec-hunt/constants";
import { ExecHuntAdmin } from "@/components/exec-hunt/ExecHuntAdmin";

// ADMIN - Events > Christmas Party Scavenger Hunt. Behind the auth wall
// (middleware protects /events) AND limited to roles that can edit events, so a
// viewer or hiring manager who can see Events still gets a 404 here.
export const dynamic = "force-dynamic";

export default async function ExecHuntAdminPage() {
  const access = await requireModulePageAccess("events");
  if (!hasPermission(access.role, "events:write")) notFound();

  const [config, stats] = await Promise.all([getExecHuntConfig(), getExecHuntStats()]);
  const origin = execHuntOrigin();

  return (
    <ExecHuntAdmin
      config={{
        enabled: config.enabled,
        opensAt: config.opensAt?.toISOString() ?? null,
        closesAt: config.closesAt?.toISOString() ?? null,
        showLeaderboard: config.showLeaderboard,
        showNames: config.showNames
      }}
      origin={origin}
      stats={{
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
      }}
    />
  );
}
