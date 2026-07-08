import { prisma } from "@/lib/prisma";
import {
  ONBOARDING_TASKS,
  MAINTENANCE_TASKS,
  MAINTENANCE_GROUP,
  CUSTOM_GROUP,
  type OnboardingTaskDef
} from "@/lib/onboarding/tasks";
import { getMilestoneCatalog } from "@/lib/data/onboarding-milestones";
import { computeTenure } from "@/lib/data/tenure";

const DAY = 86_400_000;

export type HireStage = "ACTIVE" | "POST_ONBOARD" | "ARCHIVED";
export type HireStatus = "Ready" | "In progress" | "Due soon" | "Overdue" | "Onboarded" | "Archived" | "Canceled";
export type AlertLevel = "blocked" | "urgent" | "missing";

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
  position: string | null;
  department: string | null;
  phone: string | null;
  ssEmail: string | null;
  personalEmail: string | null;
  offerSentDate: string | null;
  offerSignedDate: string | null;
  startDate: string | null;
  orientationDate: string | null;
  terminationDate: string | null;
  stage: HireStage;
  canceled: boolean;
  employmentStatus: EmploymentStatus;
  travelStatus: string | null;
  businessCardStatus: string;
  notes: string | null;
  pdpGraduate: boolean;
  tenureYears: number; // completed whole years with the company (anniversary-based)
  doneCount: number;
  applicableCount: number;
  status: HireStatus;
  nextAction: string | null;
};

export type Alert = { id: string; name: string; level: AlertLevel; text: string };
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
  position: string | null;
  department: string | null;
  phone: string | null;
  ssEmail: string | null;
  personalEmail: string | null;
  offerSentDate: Date | null;
  offerSignedDate: Date | null;
  startDate: Date | null;
  orientationDate: Date | null;
  terminationDate: Date | null;
  stage: string;
  canceled: boolean;
  employmentStatus: string;
  businessCardStatus: string;
  travelStatus: string | null;
  notes: string | null;
  tasks: { id: string; key: string; label: string; group: string; order: number; status: string }[];
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
    position: hire.position,
    department: hire.department,
    phone: hire.phone,
    ssEmail: hire.ssEmail,
    personalEmail: hire.personalEmail,
    offerSentDate: iso(hire.offerSentDate),
    offerSignedDate: iso(hire.offerSignedDate),
    startDate: iso(hire.startDate),
    orientationDate: iso(hire.orientationDate),
    terminationDate: iso(hire.terminationDate),
    stage: hire.stage as HireStage,
    canceled: hire.canceled,
    employmentStatus: (["TERMINATED", "CONTRACT"].includes(hire.employmentStatus) ? hire.employmentStatus : "ACTIVE") as EmploymentStatus,
    businessCardStatus: hire.businessCardStatus,
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

function buildDashboard(active: HireWithTasks[], now: number, travelByHire: Map<string, HireTravelStatus>): OnboardingDashboard {
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
    if (row.status === "Overdue") {
      alerts.push({ id: hire.id, name: hire.name, level: "blocked", text: `start date passed, ${row.doneCount} of ${row.applicableCount} tasks done` });
    } else if (signed && signed.status === "TODO") {
      alerts.push({ id: hire.id, name: hire.name, level: soon ? "urgent" : "missing", text: "offer letter not signed yet" });
    } else if (row.nextAction && (row.status === "Due soon" || row.applicableCount - row.doneCount > 0)) {
      alerts.push({ id: hire.id, name: hire.name, level: row.status === "Due soon" ? "urgent" : "missing", text: `${row.nextAction.toLowerCase()}` });
    }
  }
  const severity: Record<AlertLevel, number> = { blocked: 0, urgent: 1, missing: 2 };
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
    bottlenecks,
    readyForStart,
    orientationTimeliness,
    travelReadiness
  };
}

const hireSelect = {
  id: true,
  name: true,
  position: true,
  department: true,
  phone: true,
  ssEmail: true,
  personalEmail: true,
  offerSentDate: true,
  offerSignedDate: true,
  startDate: true,
  orientationDate: true,
  terminationDate: true,
  stage: true,
  canceled: true,
  employmentStatus: true,
  businessCardStatus: true,
  travelStatus: true,
  notes: true,
  pdpGraduate: true,
  employmentStints: { select: { startDate: true, endDate: true } },
  tasks: { select: { id: true, key: true, label: true, group: true, order: true, status: true } }
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

export type NewHireDetail = NewHireRow & { tasks: TaskView[] };

export async function getNewHireDetail(id: string): Promise<NewHireDetail | null> {
  const hire = (await prisma.newHire.findUnique({ where: { id }, select: hireSelect })) as HireWithTasks | null;
  if (!hire) return null;
  const row = toRow(hire, Date.now());
  const tasks: TaskView[] = [...hire.tasks]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({ id: t.id, key: t.key, label: t.label, group: t.group, order: t.order, status: t.status as TaskView["status"] }));
  return { ...row, tasks };
}

// Builds the default task set for a brand-new (manually added) hire.
export function defaultTaskCreateData(): Array<Pick<OnboardingTaskDef, "label" | "group"> & { key: string; order: number; status: string }> {
  return ONBOARDING_TASKS.map((t, i) => ({ key: t.key, label: t.label, group: t.group, order: i, status: "TODO" }));
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
  const hires = (await prisma.newHire.findMany({
    where: { stage: "ACTIVE" },
    select: hireSelect,
    orderBy: [{ startDate: "asc" }, { name: "asc" }]
  })) as HireWithTasks[];
  const travelByHire = await travelStatusByHire(hires.map((h) => h.id));
  return buildDashboard(hires, Date.now(), travelByHire);
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
  const hires = (await prisma.newHire.findMany({
    where: { stage: "ACTIVE" },
    select: hireSelect,
    orderBy: [{ startDate: "asc" }, { name: "asc" }]
  })) as HireWithTasks[];

  return hires.map((h) => {
    const row = toRow(h, now);
    const tasks = h.tasks
      .filter((t) => t.group !== MAINTENANCE_GROUP)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ id: t.id, key: t.key, status: t.status as GridTaskStatus }));
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
      doneCount: row.doneCount,
      applicableCount: row.applicableCount,
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
  // Ensure the 4 maintenance tasks exist for every post-onboard hire in a single insert.
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
    orderBy: [{ name: "asc" }]
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
