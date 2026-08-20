import type { ComponentType } from "react";
import type { RoleName } from "@/lib/auth/roles";
import {
  Activity,
  BarChart3,
  Blocks,
  BookOpen,
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
  FileSignature,
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

// EDIT sits between VIEW_ONLY and FULL_ACCESS: normal editing works, but
// destructive actions (delete, merge, bulk-delete) stay FULL_ACCESS-only.
// Enforcement lives in lib/auth/module-write-access.ts, currently wired into
// the Candidates and Employees write/delete routes only — see that file's
// header comment for the exact scope before assuming it's enforced elsewhere.
export const accessLevels = ["HIDDEN", "VIEW_ONLY", "EDIT", "FULL_ACCESS"] as const;

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
  "handbook",
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

// The Home group used to sit here holding a single item, the Command Center.
// On Aug 3 the Command Center moved under Admin > Settings and became
// admin-only, which left the group empty, so it is gone rather than kept as an
// empty tile. Note the nav item below carries id "settings", NOT
// "command-center": the id is what the access policy is keyed on, and using
// "settings" is what makes it appear and disappear with the rest of the Admin
// section instead of needing its own visibility rule.
export const navigationGroups: readonly NavigationGroup[] = [
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
          { id: "matching", href: "/matching", label: "Matchboard", icon: Radar },
          // An offer is the last step of recruiting, so it lives here rather than
          // under People. Rides on the candidates module's access (it is a view of
          // candidate applications, not a separate thing to permission).
          { id: "candidates", href: "/offers", label: "Offers", icon: FileSignature }
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
          // Interviews that happened with no write-up yet. Rides on the calendar
          // module's access, like Offers rides on candidates above — it is a view
          // of calendar interviews, not a separate thing to permission.
          { id: "calendar", href: "/interviews/debrief", label: "Debrief Queue", icon: CalendarCheck },
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
  // The three buckets follow one question anyone can answer without training:
  // have they signed? have they started?
  //   Recruiting  — people we MIGHT hire      (haven't signed)
  //   Onboarding  — people who are JOINING    (signed, not started)
  //   People      — people who WORK HERE      (started)
  // The offer is the last step of Recruiting, and signing is the handoff into
  // Onboarding. Splitting these two groups is what removes the old fog, where
  // "People" held both someone who starts in six weeks and someone who has
  // worked here for six years.
  //
  // Both groups intentionally keep the "people" module id, so access is
  // unchanged by this reorg — it is a navigation change, not a permissions one.
  {
    id: "onboarding",
    label: "Onboarding",
    icon: UserPlus,
    sections: [
      {
        id: "onboarding",
        label: "Onboarding",
        items: [
          // Route stays /people: renaming it would break saved page layouts,
          // which are keyed by page id. The label is what people read.
          { id: "people", href: "/people", label: "New hires", icon: UserPlus },
          { id: "people", href: "/orientation", label: "Orientation", icon: CalendarCheck },
          { id: "people", href: "/travel", label: "Travel", icon: Plane },
          { id: "people", href: "/business-cards", label: "Business cards", icon: CreditCard }
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
          { id: "people", href: "/employees", label: "Employees", icon: Users },
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
          { id: "fleet", href: "/fleet/maintenance", label: "Maintenance Org Chart", icon: Wrench },
          // Moved out of Admin > Settings (the Jul admin audit): the canonical
          // list of pilot positions is recruiting reference data that Jobs,
          // Pilot Requirements and Matchboard all resolve against, not an
          // administrative setting. Gated on "fleet" now rather than "settings",
          // which only widens who can READ it — the view is read-only.
          { id: "fleet", href: "/fleet/positions", label: "Fleet positions", icon: Layers }
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
          { id: "archive", href: "/archive", label: "Historical Archive", icon: Database },
          { id: "handbook", href: "/handbook", label: "Handbook", icon: BookOpen }
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
          { id: "settings", href: "/settings/command-center", label: "Command Center", icon: LayoutDashboard },
          { id: "settings", href: "/settings/users", label: "Team Members", icon: Users },
          { id: "settings", href: "/settings/activity", label: "Activity", icon: Activity },
          { id: "settings", href: "/settings/feedback", label: "Feedback", icon: MessageSquare },
          { id: "settings", href: "/settings/templates", label: "Templates", icon: FileText },
          { id: "settings", href: "/settings/content-blocks", label: "Block management", icon: Blocks },
          { id: "settings", href: "/settings/layout-lab", label: "Layout Lab", icon: LayoutGrid },
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
  // The Handbook is documentation — visible to everyone, including Viewers, who
  // are otherwise hidden from most modules. Read-only for all; there is nothing
  // to "edit" on it anyway.
  if (moduleId === "handbook") {
    return viewRule;
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

// A per-user override of the role policy, as stored on User.moduleAccessJson and
// parsed by lib/auth/user-module-access.ts. Typed structurally here rather than
// imported, because that module imports THIS one and the cycle would be real.
export type ModuleRuleOverrides = Partial<Record<ModuleId, ModuleAccessRule>>;

// The rule that applies to one person: their own override where they have one,
// otherwise their role's. ADMIN and the Settings module are never overridden -
// the same carve-outs resolveUserModuleRule enforces, kept in step deliberately.
function ruleFor(
  policy: ModuleAccessPolicy,
  moduleId: ModuleId,
  role: RoleName,
  overrides?: ModuleRuleOverrides | null
): ModuleAccessRule {
  const roleRule = getModuleAccessRule(policy, moduleId, role);
  if (!overrides || role === "ADMIN" || moduleId === "settings") {
    return roleRule;
  }
  // Missing means off, NOT the role default - kept deliberately in step with
  // resolveUserModuleRule in lib/auth/user-module-access.ts. If these two ever
  // disagree, the sidebar advertises links the gates refuse.
  return overrides[moduleId] ?? { accessLevel: "HIDDEN", showInSidebar: false };
}

export function getModuleAccessForPath(
  pathname: string,
  policy: ModuleAccessPolicy,
  role: RoleName,
  overrides?: ModuleRuleOverrides | null
): { moduleId: ModuleId; rule: ModuleAccessRule } | null {
  const moduleId = getModuleIdForPath(pathname);

  if (!moduleId) {
    return null;
  }

  return {
    moduleId,
    rule: ruleFor(policy, moduleId, role, overrides)
  };
}

// overrides is optional so every existing call site keeps its exact behaviour;
// pass it and the sidebar reflects what this ONE account can actually open,
// rather than advertising links that 403 the moment they are clicked.
export function getVisibleNavigationGroups(
  policy: ModuleAccessPolicy,
  role: RoleName,
  overrides?: ModuleRuleOverrides | null
) {
  return navigationGroups
    .map((group) => ({
      ...group,
      sections: group.sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => isSidebarVisible(ruleFor(policy, item.id, role, overrides)))
        }))
        .filter((section) => section.items.length > 0)
    }))
    .filter((group) => group.sections.length > 0);
}

export type VisibleNavigationGroup = ReturnType<typeof getVisibleNavigationGroups>[number];
export type VisibleNavigationSection = VisibleNavigationGroup["sections"][number];
