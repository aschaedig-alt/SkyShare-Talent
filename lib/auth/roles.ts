export const roleNames = ["ADMIN", "RECRUITER", "HIRING_MANAGER", "VIEWER"] as const;

export type RoleName = (typeof roleNames)[number];

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
  | "publishing:write";

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
    "publishing:write"
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
    "duplicates:write"
  ],
  HIRING_MANAGER: [
    "candidates:read",
    "files:read",
    "jobs:read",
    "requirements:read",
    "calendar:read"
  ],
  VIEWER: [
    "candidates:read",
    "files:read",
    "jobs:read",
    "requirements:read",
    "calendar:read"
  ]
};

export function hasPermission(role: RoleName, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function isRoleName(value: string | null | undefined): value is RoleName {
  return roleNames.includes(value as RoleName);
}
