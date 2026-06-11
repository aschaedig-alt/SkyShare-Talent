import { prisma } from "@/lib/prisma";
import { ONBOARDING_TASKS, type OnboardingTaskDef } from "@/lib/onboarding/tasks";

const DAY = 86_400_000;

export type HireStage = "ACTIVE" | "POST_ONBOARD" | "ARCHIVED";
export type HireStatus = "Ready" | "In process" | "Urgent" | "Blocked" | "Onboarded" | "Archived" | "Canceled";
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
  stage: HireStage;
  canceled: boolean;
  travelStatus: string | null;
  notes: string | null;
  doneCount: number;
  applicableCount: number;
  status: HireStatus;
  nextAction: string | null;
};

export type Alert = { id: string; name: string; level: AlertLevel; text: string };
export type UpcomingStart = { id: string; name: string; position: string | null; startDate: string };

export type OnboardingDashboard = {
  startingSoon: number;
  missingItems: number;
  urgent: number;
  inProcess: number;
  alerts: Alert[];
  upcomingStarts: UpcomingStart[];
};

export type OnboardingWorkspaceData = {
  counts: { active: number; postOnboard: number; archived: number };
  rows: NewHireRow[];
  dashboard: OnboardingDashboard | null;
};

type HireWithTasks = {
  id: string;
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
  stage: string;
  canceled: boolean;
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
  if (startMs !== null && startMs < now - DAY) return "Blocked";
  if (startMs !== null && startMs - now <= 7 * DAY) return "Urgent";
  return "In process";
}

function toRow(hire: HireWithTasks, now: number): NewHireRow {
  const applicable = hire.tasks.filter((t) => t.status !== "NA");
  const doneCount = applicable.filter((t) => t.status === "DONE").length;
  const applicableCount = applicable.length;
  const nextTask = [...hire.tasks].sort((a, b) => a.order - b.order).find((t) => t.status === "TODO");
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
    stage: hire.stage as HireStage,
    canceled: hire.canceled,
    travelStatus: hire.travelStatus,
    notes: hire.notes,
    doneCount,
    applicableCount,
    status: deriveStatus(hire, doneCount, applicableCount, now),
    nextAction: nextTask?.label ?? null
  };
}

function buildDashboard(active: HireWithTasks[], now: number): OnboardingDashboard {
  const rows = active.map((h) => ({ hire: h, row: toRow(h, now) }));

  const startingSoon = rows.filter(
    ({ row }) => row.startDate && new Date(row.startDate).getTime() - now <= 7 * DAY && new Date(row.startDate).getTime() - now >= -DAY
  ).length;
  const missingItems = rows.filter(({ row }) => row.applicableCount - row.doneCount > 0).length;
  const urgent = rows.filter(({ row }) => row.status === "Urgent" || row.status === "Blocked").length;

  const alerts: Alert[] = [];
  for (const { hire, row } of rows) {
    const signed = hire.tasks.find((t) => t.key === "candidate_signed");
    const startMs = row.startDate ? new Date(row.startDate).getTime() : null;
    const soon = startMs !== null && startMs - now <= 14 * DAY;
    if (row.status === "Blocked") {
      alerts.push({ id: hire.id, name: hire.name, level: "blocked", text: `start date passed, ${row.doneCount} of ${row.applicableCount} tasks done` });
    } else if (signed && signed.status === "TODO") {
      alerts.push({ id: hire.id, name: hire.name, level: soon ? "urgent" : "missing", text: "offer letter not signed yet" });
    } else if (row.nextAction && (row.status === "Urgent" || row.applicableCount - row.doneCount > 0)) {
      alerts.push({ id: hire.id, name: hire.name, level: row.status === "Urgent" ? "urgent" : "missing", text: `${row.nextAction.toLowerCase()}` });
    }
  }
  const severity: Record<AlertLevel, number> = { blocked: 0, urgent: 1, missing: 2 };
  alerts.sort((a, b) => severity[a.level] - severity[b.level]);

  const upcomingStarts: UpcomingStart[] = rows
    .filter(({ row }) => row.startDate && new Date(row.startDate).getTime() >= now - DAY)
    .sort((a, b) => new Date(a.row.startDate as string).getTime() - new Date(b.row.startDate as string).getTime())
    .slice(0, 6)
    .map(({ row }) => ({ id: row.id, name: row.name, position: row.position, startDate: row.startDate as string }));

  return { startingSoon, missingItems, urgent, inProcess: rows.length, alerts: alerts.slice(0, 8), upcomingStarts };
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
  stage: true,
  canceled: true,
  travelStatus: true,
  notes: true,
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
    dashboard = buildDashboard(hires, now);
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
