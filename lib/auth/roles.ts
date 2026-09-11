export const roleNames = ["ADMIN", "RECRUITER", "HIRING_MANAGER", "VIEWER"] as const;

export type RoleName = (typeof roleNames)[number];

/** Role hierarchy: lower number = higher privilege. Useful for "role >= RECRUITER" checks. */
export const ROLE_RANK: Record<RoleName, number> = {
  "ADMIN": 0,
  "RECRUITER": 1,
  "HIRING_MANAGER": 2,
  "VIEWER": 3,
};

export type Permission =
  | "candidates:read"
  | "candidates:write"
  | "files:read"
  | "files:write"
  | "jobs:read"
  | "jobs:write"
  | "requirements:read"
  | "requirements:write"
  | "calendar:read"
  | "calendar:write"
  | "imports:write"
  | "duplicates:write"
  | "settings:admin"
  | "publishing:write"
  | "events:read"
  | "events:write";

export const rolePermissions: Record<RoleName, Permission[]> = {
  ADMIN: [
    "candidates:read",
    "candidates:write",
    "files:read",
    "files:write",
    "jobs:read",
    "jobs:write",
    "requirements:read",
    "requirements:write",
    "calendar:read",
    "calendar:write",
    "imports:write",
    "duplicates:write",
    "settings:admin",
    "publishing:write",
    "events:read",
    "events:write"
  ],
  RECRUITER: [
    "candidates:read",
    "candidates:write",
    "files:read",
    "files:write",
    "jobs:read",
    "jobs:write",
    "requirements:read",
    "calendar:read",
    "calendar:write",
    "imports:write",
    "duplicates:write",
    "events:read",
    "events:write"
  ],
  HIRING_MANAGER: [
    "candidates:read",
    "files:read",
    "jobs:read",
    "requirements:read",
    "calendar:read",
    "events:read"
  ],
  VIEWER: [
    "candidates:read",
    "files:read",
    "jobs:read",
    "requirements:read",
    "calendar:read",
    "events:read"
  ]
};

export function hasPermission(role: RoleName, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function isRoleName(value: string | null | undefined): value is RoleName {
  return roleNames.includes(value as RoleName);
}

/** Check if user has at least this role seniority (e.g., isAdminOrAbove checks ADMIN). */
export function isRoleAtLeast(
  role: RoleName | null | undefined,
  minimum: RoleName
): boolean {
  if (!role) return false;
  return ROLE_RANK[role] <= ROLE_RANK[minimum];
}

/** Check if user is ADMIN. */
export function isAdmin(role: RoleName | null | undefined): boolean {
  return role === "ADMIN";
}

/** Check if user is ADMIN or RECRUITER. */
export function isAdminOrRecruiter(role: RoleName | null | undefined): boolean {
  return role === "ADMIN" || role === "RECRUITER";
}

/**
 * Is this person on the HR team? The one question a private HR note asks.
 *
 * DELIBERATELY A SEPARATE FUNCTION from isAdminOrRecruiter even though the
 * default answer is the same today. They mean different things: one is "can edit
 * candidates", the other is "may read the hiring conversation". Today both are
 * Aimee, Hannah and Kevin. She said plainly on 2026-09-11 that as the team grows
 * that will change, and when it does, this function and the per-person switch it
 * reads are the only things that change — not every call site.
 *
 * `hrTeam` is the per-person override: NULL follows the role, TRUE and FALSE are
 * explicit in each direction. A false override beats the role, so somebody can be
 * a recruiter without being HR.
 */
export function isHrTeam(role: RoleName | null | undefined, hrTeam?: boolean | null): boolean {
  if (hrTeam === true || hrTeam === false) return hrTeam;
  return isAdminOrRecruiter(role);
}
