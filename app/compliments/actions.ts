"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/auth";
import { CURRENT_EMPLOYEE_WHERE } from "@/lib/data/current-employee";
import { RecognitionStrength } from "@/lib/compliments/constants";
import { getComplimentsSettings } from "@/lib/compliments/settings";

const strengthValues = Object.values(RecognitionStrength) as [string, ...string[]];

const createRecognitionSchema = z
  .object({
    giverId: z.string().min(1, "Choose who is giving the recognition."),
    recipientId: z.string().min(1, "Choose who is being recognized."),
    message: z.string().trim().min(5, "Add a short message about the impact.").max(1000),
    valueIds: z.array(z.string().min(1)).min(1, "Select at least one value."),
    strength: z.enum(strengthValues)
  })
  .refine((data) => data.giverId !== data.recipientId, {
    message: "Pick two different people — you can't recognize yourself.",
    path: ["recipientId"]
  });

export type ActionResult = { ok: boolean; error?: string };

export async function createRecognition(input: unknown): Promise<ActionResult> {
  const parsed = createRecognitionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid recognition." };
  }
  const { giverId, recipientId, message, valueIds, strength } = parsed.data;

  // Both people must be CURRENT EMPLOYEES. This used to require stage IN
  // (ACTIVE, POST_ONBOARD), which is an onboarding stage rather than an
  // employment check, so a compliment addressed to any of the 145 employees
  // past onboarding was rejected at send time.
  const people = await prisma.newHire.findMany({
    where: { id: { in: [giverId, recipientId] }, ...CURRENT_EMPLOYEE_WHERE },
    select: { id: true }
  });
  if (people.length !== 2) {
    return { ok: false, error: "Both people must be current employees." };
  }

  const settings = await getComplimentsSettings();
  const points = settings.strengthPoints[strength as keyof typeof settings.strengthPoints];

  await prisma.$transaction([
    prisma.recognition.create({
      data: {
        giverId,
        recipientId,
        message,
        strength,
        pointsAwarded: points,
        values: { connect: valueIds.map((id) => ({ id })) }
      }
    }),
    prisma.newHire.update({
      where: { id: recipientId },
      data: { pointsBalance: { increment: points } }
    })
  ]);

  revalidatePath("/compliments");
  revalidatePath("/compliments/feed");
  revalidatePath("/compliments/analytics");
  return { ok: true };
}

const redeemSchema = z.object({
  newHireId: z.string().min(1),
  rewardId: z.string().min(1)
});

export async function redeemReward(input: unknown): Promise<ActionResult> {
  const parsed = redeemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid redemption." };
  }
  const { newHireId, rewardId } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const [hire, reward] = await Promise.all([
        tx.newHire.findUnique({ where: { id: newHireId }, select: { pointsBalance: true } }),
        tx.reward.findUnique({ where: { id: rewardId }, select: { pointCost: true, available: true } })
      ]);
      if (!hire) throw new Error("That person is no longer on the roster.");
      if (!reward || !reward.available) throw new Error("That reward isn't available.");
      if (hire.pointsBalance < reward.pointCost) throw new Error("Not enough points for that reward.");

      await tx.redemption.create({ data: { newHireId, rewardId, pointsSpent: reward.pointCost } });
      await tx.newHire.update({
        where: { id: newHireId },
        data: { pointsBalance: { decrement: reward.pointCost } }
      });
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Redemption failed." };
  }

  revalidatePath("/compliments/rewards");
  return { ok: true };
}

export type LikeResult = { ok: true; liked: boolean; count: number } | { ok: false; error: string };

export async function toggleLike(recognitionId: string): Promise<LikeResult> {
  if (!recognitionId) return { ok: false, error: "Missing recognition." };

  // The actor is the logged-in operator; falls back to a shared id when auth is off.
  const session = await getServerSession(authOptions).catch(() => null);
  const actorId = session?.user?.id ?? "operator";

  const existing = await prisma.recognitionLike.findUnique({
    where: { recognitionId_actorId: { recognitionId, actorId } }
  });

  let liked: boolean;
  if (existing) {
    await prisma.recognitionLike.delete({ where: { id: existing.id } });
    liked = false;
  } else {
    await prisma.recognitionLike.create({ data: { recognitionId, actorId } });
    liked = true;
  }

  const count = await prisma.recognitionLike.count({ where: { recognitionId } });
  revalidatePath("/compliments/feed");
  return { ok: true, liked, count };
}
