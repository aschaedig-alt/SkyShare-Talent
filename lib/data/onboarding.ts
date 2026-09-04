import { prisma } from "@/lib/prisma";
import {
  ONBOARDING_TASKS,
  MAINTENANCE_TASKS,
  MAINTENANCE_GROUP,
  CUSTOM_GROUP,
  type OnboardingTaskDef
} from "@/lib/onboarding/tasks";
import { getMilestoneCatalog } from "@/lib/data/onboarding-milestones";
import { getDashboardHiddenIds } from "@/lib/data/dashboard-hidden";
import { getGridHiddenKeys } from "@/lib/data/onboarding-grid-config";
import { computeTenure } from "@/lib/data/tenure";
import { isOfferStepKey, offerStepCompletedAt, parseOfferSteps, type OfferSteps, type OfferApplicationView } from "@/lib/offers/steps";
import { findOfferApplicationId } from "@/lib/offers/onboarding-sync";

const DAY = 86_400_000;

export type HireStage = "ACTIVE" | "POST_ONBOARD" | "ARCHIVED";
export type HireStatus = "Ready" | "In progress" | "Due soon" | "Overdue" | "Onboarded" | "Archived" | "Canceled";
// "ready" is the one POSITIVE level: nothing is wrong, someone is just waiting on
// us to act. Every other level marks a problem.
/** Days a cleared-but-unhired candidate may sit before the alert turns red. */
const READY_TO_HIRE_ESCALATE_DAYS = 3;

export type AlertLevel = "blocked" | "urgent" | "missing" | "ready";

export type TaskView = {
  id: string;
  key: string;
  label: string;
  group: string;
  order: number;
  status: "TODO" | "DONE" | "NA";
};

export type NewHireRow = {
  id: string;
  name: string;
  legalName: string | null;
  position: string | null;
  department: string | null;
  location: string | null;
  managedAircraft: string | null;
  managedPilot: boolean;
  tags: string[];
  phone: string | null;
  ssEmail: string | null;
  personalEmail: string | null;
  supervisorName: string | null;
  supervisorEmail: string | null;
  supervisorHireId: string | null;
  supervisorHire: { name: string; ssEmail: string | null; personalEmail: string | null } | null;
  supervisor2Name: string | null;
  supervisor2Email: string | null;
  supervisor2HireId: string | null;
  supervisor2Hire: { name: string; ssEmail: string | null; personalEmail: string | null } | null;
  offerSentDate: string | null;
  offerSignedDate: string | null;
  startDate: string | null;
  orientationDate: string | null;
  aircraftServiceDate: string | null;
  seniorityDate: string | null;
  seniorityNumber: number | null;
  orientationNotNeeded: boolean;
  birthday: string | null;
  /** Indoc OVERRIDE. Empty means the page shows the travel booking instead. */
  indocStartDate: string | null;
  indocEndDate: string | null;
  trainingDate: string | null;
  trainingLocation: string | null;
  birthCountry: string | null;
  citizenshipCountry: string | null;
  terminationDate: string | null;
  stage: HireStage;
  canceled: boolean;
  employmentStatus: EmploymentStatus;
  travelStatus: string | null;
  businessCardStatus: string;
  businessCardTitle: string | null;
  notes: string | null;
  pdpGraduate: boolean;
  tenureYears: number; // completed whole years with the company (anniversary-based)
  doneCount: number;
  applicableCount: number;
  status: HireStatus;
  nextAction: string | null;
};

export type Alert = {
  id: string;
  name: string;
  level: AlertLevel;
  text: string;
  /**
   * Where the row links. Defaults to the new-hire page, which is right for every
   * onboarding alert — but a travel reimbursement is just as often owed to a
   * CANDIDATE on a recruiting visit, and sending those to /people/<candidateId>
   * lands on a page that does not exist.
   */
  href?: string;
};
export type UpcomingStart = { id: string; name: string; position: string | null; startDate: string };

export type ChartDatum = { label: string; count: number };

export type DrillPerson = {
  id: string;
  name: string;
  position: string | null;
  startDate: string | null;
  status: HireStatus;
  doneCount: number;
  applicableCount: number;
};

// A row on the dashboard "In onboarding" worklist: active hires plus anyone
// onboarded recently, so the whole recent picture is scannable. onboardedAt is
// set for the finished ones.
export type WorklistPerson = DrillPerson & { onboardedAt: string | null };

export type OnboardingDashboard = {
  startingSoon: number;
  missingItems: number;
  urgent: number;
  inProcess: number;
  avgCompletion: number;
  alerts: Alert[];
  upcomingStarts: UpcomingStart[];
  byStatus: ChartDatum[];
  byDepartment: ChartDatum[];
  startsByWeek: ChartDatum[];
  funnel: ChartDatum[];
  // People behind the headline metrics, for click-to-drill on the cards.
  startingSoonList: DrillPerson[];
  needsAttentionList: DrillPerson[];
  missingItemsList: DrillPerson[];
  // Active hires with no start date. They're filtered out of every date-based
  // panel above (starting soon, upcoming, by week), so without this bucket they
  // silently vanish from the dashboard until someone sets a date.
  noStartDateList: DrillPerson[];
  // Everyone currently in onboarding + anyone onboarded in the last few weeks,
  // minus the ones checked off. worklistHidden holds the checked-off ones.
  worklist: WorklistPerson[];
  worklistHidden: WorklistPerson[];
  // Top onboarding tasks still incomplete across active hires (where it's jamming).
  bottlenecks: ChartDatum[];
  // Hires starting in the next ~3 weeks, with progress + status, for the quick scan.
  readyForStart: DrillPerson[];
  // Of active hires with a start date: orientation scheduled within a month of it.
  orientationTimeliness: { onTime: number; outsideMonth: number; unscheduled: number; total: number; pct: number };
  // Travel booked vs needed among upcoming starters (ties in the Travel module).
  travelReadiness: { booked: number; needed: number; none: number; total: number };
};

export type OnboardingWorkspaceData = {
  counts: { active: number; postOnboard: number; archived: number };
  rows: NewHireRow[];
  dashboard: OnboardingDashboard | null;
};

type HireWithTasks = {
  id: string;
  pdpGraduate: boolean;
  employmentStints: { startDate: Date | null; endDate: Date | null }[];
  name: string;
  legalName: string | null;
  position: string | null;
  department: string | null;
  location: string | null;
  managedAircraft: string | null;
  managedPilot: boolean;
  tags: string[];
  phone: string | null;
  ssEmail: string | null;
  personalEmail: string | null;
  supervisorHireId: string | null;
  supervisorHire: { name: string; ssEmail: string | null; personalEmail: string | null } | null;
  supervisor2Name: string | null;
  supervisor2Email: string | null;
  supervisor2HireId: string | null;
  supervisor2Hire: { name: string; ssEmail: string | null; personalEmail: string | null } | null;
  supervisorName: string | null;
  supervisorEmail: string | null;
  offerSentDate: Date | null;
  offerSignedDate: Date | null;
  startDate: Date | null;
  orientationDate: Date | null;
  aircraftServiceDate: Date | null;
  seniorityDate: Date | null;
  seniorityNumber: number | null;
  orientationNotNeeded: boolean;
  birthday: Date | null;
  indocStartDate: Date | null;
  indocEndDate: Date | null;
  trainingDate: Date | null;
  trainingLocation: string | null;
  birthCountry: string | null;
  citizenshipCountry: string | null;
  terminationDate: Date | null;
  onboardedAt: Date | null;
  stage: string;
  canceled: boolean;
  employmentStatus: string;
  businessCardStatus: string;
  businessCardTitle: string | null;
  travelStatus: string | null;
  notes: string | null;
  // completedAt drives "how long has this been sitting" — see the ready-to-hire alert.
  tasks: { id: string; key: string; label: string; group: string; order: number; status: string; completedAt: Date | null }[];
};

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function deriveStatus(hire: HireWithTasks, doneCount: number, applicableCount: number, now: number): HireStatus {
  if (hire.canceled) return "Canceled";
  if (hire.stage === "ARCHIVED") return "Archived";
  if (hire.stage === "POST_ONBOARD") return "Onboarded";
  if (applicableCount > 0 && doneCount === applicableCount) return "Ready";
  const startMs = hire.startDate ? hire.startDate.getTime() : null;
  if (startMs !== null && startMs < now - DAY) return "Overdue";
  if (startMs !== null && startMs - now <= 7 * DAY) return "Due soon";
  return "In progress";
}

function toRow(hire: HireWithTasks, now: number): NewHireRow {
  const onboardingTasks = hire.tasks.filter((t) => t.group !== MAINTENANCE_GROUP && t.group !== CUSTOM_GROUP);
  const applicable = onboardingTasks.filter((t) => t.status !== "NA");
  const doneCount = applicable.filter((t) => t.status === "DONE").length;
  const applicableCount = applicable.length;
  const nextTask = [...onboardingTasks].sort((a, b) => a.order - b.order).find((t) => t.status === "TODO");
  // Rehire-aware tenure: bridge gaps <= 3 months, reset for longer (see lib/data/tenure).
  // Fall back to a single implicit stint (hire start -> termination) when no stints exist.
  const stints = hire.employmentStints.length
    ? hire.employmentStints
    : hire.startDate
      ? [{ startDate: hire.startDate, endDate: hire.terminationDate }]
      : [];
  const tenureYears = computeTenure(stints, now).completedYears;
  return {
    id: hire.id,
    name: hire.name,
    legalName: hire.legalName,
    position: hire.position,
    department: hire.department,
    location: hire.location,
    managedAircraft: hire.managedAircraft,
    managedPilot: hire.managedPilot,
    tags: hire.tags ?? [],
    phone: hire.phone,
    ssEmail: hire.ssEmail,
    personalEmail: hire.personalEmail,
    supervisorName: hire.supervisorName,
    supervisorEmail: hire.supervisorEmail,
    supervisorHireId: hire.supervisorHireId,
    supervisorHire: hire.supervisorHire ?? null,
    supervisor2Name: hire.supervisor2Name,
    supervisor2Email: hire.supervisor2Email,
    supervisor2HireId: hire.supervisor2HireId,
    supervisor2Hire: hire.supervisor2Hire ?? null,
    offerSentDate: iso(hire.offerSentDate),
    offerSignedDate: iso(hire.offerSignedDate),
    startDate: iso(hire.startDate),
    orientationDate: iso(hire.orientationDate),
    aircraftServiceDate: iso(hire.aircraftServiceDate),
    seniorityDate: iso(hire.seniorityDate),
    seniorityNumber: hire.seniorityNumber,
    orientationNotNeeded: hire.orientationNotNeeded,
    birthday: iso(hire.birthday),
    indocStartDate: iso(hire.indocStartDate),
    indocEndDate: iso(hire.indocEndDate),
    trainingDate: iso(hire.trainingDate),
    trainingLocation: hire.trainingLocation,
    birthCountry: hire.birthCountry,
    citizenshipCountry: hire.citizenshipCountry,
    terminationDate: iso(hire.terminationDate),
    stage: hire.stage as HireStage,
    canceled: hire.canceled,
    employmentStatus: (["TERMINATED", "CONTRACT"].includes(hire.employmentStatus) ? hire.employmentStatus : "ACTIVE") as EmploymentStatus,
    businessCardStatus: hire.businessCardStatus,
    businessCardTitle: hire.businessCardTitle,
    travelStatus: hire.travelStatus,
    notes: hire.notes,
    pdpGraduate: hire.pdpGraduate,
    tenureYears,
    doneCount,
    applicableCount,
    status: deriveStatus(hire, doneCount, applicableCount, now),
    nextAction: nextTask?.label ?? null
  };
}

type HireTravelStatus = { hasTrips: boolean; hasNeeded: boolean };

async function travelStatusByHire(hireIds: string[]): Promise<Map<string, HireTravelStatus>> {
  const map = new Map<string, HireTravelStatus>();
  if (hireIds.length === 0) return map;
  const trips = await prisma.travelTrip.findMany({
    where: { newHireId: { in: hireIds }, status: { not: "CANCELED" } },
    select: { newHireId: true, status: true }
  });
  for (const t of trips) {
    if (!t.newHireId) continue;
    const cur = map.get(t.newHireId) ?? { hasTrips: false, hasNeeded: false };
    cur.hasTrips = true;
    if (t.status === "NEEDED") cur.hasNeeded = true;
    map.set(t.newHireId, cur);
  }
  return map;
}

/** A hire we still owe travel money back to, with how much. */
export type ReimbursementOwed = { personId: string; personName: string; href: string; amount: number; items: number };

/**
 * Everyone owed a travel reimbursement, across EVERY stage.
 *
 * Deliberately not scoped to the hires already on the dashboard. Reimbursement
 * is owed after a trip, which is usually after onboarding finishes, so scoping
 * this to active hires — or to the 21-day recently-onboarded window — would let
 * the debt disappear off the board while it was still unpaid. That is the exact
 * failure this exists to prevent.
 *
 * NEEDED is set by hand when somebody records that the traveller paid for
 * something themselves, so a row here is a real obligation rather than an
 * inference. Canceled trips are excluded; amount-less items still count toward
 * the item tally so a missing figure cannot hide the debt entirely.
 */
async function reimbursementsOwed(): Promise<ReimbursementOwed[]> {
  const items = await prisma.travelItem.findMany({
    where: {
      selfBooked: true,
      reimbursement: "NEEDED",
      trip: { status: { not: "CANCELED" } }
    },
    select: {
      amount: true,
      trip: {
        select: {
          newHireId: true,
          candidateId: true,
          newHire: { select: { name: true } },
          candidate: { select: { displayName: true } }
        }
      }
    }
  });
  const byPerson = new Map<string, ReimbursementOwed>();
  for (const i of items) {
    const t = i.trip;
    // A trip linked to neither is orphaned data with nobody to pay; skipping it
    // keeps an unclickable row off the board.
    const person = t.newHireId
      ? { personId: t.newHireId, personName: t.newHire?.name ?? "Unknown", href: `/people/${t.newHireId}` }
      : t.candidateId
        ? { personId: t.candidateId, personName: t.candidate?.displayName ?? "Unknown", href: `/candidates/${t.candidateId}` }
        : null;
    if (!person) continue;
    const cur = byPerson.get(person.personId) ?? { ...person, amount: 0, items: 0 };
    cur.amount += i.amount ?? 0;
    cur.items += 1;
    byPerson.set(person.personId, cur);
  }
  return [...byPerson.values()].sort((a, b) => b.amount - a.amount);
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function buildDashboard(
  active: HireWithTasks[],
  now: number,
  travelByHire: Map<string, HireTravelStatus>,
  recentlyOnboarded: HireWithTasks[] = [],
  hiddenIds: Set<string> = new Set(),
  owed: ReimbursementOwed[] = []
): OnboardingDashboard {
  const rows = active.map((h) => ({ hire: h, row: toRow(h, now) }));

  const startingSoon = rows.filter(
    ({ row }) => row.startDate && new Date(row.startDate).getTime() - now <= 7 * DAY && new Date(row.startDate).getTime() - now >= -DAY
  ).length;
  const missingItems = rows.filter(({ row }) => row.applicableCount - row.doneCount > 0).length;
  const urgent = rows.filter(({ row }) => row.status === "Due soon" || row.status === "Overdue").length;

  const alerts: Alert[] = [];
  for (const { hire, row } of rows) {
    const signed = hire.tasks.find((t) => t.key === "candidate_signed");
    const startMs = row.startDate ? new Date(row.startDate).getTime() : null;
    const soon = startMs !== null && startMs - now <= 14 * DAY;

    // Cleared by the background check but not yet hired in Paycom. This is the one
    // point in the process where a person is waiting on US and nothing on the board
    // said so — the check comes back, the box gets ticked, and then it just sits.
    // Self-clearing: tick "Hire in Paycom" and the row disappears on its own.
    const bgCleared = hire.tasks.find((t) => t.key === "bg_check_complete");
    const paycomHire = hire.tasks.find((t) => t.key === "paycom_hire");
    const waitingToHire = bgCleared?.status === "DONE" && paycomHire?.status === "TODO";
    const clearedDays =
      waitingToHire && bgCleared?.completedAt
        ? Math.floor((now - new Date(bgCleared.completedAt).getTime()) / DAY)
        : 0;

    if (row.status === "Overdue") {
      alerts.push({ id: hire.id, name: hire.name, level: "blocked", text: `start date passed, ${row.doneCount} of ${row.applicableCount} tasks done` });
    } else if (waitingToHire) {
      alerts.push({
        id: hire.id,
        name: hire.name,
        // Good news turns into a problem if nobody acts on it, so this goes red
        // once it has been sitting. READY_TO_HIRE_ESCALATE_DAYS is the dial.
        level: clearedDays >= READY_TO_HIRE_ESCALATE_DAYS ? "urgent" : "ready",
        text:
          clearedDays >= 1
            ? `background check cleared ${clearedDays}d ago — hire in Paycom`
            : "background check cleared — hire in Paycom"
      });
    } else if (signed && signed.status === "TODO") {
      alerts.push({ id: hire.id, name: hire.name, level: soon ? "urgent" : "missing", text: "offer letter not signed yet" });
    } else if (row.nextAction && (row.status === "Due soon" || row.applicableCount - row.doneCount > 0)) {
      alerts.push({ id: hire.id, name: hire.name, level: row.status === "Due soon" ? "urgent" : "missing", text: `${row.nextAction.toLowerCase()}` });
    }
  }
  // Appended separately rather than inside the loop above: that loop is an
  // else-if chain over ACTIVE hires only, so a debt would be both hidden behind
  // an unrelated flag and invisible for anyone past onboarding.
  for (const o of owed) {
    alerts.push({
      id: o.personId,
      name: o.personName,
      href: o.href,
      level: "urgent",
      text: o.amount > 0 ? `travel reimbursement owed — ${money(o.amount)}` : "travel reimbursement owed — amount not recorded"
    });
  }

  const severity: Record<AlertLevel, number> = { blocked: 0, urgent: 1, ready: 2, missing: 3 };
  alerts.sort((a, b) => severity[a.level] - severity[b.level]);

  const upcomingStarts: UpcomingStart[] = rows
    .filter(({ row }) => row.startDate && new Date(row.startDate).getTime() >= now - DAY)
    .sort((a, b) => new Date(a.row.startDate as string).getTime() - new Date(b.row.startDate as string).getTime())
    .slice(0, 6)
    .map(({ row }) => ({ id: row.id, name: row.name, position: row.position, startDate: row.startDate as string }));

  // Charts
  const statusOrder: HireStatus[] = ["In progress", "Ready", "Due soon", "Overdue"];
  const byStatus: ChartDatum[] = statusOrder
    .map((s) => ({ label: s, count: rows.filter(({ row }) => row.status === s).length }))
    .filter((d) => d.count > 0);

  const deptMap = new Map<string, number>();
  for (const { row } of rows) {
    const d = row.department ?? "Unassigned";
    deptMap.set(d, (deptMap.get(d) ?? 0) + 1);
  }
  const byDepartment: ChartDatum[] = [...deptMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Starts grouped into the next 6 weeks, starting this week (Monday).
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const dow = (startOfToday.getUTCDay() + 6) % 7; // 0 = Monday
  const weekStart = startOfToday.getTime() - dow * DAY;
  const startsByWeek: ChartDatum[] = Array.from({ length: 6 }, (_, i) => {
    const from = weekStart + i * 7 * DAY;
    const label = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(from));
    const count = rows.filter(({ row }) => {
      if (!row.startDate) return false;
      const t = new Date(row.startDate).getTime();
      return t >= from && t < from + 7 * DAY;
    }).length;
    return { label, count };
  });

  const funnelDefs: Array<{ label: string; key: string }> = [
    { label: "Offer signed", key: "candidate_signed" },
    { label: "Background done", key: "bg_check_complete" },
    { label: "Hired in Paycom", key: "paycom_hire" },
    { label: "Groups & drive", key: "groups_drive" },
    { label: "Attended orientation", key: "attended_orientation" }
  ];
  const funnel: ChartDatum[] = funnelDefs.map((f) => ({
    label: f.label,
    count: rows.filter(({ hire }) => hire.tasks.some((t) => t.key === f.key && t.status === "DONE")).length
  }));

  const avgCompletion =
    rows.length === 0
      ? 0
      : Math.round(
          (rows.reduce((acc, { row }) => acc + (row.applicableCount > 0 ? row.doneCount / row.applicableCount : 0), 0) /
            rows.length) *
            100
        );

  const toDrill = ({ row }: { row: NewHireRow }): DrillPerson => ({
    id: row.id,
    name: row.name,
    position: row.position,
    startDate: row.startDate,
    status: row.status,
    doneCount: row.doneCount,
    applicableCount: row.applicableCount
  });
  const byStartAsc = (a: DrillPerson, b: DrillPerson) =>
    (a.startDate ? new Date(a.startDate).getTime() : Infinity) - (b.startDate ? new Date(b.startDate).getTime() : Infinity);

  const startingSoonList = rows
    .filter(({ row }) => row.startDate && new Date(row.startDate).getTime() - now <= 7 * DAY && new Date(row.startDate).getTime() - now >= -DAY)
    .map(toDrill)
    .sort(byStartAsc);
  const needsAttentionList = rows
    .filter(({ row }) => row.status === "Overdue" || row.status === "Due soon")
    .map(toDrill)
    .sort((a, b) => (a.status === "Overdue" ? 0 : 1) - (b.status === "Overdue" ? 0 : 1) || byStartAsc(a, b));
  const missingItemsList = rows
    .filter(({ row }) => row.applicableCount - row.doneCount > 0)
    .map(toDrill)
    .sort((a, b) => b.applicableCount - b.doneCount - (a.applicableCount - a.doneCount));
  // Dateless active hires (excluding canceled) — surfaced so they don't disappear.
  const noStartDateList = rows
    .filter(({ row }) => !row.startDate && !row.canceled)
    .map(toDrill)
    .sort((a, b) => a.name.localeCompare(b.name));

  // In-onboarding worklist: every active hire + anyone onboarded recently, split
  // into shown vs checked-off (hidden). In-onboarding first (by start date), then
  // the recently onboarded (most recent first).
  const recentRows = recentlyOnboarded.map((h) => ({ hire: h, row: toRow(h, now) }));
  const worklistAll: WorklistPerson[] = [...rows, ...recentRows].map(({ hire, row }) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    startDate: row.startDate,
    status: row.status,
    doneCount: row.doneCount,
    applicableCount: row.applicableCount,
    onboardedAt: iso(hire.onboardedAt)
  }));
  worklistAll.sort((a, b) => {
    const ao = a.onboardedAt ? 1 : 0;
    const bo = b.onboardedAt ? 1 : 0;
    if (ao !== bo) return ao - bo; // in-onboarding before onboarded
    if (a.onboardedAt && b.onboardedAt) return new Date(b.onboardedAt).getTime() - new Date(a.onboardedAt).getTime();
    return (a.startDate ? new Date(a.startDate).getTime() : Infinity) - (b.startDate ? new Date(b.startDate).getTime() : Infinity);
  });
  const worklist = worklistAll.filter((p) => !hiddenIds.has(p.id));
  const worklistHidden = worklistAll.filter((p) => hiddenIds.has(p.id));

  // Checklist bottlenecks: onboarding tasks still TODO across the most hires.
  const todoByTask = new Map<string, { label: string; count: number }>();
  for (const { hire } of rows) {
    for (const t of hire.tasks) {
      if (t.group === MAINTENANCE_GROUP || t.group === CUSTOM_GROUP) continue;
      if (t.status !== "TODO") continue;
      const e = todoByTask.get(t.key) ?? { label: t.label, count: 0 };
      e.count += 1;
      todoByTask.set(t.key, e);
    }
  }
  const bottlenecks: ChartDatum[] = [...todoByTask.values()]
    .map((e) => ({ label: e.label, count: e.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Ready for their start: starting within ~3 weeks, with progress + status.
  const readyForStart = rows
    .filter(({ row }) => row.startDate && new Date(row.startDate).getTime() - now <= 21 * DAY && new Date(row.startDate).getTime() - now >= -DAY)
    .map(toDrill)
    .sort(byStartAsc);

  // Orientation timeliness: of active hires with a start date, is orientation
  // scheduled within a month of it?
  const withStart = rows.filter(({ row }) => row.startDate);
  let onTime = 0;
  let outsideMonth = 0;
  let unscheduled = 0;
  for (const { row } of withStart) {
    if (!row.orientationDate) {
      unscheduled += 1;
    } else if (Math.abs(new Date(row.orientationDate).getTime() - new Date(row.startDate as string).getTime()) <= 31 * DAY) {
      onTime += 1;
    } else {
      outsideMonth += 1;
    }
  }
  const orientationTimeliness = {
    onTime,
    outsideMonth,
    unscheduled,
    total: withStart.length,
    pct: withStart.length ? Math.round((onTime / withStart.length) * 100) : 0
  };

  // Travel readiness among the upcoming starters.
  let travBooked = 0;
  let travNeeded = 0;
  let travNone = 0;
  for (const p of readyForStart) {
    const ts = travelByHire.get(p.id);
    if (!ts || !ts.hasTrips) travNone += 1;
    else if (ts.hasNeeded) travNeeded += 1;
    else travBooked += 1;
  }
  const travelReadiness = { booked: travBooked, needed: travNeeded, none: travNone, total: readyForStart.length };

  return {
    startingSoon,
    missingItems,
    urgent,
    inProcess: rows.length,
    avgCompletion,
    alerts: alerts.slice(0, 8),
    upcomingStarts,
    byStatus,
    byDepartment,
    startsByWeek,
    funnel,
    startingSoonList,
    needsAttentionList,
    missingItemsList,
    noStartDateList,
    worklist,
    worklistHidden,
    bottlenecks,
    readyForStart,
    orientationTimeliness,
    travelReadiness
  };
}

const hireSelect = {
  id: true,
  name: true,
  legalName: true,
  position: true,
  department: true,
  location: true,
  managedAircraft: true,
  managedPilot: true,
  tags: true,
  phone: true,
  ssEmail: true,
  personalEmail: true,
  supervisorName: true,
  supervisorEmail: true,
  supervisorHireId: true,
  supervisorHire: { select: { name: true, ssEmail: true, personalEmail: true } },
  supervisor2Name: true,
  supervisor2Email: true,
  supervisor2HireId: true,
  supervisor2Hire: { select: { name: true, ssEmail: true, personalEmail: true } },
  offerSentDate: true,
  offerSignedDate: true,
  startDate: true,
  orientationDate: true,
  aircraftServiceDate: true,
  seniorityDate: true,
  seniorityNumber: true,
  orientationNotNeeded: true,
  birthday: true,
  indocStartDate: true,
  indocEndDate: true,
  trainingDate: true,
  trainingLocation: true,
  birthCountry: true,
  citizenshipCountry: true,
  terminationDate: true,
  onboardedAt: true,
  stage: true,
  canceled: true,
  employmentStatus: true,
  businessCardStatus: true,
  businessCardTitle: true,
  travelStatus: true,
  notes: true,
  pdpGraduate: true,
  employmentStints: { select: { startDate: true, endDate: true } },
  tasks: { select: { id: true, key: true, label: true, group: true, order: true, status: true, completedAt: true } }
} as const;

export async function getOnboardingWorkspaceData(stage: HireStage = "ACTIVE"): Promise<OnboardingWorkspaceData> {
  const now = Date.now();
  const [active, post, archived] = await Promise.all([
    prisma.newHire.count({ where: { stage: "ACTIVE" } }),
    prisma.newHire.count({ where: { stage: "POST_ONBOARD" } }),
    prisma.newHire.count({ where: { stage: "ARCHIVED" } })
  ]);

  const hires = (await prisma.newHire.findMany({
    where: { stage },
    select: hireSelect,
    orderBy: [{ startDate: "asc" }, { name: "asc" }]
  })) as HireWithTasks[];

  const rows = hires.map((h) => toRow(h, now));

  let dashboard: OnboardingDashboard | null = null;
  if (stage === "ACTIVE") {
    const travelByHire = await travelStatusByHire(hires.map((h) => h.id));
    dashboard = buildDashboard(hires, now, travelByHire);
  }

  return { counts: { active, postOnboard: post, archived }, rows, dashboard };
}

export type NewHireDetail = NewHireRow & {
  tasks: TaskView[];
  offer: OfferApplicationView | null;
  /** The Candidate this hire came from, if linked — documents and interview
      history live over there, so the profile needs a way to get to it. */
  candidateId: string | null;
  candidateName: string | null;
};

// The hire's live offer (from the linked candidate's furthest-along application),
// in the shape the OfferControl stepper renders — so the same offer stepper shown
// on the candidate profile also shows on the onboarding record, both driving (and
// kept in step by) the offer<->onboarding sync. Null when the hire isn't linked to
// a candidate, or that candidate has no application to carry an offer.
async function loadHireOffer(candidateId: string | null | undefined): Promise<OfferApplicationView | null> {
  if (!candidateId) return null;
  const applicationId = await findOfferApplicationId(candidateId);
  if (!applicationId) return null;
  const app = await prisma.candidateApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      offerStatus: true,
      offerStepsJson: true,
      offerSentAt: true,
      offerSignedAt: true,
      offerDeclinedAt: true,
      offerDeclineReason: true,
      offerNotSentAt: true,
      offerNotSentReason: true,
      offerStartDate: true,
      offerSource: true
    }
  });
  if (!app) return null;
  return {
    id: app.id,
    offerStatus: app.offerStatus,
    offerSteps: parseOfferSteps(app.offerStepsJson),
    offerSentAt: app.offerSentAt?.toISOString() ?? null,
    offerSignedAt: app.offerSignedAt?.toISOString() ?? null,
    offerDeclinedAt: app.offerDeclinedAt?.toISOString() ?? null,
    offerDeclineReason: app.offerDeclineReason,
    offerNotSentAt: app.offerNotSentAt?.toISOString() ?? null,
    offerNotSentReason: app.offerNotSentReason,
    offerStartDate: app.offerStartDate?.toISOString() ?? null,
    offerSource: app.offerSource
  };
}

export async function getNewHireDetail(id: string): Promise<NewHireDetail | null> {
  const hire = (await prisma.newHire.findUnique({ where: { id }, select: hireSelect })) as HireWithTasks | null;
  if (!hire) return null;
  const link = await prisma.newHire.findUnique({ where: { id }, select: { candidateId: true } });
  // NewHire.candidateId is a plain column with no Prisma relation, so the name
  // needs its own lookup rather than an include.
  const candidate = link?.candidateId
    ? await prisma.candidate.findUnique({ where: { id: link.candidateId }, select: { displayName: true } })
    : null;
  const row = toRow(hire, Date.now());
  const tasks: TaskView[] = [...hire.tasks]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ id: t.id, key: t.key, label: t.label, group: t.group, order: t.order, status: t.status as TaskView["status"] }));
  return {
    ...row,
    tasks,
    offer: await loadHireOffer(link?.candidateId),
    candidateId: link?.candidateId ?? null,
    candidateName: candidate?.displayName ?? null
  };
}

// Builds the default task set for a brand-new (manually added) hire.
//
// offerSteps carries over what was already ticked on the candidate's offer while
// they were still a candidate (lib/offers/steps.ts uses these same six keys), so
// the Offer group arrives already complete instead of asking someone to tick the
// same six boxes a second time. Passing nothing gives the old all-TODO behaviour,
// which is what the CSV importer and a hire with no offer both want.
export function defaultTaskCreateData(
  offerSteps?: OfferSteps
): Array<
  Pick<OnboardingTaskDef, "label" | "group"> & { key: string; order: number; status: string; completedAt?: Date }
> {
  return ONBOARDING_TASKS.map((t, i) => {
    const doneAt = offerSteps && isOfferStepKey(t.key) ? offerStepCompletedAt(offerSteps, t.key) : null;
    return {
      key: t.key,
      label: t.label,
      group: t.group,
      order: i,
      status: doneAt ? "DONE" : "TODO",
      ...(doneAt ? { completedAt: doneAt } : {})
    };
  });
}

// When every maintenance check-in (30/60/90 + benefits) is done, a post-onboard
// employee is finished with onboarding, so move them to Archived — but keep their
// employmentStatus (they are a CURRENT employee, not terminated). The Archived
// tab's current/former filter keeps the two distinct. Returns true if archived.
export async function maybeArchiveOnCheckinsComplete(hireId: string): Promise<boolean> {
  const hire = await prisma.newHire.findUnique({
    where: { id: hireId },
    select: { stage: true, tasks: { where: { group: MAINTENANCE_GROUP }, select: { status: true } } }
  });
  if (!hire || hire.stage !== "POST_ONBOARD") return false;
  const checkins = hire.tasks;
  if (checkins.length === 0 || !checkins.every((t) => t.status === "DONE")) return false;
  await prisma.newHire.update({ where: { id: hireId }, data: { stage: "ARCHIVED" } });
  return true;
}

export async function getOnboardingCounts() {
  const [active, postOnboard, archived] = await Promise.all([
    prisma.newHire.count({ where: { stage: "ACTIVE" } }),
    prisma.newHire.count({ where: { stage: "POST_ONBOARD" } }),
    prisma.newHire.count({ where: { stage: "ARCHIVED" } })
  ]);
  return { active, postOnboard, archived };
}

export async function getActiveDashboard(): Promise<OnboardingDashboard> {
  const now = Date.now();
  const [hires, recentlyOnboarded, hiddenIds] = await Promise.all([
    prisma.newHire.findMany({
      where: { stage: "ACTIVE" },
      select: hireSelect,
      orderBy: [{ startDate: "asc" }, { name: "asc" }]
    }) as Promise<HireWithTasks[]>,
    // Recently onboarded (last ~3 weeks) so the worklist shows the full recent picture.
    prisma.newHire.findMany({
      where: { stage: "POST_ONBOARD", onboardedAt: { gte: new Date(now - 21 * DAY) } },
      select: hireSelect,
      orderBy: [{ onboardedAt: "desc" }]
    }) as Promise<HireWithTasks[]>,
    getDashboardHiddenIds()
  ]);
  const [travelByHire, owed] = await Promise.all([travelStatusByHire(hires.map((h) => h.id)), reimbursementsOwed()]);
  return buildDashboard(hires, now, travelByHire, recentlyOnboarded, new Set(hiddenIds), owed);
}

// ---- Grid + Milestones (active hires only) ----

export type GridTaskStatus = "TODO" | "DONE" | "NA";
export type GridTask = { id: string; key: string; status: GridTaskStatus };
export type GridHire = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  offerSentDate: string | null;
  offerSignedDate: string | null;
  startDate: string | null;
  orientationDate: string | null;
  phone: string | null;
  ssEmail: string | null;
  personalEmail: string | null;
  status: HireStatus;
  doneCount: number;
  applicableCount: number;
  tasks: GridTask[];
};

export async function getActiveGridHires(): Promise<GridHire[]> {
  const now = Date.now();
  const [hires, hiddenKeys] = await Promise.all([
    prisma.newHire.findMany({
      where: { stage: "ACTIVE" },
      select: hireSelect,
      orderBy: [{ startDate: "asc" }, { name: "asc" }]
    }) as Promise<HireWithTasks[]>,
    getGridHiddenKeys()
  ]);

  return hires.map((h) => {
    const row = toRow(h, now);
    const tasks = h.tasks
      .filter((t) => t.group !== MAINTENANCE_GROUP)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ id: t.id, key: t.key, status: t.status as GridTaskStatus }));
    // Progress counts the visible built-in checklist only — a hidden task no
    // longer drags the percentage, and custom tasks are extras that don't count.
    const counted = h.tasks.filter(
      (t) => t.group !== MAINTENANCE_GROUP && t.group !== CUSTOM_GROUP && !hiddenKeys.has(t.key) && t.status !== "NA"
    );
    return {
      id: h.id,
      name: h.name,
      position: h.position,
      department: h.department,
      offerSentDate: iso(h.offerSentDate),
      offerSignedDate: iso(h.offerSignedDate),
      startDate: iso(h.startDate),
      orientationDate: iso(h.orientationDate),
      phone: h.phone,
      ssEmail: h.ssEmail,
      personalEmail: h.personalEmail,
      status: row.status,
      doneCount: counted.filter((t) => t.status === "DONE").length,
      applicableCount: counted.length,
      tasks
    };
  });
}

export type MilestoneColumn = { key: string; label: string; custom: boolean };
export type MilestoneRow = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  statuses: GridTaskStatus[];
  done: number;
  total: number;
};
export type MilestoneData = { milestones: MilestoneColumn[]; hires: MilestoneRow[] };

export async function getActiveMilestoneData(): Promise<MilestoneData> {
  const [catalog, hires] = await Promise.all([
    getMilestoneCatalog(),
    prisma.newHire.findMany({
      where: { stage: "ACTIVE" },
      select: { id: true, name: true, position: true, department: true, tasks: { select: { key: true, status: true } } },
      orderBy: [{ startDate: "asc" }, { name: "asc" }]
    })
  ]);

  const hireRows: MilestoneRow[] = hires.map((h) => {
    const byKey = new Map(h.tasks.map((t) => [t.key, t.status] as const));
    const statuses = catalog.map((m) => (byKey.get(m.key) ?? "TODO") as GridTaskStatus);
    return {
      id: h.id,
      name: h.name,
      position: h.position,
      department: h.department,
      statuses,
      done: statuses.filter((s) => s === "DONE").length,
      total: statuses.filter((s) => s !== "NA").length
    };
  });

  return { milestones: catalog.map((m) => ({ key: m.key, label: m.label, custom: m.custom })), hires: hireRows };
}

// ---- Post-onboard (maintenance check-ins) ----

export type Checkin = { id: string; key: string; short: string; status: GridTaskStatus; dueSoon: boolean };
export type EmploymentStatus = "ACTIVE" | "TERMINATED" | "CONTRACT";
export type PostOnboardHire = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  startDate: string | null;
  onboardedAt: string | null;
  employmentStatus: EmploymentStatus;
  checkins: Checkin[];
};

export async function getPostOnboardHires(): Promise<PostOnboardHire[]> {
  const now = Date.now();
  const ids = await prisma.newHire.findMany({ where: { stage: "POST_ONBOARD" }, select: { id: true } });
  // Ensure every maintenance task exists for each post-onboard hire in a single
  // insert. skipDuplicates means adding a NEW task to MAINTENANCE_TASKS backfills
  // a row for everyone already on this list the next time the page loads.
  await prisma.onboardingTask.createMany({
    data: ids.flatMap((h) =>
      MAINTENANCE_TASKS.map((m, i) => ({
        newHireId: h.id,
        key: m.key,
        label: m.label,
        group: MAINTENANCE_GROUP,
        order: 100 + i,
        status: "TODO"
      }))
    ),
    skipDuplicates: true
  });

  const hires = await prisma.newHire.findMany({
    where: { stage: "POST_ONBOARD" },
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      startDate: true,
      onboardedAt: true,
      employmentStatus: true,
      tasks: { where: { group: MAINTENANCE_GROUP }, select: { id: true, key: true, status: true } }
    },
    // Newest start date first: this list is worked from the most recent arrivals
    // backwards, and alphabetical put whoever happened to be called Aaron at the
    // top forever. "nulls: last" matters — a hire with no start date would
    // otherwise sort above everyone on a descending sort and lead the page.
    orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { name: "asc" }]
  });

  return hires.map((h) => {
    const byKey = new Map(h.tasks.map((t) => [t.key, { id: t.id, status: t.status }] as const));
    const startMs = h.startDate ? h.startDate.getTime() : null;
    const checkins: Checkin[] = MAINTENANCE_TASKS.map((m) => {
      const rec = byKey.get(m.key);
      const status = (rec?.status ?? "TODO") as GridTaskStatus;
      const dueSoon = Boolean(m.dueDays !== null && startMs !== null && now >= startMs + m.dueDays * DAY && status !== "DONE");
      return { id: rec?.id ?? "", key: m.key, short: m.short, status, dueSoon };
    });
    return {
      id: h.id,
      name: h.name,
      position: h.position,
      department: h.department,
      startDate: iso(h.startDate),
      onboardedAt: iso(h.onboardedAt),
      employmentStatus: (["TERMINATED", "CONTRACT"].includes(h.employmentStatus) ? h.employmentStatus : "ACTIVE") as EmploymentStatus,
      checkins
    };
  });
}

export async function getArchivedRows(): Promise<NewHireRow[]> {
  const now = Date.now();
  const hires = (await prisma.newHire.findMany({
    where: { stage: "ARCHIVED" },
    select: hireSelect,
    orderBy: [{ name: "asc" }]
  })) as HireWithTasks[];
  return hires.map((h) => toRow(h, now));
}
