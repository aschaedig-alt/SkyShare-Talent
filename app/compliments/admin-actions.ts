"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isComplimentsAdmin, saveComplimentsSettings } from "@/lib/compliments/settings";
import { RewardCategory, REWARD_ICON_NAMES } from "@/lib/compliments/constants";

export type AdminResult = { ok: boolean; error?: string };

const categoryValues = Object.values(RewardCategory) as [string, ...string[]];
const iconValues = [...REWARD_ICON_NAMES] as [string, ...string[]];

const createRewardSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(80),
  description: z.string().trim().max(200).optional(),
  category: z.enum(categoryValues),
  pointCost: z.coerce.number().int("Whole points only.").min(1, "Point cost must be at least 1.").max(1_000_000),
  icon: z.enum(iconValues),
  available: z.boolean()
});

const updateRewardSchema = createRewardSchema.extend({ id: z.string().min(1) });

// zod's inference for this coerced object widens fields to optional in TS even
// though they're validated as required at runtime — pin the validated shape.
type RewardData = {
  name: string;
  description?: string;
  category: string;
  pointCost: number;
  icon: string;
  available: boolean;
};

function rewardCreateData(d: RewardData) {
  return {
    name: d.name,
    description: d.description ? d.description : null,
    category: d.category,
    pointCost: d.pointCost,
    icon: d.icon,
    available: d.available
  };
}

async function guardAdmin(): Promise<AdminResult | null> {
  if (!(await isComplimentsAdmin())) {
    return { ok: false, error: "Only admins can change the rewards catalog or settings." };
  }
  return null;
}

function revalidateAdmin() {
  revalidatePath("/compliments/budget");
  revalidatePath("/compliments/rewards");
  revalidatePath("/compliments/analytics");
}

export async function createReward(input: unknown): Promise<AdminResult> {
  const denied = await guardAdmin();
  if (denied) return denied;

  const parsed = createRewardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid reward." };

  await prisma.reward.create({ data: rewardCreateData(parsed.data as RewardData) });
  revalidateAdmin();
  return { ok: true };
}

export async function updateReward(input: unknown): Promise<AdminResult> {
  const denied = await guardAdmin();
  if (denied) return denied;

  const parsed = updateRewardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid reward." };
  const d = parsed.data as RewardData & { id: string };

  await prisma.reward.update({ where: { id: d.id }, data: rewardCreateData(d) });
  revalidateAdmin();
  return { ok: true };
}

export async function deleteReward(id: string): Promise<AdminResult> {
  const denied = await guardAdmin();
  if (denied) return denied;
  if (!id) return { ok: false, error: "Missing reward." };

  // Preserve budget history: never cascade-delete a reward that has redemptions.
  const redemptions = await prisma.redemption.count({ where: { rewardId: id } });
  if (redemptions > 0) {
    return {
      ok: false,
      error: "This reward has redemption history. Mark it unavailable instead of deleting it."
    };
  }

  await prisma.reward.delete({ where: { id } });
  revalidateAdmin();
  return { ok: true };
}

const settingsSchema = z.object({
  pointsPerDollar: z.coerce.number().min(1, "Must be at least 1 point per dollar.").max(100000),
  monthlyBudgetUsd: z.coerce.number().min(0).max(10_000_000),
  strengthPoints: z.object({
    GOOD: z.coerce.number().int().min(0).max(100000),
    GREAT: z.coerce.number().int().min(0).max(100000),
    AMAZING: z.coerce.number().int().min(0).max(100000)
  })
});

export async function updateComplimentsSettings(input: unknown): Promise<AdminResult> {
  const denied = await guardAdmin();
  if (denied) return denied;

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };

  await saveComplimentsSettings(parsed.data);
  revalidateAdmin();
  revalidatePath("/compliments");
  revalidatePath("/compliments/give");
  return { ok: true };
}
