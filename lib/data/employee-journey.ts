import { prisma } from "@/lib/prisma";
import { positionFor } from "@/lib/fleet/positions";
import { computeTenure } from "@/lib/data/tenure";
import { ensureInitialRole } from "@/lib/data/ensure-initial-role";
import { isUpgradeStep } from "@/lib/fleet/pilot-ladder";

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

// Rehire-aware tenure summary for the profile (see lib/data/tenure). Dates are ISO.
export type JourneyTenure = {
  originalStart: string | null; // true first day
  serviceStart: string | null; // effective start after the 3-month rehire rule
  rehireStart: string | null; // most recent return (when rehired)
  termDate: string | null; // last departure (when not currently employed)
  tenureDays: number | null;
  stintCount: number;
  rehired: boolean;
  reset: boolean; // tenure was reset by a > 3-month gap
  lastRehireBridged: boolean | null; // most recent return: continued (true) vs reset (false)
  lastGapDays: number | null;
};

export type EmployeeJourney = {
  roles: JourneyRole[];
  totalTenureDays: number | null;
  roleCount: number;
  upgradeCount: number; // SIC -> PIC steps in this person's history
  stints: JourneyStint[]; // employment periods; >1 = a rehire (left & came back)
  tenure: JourneyTenure; // rehire-aware start/rehire/term + tenure flag
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
  // Ground/support roles never hold a pilot seat — guard against bad imports that
  // tagged a maintenance/support role with an aircraft or a "*-captain" fleet slug
  // (e.g. "G450 Maintenance Technician (HND)" carrying slug g450-captain).
  if (/\b(maintenance|mechanic|technician|amt|avionics|detailer|detailing|line service|inspector|parts|dispatch|coordinator)\b/i.test(r.title)) return null;
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
  // Backfill: an existing hire with a position + start date but no recorded role
  // gets their initial "HIRE" entry the first time their journey is viewed.
  await ensureInitialRole(hireId);
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

  // Rehire-aware tenure: bridge short gaps (<= 3 months), reset for longer.
  // Fall back to an implicit stint from the first role when none are recorded.
  const tenureStints = stintRows.length ? stintRows : first ? [{ startDate: first.startDate, endDate: lastEnd }] : [];
  const t = computeTenure(tenureStints, now);

  return {
    roles: journeyRoles,
    totalTenureDays: t.tenureDays ?? rolesSpan,
    roleCount: journeyRoles.length,
    upgradeCount: upgradeFlags.filter(Boolean).length,
    stints,
    tenure: {
      originalStart: iso(t.originalStart),
      serviceStart: iso(t.serviceStart),
      rehireStart: iso(t.rehireStart),
      termDate: iso(t.termDate),
      tenureDays: t.tenureDays,
      stintCount: t.stintCount,
      rehired: t.rehired,
      reset: t.reset,
      lastRehireBridged: t.lastRehireBridged,
      lastGapDays: t.lastGapDays
    }
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
  /**
   * The SEAT advanced SIC -> PIC on this step, whatever the aircraft did.
   *
   * Separate from `kind` on purpose, and this is the fix for a real
   * miscount found 2026-09-08. kind is one value and "transition" wins it, so
   * the commonest upgrade at a fractional operator - a CJ2 First Officer moving
   * to the 560XL AS A CAPTAIN - was recorded as a transition and never counted
   * as an upgrade. That pilot is a captain and the report said they were not.
   *
   * Reordering classifyStep to test the seat first was the obvious fix and it is
   * the wrong one: the step would stop being a transition, and the aircraft move
   * would vanish from the transition totals and the top-paths chart. A single
   * step is genuinely both things, so it now carries both facts.
   *
   * Counting rule that follows: `moves` still comes from kind, so one step is
   * still one move and nothing double-counts. Only the "reached Captain" question
   * reads this flag.
   */
  seatUp: boolean;
  /**
   * This step is an UPGRADE under the house rules — a seat advance OR a move to a
   * larger aircraft with the seat not lowered. See isUpgradeStep.
   *
   * SEPARATE FROM seatUp, and the separation is the point. Once "a larger aircraft
   * is an upgrade" was added, 24 of the 38 upgrades on file became same-seat moves
   * up the ladder by pilots who were ALREADY captains — so a single flag made the
   * "Made Captain" tile read 33 when only 12 pilots have ever moved from the right
   * seat to the left. One flag cannot mean both "advanced" and "became a captain".
   */
  upgrade: boolean;
};

export type UpgradePilot = {
  hireId: string;
  name: string;
  active: boolean; // currently employed (not terminated)
  managed: boolean; // dedicated managed-aircraft pilot (not the SkyShare/fractional pool)
  tenureDays: number; // hire -> now (active) or -> last role end (former)
  employedYears: number[]; // calendar years the pilot was on staff (for per-year headcount)
  upgrades: number; // FO -> Captain, same aircraft
  transitions: number; // moved to a different aircraft
  moves: number; // upgrades + transitions
  laterals: number; // same-aircraft non-upgrade moves (rare)
  /** Steps where the seat advanced to PIC, INCLUDING those that also changed
   *  aircraft. Always >= `upgrades`. See UpgradePilotStep.seatUp. */
  seatUpgrades: number;
  /** Reached Captain from the right seat at any point. Now driven by seatUpgrades
   *  rather than by same-aircraft upgrades only, so a pilot who upgraded onto a
   *  new type counts. */
  madeCaptain: boolean;
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
    // CHALLENGER 350 AND PRAETOR 600 WERE MISSING, found 2026-09-08 by a chief-pilot
    // review of this report. Both went into the fleet registry on Aug 28 and neither
    // was ever added here, so airframeOf returned null for their crews - which does
    // not merely mislabel them, it makes their moves invisible: classifyStep needs
    // BOTH sides non-null to call a transition, so a move onto or off these types
    // fell through to "lateral", and a lateral is not counted as a move anywhere.
    // Those pilots sat in "Stayed put" no matter how far they had actually moved.
    // The Challenger 350's type rating is CL-30 (confirmed by him Aug 28), so the
    // pattern accepts either spelling.
    // THE MODEL NUMBER IS REQUIRED, and a bare "Challenger" deliberately does NOT
    // match. It briefly did, on the reasoning that the only Challenger rows on file
    // read "Challenger Pilot" with no model — but he confirmed 2026-09-08 that the
    // Challenger 350 and Praetor 600 are NEW aircraft, which makes those two rows a
    // DIFFERENT and much older Challenger. Matching them would have put pilots on a
    // type that did not exist when they flew. Both of those records are terminated
    // and he has said to disregard them.
    //
    // So this pattern is here for the crews yet to be assigned to the new tails,
    // and it wants the model: 350, or the CL-30 type rating (his confirmation,
    // Aug 28).
    [/\bchallenger ?350\b|\bcl-?30\b/i, "Challenger 350"],
    [/\bpraetor ?600\b/i, "Praetor 600"],
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

// The ladder and the upgrade rules live in lib/fleet/pilot-ladder.ts — a module
// with NO imports, because the reports page is a client component and needs the
// same rules. Keeping them here dragged Prisma into the client bundle and 500ed
// the page. Re-exported so existing importers of this module still resolve.
export { SKYSHARE_LADDER, ladderRank } from "@/lib/fleet/pilot-ladder";

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
    prisma.newHire.findMany({ select: { id: true, name: true, employmentStatus: true, managedPilot: true } }),
    prisma.employmentStint.findMany({ select: { newHireId: true, startDate: true, endDate: true } })
  ])) as [
    (RawRole & { newHireId: string })[],
    { id: string; name: string; employmentStatus: string; managedPilot: boolean }[],
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
    // seatUp rides alongside kind rather than inside it — see
    // UpgradePilotStep.seatUp for why a step has to be able to be both an
    // aircraft transition AND a seat advance.
    const seatUps: boolean[] = [];
    const upgradeFlags: boolean[] = [];
    ordered.forEach((r, i) => {
      kinds.push(i === 0 ? "hire" : classifyStep(prevSeat, prevAf, seats[i], frames[i]));
      // seatUps is the SEAT fact only (SIC -> PIC) and drives "Made Captain".
      // upgradeFlags is the full rule set and drives the upgrade counts.
      seatUps.push(i !== 0 && prevSeat === "SIC" && seats[i] === "PIC");
      upgradeFlags.push(i !== 0 && isUpgradeStep(prevSeat, prevAf, seats[i], frames[i]));
      if (frames[i] !== null) prevAf = frames[i];
      if (seats[i] !== null) prevSeat = seats[i];
    });

    const hireTime = ordered[0].startDate.getTime();
    const daysFrom = (i: number) => Math.max(0, Math.round((ordered[i].startDate.getTime() - hireTime) / DAY));
    const firstIdx = (pred: (k: StepKind) => boolean) => {
      const i = kinds.findIndex((k, idx) => idx > 0 && pred(k));
      return i === -1 ? null : daysFrom(i);
    };
    // Same rule as the count above: the first time the SEAT advanced, whatever the
    // aircraft did. Kept separate from firstIdx because that one tests step kind.
    const firstSeatUpIdx = (() => {
      const i = upgradeFlags.findIndex((v, idx) => idx > 0 && v);
      return i === -1 ? null : daysFrom(i);
    })();

    // ANY FIRST OFFICER TO CAPTAIN CHANGE IS AN UPGRADE — his rule, stated
    // 2026-09-08: "there are multiple ways a pilot can go. but any fo to capt
    // change should be an upgrade." So the count reads the SEAT, not the step kind.
    // Previously it read kind === "upgrade", which classifyStep only assigns when
    // the aircraft is unchanged, so the commonest upgrade here - a CJ2 First
    // Officer moving to the 560XL as a Captain - was counted as a transition and
    // as no upgrade at all.
    const upgrades = upgradeFlags.filter(Boolean).length;
    const transitions = kinds.filter((k) => k === "transition").length;
    const laterals = kinds.filter((k) => k === "lateral").length;
    // ONE STEP IS ONE MOVE. A step can now be an upgrade AND a transition at once,
    // so upgrades + transitions would count that step twice and inflate a pilot's
    // move count past the number of things that actually happened to them.
    const moves = kinds.filter((k, i) => i > 0 && (k === "transition" || upgradeFlags[i])).length;
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
      managed: info?.managedPilot ?? false,
      tenureDays,
      employedYears,
      upgrades,
      transitions,
      moves,
      laterals,
      seatUpgrades: seatUps.filter(Boolean).length,
      // MADE CAPTAIN MEANS MADE CAPTAIN — the seat fact, not the full upgrade rule.
      // Driving it off upgrades made it count pilots who moved up the ladder while
      // already in the left seat.
      // Driven by the SEAT rather than by same-aircraft upgrades, so a First
      // Officer who upgraded onto a different type is counted. That was the whole
      // miscount: the commonest real upgrade here changes aircraft at the same
      // time, and it used to be filed as a transition and nothing else.
      madeCaptain: seatUps.some(Boolean),
      daysToFirstMove: firstIdx((k) => k === "upgrade" || k === "transition"),
      daysToFirstUpgrade: firstSeatUpIdx,
      daysToFirstTransition: firstIdx((k) => k === "transition"),
      startDate: iso(ordered[0].startDate),
      latestDate: iso(ordered[ordered.length - 1].startDate),
      steps: ordered.map((r, i) => ({
        title: reportTitle(r.title),
        seat: seats[i],
        aircraft: frames[i],
        date: iso(r.startDate),
        kind: kinds[i],
        seatUp: seatUps[i],
        upgrade: upgradeFlags[i]
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
