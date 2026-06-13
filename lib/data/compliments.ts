import { prisma } from "@/lib/prisma";
import { initialsFromName } from "@/lib/compliments/format";
import type { RecognitionView, RewardView, RosterPerson } from "@/lib/compliments/types";

// Employees in the Compliments program = active (Milestones) + post-onboard hires.
const ROSTER_STAGES = ["ACTIVE", "POST_ONBOARD"];

type RecognitionWithRelations = {
  id: string;
  message: string;
  strength: string;
  pointsAwarded: number;
  createdAt: Date;
  giver: { name: string; avatarInitials: string | null } | null;
  recipient: { name: string; avatarInitials: string | null } | null;
  values: { name: string; colorKey: string }[];
  _count: { likes: number; comments: number };
};

const recognitionInclude = {
  giver: { select: { name: true, avatarInitials: true } },
  recipient: { select: { name: true, avatarInitials: true } },
  values: { select: { name: true, colorKey: true }, orderBy: { sortOrder: "asc" } },
  _count: { select: { likes: true, comments: true } }
} as const;

function toRecognitionView(r: RecognitionWithRelations): RecognitionView {
  const giverName = r.giver?.name ?? "Someone";
  const recipientName = r.recipient?.name ?? "a teammate";
  return {
    id: r.id,
    giverName,
    giverInitials: r.giver?.avatarInitials ?? initialsFromName(giverName),
    recipientName,
    recipientInitials: r.recipient?.avatarInitials ?? initialsFromName(recipientName),
    message: r.message,
    values: r.values.map((v) => ({ name: v.name, colorKey: v.colorKey })),
    strength: r.strength,
    pointsAwarded: r.pointsAwarded,
    createdAt: r.createdAt.toISOString(),
    likeCount: r._count.likes,
    commentCount: r._count.comments
  };
}

export async function getComplimentsRoster(): Promise<RosterPerson[]> {
  const hires = await prisma.newHire.findMany({
    where: { stage: { in: ROSTER_STAGES } },
    select: {
      id: true,
      name: true,
      department: true,
      position: true,
      avatarInitials: true,
      stage: true,
      pointsBalance: true
    },
    orderBy: { name: "asc" }
  });
  return hires.map((h) => ({
    id: h.id,
    name: h.name,
    department: h.department,
    position: h.position,
    initials: h.avatarInitials ?? initialsFromName(h.name),
    stage: h.stage,
    pointsBalance: h.pointsBalance
  }));
}

export async function getRecognitionValues() {
  return prisma.recognitionValue.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, colorKey: true }
  });
}

// ---- Dashboard ---------------------------------------------------------------

function startOfMonth(d: Date, monthsBack = 0): Date {
  return new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
}

function trend(current: number, previous: number): { direction: "up" | "down" | "flat"; label: string } {
  if (previous === 0) {
    return current > 0
      ? { direction: "up", label: "new this month" }
      : { direction: "flat", label: "no change" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { direction: "up", label: `${pct}% from last month` };
  if (pct < 0) return { direction: "down", label: `${Math.abs(pct)}% from last month` };
  return { direction: "flat", label: "same as last month" };
}

export type LeaderEntry = {
  id: string;
  name: string;
  initials: string;
  department: string | null;
  count: number;
};

export type DashboardData = {
  recognitionsThisMonth: number;
  recognitionsTrend: ReturnType<typeof trend>;
  allTimeRecognitions: number;
  streakDays: number;
  pointsThisMonth: number;
  pointsTrend: ReturnType<typeof trend>;
  peopleCelebrated: number;
  participationPct: number;
  rosterSize: number;
  // Gamified momentum
  goal: { target: number; current: number; pct: number; remaining: number };
  notRecognized: number;
  topRecognizers: LeaderEntry[];
  topRecipients: LeaderEntry[];
  valuesInAction: { name: string; colorKey: string; count: number; pct: number }[];
  mostLoved: RecognitionView | null;
};

type LeaderPerson = { name: string; avatarInitials: string | null; department: string | null } | null;

// Local yyyy-mm-dd key for streak bucketing.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Consecutive days (ending today) that have at least one recognition.
function computeStreak(dates: Date[], now: Date): number {
  const days = new Set(dates.map(dayKey));
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function tallyLeaders(
  rows: { id: string; person: LeaderPerson }[]
): LeaderEntry[] {
  const map = new Map<string, LeaderEntry>();
  for (const row of rows) {
    const existing = map.get(row.id);
    if (existing) {
      existing.count += 1;
    } else {
      const name = row.person?.name ?? "Unknown";
      map.set(row.id, {
        id: row.id,
        name,
        initials: row.person?.avatarInitials ?? initialsFromName(name),
        department: row.person?.department ?? null,
        count: 1
      });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

export async function getDashboardData(): Promise<DashboardData> {
  const now = new Date();
  const thisMonth = startOfMonth(now);
  const lastMonth = startOfMonth(now, 1);

  const [rosterSize, thisMonthRecs, lastMonthRecs, allTimeRecognitions, streakRows, mostLovedRaw] =
    await Promise.all([
      prisma.newHire.count({ where: { stage: { in: ROSTER_STAGES } } }),
      // This month powers the metrics, leaderboards and values breakdown.
      prisma.recognition.findMany({
        where: { createdAt: { gte: thisMonth } },
        select: {
          pointsAwarded: true,
          recipientId: true,
          giverId: true,
          giver: { select: { name: true, avatarInitials: true, department: true } },
          recipient: { select: { name: true, avatarInitials: true, department: true } },
          values: { select: { name: true, colorKey: true } }
        }
      }),
      prisma.recognition.findMany({
        where: { createdAt: { gte: lastMonth, lt: thisMonth } },
        select: { pointsAwarded: true }
      }),
      prisma.recognition.count(),
      // Recent recognition dates feed the consecutive-day streak.
      prisma.recognition.findMany({
        where: { createdAt: { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } },
        select: { createdAt: true }
      }),
      prisma.recognition.findFirst({
        orderBy: [{ likes: { _count: "desc" } }, { createdAt: "desc" }],
        include: recognitionInclude
      })
    ]);

  const pointsThisMonth = thisMonthRecs.reduce((sum, r) => sum + r.pointsAwarded, 0);
  const pointsLastMonth = lastMonthRecs.reduce((sum, r) => sum + r.pointsAwarded, 0);
  const peopleCelebrated = new Set(thisMonthRecs.map((r) => r.recipientId)).size;
  const distinctGivers = new Set(thisMonthRecs.map((r) => r.giverId)).size;
  const participationPct = rosterSize > 0 ? Math.round((distinctGivers / rosterSize) * 100) : 0;

  // Monthly goal: next round number above the current pace — attainable but motivating.
  const target = Math.max(50, Math.ceil((thisMonthRecs.length + 1) / 25) * 25);
  const goalPct = target > 0 ? Math.min(100, Math.round((thisMonthRecs.length / target) * 100)) : 0;

  // Values in action (this month), most-celebrated value first.
  const valueCounts = new Map<string, { colorKey: string; count: number }>();
  for (const r of thisMonthRecs) {
    for (const v of r.values) {
      const existing = valueCounts.get(v.name);
      if (existing) existing.count += 1;
      else valueCounts.set(v.name, { colorKey: v.colorKey, count: 1 });
    }
  }
  const valueTotal = [...valueCounts.values()].reduce((a, b) => a + b.count, 0) || 1;
  const valuesInAction = [...valueCounts.entries()]
    .map(([name, v]) => ({ name, colorKey: v.colorKey, count: v.count, pct: Math.round((v.count / valueTotal) * 100) }))
    .sort((a, b) => b.count - a.count);

  return {
    recognitionsThisMonth: thisMonthRecs.length,
    recognitionsTrend: trend(thisMonthRecs.length, lastMonthRecs.length),
    allTimeRecognitions,
    streakDays: computeStreak(streakRows.map((r) => r.createdAt), now),
    pointsThisMonth,
    pointsTrend: trend(pointsThisMonth, pointsLastMonth),
    peopleCelebrated,
    participationPct,
    rosterSize,
    goal: { target, current: thisMonthRecs.length, pct: goalPct, remaining: Math.max(0, target - thisMonthRecs.length) },
    notRecognized: Math.max(0, rosterSize - peopleCelebrated),
    topRecognizers: tallyLeaders(thisMonthRecs.map((r) => ({ id: r.giverId, person: r.giver }))),
    topRecipients: tallyLeaders(thisMonthRecs.map((r) => ({ id: r.recipientId, person: r.recipient }))),
    valuesInAction,
    mostLoved: mostLovedRaw ? toRecognitionView(mostLovedRaw as RecognitionWithRelations) : null
  };
}

// ---- Feed --------------------------------------------------------------------

export type FeedFilter = "all" | "week" | "month";

export async function getFeedRecognitions(filter: FeedFilter, take = 30): Promise<RecognitionView[]> {
  const now = new Date();
  let gte: Date | undefined;
  if (filter === "week") gte = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (filter === "month") gte = startOfMonth(now);

  const rows = await prisma.recognition.findMany({
    where: gte ? { createdAt: { gte } } : undefined,
    orderBy: { createdAt: "desc" },
    take,
    include: recognitionInclude
  });
  return (rows as RecognitionWithRelations[]).map(toRecognitionView);
}

// ---- Rewards -----------------------------------------------------------------

export async function getRewards(): Promise<RewardView[]> {
  const rewards = await prisma.reward.findMany({ orderBy: { pointCost: "asc" } });
  return rewards.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    pointCost: r.pointCost,
    icon: r.icon,
    available: r.available
  }));
}

export async function getNewHireBalance(newHireId: string): Promise<number | null> {
  const hire = await prisma.newHire.findUnique({ where: { id: newHireId }, select: { pointsBalance: true } });
  return hire?.pointsBalance ?? null;
}

// ---- Analytics ---------------------------------------------------------------

export type AnalyticsRange = "30" | "90" | "365";

export type AnalyticsData = {
  totalRecognitions: number;
  participationPct: number;
  avgPerPerson: number;
  pointsDistributed: number;
  recognitionsTrend: ReturnType<typeof trend>;
  pointsTrend: ReturnType<typeof trend>;
  byValue: { name: string; colorKey: string; count: number; pct: number }[];
  topRecipients: { name: string; department: string | null; initials: string; count: number }[];
  byDepartment: { department: string; count: number; pct: number; people: number }[];
};

export async function getAnalyticsData(range: AnalyticsRange): Promise<AnalyticsData> {
  const days = Number(range);
  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

  const [rosterSize, current, previous, values] = await Promise.all([
    prisma.newHire.count({ where: { stage: { in: ROSTER_STAGES } } }),
    prisma.recognition.findMany({
      where: { createdAt: { gte: since } },
      select: {
        pointsAwarded: true,
        giverId: true,
        recipientId: true,
        recipient: { select: { name: true, department: true, avatarInitials: true } },
        values: { select: { name: true, colorKey: true } }
      }
    }),
    prisma.recognition.findMany({
      where: { createdAt: { gte: prevSince, lt: since } },
      select: { pointsAwarded: true }
    }),
    getRecognitionValues()
  ]);

  const totalRecognitions = current.length;
  const pointsDistributed = current.reduce((sum, r) => sum + r.pointsAwarded, 0);
  const distinctGivers = new Set(current.map((r) => r.giverId)).size;
  const participationPct = rosterSize > 0 ? Math.round((distinctGivers / rosterSize) * 100) : 0;
  const avgPerPerson = rosterSize > 0 ? Math.round((totalRecognitions / rosterSize) * 10) / 10 : 0;

  // By value (a recognition tagged to N values counts once per value).
  const valueCounts = new Map<string, number>();
  for (const r of current) {
    for (const v of r.values) {
      valueCounts.set(v.name, (valueCounts.get(v.name) ?? 0) + 1);
    }
  }
  const valueTotal = [...valueCounts.values()].reduce((a, b) => a + b, 0) || 1;
  const byValue = values
    .map((v) => {
      const count = valueCounts.get(v.name) ?? 0;
      return { name: v.name, colorKey: v.colorKey, count, pct: Math.round((count / valueTotal) * 100) };
    })
    .sort((a, b) => b.count - a.count);

  // Top recipients.
  const recipientMap = new Map<string, { name: string; department: string | null; initials: string; count: number }>();
  for (const r of current) {
    const id = r.recipientId;
    const existing = recipientMap.get(id);
    if (existing) {
      existing.count += 1;
    } else {
      recipientMap.set(id, {
        name: r.recipient?.name ?? "Unknown",
        department: r.recipient?.department ?? null,
        initials: r.recipient?.avatarInitials ?? initialsFromName(r.recipient?.name ?? "?"),
        count: 1
      });
    }
  }
  const topRecipients = [...recipientMap.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  // Recognition equity by department (people = roster size per department).
  const rosterByDept = await prisma.newHire.groupBy({
    by: ["department"],
    where: { stage: { in: ROSTER_STAGES } },
    _count: true
  });
  const deptPeople = new Map<string, number>();
  for (const row of rosterByDept) {
    deptPeople.set(row.department ?? "Unassigned", row._count);
  }
  const deptCounts = new Map<string, number>();
  for (const r of current) {
    const dept = r.recipient?.department ?? "Unassigned";
    deptCounts.set(dept, (deptCounts.get(dept) ?? 0) + 1);
  }
  const deptTotal = totalRecognitions || 1;
  const byDepartment = [...deptPeople.entries()]
    .map(([department, people]) => {
      const count = deptCounts.get(department) ?? 0;
      return { department, count, pct: Math.round((count / deptTotal) * 100), people };
    })
    .sort((a, b) => b.count - a.count);

  return {
    totalRecognitions,
    participationPct,
    avgPerPerson,
    pointsDistributed,
    recognitionsTrend: trend(totalRecognitions, previous.length),
    pointsTrend: trend(pointsDistributed, previous.reduce((sum, r) => sum + r.pointsAwarded, 0)),
    byValue,
    topRecipients,
    byDepartment
  };
}
