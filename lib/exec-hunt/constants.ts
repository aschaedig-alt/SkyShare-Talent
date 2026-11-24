// "Where's the Executive?" — the Christmas party scavenger hunt (Dec 11 2026).
// Client-safe constants only; server logic is in lib/exec-hunt/server.ts.

export const EXEC_HUNT_TITLE = "Where's the Executive?";

/** The five executives, in display order. The slug is permanent: it is part of
 *  every printed QR code's URL. */
export const EXEC_HUNT_EXECUTIVES = [
  { slug: "cory", name: "Cory" },
  { slug: "tommy", name: "Tommy" },
  { slug: "harry", name: "Harry" },
  { slug: "keith", name: "Keith" },
  { slug: "jonathan", name: "Jonathan" }
] as const;

export const EXEC_HUNT_PICTURES_PER_EXEC = 3;
export const EXEC_HUNT_TOTAL = EXEC_HUNT_EXECUTIVES.length * EXEC_HUNT_PICTURES_PER_EXEC;

/** Public pages (no login). */
export const EXEC_HUNT_PUBLIC_BASE = "/christmas/exec-hunt";
/** The printed code for one picture points here. */
export function execHuntScanPath(publicKey: string) {
  return `${EXEC_HUNT_PUBLIC_BASE}/${encodeURIComponent(publicKey)}`;
}

/** localStorage key holding { token, name } on the guest's phone. */
export const EXEC_HUNT_STORAGE_KEY = "skyshare-exec-hunt-guest";
/** The same token, as a cookie, so a browser that loses localStorage still
 *  recognises the guest (and the server can read it). */
export const EXEC_HUNT_COOKIE = "exec_hunt_guest";

export const EXEC_HUNT_NAME_MAX = 40;

export type ExecHuntProgress = {
  found: number;
  total: number;
  executives: { slug: string; name: string; found: number[] }[];
};

export type ExecHuntClaimResult =
  | {
      status: "claimed" | "already";
      picture: { slug: string; label: string; executiveName: string; number: number };
      guest: { name: string; token?: string };
      progress: ExecHuntProgress;
    }
  | { status: "closed"; message: string }
  | { status: "needs-name" }
  | { status: "not-found" };

export type ExecHuntLiveData = {
  open: boolean;
  statusLine: string;
  participants: number;
  discoveries: number;
  completed: number;
  locationsFound: number;
  total: number;
  executives: { slug: string; name: string; photoUrl: string | null; pictures: { number: number; count: number }[] }[];
  /** Null when the admin has hidden the leaderboard. */
  leaderboard: { rank: number; name: string | null; found: number }[] | null;
  updatedAt: string;
};
