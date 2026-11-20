import { prisma } from "@/lib/prisma";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { logActivity } from "@/lib/activity/logger";
import { VIEW_AS_MAX_MINUTES, type ViewAsTokenState } from "@/lib/auth/view-as-token";

/**
 * "View as" — an ADMIN borrows another account's identity to see exactly what it
 * sees.
 *
 * HOW IT WORKS, AND WHY THIS WAY. Every page gate, API gate, sidebar and data
 * scope in this app reads identity from ONE place: getServerSession(authOptions)
 * (18 call sites, all funnelling through the session callback in auth.ts). So the
 * swap is made there and nowhere else. While viewing as somebody, the session
 * reports THEIR id, email, name and role, and everything downstream —
 * resolveViewerScope, the per-user module toggles, the candidate allowlist, the
 * department narrowing, the HR-note masking — resolves for them with no code of
 * its own knowing. That is the point: a parallel "simulate what they would see"
 * code path would only test itself, and the question being asked is whether the
 * REAL gates leak.
 *
 * The JWT keeps the ADMIN's own id, email and role (token.id / token.email /
 * token.role) the whole time, plus a viewAs block naming the target. That is what
 * lets the admin always get back out — exiting is authorised by who they really
 * are, not by the account they are borrowing.
 *
 * SAFETY, each piece load-bearing:
 *   - Starting is re-checked server-side against the DATABASE role of the real
 *     account, not anything the browser sends. A non-admin asking to view as
 *     somebody gets nothing.
 *   - Every request re-checks it too: lose ADMIN mid-session and view-as drops.
 *   - It is READ-ONLY. middleware.ts refuses every non-GET request (API calls and
 *     server actions alike) while it is active, so nothing can be written to the
 *     shared live database under somebody else's name.
 *   - It expires on its own after VIEW_AS_MAX_MINUTES.
 *   - Start and end are written to the Activity log under the ADMIN's identity.
 */

type TargetRow = { id: string; email: string | null; name: string | null; role: string };

async function loadTarget(userId: string): Promise<TargetRow | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true }
  });
}

function stateFromTarget(target: TargetRow, startedAt: number, expiresAt: number): ViewAsTokenState | null {
  if (!isRoleName(target.role)) return null;
  return {
    userId: target.id,
    email: target.email,
    name: target.name,
    role: target.role,
    startedAt,
    expiresAt
  };
}

/** Begin viewing as `targetUserId`. Returns null (and starts nothing) unless the real caller is an ADMIN. */
export async function startViewAs(params: {
  realUserId: string | undefined;
  realEmail: string | undefined;
  realRole: RoleName;
  targetUserId: string;
}): Promise<ViewAsTokenState | null> {
  const { realUserId, realEmail, realRole, targetUserId } = params;
  if (realRole !== "ADMIN" || !realUserId) return null;
  if (targetUserId === realUserId) return null;

  const target = await loadTarget(targetUserId);
  if (!target) return null;

  const now = Date.now();
  const state = stateFromTarget(target, now, now + VIEW_AS_MAX_MINUTES * 60_000);
  if (!state) return null;

  await logActivity({
    activityType: "VIEW_AS_STARTED",
    userId: realUserId,
    userEmail: realEmail,
    description: `Started viewing as ${target.name ?? target.email ?? target.id} (${target.role}), read-only`,
    entityType: "User",
    entityId: target.id,
    metadata: { targetEmail: target.email, targetRole: target.role }
  });

  return state;
}

/** Record that view-as ended. Never throws. */
export async function endViewAs(params: {
  realUserId: string | undefined;
  realEmail: string | undefined;
  state: ViewAsTokenState;
  reason: "exited";
}) {
  const { realUserId, realEmail, state, reason } = params;
  await logActivity({
    activityType: "VIEW_AS_ENDED",
    userId: realUserId,
    userEmail: realEmail,
    description: `Stopped viewing as ${state.name ?? state.email ?? state.userId} (${reason})`,
    entityType: "User",
    entityId: state.userId,
    metadata: { reason, minutes: Math.round((Date.now() - state.startedAt) / 60_000) }
  });
}

/**
 * Re-validate an active view-as on every token refresh. Re-reads the target, so
 * a role or access change an admin makes in another window shows up on the next
 * page load rather than being frozen at whatever it was when view-as began.
 */
export async function refreshViewAs(params: {
  realUserId: string | undefined;
  realEmail: string | undefined;
  realRole: RoleName;
  state: ViewAsTokenState;
}): Promise<ViewAsTokenState | null> {
  const { realRole, state } = params;

  // NONE OF THESE DROPS IS LOGGED, deliberately. This runs inside
  // getServerSession, and a server component cannot rewrite the cookie — so the
  // stale viewAs stays in the cookie and is dropped again on EVERY request until
  // a route handler happens to refresh it. Logging here would write one Activity
  // row per page load. The START entry plus VIEW_AS_MAX_MINUTES bounds it anyway.
  if (realRole !== "ADMIN") return null;
  if (Date.now() >= state.expiresAt) return null;

  const target = await loadTarget(state.userId);
  if (!target) return null;
  return stateFromTarget(target, state.startedAt, state.expiresAt);
}
