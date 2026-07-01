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

export type EmployeeJourney = {
  roles: JourneyRole[];
  totalTenureDays: number | null;
  roleCount: number;
  upgradeCount: number; // SIC -> PIC steps in this person's history
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
  const roles = (await prisma.roleAssignment.findMany({
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
  })) as RawRole[];

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
  const totalTenureDays = first ? Math.max(0, Math.round((tenureEnd - first.startDate.getTime()) / DAY)) : null;

  return {
    roles: journeyRoles,
    totalTenureDays,
    roleCount: journeyRoles.length,
    upgradeCount: upgradeFlags.filter(Boolean).length
  };
}

// ---------------------------------------------------------------------------
// Fleet-wide pilot upgrade analytics for Reports.
// ---------------------------------------------------------------------------

export type UpgradeAnalytics = {
  pilotsTracked: number; // employees with at least one pilot-seat role
  startedAsSIC: number; // first pilot seat was SIC (eligible to upgrade)
  upgraded: number; // of startedAsSIC, how many reached PIC
  avgDaysToUpgrade: number | null;
  medianDaysToUpgrade: number | null;
  pctWithin1yr: number; // of startedAsSIC, upgraded within 365 days of hire
  pctWithin2yr: number;
  upgradedOnce: number; // exactly 1 SIC->PIC step
  upgradedTwicePlus: number;
  upgradedThricePlus: number;
  hasData: boolean; // any recorded upgrades yet
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
  let startedAsSIC = 0;
  let upgraded = 0;
  let within1yr = 0;
  let within2yr = 0;
  let upgradedOnce = 0;
  let upgradedTwicePlus = 0;
  let upgradedThricePlus = 0;
  const daysToUpgrade: number[] = [];

  for (const roles of byHire.values()) {
    const ordered = orderRoles(roles);
    const seats = ordered.map((r) => seatOf(r));
    if (!seats.some((s) => s === "PIC" || s === "SIC")) continue; // not a pilot
    pilotsTracked++;

    const firstPilotSeat = seats.find((s) => s === "PIC" || s === "SIC");
    if (firstPilotSeat !== "SIC") continue; // hired straight into PIC — not an upgrade candidate
    startedAsSIC++;

    const flags = markUpgrades(ordered);
    const upgradeCount = flags.filter(Boolean).length;
    if (upgradeCount === 0) continue;

    upgraded++;
    if (upgradeCount === 1) upgradedOnce++;
    if (upgradeCount >= 2) upgradedTwicePlus++;
    if (upgradeCount >= 3) upgradedThricePlus++;

    const hireStart = ordered[0].startDate.getTime();
    const firstUpgradeIdx = flags.findIndex(Boolean);
    const firstUpgradeStart = ordered[firstUpgradeIdx].startDate.getTime();
    const days = Math.max(0, Math.round((firstUpgradeStart - hireStart) / DAY));
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
  const pct = (n: number) => (startedAsSIC ? Math.round((n / startedAsSIC) * 100) : 0);

  return {
    pilotsTracked,
    startedAsSIC,
    upgraded,
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
