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

// A move between two roles is one of:
//   upgrade    — First Officer -> Captain on the SAME aircraft
//   transition — a move to a DIFFERENT aircraft (any seat)
//   lateral    — same aircraft, not an FO->Captain step (e.g. Captain -> Lead Captain)
export type StepKind = "hire" | "upgrade" | "transition" | "lateral";

export type UpgradePilotStep = {
  title: string; // reporting label (CE-525 shown as its airframe, CJ2)
  seat: string | null; // PIC | SIC | null
  aircraft: string | null; // canonical airframe code (for same-aircraft comparison)
  date: string | null;
  kind: StepKind;
};

export type UpgradePilot = {
  hireId: string;
  name: string;
  active: boolean; // currently employed (not terminated)
  tenureDays: number; // hire -> now (active) or -> last role end (former)
  employedYears: number[]; // calendar years the pilot was on staff (for per-year headcount)
  upgrades: number; // FO -> Captain, same aircraft
  transitions: number; // moved to a different aircraft
  moves: number; // upgrades + transitions
  laterals: number; // same-aircraft non-upgrade moves (rare)
  madeCaptain: boolean; // >= 1 upgrade (reached Captain via FO -> Captain)
  daysToFirstMove: number | null;
  daysToFirstUpgrade: number | null;
  daysToFirstTransition: number | null;
  startDate: string | null;
  latestDate: string | null;
  steps: UpgradePilotStep[]; // full role journey, oldest first
};

// The whole tracked-pilot set (advanced or not); the Reports UI filters
// (all/active) and aggregates client-side.
export type UpgradeAnalytics = {
  pilots: UpgradePilot[];
  hasData: boolean;
};

// Report the CE-525 type rating as its airframe, CJ2.
function reportTitle(title: string): string {
  return title.replace(/\bCE-?525\b/gi, "CJ2");
}

// Canonical airframe code from a title (+ aircraft field) so "same aircraft" can
// be compared. CE-525 collapses to CJ2; XL shorthand to 560XL.
function airframeOf(title: string, aircraft: string | null): string | null {
  const t = `${title} ${aircraft ?? ""}`;
  const AF: [RegExp, string][] = [
    [/\bg450\b/i, "G450"],
    [/\bg200\b/i, "G200"],
    [/\bgv\b/i, "GV"],
    [/\blegacy ?650\b/i, "Legacy 650"],
    [/\blegacy ?600\b/i, "Legacy 600"],
    [/\bpc-?12\b/i, "PC-12"],
    [/\bphenom ?300\b/i, "Phenom 300"],
    [/\bphenom ?100\b/i, "Phenom 100"],
    [/\b560 ?xls\+?\b|\bxls\+?\b/i, "560XLS+"],
    [/\b560 ?xl\b|\bxl\b/i, "560XL"],
    [/\bcj ?2\b|\bce-?525\b/i, "CJ2"],
    [/\bm2\b/i, "M2"]
  ];
  for (const [re, code] of AF) if (re.test(t)) return code;
  return null;
}

function classifyStep(prevSeat: string | null, prevAf: string | null, seat: string | null, af: string | null): StepKind {
  if (prevAf && af && prevAf !== af) return "transition";
  if (seat === "PIC" && prevSeat === "SIC") return "upgrade";
  return "lateral";
}

export async function getUpgradeAnalytics(): Promise<UpgradeAnalytics> {
  const [rows, names, stintRows] = (await Promise.all([
    prisma.roleAssignment.findMany({
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
    }),
    prisma.newHire.findMany({ select: { id: true, name: true, employmentStatus: true } }),
    prisma.employmentStint.findMany({ select: { newHireId: true, startDate: true, endDate: true } })
  ])) as [
    (RawRole & { newHireId: string })[],
    { id: string; name: string; employmentStatus: string }[],
    { newHireId: string; startDate: Date; endDate: Date | null }[]
  ];

  const infoOf = new Map(names.map((n) => [n.id, n]));
  const stintsByHire = new Map<string, { startDate: Date; endDate: Date | null }[]>();
  for (const st of stintRows) {
    const l = stintsByHire.get(st.newHireId) ?? [];
    l.push(st);
    stintsByHire.set(st.newHireId, l);
  }

  const byHire = new Map<string, RawRole[]>();
  for (const r of rows) {
    const list = byHire.get(r.newHireId) ?? [];
    list.push(r);
    byHire.set(r.newHireId, list);
  }

  const pilots: UpgradePilot[] = [];

  for (const [hireId, roles] of byHire) {
    const rawOrdered = orderRoles(roles);
    if (!rawOrdered.some((r) => seatOf(r) !== null)) continue; // not a pilot

    // Collapse consecutive roles that are the same airframe + seat once CE-525 is
    // relabeled as CJ2 (e.g. a "CE-525 Captain" step followed by "CJ2 Captain" is
    // one role, not two — keep the earlier).
    const ordered: RawRole[] = [];
    for (const r of rawOrdered) {
      const prev = ordered[ordered.length - 1];
      const pf = prev ? airframeOf(prev.title, prev.aircraft) : null;
      const cf = airframeOf(r.title, r.aircraft);
      if (prev && pf !== null && pf === cf && seatOf(prev) === seatOf(r)) continue;
      ordered.push(r);
    }

    const seats = ordered.map((r) => seatOf(r));
    const frames = ordered.map((r) => airframeOf(r.title, r.aircraft));
    // Classify each step against the previous *flying* airframe/seat, carrying them
    // forward across non-flying management roles (null airframe/seat, e.g. Assistant
    // Chief Pilot). Without this, a management title between two flying roles would
    // hide the real transition/upgrade that follows it.
    const kinds: StepKind[] = [];
    let prevAf: string | null = null;
    let prevSeat: string | null = null;
    ordered.forEach((r, i) => {
      kinds.push(i === 0 ? "hire" : classifyStep(prevSeat, prevAf, seats[i], frames[i]));
      if (frames[i] !== null) prevAf = frames[i];
      if (seats[i] !== null) prevSeat = seats[i];
    });

    const hireTime = ordered[0].startDate.getTime();
    const daysFrom = (i: number) => Math.max(0, Math.round((ordered[i].startDate.getTime() - hireTime) / DAY));
    const firstIdx = (pred: (k: StepKind) => boolean) => {
      const i = kinds.findIndex((k, idx) => idx > 0 && pred(k));
      return i === -1 ? null : daysFrom(i);
    };

    const upgrades = kinds.filter((k) => k === "upgrade").length;
    const transitions = kinds.filter((k) => k === "transition").length;
    const laterals = kinds.filter((k) => k === "lateral").length;
    const info = infoOf.get(hireId);
    // Only ACTIVE counts as an active pilot — CONTRACT/TERMINATED are treated as past.
    const active = info?.employmentStatus === "ACTIVE";
    const last = ordered[ordered.length - 1];
    const endTime = active ? Date.now() : (last.endDate ?? last.startDate).getTime();
    const tenureDays = Math.max(0, Math.round((endTime - hireTime) / DAY));

    // Calendar years on staff — from employment stints (so rehire gaps are
    // excluded), else the single role span.
    const stints = stintsByHire.get(hireId) ?? [];
    const intervals: [number, number][] = stints.length
      ? stints.map((st) => [st.startDate.getTime(), (st.endDate ?? new Date(endTime)).getTime()] as [number, number])
      : [[hireTime, endTime]];
    const yset = new Set<number>();
    for (const [a, b] of intervals) {
      for (let y = new Date(a).getUTCFullYear(); y <= new Date(b).getUTCFullYear(); y++) yset.add(y);
    }
    const employedYears = [...yset].sort((x, y) => x - y);

    pilots.push({
      hireId,
      name: info?.name ?? "Unknown",
      active,
      tenureDays,
      employedYears,
      upgrades,
      transitions,
      moves: upgrades + transitions,
      laterals,
      madeCaptain: upgrades > 0,
      daysToFirstMove: firstIdx((k) => k === "upgrade" || k === "transition"),
      daysToFirstUpgrade: firstIdx((k) => k === "upgrade"),
      daysToFirstTransition: firstIdx((k) => k === "transition"),
      startDate: iso(ordered[0].startDate),
      latestDate: iso(ordered[ordered.length - 1].startDate),
      steps: ordered.map((r, i) => ({
        title: reportTitle(r.title),
        seat: seats[i],
        aircraft: frames[i],
        date: iso(r.startDate),
        kind: kinds[i]
      }))
    });
  }

  // Richest journeys first: most moves, Captains ahead of non-Captains, then name.
  pilots.sort(
    (a, b) =>
      b.moves - a.moves ||
      Number(b.madeCaptain) - Number(a.madeCaptain) ||
      a.name.localeCompare(b.name)
  );

  return { pilots, hasData: pilots.some((p) => p.moves > 0) };
}
