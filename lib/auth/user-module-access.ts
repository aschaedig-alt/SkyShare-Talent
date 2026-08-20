import {
  accessLevels,
  getModuleAccessRule,
  moduleIds,
  type AccessLevel,
  type ModuleAccessPolicy,
  type ModuleAccessRule,
  type ModuleId
} from "@/lib/navigation/modules";
import type { RoleName } from "@/lib/auth/roles";
import { TOGGLEABLE_MODULES } from "@/lib/auth/scoping-options";

// PER-USER module visibility, layered on top of the workspace Module Visibility
// policy in Settings.
//
// The workspace policy is keyed by ROLE, so narrowing it to contain one person
// narrows it for every other person holding that role. This lets an admin turn
// modules on and off for ONE account — which is what makes "this hiring manager
// only ever sees Candidates" possible without touching anybody else.
//
// Stored as JSON on User.moduleAccessJson. NULL means "follow the role policy",
// which is what every pre-existing user has, so this whole file is inert until
// an admin sets an override. That is deliberate: it means shipping this cannot
// change what anyone currently sees.

export type UserModuleOverrides = Partial<Record<ModuleId, ModuleAccessRule>>;

function isModuleId(value: string): value is ModuleId {
  return (moduleIds as readonly string[]).includes(value);
}

function isAccessLevel(value: unknown): value is AccessLevel {
  return (accessLevels as readonly string[]).includes(value as string);
}

/**
 * Parse the stored JSON. Returns null for "no override configured".
 *
 * Anything unparseable is treated as no override rather than as a lockout: a
 * corrupt column must not brick somebody's account. That is the opposite of how
 * the candidate allowlist fails, and deliberately so — this decides which PAGES
 * render, while the allowlist decides who a person can read. Failing this one
 * closed would lock a user out of the whole app over a bad character; failing
 * the allowlist open would show them people they were never granted.
 */
export function parseUserModuleOverrides(json: string | null | undefined): UserModuleOverrides | null {
  if (!json) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const overrides: UserModuleOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isModuleId(key) || !value || typeof value !== "object") {
      continue;
    }
    const rule = value as Partial<ModuleAccessRule>;
    if (!isAccessLevel(rule.accessLevel)) {
      continue;
    }
    overrides[key] = {
      accessLevel: rule.accessLevel,
      // A hidden module is never in the sidebar, whatever the stored flag says —
      // same invariant normalizeRule keeps for the workspace policy.
      showInSidebar: rule.accessLevel === "HIDDEN" ? false : rule.showInSidebar !== false
    };
  }

  return Object.keys(overrides).length ? overrides : null;
}

/** Serialize for storage. Returns null when there is nothing to override. */
export function serializeUserModuleOverrides(overrides: UserModuleOverrides | null | undefined): string | null {
  if (!overrides) {
    return null;
  }
  const clean: UserModuleOverrides = {};
  for (const [key, rule] of Object.entries(overrides)) {
    if (!isModuleId(key) || !rule || !isAccessLevel(rule.accessLevel)) {
      continue;
    }
    // Settings is hard-locked to ADMIN in lib/navigation/modules.ts (both
    // roleDefaultRule and normalizeRule), so accepting an override for it would
    // create a per-user backdoor into the one module the workspace policy
    // refuses to widen. Drop it at write time as well as at read time.
    if (key === "settings") {
      continue;
    }
    clean[key] = {
      accessLevel: rule.accessLevel,
      showInSidebar: rule.accessLevel === "HIDDEN" ? false : rule.showInSidebar !== false
    };
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

/**
 * The rule that actually applies to this user for this module: their own
 * override if they have one, otherwise the workspace policy for their role.
 *
 * ADMIN is never narrowed by a per-user override — same carve-out ADMIN already
 * has everywhere else in this codebase, and it stops an admin locking themselves
 * out of Settings and being unable to undo it.
 */
export function resolveUserModuleRule(
  policy: ModuleAccessPolicy,
  moduleId: ModuleId,
  role: RoleName,
  overrides: UserModuleOverrides | null | undefined
): ModuleAccessRule {
  const roleRule = getModuleAccessRule(policy, moduleId, role);

  if (role === "ADMIN" || !overrides) {
    return roleRule;
  }
  // Settings stays ADMIN-only regardless of what is stored.
  if (moduleId === "settings") {
    return roleRule;
  }

  // A stored override is a COMPLETE statement, so a module missing from it is off
  // rather than falling back to the role default.
  //
  // The alternative (?? roleRule) fails in the widening direction and silently: a
  // hiring manager's role default is VIEW_ONLY on every module, so adding a new
  // module to lib/navigation/modules.ts would hand it to every already-restricted
  // account, while the admin screen - which treats a missing key as off - kept
  // showing it unticked. Whoever restricted the account never gets told.
  return overrides[moduleId] ?? { accessLevel: "HIDDEN", showInSidebar: false };
}

/**
 * A convenience for the common "may this user reach this module at all" test.
 * HIDDEN is the only level that blocks access; VIEW_ONLY and above can load the
 * page (VIEW_ONLY mutes the controls in ModuleAccessShell).
 */
export function isModuleReachable(rule: ModuleAccessRule): boolean {
  return rule.accessLevel !== "HIDDEN";
}

/**
 * The starting point a newly-restricted account gets: everything off but Candidates.
 *
 * The admin UI calls this rather than rebuilding the same loop - the two used to be
 * separate, one over moduleIds and one over TOGGLEABLE_MODULES, which is precisely the
 * pair that drifts once somebody adds a module.
 *
 * Every toggleable module is written EXPLICITLY rather than leaving the off ones absent.
 * resolveUserModuleRule treats a missing key as off too, so both agree - but a complete
 * object is what the admin screen reads back, and a sparse one would render as though
 * nothing had been configured.
 */
export function candidatesOnlyOverrides(): UserModuleOverrides {
  const overrides: UserModuleOverrides = {};
  for (const moduleId of TOGGLEABLE_MODULES) {
    overrides[moduleId] =
      moduleId === "candidates"
        ? { accessLevel: "VIEW_ONLY", showInSidebar: true }
        : { accessLevel: "HIDDEN", showInSidebar: false };
  }
  return overrides;
}
