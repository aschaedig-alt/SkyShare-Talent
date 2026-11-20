import type { RoleName } from "@/lib/auth/roles";

// Edge-safe half of View as (no Prisma): middleware.ts imports this to enforce
// read-only mode. The database half is lib/auth/view-as.ts.

/** How long a view-as lasts before it ends on its own. */
export const VIEW_AS_MAX_MINUTES = 60;

/** Stored inside the JWT while an ADMIN is viewing as somebody. */
export type ViewAsTokenState = {
  userId: string;
  email: string | null;
  name: string | null;
  role: RoleName;
  startedAt: number;
  expiresAt: number;
};

export function isViewAsActive(state: unknown): state is ViewAsTokenState {
  if (!state || typeof state !== "object") return false;
  const s = state as Partial<ViewAsTokenState>;
  return typeof s.userId === "string" && typeof s.expiresAt === "number" && Date.now() < s.expiresAt;
}

/** Requests that may change data. All of these are refused while view-as is active. */
export function isMutatingMethod(method: string) {
  const m = method.toUpperCase();
  return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
}
