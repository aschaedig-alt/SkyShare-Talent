// Permission matrix for role-based access control
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    // Candidates
    "candidates:read",
    "candidates:write",
    "candidates:delete",
    // Jobs
    "jobs:read",
    "jobs:write",
    "jobs:delete",
    // Pilot Requirements
    "pilots:read",
    "pilots:write",
    "pilots:delete",
    // Imports
    "imports:read",
    "imports:write",
    // Duplicates
    "duplicates:read",
    "duplicates:resolve",
    // Calendar
    "calendar:read",
    "calendar:write",
    "calendar:sync",
    // Settings
    "settings:admin",
    "users:read",
    "users:write",
    "permissions:admin",
    "activity:read",
  ],
  RECRUITER: [
    "candidates:read",
    "candidates:write",
    "candidates:delete",
    "jobs:read",
    "jobs:write",
    "pilots:read",
    "pilots:write",
    "imports:read",
    "imports:write",
    "duplicates:read",
    "duplicates:resolve",
    "calendar:read",
    "calendar:write",
    "calendar:sync",
  ],
  HIRING_MANAGER: [
    "candidates:read",
    "jobs:read",
    "pilots:read",
    "calendar:read",
    "activity:read",
  ],
  VIEWER: [
    "candidates:read",
    "jobs:read",
    "pilots:read",
    "calendar:read",
    "activity:read",
  ],
};

export type UserRole = keyof typeof ROLE_PERMISSIONS;

export const VALID_ROLES: UserRole[] = ["ADMIN", "RECRUITER", "HIRING_MANAGER", "VIEWER"];

export function hasPermission(userRole: string, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[userRole as UserRole];
  if (!permissions) return false;
  return permissions.includes(permission);
}

export function getUserPermissions(userRole: string): string[] {
  return ROLE_PERMISSIONS[userRole as UserRole] || [];
}

export function canAccessModule(userRole: string, module: string): boolean {
  const permissions = ROLE_PERMISSIONS[userRole as UserRole];
  if (!permissions) return false;
  return permissions.some((p) => p.startsWith(module + ":"));
}

export const MODULE_ACCESS_MATRIX: Record<
  string,
  {
    label: string;
    roles: UserRole[];
    minRole: UserRole;
  }
> = {
  "command-center": {
    label: "Command Center",
    roles: ["ADMIN", "RECRUITER", "HIRING_MANAGER", "VIEWER"],
    minRole: "VIEWER",
  },
  candidates: {
    label: "Candidates",
    roles: ["ADMIN", "RECRUITER", "HIRING_MANAGER", "VIEWER"],
    minRole: "VIEWER",
  },
  "recruiting-jobs": {
    label: "Jobs",
    roles: ["ADMIN", "RECRUITER", "HIRING_MANAGER", "VIEWER"],
    minRole: "VIEWER",
  },
  "pilot-requirements": {
    label: "Pilot Requirements",
    roles: ["ADMIN", "RECRUITER", "HIRING_MANAGER", "VIEWER"],
    minRole: "VIEWER",
  },
  imports: {
    label: "Imports",
    roles: ["ADMIN", "RECRUITER"],
    minRole: "RECRUITER",
  },
  "duplicate-review": {
    label: "Duplicate Review",
    roles: ["ADMIN", "RECRUITER"],
    minRole: "RECRUITER",
  },
  calendar: {
    label: "Calendar",
    roles: ["ADMIN", "RECRUITER", "HIRING_MANAGER"],
    minRole: "HIRING_MANAGER",
  },
  settings: {
    label: "Settings",
    roles: ["ADMIN"],
    minRole: "ADMIN",
  },
};
