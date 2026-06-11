import type { ComponentType } from "react";
import type { RoleName } from "@/lib/auth/roles";
import {
  BarChart3,
  Blocks,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Gauge,
  Import,
  Plane,
  SearchCheck,
  Settings
} from "lucide-react";

export const accessLevels = ["HIDDEN", "VIEW_ONLY", "FULL_ACCESS"] as const;

export type AccessLevel = (typeof accessLevels)[number];

export const moduleIds = [
  "command-center",
  "candidates",
  "recruiting-jobs",
  "pilot-requirements",
  "calendar",
  "imports",
  "duplicate-review",
  "reports",
  "jobs",
  "review",
  "templates",
  "blocks",
  "changes",
  "approvals",
  "jobs-sandbox",
  "settings"
] as const;

export type ModuleId = (typeof moduleIds)[number];

export type ModuleAccessRule = {
  showInSidebar: boolean;
  accessLevel: AccessLevel;
};

export type ModuleAccessPolicy = {
  [moduleId in ModuleId]: Record<RoleName, ModuleAccessRule>;
};

export type NavigationItem = {
  id: ModuleId;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Recruiting",
    items: [
      { id: "command-center", href: "/command-center", label: "Command Center", icon: Gauge },
      { id: "candidates", href: "/candidates", label: "Candidates", icon: SearchCheck },
      { id: "recruiting-jobs", href: "/recruiting-jobs", label: "Jobs", icon: BriefcaseBusiness },
      { id: "pilot-requirements", href: "/pilot-requirements", label: "Pilot Requirements", icon: Plane },
      { id: "calendar", href: "/calendar", label: "Calendar", icon: CalendarDays }
    ]
  },
  {
    label: "Data & Review",
    items: [
      { id: "imports", href: "/imports", label: "Imports / Uploads", icon: Import },
      { id: "duplicate-review", href: "/duplicate-review", label: "Duplicate Review", icon: CheckCircle2 },
      { id: "reports", href: "/reports", label: "Reports", icon: BarChart3 }
    ]
  },
  {
    label: "Publishing",
    items: [
      { id: "jobs", href: "/jobs", label: "Job Builder", icon: ClipboardList },
      { id: "review", href: "/review", label: "Final Review", icon: FileCheck2 },
      { id: "blocks", href: "/blocks", label: "Content Blocks", icon: Blocks }
    ]
  },
  {
    label: "Admin",
    items: [{ id: "settings", href: "/settings", label: "Settings", icon: Settings }]
  }
];

const defaultRule: ModuleAccessRule = {
  showInSidebar: true,
  accessLevel: "FULL_ACCESS"
};

const hiddenRule: ModuleAccessRule = {
  showInSidebar: false,
  accessLevel: "HIDDEN"
};

function accessLevelFrom(value: unknown): AccessLevel | null {
  return accessLevels.includes(value as AccessLevel) ? (value as AccessLevel) : null;
}

function normalizeRule(moduleId: ModuleId, role: RoleName, value: unknown): ModuleAccessRule {
  const fallback =
    moduleId === "settings"
      ? role === "ADMIN"
        ? defaultRule
        : hiddenRule
      : defaultRule;

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const raw = value as Partial<ModuleAccessRule>;
  const accessLevel = accessLevelFrom(raw.accessLevel) ?? fallback.accessLevel;
  const showInSidebar =
    accessLevel === "HIDDEN" ? false : typeof raw.showInSidebar === "boolean" ? raw.showInSidebar : fallback.showInSidebar;

  if (moduleId === "settings") {
    return role === "ADMIN" ? defaultRule : hiddenRule;
  }

  return {
    showInSidebar,
    accessLevel
  };
}

export function createDefaultModuleAccessPolicy(): ModuleAccessPolicy {
  const policy = {} as ModuleAccessPolicy;

  for (const moduleId of moduleIds) {
    policy[moduleId] = {
      ADMIN: normalizeRule(moduleId, "ADMIN", defaultRule),
      RECRUITER: normalizeRule(moduleId, "RECRUITER", defaultRule),
      HIRING_MANAGER: normalizeRule(moduleId, "HIRING_MANAGER", defaultRule),
      VIEWER: normalizeRule(moduleId, "VIEWER", defaultRule)
    } as Record<RoleName, ModuleAccessRule>;
  }

  return policy;
}

function extractPolicyPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const raw = value as { policy?: unknown };
  return raw.policy ?? value;
}

export function normalizeModuleAccessPolicy(value: unknown): ModuleAccessPolicy {
  const normalized = createDefaultModuleAccessPolicy();
  const payload = extractPolicyPayload(value);

  if (!payload || typeof payload !== "object") {
    return normalized;
  }

  const rawPolicy = payload as Partial<Record<ModuleId, Partial<Record<RoleName, unknown>>>>;

  for (const moduleId of moduleIds) {
    const modulePolicy = rawPolicy[moduleId];

    if (!modulePolicy || typeof modulePolicy !== "object") {
      continue;
    }

    for (const role of ["ADMIN", "RECRUITER", "HIRING_MANAGER", "VIEWER"] as const) {
      normalized[moduleId][role] = normalizeRule(moduleId, role, modulePolicy[role]);
    }
  }

  return normalized;
}

export function getModuleAccessRule(policy: ModuleAccessPolicy, moduleId: ModuleId, role: RoleName): ModuleAccessRule {
  return policy[moduleId]?.[role] ?? createDefaultModuleAccessPolicy()[moduleId][role];
}

export function isSidebarVisible(rule: ModuleAccessRule) {
  return rule.accessLevel !== "HIDDEN" && rule.showInSidebar;
}

function matchesPath(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getModuleIdForPath(pathname: string): ModuleId | null {
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (matchesPath(item.href, pathname)) {
        return item.id;
      }
    }
  }

  return null;
}

export function getModuleAccessForPath(
  pathname: string,
  policy: ModuleAccessPolicy,
  role: RoleName
): { moduleId: ModuleId; rule: ModuleAccessRule } | null {
  const moduleId = getModuleIdForPath(pathname);

  if (!moduleId) {
    return null;
  }

  return {
    moduleId,
    rule: getModuleAccessRule(policy, moduleId, role)
  };
}

export function getVisibleNavigationGroups(policy: ModuleAccessPolicy, role: RoleName) {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isSidebarVisible(getModuleAccessRule(policy, item.id, role)))
    }))
    .filter((group) => group.items.length > 0);
}
