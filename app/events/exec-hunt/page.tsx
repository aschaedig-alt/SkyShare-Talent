import { notFound, redirect } from "next/navigation";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { hasPermission } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { getExecHuntAdminProps } from "@/lib/exec-hunt/admin-props";
import { ExecHuntAdmin } from "@/components/exec-hunt/ExecHuntAdmin";

// ADMIN - Events > Christmas Party Scavenger Hunt. Behind the auth wall
// (middleware protects /events) AND limited to roles that can edit events, so a
// viewer or hiring manager who can see Events still gets a 404 here.
//
// Since Nov 25 2026 the hunt lives inside its party as an activity (Aimee). Once a
// company event has the scavenger hunt activity, this address forwards there; until
// then it still shows the hunt on its own, so nothing is unreachable.
export const dynamic = "force-dynamic";

export default async function ExecHuntAdminPage() {
  const access = await requireModulePageAccess("events");
  if (!hasPermission(access.role, "events:write")) notFound();

  const home = await prisma.eventActivity.findFirst({
    where: { kind: "SCAVENGER_HUNT", event: { audience: "INTERNAL" } },
    orderBy: { createdAt: "desc" },
    select: { eventId: true }
  });
  if (home) redirect(`/company-events/${home.eventId}?tab=activities`);

  return <ExecHuntAdmin {...await getExecHuntAdminProps()} />;
}
