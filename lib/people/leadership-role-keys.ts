/**
 * The leadership roles a supervisor slot can follow, and their titles.
 *
 * Kept apart from lib/people/leadership-roles.ts (which talks to the database)
 * so client components can import it. The logic and the why live there.
 */

export type LeadershipRoleKey = "chief-pilot" | "assistant-chief-pilot";

/** The roles that exist. Titles are fixed here; only the holder is edited. */
export const LEADERSHIP_ROLES: ReadonlyArray<{ key: LeadershipRoleKey; title: string; sortOrder: number }> = [
  { key: "chief-pilot", title: "Chief Pilot", sortOrder: 1 },
  { key: "assistant-chief-pilot", title: "Assistant Chief Pilot", sortOrder: 2 }
];

/** What a new pilot hire reports to, by default. His answer 2026-11-10: automatic. */
export const PILOT_DEFAULT_SUPERVISOR_ROLE: LeadershipRoleKey = "chief-pilot";
export const PILOT_DEFAULT_SUPERVISOR2_ROLE: LeadershipRoleKey = "assistant-chief-pilot";

export function isLeadershipRoleKey(v: unknown): v is LeadershipRoleKey {
  return typeof v === "string" && LEADERSHIP_ROLES.some((r) => r.key === v);
}

export function leadershipRoleTitle(key: string | null | undefined): string | null {
  return LEADERSHIP_ROLES.find((r) => r.key === key)?.title ?? null;
}

export type LeadershipRoleView = {
  key: LeadershipRoleKey;
  title: string;
  holder: { id: string; name: string; position: string | null; email: string | null } | null;
  /** How many people follow this role, in either slot. */
  followers: number;
};
