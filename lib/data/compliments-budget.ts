import { prisma } from "@/lib/prisma";
import { dollarsFromPoints } from "@/lib/compliments/constants";
import { REWARD_CATEGORY_LABELS, type RewardCategory } from "@/lib/compliments/constants";
import type { ComplimentsSettings } from "@/lib/compliments/settings";

const ROSTER_STAGES = ["ACTIVE", "POST_ONBOARD"];
const DAY = 24 * 60 * 60 * 1000;

export type CategoryCost = {
  category: string;
  label: string;
  points: number;
  dollars: number;
  count: number;
};

export type RewardCost = {
  id: string;
  name: string;
  category: string;
  pointCost: number;
  dollars: number;
  available: boolean;
  redeemedCount: number;
  pointsRedeemed: number;
  dollarsRedeemed: number;
};

export type MonthlyCost = { label: string; redeemedUsd: number; awardedUsd: number };

export type BudgetData = {
  pointsPerDollar: number;
  monthlyBudgetUsd: number;
  rosterSize: number;
  // Headline dollars
  realizedSpendUsd: number; // actually redeemed to date
  outstandingLiabilityUsd: number; // unredeemed balances still owed
  totalAwardedUsd: number; // total recognition value injected
  totalProgramValueUsd: number; // realized + outstanding
  // This / last month realized spend
  thisMonthSpendUsd: number;
  lastMonthSpendUsd: number;
  budgetUsedPct: number; // this month spend vs monthly budget
  budgetRemainingUsd: number;
  // Forward run-rate (90-day average)
  projectedMonthlyUsd: number;
  projectedAnnualUsd: number;
  projectedMonthlyAwardedUsd: number; // rate new liability accrues
  // Per-head
  liabilityPerPersonUsd: number;
  awardedPerPersonUsd: number;
  // Counts
  totalRedemptions: number;
  totalRecognitions: number;
  // Breakdowns
  byCategory: CategoryCost[];
  byReward: RewardCost[];
  monthly: MonthlyCost[];
};

function startOfMonth(d: Date, monthsBack = 0): Date {
  return new Date(d.getFullYear(), d.getMonth() - monthsBack, 1);
}

export async function getBudgetData(settings: ComplimentsSettings): Promise<BudgetData> {
  const ratio = settings.pointsPerDollar;
  const usd = (points: number) => dollarsFromPoints(points, ratio);
  const now = new Date();
  const thisMonth = startOfMonth(now);
  const lastMonth = startOfMonth(now, 1);
  const since90 = new Date(now.getTime() - 90 * DAY);

  const [redemptions, recognitions, liabilityAgg, rosterSize, rewards] = await Promise.all([
    prisma.redemption.findMany({
      select: { pointsSpent: true, createdAt: true, rewardId: true, reward: { select: { name: true, category: true } } }
    }),
    prisma.recognition.findMany({ select: { pointsAwarded: true, createdAt: true } }),
    prisma.newHire.aggregate({ where: { stage: { in: ROSTER_STAGES } }, _sum: { pointsBalance: true } }),
    prisma.newHire.count({ where: { stage: { in: ROSTER_STAGES } } }),
    prisma.reward.findMany({ orderBy: { pointCost: "desc" }, include: { _count: { select: { redemptions: true } } } })
  ]);

  const realizedPoints = redemptions.reduce((s, r) => s + r.pointsSpent, 0);
  const liabilityPoints = liabilityAgg._sum.pointsBalance ?? 0;
  const awardedPoints = recognitions.reduce((s, r) => s + r.pointsAwarded, 0);

  const thisMonthSpend = redemptions
    .filter((r) => r.createdAt >= thisMonth)
    .reduce((s, r) => s + r.pointsSpent, 0);
  const lastMonthSpend = redemptions
    .filter((r) => r.createdAt >= lastMonth && r.createdAt < thisMonth)
    .reduce((s, r) => s + r.pointsSpent, 0);

  // 90-day run rate.
  const redeemed90 = redemptions.filter((r) => r.createdAt >= since90).reduce((s, r) => s + r.pointsSpent, 0);
  const awarded90 = recognitions.filter((r) => r.createdAt >= since90).reduce((s, r) => s + r.pointsAwarded, 0);
  const dailyRedeemUsd = usd(redeemed90) / 90;
  const dailyAwardUsd = usd(awarded90) / 90;

  // Per category (realized redemptions).
  const catMap = new Map<string, { points: number; count: number }>();
  for (const r of redemptions) {
    const cat = r.reward?.category ?? "OTHER";
    const e = catMap.get(cat) ?? { points: 0, count: 0 };
    e.points += r.pointsSpent;
    e.count += 1;
    catMap.set(cat, e);
  }
  const byCategory: CategoryCost[] = [...catMap.entries()]
    .map(([category, v]) => ({
      category,
      label: REWARD_CATEGORY_LABELS[category as RewardCategory] ?? category,
      points: v.points,
      dollars: usd(v.points),
      count: v.count
    }))
    .sort((a, b) => b.dollars - a.dollars);

  // Per reward (catalog with realized cost).
  const rewardPoints = new Map<string, number>();
  for (const r of redemptions) {
    rewardPoints.set(r.rewardId, (rewardPoints.get(r.rewardId) ?? 0) + r.pointsSpent);
  }
  const byReward: RewardCost[] = rewards.map((rw) => {
    const pointsRedeemed = rewardPoints.get(rw.id) ?? 0;
    return {
      id: rw.id,
      name: rw.name,
      category: rw.category,
      pointCost: rw.pointCost,
      dollars: usd(rw.pointCost),
      available: rw.available,
      redeemedCount: rw._count.redemptions,
      pointsRedeemed,
      dollarsRedeemed: usd(pointsRedeemed)
    };
  });

  // Last 6 months of redeemed vs awarded value.
  const monthly: MonthlyCost[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = startOfMonth(now, i);
    const end = startOfMonth(now, i - 1);
    const redeemed = redemptions
      .filter((r) => r.createdAt >= start && r.createdAt < end)
      .reduce((s, r) => s + r.pointsSpent, 0);
    const awarded = recognitions
      .filter((r) => r.createdAt >= start && r.createdAt < end)
      .reduce((s, r) => s + r.pointsAwarded, 0);
    monthly.push({
      label: start.toLocaleDateString(undefined, { month: "short" }),
      redeemedUsd: usd(redeemed),
      awardedUsd: usd(awarded)
    });
  }

  const realizedSpendUsd = usd(realizedPoints);
  const outstandingLiabilityUsd = usd(liabilityPoints);
  const thisMonthSpendUsd = usd(thisMonthSpend);

  return {
    pointsPerDollar: ratio,
    monthlyBudgetUsd: settings.monthlyBudgetUsd,
    rosterSize,
    realizedSpendUsd,
    outstandingLiabilityUsd,
    totalAwardedUsd: usd(awardedPoints),
    totalProgramValueUsd: realizedSpendUsd + outstandingLiabilityUsd,
    thisMonthSpendUsd,
    lastMonthSpendUsd: usd(lastMonthSpend),
    budgetUsedPct:
      settings.monthlyBudgetUsd > 0 ? Math.round((thisMonthSpendUsd / settings.monthlyBudgetUsd) * 100) : 0,
    budgetRemainingUsd: Math.max(0, settings.monthlyBudgetUsd - thisMonthSpendUsd),
    projectedMonthlyUsd: dailyRedeemUsd * 30,
    projectedAnnualUsd: dailyRedeemUsd * 365,
    projectedMonthlyAwardedUsd: dailyAwardUsd * 30,
    liabilityPerPersonUsd: rosterSize > 0 ? outstandingLiabilityUsd / rosterSize : 0,
    awardedPerPersonUsd: rosterSize > 0 ? usd(awardedPoints) / rosterSize : 0,
    totalRedemptions: redemptions.length,
    totalRecognitions: recognitions.length,
    byCategory,
    byReward,
    monthly
  };
}
