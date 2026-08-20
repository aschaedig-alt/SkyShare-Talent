import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { RoleName } from "@/lib/auth/roles";
import type { DeptKey } from "@/lib/calendar/departments";
import { parseUserModuleOverrides, type UserModuleOverrides } from "@/lib/auth/user-module-access";

// The signed-in user's department/tag scoping, resolved once per page and
// threaded through to whichever data-fetch functions need it (employees,
// candidates, interview/note masking). ADMIN/RECRUITER never carry real
// values here — they're never narrowed by this feature regardless.
export type ViewerScope = {
  role: RoleName;
  userId: string | null;
  email: string | null;
  department: DeptKey | null;
  isExecutive: boolean;
  restrictCandidatesToDepartment: boolean;
  // The hand-picked allowlist. Read lib/auth/candidate-scope.ts rather than
  // testing these two directly — the pairing is easy to get backwards.
  //
  // allowedCandidateIds is null ONLY when this viewer is not allowlist-scoped at
  // all. When restrictCandidatesToAllowlist is true it is ALWAYS an array, even
  // if the read found nothing, so that "the query failed" and "nobody has been
  // picked yet" both land on the safe answer of an empty list rather than on
  // null, which every candidate query in this codebase reads as "unrestricted".
  restrictCandidatesToAllowlist: boolean;
  allowedCandidateIds: string[] | null;
  // May they write notes/scorecards on the candidates they can see? Only
  // meaningful alongside restrictCandidatesToAllowlist.
  allowlistCanAnnotate: boolean;
  // This user's per-user Module Visibility override, already parsed. Null means
  // "follow the role policy", which is every pre-existing account. Carried here
  // so the page gate, the API gate and the sidebar all share ONE database read
  // per request instead of each doing their own.
  moduleOverrides: UserModuleOverrides | null;
};

// The unrestricted scope, used for ADMIN/RECRUITER and for the local-dev bypass.
// Named rather than inlined so there is exactly one definition of "sees
// everything" to audit.
function unrestrictedScope(role: RoleName, userId: string | null, email: string | null): ViewerScope {
  return {
    role,
    userId,
    email,
    department: null,
    isExecutive: false,
    restrictCandidatesToDepartment: false,
    restrictCandidatesToAllowlist: false,
    allowedCandidateIds: null,
    allowlistCanAnnotate: false,
    moduleOverrides: null
  };
}

// Wrapped in React cache() for the same reason getWorkspaceModuleAccessPolicy is:
// AppShell resolves the viewer on every route to build the sidebar, and the page
// then resolves it AGAIN inside requireModulePageAccess. cache() is per-request
// and per-argument, so the second call reuses the first promise rather than
// making another Neon round trip. Outside a React request scope (an ad-hoc tsx
// script) it degrades to a plain call.
export const resolveViewerScope = cache(async function resolveViewerScope(
  role: RoleName,
  userId: string | null,
  email: string | null
): Promise<ViewerScope> {
  if (role === "ADMIN" || role === "RECRUITER" || !userId) {
    return unrestrictedScope(role, userId, email);
  }

  // Read per request rather than caching the allowlist on the JWT. auth.ts puts
  // only id + role on the token, and deliberately so: a token-cached allowlist
  // would go stale for the token's whole lifetime, meaning an admin removing a
  // candidate would not take effect until that person next signed in.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      department: true,
      isExecutive: true,
      restrictCandidatesToDepartment: true,
      restrictCandidatesToAllowlist: true,
      allowlistCanAnnotate: true,
      moduleAccessJson: true,
      allowedCandidates: { select: { candidateId: true } }
    }
  });

  // A missing User row means the id on the token does not resolve — auth.ts falls
  // back to the Google subject when no row exists. Treat that as "no scoping
  // configured", which for a non-admin role is the same unrestricted position
  // they have today; the allowlist below only ever narrows from here.
  const restrictToAllowlist = user?.restrictCandidatesToAllowlist ?? false;

  return {
    role,
    userId,
    email,
    department: (user?.department as DeptKey | null) ?? null,
    isExecutive: user?.isExecutive ?? false,
    restrictCandidatesToDepartment: user?.restrictCandidatesToDepartment ?? false,
    restrictCandidatesToAllowlist: restrictToAllowlist,
    // Fails CLOSED: the flag being on always yields an array. `?? []` is doing
    // real work here, not defensive noise — user is null when the row vanished
    // mid-session, and null would read as unrestricted downstream.
    allowedCandidateIds: restrictToAllowlist ? (user?.allowedCandidates ?? []).map((row) => row.candidateId) : null,
    allowlistCanAnnotate: restrictToAllowlist ? (user?.allowlistCanAnnotate ?? false) : false,
    moduleOverrides: parseUserModuleOverrides(user?.moduleAccessJson)
  };
});
