import { prisma } from "@/lib/prisma";
import { positionFor } from "@/lib/fleet/positions";

// ---------------------------------------------------------------------------
// Employee journey — the sequence of roles a person has held at SkyShare, plus
// pilot-upgrade analytics (SIC -> PIC). A role's endDate === null means it's
// their current role. An "upgrade" is a seat change from SIC (first officer) to
// PIC (captain), detected from the ordered seat sequence (and/or an explicit
// UPGRADE transitionType).
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

export type TransitionType = "HIRE" | "PROMOTION" | "UPGRADE" | "LATERAL" | "TRANSFER";

export type JourneyRole = {
  id: string;
  title: string;
  seat: string | null; // PIC | SIC | null (non-pilot)
  aircraft: string | null;
  department: string | null;
  startDate: string | null;
  endDate: string | null; // null = current
  transitionType: TransitionType;
  durationDays: number | null; // start -> endDate (or now if current)
  current: boolean;
  isUpgrade: boolean; // this role is an SIC -> PIC step up from the prior role
};

export type JourneyStint = { start: string | null; end: string | null; note: string | null };

export type EmployeeJourney = {
  roles: JourneyRole[];
  totalTenureDays: number | null;
  roleCount: number;
  upgradeCount: number; // SIC -> PIC steps in this person's history
  stints: JourneyStint[]; // employment periods; >1 = a rehire (left & came back)
};

type RawRole = {
  id: string;
  title: string;
  fleetPositionSlug: string | null;
  seat: string | null;
  aircraft: string | null;
  department: string | null;
  startDate: Date;
  endDate: Date | null;
  transitionType: string;
  createdAt: Date;
};

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

// Prefer the stored seat; fall back to resolving it from the title/slug so
// pre-fleet-registry titles still classify.
function seatOf(r: { seat: string | null; fleetPositionSlug: string | null; title: string }): "PIC" | "SIC" | null {
  const raw = (r.seat ?? "").toUpperCase();
  if (raw === "PIC" || raw === "SIC") return raw;
  const fp = positionFor(r.fleetPositionSlug, r.title)?.seat;
  if (fp) return fp;
  // Text fallback for messy imported titles (e.g. "Pilot XL SIC", "Pilot PC-12 PIC")
  // whose aircraft doesn't resolve to the registry but whose seat is stated.
  const t = r.title.toLowerCase();
  if (/\b(sic|first officer|f\/?o|second in command)\b/.test(t)) return "SIC";
  if (/\b(pic|captain|pilot in command)\b/.test(t)) return "PIC";
  return null;
}

function orderRoles(roles: RawRole[]): RawRole[] {
  return [...roles].sort((a, b) => {
    const t = a.startDate.getTime() - b.startDate.getTime();
    return t !== 0 ? t : a.createdAt.getTime() - b.createdAt.getTime();
  });
}

// Walk a person's ordered roles and mark each SIC -> PIC step as an upgrade.
// Tracks whether any prior seat was SIC so PIC roles only count once the person
// has actually stepped up (a first role of PIC is not an "upgrade").
function markUpgrades(ordered: RawRole[]): boolean[] {
  const flags: boolean[] = [];
  let lastSeat: "PIC" | "SIC" | null = null;
  for (const r of ordered) {
    const seat = seatOf(r);
    // An upgrade = stepping into a PIC seat when the previous pilot seat was SIC
    // (or an explicitly-tagged UPGRADE transition).
    const isUpgrade = (seat === "PIC" && lastSeat === "SIC") || r.transitionType === "UPGRADE";
    flags.push(isUpgrade);
    if (seat) lastSeat = seat;
  }
  return flags;
}

export async function getEmployeeJourney(hireId: string): Promise<EmployeeJourney> {
  const now = Date.now();
  const [roles, stintRows] = (await Promise.all([
    prisma.roleAssignment.findMany({
      where: { newHireId: hireId },
      select: {
        id: true,
        title: true,
        fleetPositionSlug: true,
        seat: true,
        aircraft: true,
        department: true,
        startDate: true,
        endDate: true,
        transitionType: true,
        createdAt: true
      }
    }),
    prisma.employmentStint.findMany({ where: { newHireId: hireId }, orderBy: { startDate: "asc" }, select: { startDate: true, endDate: true, note: true } })
  ])) as [RawRole[], { startDate: Date; endDate: Date | null; note: string | null }[]];

  const stints: JourneyStint[] = stintRows.map((s) => ({ start: iso(s.startDate), end: iso(s.endDate), note: s.note }));

  const ordered = orderRoles(roles);
  const upgradeFlags = markUpgrades(ordered);

  const journeyRoles: JourneyRole[] = ordered.map((r, i) => {
    const start = r.startDate.getTime();
    const end = r.endDate ? r.endDate.getTime() : now;
    return {
      id: r.id,
      title: r.title,
      seat: seatOf(r),
      aircraft: r.aircraft,
      department: r.department,
      startDate: iso(r.startDate),
      endDate: iso(r.endDate),
      transitionType: (r.transitionType as TransitionType) ?? "HIRE",
      durationDays: Math.max(0, Math.round((end - start) / DAY)),
      current: r.endDate === null,
      isUpgrade: upgradeFlags[i]
    };
  });

  const first = ordered[0];
  const lastEnd = ordered.length ? ordered[ordered.length - 1].endDate : null;
  const tenureEnd = lastEnd ? lastEnd.getTime() : now;
  const rolesSpan = first ? Math.max(0, Math.round((tenureEnd - first.startDate.getTime()) / DAY)) : null;
  // Prefer summed stint time (so a rehire's gap isn't counted as tenure).
  const stintTenure = stintRows.length
    ? stintRows.reduce((acc, s) => acc + Math.max(0, Math.round(((s.endDate ? s.endDate.getTime() : now) - s.startDate.getTime()) / DAY)), 0)
    : null;

  return {
    roles: journeyRoles,
    totalTenureDays: stintTenure ?? rolesSpan,
    roleCount: journeyRoles.length,
    upgradeCount: upgradeFlags.filter(Boolean).length,
    stints
  };
}

// ---------------------------------------------------------------------------
// Fleet-wide pilot upgrade analytics for Reports.
// ---------------------------------------------------------------------------

export type UpgradeAnalytics = {
  pilotsTracked: number; // employees with a pilot role history (a seat somewhere)
  upgraded: number; // pilots with >=1 progression (role/airframe/seat move)
  captainUpgrades: number; // subset: pilots who made an SIC->PIC (First Officer -> Captain) step
  avgDaysToUpgrade: number | null; // to first progression
  medianDaysToUpgrade: number | null;
  pctWithin1yr: number; // of pilotsTracked, first progression within 365 days
  pctWithin2yr: number;
  upgradedOnce: number; // exactly 1 progression
  upgradedTwicePlus: number;
  upgradedThricePlus: number;
  hasData: boolean;
};

export async function getUpgradeAnalytics(): Promise<UpgradeAnalytics> {
  const rows = (await prisma.roleAssignment.findMany({
    select: {
      id: true,
      newHireId: true,
      title: true,
      fleetPositionSlug: true,
      seat: true,
      aircraft: true,
      department: true,
      startDate: true,
      endDate: true,
      transitionType: true,
      createdAt: true
    }
  })) as (RawRole & { newHireId: string })[];

  const byHire = new Map<string, RawRole[]>();
  for (const r of rows) {
    const list = byHire.get(r.newHireId) ?? [];
    list.push(r);
    byHire.set(r.newHireId, list);
  }

  let pilotsTracked = 0;
  let upgraded = 0;
  let captainUpgrades = 0;
  let within1yr = 0;
  let within2yr = 0;
  let upgradedOnce = 0;
  let upgradedTwicePlus = 0;
  let upgradedThricePlus = 0;
  const daysToUpgrade: number[] = [];

  for (const roles of byHire.values()) {
    const ordered = orderRoles(roles);
    if (!ordered.some((r) => seatOf(r) !== null)) continue; // not a pilot
    pilotsTracked++;

    // A "progression" = any move to a new role/airframe/seat (every role after the first).
    const progressions = ordered.length - 1;
    if (markUpgrades(ordered).some(Boolean)) captainUpgrades++; // SIC -> PIC subset
    if (progressions < 1) continue;

    upgraded++;
    if (progressions === 1) upgradedOnce++;
    if (progressions >= 2) upgradedTwicePlus++;
    if (progressions >= 3) upgradedThricePlus++;

    const days = Math.max(0, Math.round((ordered[1].startDate.getTime() - ordered[0].startDate.getTime()) / DAY));
    daysToUpgrade.push(days);
    if (days <= 365) within1yr++;
    if (days <= 730) within2yr++;
  }

  const avg = daysToUpgrade.length ? Math.round(daysToUpgrade.reduce((a, b) => a + b, 0) / daysToUpgrade.length) : null;
  const median = (() => {
    if (!daysToUpgrade.length) return null;
    const s = [...daysToUpgrade].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  })();
  const pct = (n: number) => (pilotsTracked ? Math.round((n / pilotsTracked) * 100) : 0);

  return {
    pilotsTracked,
    upgraded,
    captainUpgrades,
    avgDaysToUpgrade: avg,
    medianDaysToUpgrade: median,
    pctWithin1yr: pct(within1yr),
    pctWithin2yr: pct(within2yr),
    upgradedOnce,
    upgradedTwicePlus,
    upgradedThricePlus,
    hasData: upgraded > 0
  };
}
