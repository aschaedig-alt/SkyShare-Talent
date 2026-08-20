import { headers } from "next/headers";
import { getWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import { moduleIds, type ModuleId } from "@/lib/navigation/modules";
import { isModuleReachable, resolveUserModuleRule } from "@/lib/auth/user-module-access";
import type { ViewerScope } from "@/lib/auth/viewer-scope";

// The API-side half of per-user module access.
//
// WHY THIS FILE EXISTS: requireModulePageAccess gates PAGES only. Nothing in the
// API layer has ever consulted the Module Visibility policy — requireApiPermission
// asks the static role table and stops there. So hiding a module from somebody
// hides the screen and leaves every route behind it answering normally, which is
// no use at all when the point is to stop a person reading candidate data. Server
// actions are worse again: they are POSTs to the PAGE path and bypass both gates
// by construction.
//
// This closes both, from one place, by resolving the request path back to a
// module and checking the caller's per-user rule.
//
// IT ONLY EVER APPLIES TO A USER WHO HAS AN OVERRIDE SET. Everybody in the
// database today has moduleAccessJson = null, so for them this returns "allowed"
// before it does anything else and behaviour is byte-identical to before. That
// property is what makes it safe to add to a helper with ~200 call sites against
// a shared live database: the blast radius is exactly the accounts an admin has
// deliberately restricted, and nobody else.

// Longest prefix wins, so order within this list does not matter — matchPrefix
// sorts by specificity. Anything unmapped is ALLOWED: this gate exists to
// enforce a deliberate restriction, not to become a second permission system
// that silently breaks a route somebody adds next week. The candidate allowlist,
// not this map, is what makes candidate data safe.
const PATH_MODULES: Array<[string, ModuleId]> = [
  // --- candidates and everything that reads a candidate record ---
  ["/api/candidates", "candidates"],
  ["/api/candidate-files", "candidates"],
  ["/api/candidate-views", "candidates"],
  ["/api/candidate-applications", "candidates"],
  ["/api/candidate-metrics", "candidates"],
  ["/api/resume-intake", "candidates"],
  ["/api/document-intake", "candidates"],
  ["/api/offers", "candidates"],
  ["/candidates", "candidates"],
  ["/offers", "candidates"],

  // --- interviewing / scheduling ---
  ["/api/interviews", "calendar"],
  ["/api/interview-scorecards", "calendar"],
  ["/api/calendar", "calendar"],
  ["/interviews", "calendar"],
  ["/calendar", "calendar"],
  ["/api/interview-questions", "interview-questions"],
  ["/interview-questions", "interview-questions"],
  ["/api/booking-hosts", "scheduling"],
  ["/api/booking-types", "scheduling"],
  ["/api/availability-overrides", "scheduling"],
  ["/scheduling", "scheduling"],

  // --- sourcing / matching ---
  ["/api/recruiting-jobs", "recruiting-jobs"],
  ["/recruiting-jobs", "recruiting-jobs"],
  ["/api/pilot-requirements", "pilot-requirements"],
  ["/pilot-requirements", "pilot-requirements"],
  ["/matching", "matching"],

  // --- publishing ---
  ["/api/jobs", "jobs"],
  ["/api/job-block-instances", "jobs"],
  ["/jobs", "jobs"],
  ["/review", "review"],
  ["/api/blocks", "blocks"],
  ["/blocks", "blocks"],

  // --- people / onboarding ---
  ["/api/new-hires", "people"],
  ["/api/onboarding", "people"],
  ["/api/onboarding-grid", "people"],
  ["/api/onboarding-milestones", "people"],
  ["/api/onboarding-tasks", "people"],
  ["/api/orientation", "people"],
  ["/api/travel", "people"],
  ["/api/contacts", "people"],
  ["/people", "people"],
  ["/employees", "people"],
  ["/orientation", "people"],
  ["/travel", "people"],
  ["/business-cards", "people"],
  ["/compliments", "people"],

  // --- fleet ---
  ["/api/fleet", "fleet"],
  ["/fleet", "fleet"],

  // --- data ---
  ["/api/imports", "imports"],
  ["/imports", "imports"],
  ["/api/duplicate-review", "duplicate-review"],
  ["/duplicate-review", "duplicate-review"],
  ["/api/reports-share", "reports"],
  ["/reports", "reports"],
  ["/archive", "archive"],
  ["/handbook", "handbook"],

  // --- events ---
  ["/api/events", "events"],
  ["/events", "events"],

  // --- command center ---
  ["/command-center", "command-center"]
];

// Precomputed longest-first so the first hit is the most specific one.
const SORTED_PATH_MODULES = [...PATH_MODULES].sort((a, b) => b[0].length - a[0].length);

/** Resolve a request path to the module that owns it, or null if unmapped. */
export function moduleForPath(pathname: string | null | undefined): ModuleId | null {
  if (!pathname) {
    return null;
  }
  for (const [prefix, moduleId] of SORTED_PATH_MODULES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return moduleId;
    }
  }
  return null;
}

/**
 * The request path, as forwarded by middleware.ts (which sets x-pathname on
 * every request precisely so server code can see it). Returns null outside a
 * request scope, which makes this a no-op in scripts and at build time.
 */
async function currentPathname(): Promise<string | null> {
  try {
    const headerList = await headers();
    return headerList.get("x-pathname");
  } catch {
    return null;
  }
}

export type ModuleAccessDenial = { moduleId: ModuleId };

/**
 * Is this user blocked from the module that owns the current request path?
 *
 * Returns the denial (so the caller can name the module in its response) or null
 * when the request is allowed. Allowed is the answer for: an admin, a user with
 * no override configured, an unmapped path, and any error resolving the rule.
 */
export async function checkUserModuleAccess(viewer: ViewerScope | null): Promise<ModuleAccessDenial | null> {
  // No override configured is the overwhelmingly common case — every account in
  // the database today — and it costs one property read to answer. Admins are
  // never narrowed; a null viewer is the local-dev bypass.
  if (!viewer || viewer.role === "ADMIN" || !viewer.moduleOverrides) {
    return null;
  }

  const pathname = await currentPathname();
  const moduleId = moduleForPath(pathname);
  if (!moduleId) {
    return null;
  }

  try {
    const policy = await getWorkspaceModuleAccessPolicy();
    const rule = resolveUserModuleRule(policy, moduleId, viewer.role, viewer.moduleOverrides);
    return isModuleReachable(rule) ? null : { moduleId };
  } catch (error) {
    // A lookup failure must not turn into a lockout on a route the caller is
    // otherwise entitled to. The candidate allowlist is enforced separately and
    // fails closed on its own, so candidate DATA is still protected here.
    console.error("Failed to resolve per-user module access:", error);
    return null;
  }
}

/** Every module id, for the admin UI. Re-exported so callers need one import. */
export { moduleIds };
