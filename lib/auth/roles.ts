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
