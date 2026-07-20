import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { getWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import { setUserHome, visibleHomeChoices, DEFAULT_HOME } from "@/lib/data/user-home";

// Each user sets their OWN default home page — no admin permission needed, but you
// must be signed in (there's no per-user identity to save against otherwise).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Sign in to set a personal home page." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { href?: unknown };
  const href = typeof body.href === "string" ? body.href : null;

  // Empty / the default clears the preference back to Command Center.
  if (!href || href === DEFAULT_HOME) {
    await setUserHome(userId, null);
    return NextResponse.json({ ok: true, href: DEFAULT_HOME });
  }

  // Only allow a page this user can actually see.
  const role: RoleName = isRoleName(session?.user?.role) ? session.user.role : "VIEWER";
  const policy = await getWorkspaceModuleAccessPolicy();
  if (!visibleHomeChoices(policy, role).some((c) => c.href === href)) {
    return NextResponse.json({ error: "That isn't a page you can open." }, { status: 400 });
  }

  await setUserHome(userId, href);
  return NextResponse.json({ ok: true, href });
}
