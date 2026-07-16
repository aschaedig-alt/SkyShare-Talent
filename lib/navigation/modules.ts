import type { ComponentType } from "react";
import type { RoleName } from "@/lib/auth/roles";
import {
  Activity,
  BarChart3,
  Blocks,
  BriefcaseBusiness,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Contact,
  CreditCard,
  Database,
  FileCheck2,
  FileText,
  HeartHandshake,
  Import,
  Layers,
  Megaphone,
  Package,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  Plane,
  Radar,
  SearchCheck,
  Settings,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  Users,
  Wrench
} from "lucide-react";

export const accessLevels = ["HIDDEN", "VIEW_ONLY", "FULL_ACCESS"] as const;

export type AccessLevel = (typeof accessLevels)[number];

export const moduleIds = [
  "command-center",
  "candidates",
  "recruiting-jobs",
  "pilot-requirements",
  "matching",
  "events",
  "calendar",
  "scheduling",
  "interview-questions",
  "imports",
  "duplicate-review",
  "reports",
  "archive",
  "jobs",
  "review",
  "blocks",
  "people",
  "fleet",
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

export type NavigationSection = {
  id: string;
  label: string;
  items: NavigationItem[];
};

export type NavigationGroup = {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  sections: NavigationSection[];
};

export const navigationGroups: readonly NavigationGroup[] = [
  {
    id: "home",
    label: "Home",
    icon: LayoutDashboard,
    sections: [
      {
        id: "home",
        label: "Home",
        items: [
          { id: "command-center", href: "/command-center", label: "Command Center", icon: LayoutDashboard }
        ]
      }
    ]
  },
  {
    id: "recruiting",
    label: "Recruiting",
    icon: Users,
    sections: [
      {
        id: "sourcing",
        label: "Sourcing & Matching",
        items: [
          { id: "candidates", href: "/candidates", label: "Candidates", icon: SearchCheck },
          { id: "recruiting-jobs", href: "/recruiting-jobs", label: "Jobs", icon: BriefcaseBusiness },
          { id: "pilot-requirements", href: "/pilot-requirements", label: "Pilot Requirements", icon: Plane },
          { id: "matching", href: "/matching", label: "Matchboard", icon: Radar }
        ]
      },
      {
        id: "events",
        label: "Events & Outreach",
        items: [
          { id: "events", href: "/events", label: "Events", icon: Megaphone },
          { id: "events", href: "/events/supplies", label: "Supplies", icon: Package }
        ]
      },
      {
        id: "interviews",
        label: "Interviews & Scheduling",
        items: [
          { id: "calendar", href: "/calendar", label: "Calendar", icon: CalendarDays },
          { id: "scheduling", href: "/scheduling", label: "Scheduling", icon: CalendarClock },
          { id: "interview-questions", href: "/interview-questions", label: "Question Bank", icon: ListChecks }
        ]
      },
      {
        id: "publishing",
        label: "Publishing",
        items: [
          { id: "jobs", href: "/jobs", label: "Job Post Builder", icon: ClipboardList },
          { id: "review", href: "/review", label: "Final Review", icon: FileCheck2 },
          { id: "blocks", href: "/blocks", label: "Content Blocks", icon: Blocks }
        ]
      }
    ]
  },
  {
    id: "people",
    label: "People",
    icon: HeartHandshake,
    sections: [
      {
        id: "people",
        label: "People",
        items: [
          { id: "people", href: "/people", label: "Pre-onboarding", icon: UserPlus },
          { id: "people", href: "/employees", label: "Employees", icon: Users },
          { id: "people", href: "/orientation", label: "Orientation", icon: CalendarCheck },
          { id: "people", href: "/travel", label: "Travel", icon: Plane },
          { id: "people", href: "/business-cards", label: "Business cards", icon: CreditCard },
          { id: "people", href: "/compliments", label: "Compliments", icon: Sparkles }
        ]
      }
    ]
  },
  {
    id: "fleet",
    label: "Fleet",
    icon: Plane,
    sections: [
      {
        id: "fleet",
        label: "Fleet",
        items: [
          { id: "fleet", href: "/fleet/crew", label: "Crew Org Chart", icon: Plane },
          { id: "fleet", href: "/fleet/maintenance", label: "Maintenance Org Chart", icon: Wrench }
        ]
      }
    ]
  },
  {
    id: "data",
    label: "Data",
    icon: Database,
    sections: [
      {
        id: "data",
        label: "Data",
        items: [
          { id: "imports", href: "/imports", label: "Imports / Uploads", icon: Import },
          { id: "duplicate-review", href: "/duplicate-review", label: "Duplicate Review", icon: CheckCircle2 },
          { id: "reports", href: "/reports", label: "Reports", icon: BarChart3 },
          { id: "archive", href: "/archive", label: "Historical Archive", icon: Database }
        ]
      }
    ]
  },
  {
    id: "admin",
    label: "Admin",
    icon: Settings,
    sections: [
      {
        id: "settings",
        label: "Settings",
        items: [
          { id: "settings", href: "/settings", label: "General", icon: SlidersHorizontal },
          { id: "settings", href: "/settings/users", label: "Team Members", icon: Users },
          { id: "settings", href: "/settings/activity", label: "Activity", icon: Activity },
          { id: "settings", href: "/settings/feedback", label: "Feedback", icon: MessageSquare },
          { id: "settings", href: "/settings/templates", label: "Templates", icon: FileText },
          { id: "settings", href: "/settings/content-blocks", label: "Block management", icon: Blocks },
          { id: "settings", href: "/settings/layout-lab", label: "Layout Lab", icon: LayoutGrid },
          { id: "settings", href: "/settings/fleet", label: "Fleet positions", icon: Layers },
          { id: "settings", href: "/settings/new-hire-contacts", label: "New hire contacts", icon: Contact }
        ]
      }
    ]
  }
];

const defaultRule: ModuleAccessRule = {
  showInSidebar: true,
  accessLevel: "FULL_ACCESS"
};

const viewRule: ModuleAccessRule = {
  showInSidebar: true,
  accessLevel: "VIEW_ONLY"
};

const hiddenRule: ModuleAccessRule = {
  showInSidebar: false,
  accessLevel: "HIDDEN"
};

// Default access for a module a role has no explicit setting for — i.e. what a
// NEWLY-added page gets until an admin edits it in the Module Visibility panel:
//   admin → full · recruiter → view · hiring manager → view · viewer → hidden.
// (The Settings module stays hard-locked to admins.)
function roleDefaultRule(moduleId: ModuleId, role: RoleName): ModuleAccessRule {
  if (moduleId === "settings") {
    return role === "ADMIN" ? defaultRule : hiddenRule;
  }
  switch (role) {
    case "ADMIN":
      return defaultRule;
    case "RECRUITER":
    case "HIRING_MANAGER":
      return viewRule;
    case "VIEWER":
      return hiddenRule;
    default:
      return hiddenRule;
  }
}

function accessLevelFrom(value: unknown): AccessLevel | null {
  return accessLevels.includes(value as AccessLevel) ? (value as AccessLevel) : null;
}

function normalizeRule(moduleId: ModuleId, role: RoleName, value: unknown): ModuleAccessRule {
  const fallback = roleDefaultRule(moduleId, role);

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
      ADMIN: roleDefaultRule(moduleId, "ADMIN"),
      RECRUITER: roleDefaultRule(moduleId, "RECRUITER"),
      HIRING_MANAGER: roleDefaultRule(moduleId, "HIRING_MANAGER"),
      VIEWER: roleDefaultRule(moduleId, "VIEWER")
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
    for (const section of group.sections) {
      for (const item of section.items) {
        if (matchesPath(item.href, pathname)) {
          return item.id;
        }
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
      sections: group.sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => isSidebarVisible(getModuleAccessRule(policy, item.id, role)))
        }))
        .filter((section) => section.items.length > 0)
    }))
    .filter((group) => group.sections.length > 0);
}

export type VisibleNavigationGroup = ReturnType<typeof getVisibleNavigationGroups>[number];
export type VisibleNavigationSection = VisibleNavigationGroup["sections"][number];
