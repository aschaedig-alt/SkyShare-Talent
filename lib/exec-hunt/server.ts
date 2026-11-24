import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  EXEC_HUNT_EXECUTIVES,
  EXEC_HUNT_NAME_MAX,
  EXEC_HUNT_PICTURES_PER_EXEC,
  EXEC_HUNT_TOTAL,
  type ExecHuntClaimResult,
  type ExecHuntLiveData,
  type ExecHuntProgress
} from "@/lib/exec-hunt/constants";

// ---------------------------------------------------------------------------
// HOW A GUEST IS RECOGNISED
//
// No login. The first claim from a phone creates an ExecHuntGuest and hands the
// browser a random 32-byte token, which it keeps in localStorage AND in a cookie
// (either one is enough on a later scan). The database stores only the sha256 of
// the token, so the table cannot be used to impersonate anyone.
//
// The NAME is a label, never an identity: two "Mike"s are two tokens, two rows,
// two leaderboard lines. The admin views show a short id beside a repeated name
// so they can be told apart.
//
// HOW DUPLICATES ARE PREVENTED
//
// ExecHuntDiscovery has @@unique([guestId, pictureId]). A claim is one INSERT; if
// the row already exists the database refuses it and we answer "already found".
// That covers re-scans, double-taps and two requests racing each other — the count
// is always COUNT(*) of real rows, never a number the phone sends.
// ---------------------------------------------------------------------------

export function hashGuestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function newGuestToken() {
  return randomBytes(32).toString("base64url");
}

/** Plausible token shape — rejects junk before it reaches the database. */
export function isTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(value);
}

export function cleanGuestName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // Collapse whitespace, strip control characters, cap the length.
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXEC_HUNT_NAME_MAX);
  return cleaned.length ? cleaned : null;
}

/**
 * The absolute origin printed into the QR codes. NEVER localhost — a code
 * printed from a laptop must open on a guest's phone. Same rule as
 * cardLinkOrigin (lib/new-hire-contacts/hire-card-link.ts).
 */
export function execHuntOrigin(): string {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const production = productionHost ? `https://${productionHost}` : "https://skyshare-journey.vercel.app";
  const base = process.env.NEXTAUTH_URL ?? production;
  return (/localhost|127\.0\.0\.1|\[::1\]/i.test(base) ? production : base).replace(/\/+$/, "");
}

export function execHuntPhotoUrl(exec: { slug: string; photoKey: string | null; photoUpdatedAt: Date | null }) {
  if (!exec.photoKey) return null;
  return `/api/christmas/exec-hunt/photo/${exec.slug}?v=${exec.photoUpdatedAt?.getTime() ?? 0}`;
}

// ---------------------------------------------------------------------------
// Seeding — the 5 executives and 15 pictures exist from the first page view.
// Idempotent: skipDuplicates on the unique slugs means a second (or racing) call
// changes nothing, and an existing picture's publicKey is NEVER rewritten.
// ---------------------------------------------------------------------------

let seeded = false;

export async function ensureExecHuntSeeded() {
  if (seeded) return;
  const pictureCount = await prisma.execHuntPicture.count();
  if (pictureCount >= EXEC_HUNT_TOTAL) {
    seeded = true;
    return;
  }

  await prisma.execHuntConfig.createMany({ data: [{ id: "default" }], skipDuplicates: true });
  await prisma.execHuntExecutive.createMany({
    data: EXEC_HUNT_EXECUTIVES.map((exec, index) => ({ slug: exec.slug, name: exec.name, sortOrder: index })),
    skipDuplicates: true
  });
  const executives = await prisma.execHuntExecutive.findMany({ select: { id: true, slug: true } });
  const bySlug = new Map(executives.map((exec) => [exec.slug, exec.id]));

  const rows = EXEC_HUNT_EXECUTIVES.flatMap((exec) =>
    Array.from({ length: EXEC_HUNT_PICTURES_PER_EXEC }, (_, i) => {
      const number = i + 1;
      const slug = `${exec.slug}-${number}`;
      // 6 lowercase letters/digits, no look-alikes: unguessable enough for a party.
      const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
      const tail = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("");
      return { executiveId: bySlug.get(exec.slug)!, number, slug, publicKey: `${slug}-${tail}` };
    })
  );
  await prisma.execHuntPicture.createMany({ data: rows, skipDuplicates: true });
  seeded = true;
}

export async function getExecHuntConfig() {
  await ensureExecHuntSeeded();
  return (
    (await prisma.execHuntConfig.findUnique({ where: { id: "default" } })) ??
    (await prisma.execHuntConfig.create({ data: { id: "default" } }))
  );
}

type ConfigLike = { enabled: boolean; opensAt: Date | null; closesAt: Date | null };

const MT_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export function execHuntOpenState(config: ConfigLike, now = new Date()): { open: boolean; message: string } {
  if (!config.enabled) return { open: false, message: "The hunt isn't running right now. Check back at the party!" };
  if (config.opensAt && now < config.opensAt) {
    return { open: false, message: `The hunt opens ${MT_FORMAT.format(config.opensAt)}. Hang tight!` };
  }
  if (config.closesAt && now > config.closesAt) {
    return { open: false, message: "The hunt has closed. Thanks for playing — Merry Christmas!" };
  }
  return { open: true, message: config.closesAt ? `Open until ${MT_FORMAT.format(config.closesAt)}` : "The hunt is on!" };
}

export async function findPictureByKey(publicKey: string) {
  await ensureExecHuntSeeded();
  return prisma.execHuntPicture.findUnique({
    where: { publicKey },
    include: { executive: true }
  });
}

export async function findGuestByToken(token: string | null | undefined) {
  if (!isTokenShape(token)) return null;
  return prisma.execHuntGuest.findUnique({ where: { tokenHash: hashGuestToken(token) } });
}

export async function getGuestProgress(guestId: string): Promise<ExecHuntProgress> {
  const [executives, found] = await Promise.all([
    prisma.execHuntExecutive.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } }),
    prisma.execHuntDiscovery.findMany({
      where: { guestId },
      select: { picture: { select: { executiveId: true, number: true } } }
    })
  ]);
  return {
    found: found.length,
    total: EXEC_HUNT_TOTAL,
    executives: executives.map((exec) => ({
      slug: exec.slug,
      name: exec.name,
      found: found
        .filter((row) => row.picture.executiveId === exec.id)
        .map((row) => row.picture.number)
        .sort((a, b) => a - b)
    }))
  };
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/**
 * Claim one picture. The server decides everything: which picture (by its
 * public key), which guest (by token), whether it is new (by the unique index).
 */
export async function claimDiscovery(input: {
  publicKey: string;
  token: string | null;
  name: string | null;
}): Promise<ExecHuntClaimResult> {
  const picture = await findPictureByKey(input.publicKey);
  if (!picture) return { status: "not-found" };

  const config = await getExecHuntConfig();
  const state = execHuntOpenState(config);
  if (!state.open) return { status: "closed", message: state.message };

  let guest = await findGuestByToken(input.token);
  let issuedToken: string | undefined;

  if (!guest) {
    if (!input.name) return { status: "needs-name" };
    issuedToken = newGuestToken();
    guest = await prisma.execHuntGuest.create({ data: { tokenHash: hashGuestToken(issuedToken), name: input.name } });
  } else if (input.name && input.name !== guest.name) {
    guest = await prisma.execHuntGuest.update({ where: { id: guest.id }, data: { name: input.name } });
  }

  let status: "claimed" | "already" = "claimed";
  try {
    await prisma.execHuntDiscovery.create({ data: { guestId: guest.id, pictureId: picture.id } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    status = "already";
  }
  invalidateLiveCache();

  return {
    status,
    picture: {
      slug: picture.slug,
      label: `${picture.executive.name} ${picture.number}`,
      executiveName: picture.executive.name,
      number: picture.number
    },
    guest: { name: guest.name, ...(issuedToken ? { token: issuedToken } : {}) },
    progress: await getGuestProgress(guest.id)
  };
}

// ---------------------------------------------------------------------------
// Stats — every figure is computed from real discovery rows.
// ---------------------------------------------------------------------------

export type ExecHuntGuestRow = {
  id: string;
  shortId: string;
  name: string;
  found: number;
  lastAt: Date | null;
  firstAt: Date | null;
  pictureSlugs: string[];
};

export async function getExecHuntStats() {
  await ensureExecHuntSeeded();
  const [executives, pictures, guests, discoveries] = await Promise.all([
    prisma.execHuntExecutive.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.execHuntPicture.findMany({ orderBy: [{ executiveId: "asc" }, { number: "asc" }] }),
    prisma.execHuntGuest.findMany({ select: { id: true, name: true, createdAt: true } }),
    prisma.execHuntDiscovery.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, guestId: true, pictureId: true, createdAt: true }
    })
  ]);

  const pictureById = new Map(pictures.map((p) => [p.id, p]));
  const perPicture = new Map<string, number>();
  const perGuest = new Map<string, { found: number; lastAt: Date; firstAt: Date; slugs: string[] }>();
  for (const row of discoveries) {
    perPicture.set(row.pictureId, (perPicture.get(row.pictureId) ?? 0) + 1);
    const entry = perGuest.get(row.guestId);
    const slug = pictureById.get(row.pictureId)?.slug ?? "?";
    if (entry) {
      entry.found += 1;
      entry.slugs.push(slug);
      if (row.createdAt < entry.firstAt) entry.firstAt = row.createdAt;
    } else {
      // Rows arrive newest first, so the first one seen is the latest.
      perGuest.set(row.guestId, { found: 1, lastAt: row.createdAt, firstAt: row.createdAt, slugs: [slug] });
    }
  }

  const guestRows: ExecHuntGuestRow[] = guests
    .map((guest) => {
      const entry = perGuest.get(guest.id);
      return {
        id: guest.id,
        shortId: guest.id.slice(-5),
        name: guest.name,
        found: entry?.found ?? 0,
        lastAt: entry?.lastAt ?? null,
        firstAt: entry?.firstAt ?? null,
        pictureSlugs: entry?.slugs ?? []
      };
    })
    .filter((row) => row.found > 0)
    // Most found first; a tie goes to whoever got there first.
    .sort((a, b) => b.found - a.found || (a.lastAt?.getTime() ?? 0) - (b.lastAt?.getTime() ?? 0));

  const executiveStats = executives.map((exec) => ({
    id: exec.id,
    slug: exec.slug,
    name: exec.name,
    photoUrl: execHuntPhotoUrl(exec),
    pictures: pictures
      .filter((p) => p.executiveId === exec.id)
      .map((p) => ({ id: p.id, number: p.number, slug: p.slug, publicKey: p.publicKey, count: perPicture.get(p.id) ?? 0 }))
  }));

  const guestNameById = new Map(guests.map((g) => [g.id, g.name]));
  const execNameById = new Map(executives.map((e) => [e.id, e.name]));

  return {
    participants: guestRows.length,
    discoveries: discoveries.length,
    completed: guestRows.filter((row) => row.found >= EXEC_HUNT_TOTAL).length,
    locationsFound: pictures.filter((p) => (perPicture.get(p.id) ?? 0) > 0).length,
    total: EXEC_HUNT_TOTAL,
    executives: executiveStats,
    guests: guestRows,
    activity: discoveries.map((row) => {
      const picture = pictureById.get(row.pictureId);
      return {
        id: row.id,
        guestId: row.guestId,
        guestShortId: row.guestId.slice(-5),
        guestName: guestNameById.get(row.guestId) ?? "?",
        pictureLabel: picture ? `${execNameById.get(picture.executiveId) ?? "?"} ${picture.number}` : "?",
        pictureSlug: picture?.slug ?? "?",
        createdAt: row.createdAt
      };
    })
  };
}

export type ExecHuntStats = Awaited<ReturnType<typeof getExecHuntStats>>;

// The projector page polls every few seconds; a short cache keeps several
// screens (and a busy minute) from turning into a query per poll.
let liveCache: { at: number; data: ExecHuntLiveData } | null = null;
const LIVE_CACHE_MS = 3000;

export function invalidateLiveCache() {
  liveCache = null;
}

export async function getExecHuntLiveData(): Promise<ExecHuntLiveData> {
  if (liveCache && Date.now() - liveCache.at < LIVE_CACHE_MS) return liveCache.data;
  const [config, stats] = await Promise.all([getExecHuntConfig(), getExecHuntStats()]);
  const state = execHuntOpenState(config);
  const data: ExecHuntLiveData = {
    open: state.open,
    statusLine: state.message,
    participants: stats.participants,
    discoveries: stats.discoveries,
    completed: stats.completed,
    locationsFound: stats.locationsFound,
    total: stats.total,
    executives: stats.executives.map((exec) => ({
      slug: exec.slug,
      name: exec.name,
      photoUrl: exec.photoUrl,
      pictures: exec.pictures.map((p) => ({ number: p.number, count: p.count }))
    })),
    // Names and counts only — never an id, a token or a time.
    leaderboard: config.showLeaderboard
      ? stats.guests.slice(0, 10).map((row, index) => ({
          rank: index + 1,
          name: config.showNames ? row.name : null,
          found: row.found
        }))
      : null,
    updatedAt: new Date().toISOString()
  };
  liveCache = { at: Date.now(), data };
  return data;
}
