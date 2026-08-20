import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { hasPermission, isRoleName, type Permission, type RoleName } from "@/lib/auth/roles";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { isEmailBlocked } from "@/lib/auth/blocklist";
import { resolveViewerScope, type ViewerScope } from "@/lib/auth/viewer-scope";
import { checkUserModuleAccess } from "@/lib/auth/api-module-access";

const revokedResponse = () => NextResponse.json({ message: "Your access has been revoked." }, { status: 403 });

// A module this account has been switched off for. 403 rather than 404 on
// purpose: which modules the app HAS is not a secret (the caller typed the URL),
// and a 403 with a reason is far easier to diagnose than a mystery 404 when
// somebody reports that a page stopped working. Candidate DATA is the opposite —
// see lib/data/candidates.ts, which 404s an off-allowlist candidate so that a
// restricted viewer cannot learn a given person exists.
const moduleBlockedResponse = (moduleId: string) =>
  NextResponse.json(
    { message: `Your account does not have access to the ${moduleId} area.` },
    { status: 403 }
  );

export type ApiRouteUser = {
  id: string | null;
  email: string | null;
  name?: string | null;
  role: RoleName;
  authMode: "local-bypass" | "session";
  // The caller's resolved department / allowlist scoping, so a route can narrow
  // its query without remembering to resolve it. Null only under the local-dev
  // bypass, where there is no user at all.
  //
  // Before this existed, resolveViewerScope had FOUR call sites in the whole
  // repo while ~200 API routes read candidate data — which is precisely why the
  // department restriction had never applied anywhere except the list query.
  viewer: ViewerScope | null;
};

export type ApiAuthResult =
  | {
      ok: true;
      user: ApiRouteUser;
    }
  | {
      ok: false;
      response: NextResponse;
    };

/**
 * The response to send when requireApiUser / requireApiPermission refused.
 *
 * This exists because of a real compiler constraint, not as decoration.
 * tsconfig.json sets "strict": false, and WITHOUT strictNullChecks TypeScript
 * does not narrow a discriminated union through `if (!auth.ok)` — reaching for
 * auth.response inside that branch fails with "Property 'response' does not
 * exist on type '{ ok: true; user: ApiRouteUser; }'". Verified against a minimal
 * repro under this exact config before writing this.
 *
 * So handlers call this instead of reaching into the union, and the one
 * unavoidable cast lives here rather than being copied into ~200 routes.
 *
 * Use it rather than a hardcoded 401: it carries the RIGHT status and message —
 * 401 for "not signed in", 403 for a revoked account, a permission failure, or a
 * module this account has been switched off from. A hardcoded 401 tells somebody
 * whose Candidates area was turned off to go and sign in again.
 */
export function authFailureResponse(auth: ApiAuthResult): NextResponse {
  const failure = auth as { ok: false; response?: NextResponse };
  return (
    failure.response ?? NextResponse.json({ message: "Authentication is required." }, { status: 401 })
  );
}

// Local dev bypasses auth entirely (see lib/auth/auth-config.ts). The bypass
// user is an ADMIN with no id, so viewer is null and every scoping check treats
// it as unrestricted. THIS IS WHY NONE OF THE PER-USER SCOPING CAN BE EXERCISED
// ON LOCALHOST without REQUIRE_AUTH=true — worth knowing before anyone reports
// that the allowlist "does nothing".
function localBypassUser(): ApiRouteUser {
  return { id: null, email: null, role: "ADMIN", authMode: "local-bypass", viewer: null };
}

/**
 * Shared session resolution: identity, revocation, viewer scope, and the
 * per-user module gate. Returns either the resolved user or the response that
 * should be sent instead.
 */
async function resolveSessionUser(): Promise<ApiAuthResult> {
  const session = await getServerSession(authOptions);
  const role = isRoleName(session?.user?.role) ? session.user.role : null;

  if (!session?.user?.id || !role) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Authentication is required." }, { status: 401 })
    };
  }

  if (await isEmailBlocked(session.user.email)) {
    return { ok: false, response: revokedResponse() };
  }

  const viewer = await resolveViewerScope(role, session.user.id, session.user.email ?? null);

  // Per-user module visibility. A no-op unless an admin has restricted this
  // specific account, and unless the request path maps to a known module.
  const denial = await checkUserModuleAccess(viewer);
  if (denial) {
    return { ok: false, response: moduleBlockedResponse(denial.moduleId) };
  }

  return {
    ok: true,
    user: {
      id: session.user.id,
      email: session.user.email ?? null,
      name: session.user.name ?? null,
      role,
      authMode: "session",
      viewer
    }
  };
}

/** Allow any authenticated user (any role). Used for actions every user may take, e.g. feedback. */
export async function requireApiUser(): Promise<ApiAuthResult> {
  if (!isAuthRequired()) {
    return { ok: true, user: localBypassUser() };
  }

  return resolveSessionUser();
}

export async function requireApiPermission(permission: Permission): Promise<ApiAuthResult> {
  if (!isAuthRequired()) {
    return { ok: true, user: localBypassUser() };
  }

  const resolved = await resolveSessionUser();
  if (!resolved.ok) {
    return resolved;
  }

  if (!hasPermission(resolved.user.role, permission)) {
    return {
      ok: false,
      response: NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 })
    };
  }

  return resolved;
}
