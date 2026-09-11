"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { hasPermission, isRoleName } from "@/lib/auth/roles";
import { CARD_ORDER_MIN_BATCH_MAX } from "@/lib/business-cards/card";
import { saveCardOrderSettings } from "@/lib/business-cards/order-batch";

export type CardOrderSettingsResult = { ok: boolean; error?: string; minBatch?: number };

// Same gate the rest of the People module uses for writes. Local dev bypasses
// auth, so this is permissive there and role-checked in production.
async function canEditPeople(): Promise<boolean> {
  if (!isAuthRequired()) return true;
  const session = await getServerSession(authOptions).catch(() => null);
  const role = session?.user?.role;
  return isRoleName(role) && hasPermission(role, "candidates:write");
}

/**
 * Change how many names she wants on an order before it is worth placing.
 *
 * This only moves a number the page displays. It does not gate anything: no card
 * status changes, no order is created, and nothing refuses to save because the
 * batch is short.
 */
export async function updateCardOrderMinimum(minBatch: number): Promise<CardOrderSettingsResult> {
  if (!(await canEditPeople())) return { ok: false, error: "You do not have permission to change this." };
  if (!Number.isInteger(minBatch) || minBatch < 1 || minBatch > CARD_ORDER_MIN_BATCH_MAX) {
    return { ok: false, error: `Enter a whole number between 1 and ${CARD_ORDER_MIN_BATCH_MAX}.` };
  }
  const saved = await saveCardOrderSettings({ minBatch });
  revalidatePath("/business-cards");
  return { ok: true, minBatch: saved.minBatch };
}
