import { prisma } from "@/lib/prisma";
import { CARD_ORDER_MIN_BATCH_MAX, DEFAULT_CARD_ORDER_MIN_BATCH } from "@/lib/business-cards/card";

// ---------------------------------------------------------------------------
// Where the minimum batch size is STORED. The number itself, its ceiling and the
// sentence the page says about it all live in card.ts — which has no imports, so
// the client bundle can have them. This file reaches for prisma, so it is server
// only: importing it from a "use client" component pulls pg (and therefore fs)
// into the browser bundle and the page 500s on Module not found: 'fs'.
//
// A row rather than a constant because she should be able to change it the day
// the printer changes their terms, without waiting for a deploy. No migration:
// WorkspaceSetting already exists and holds JSON.
// ---------------------------------------------------------------------------

const SCOPE = "business-cards";
const KEY = "order-settings";

export type CardOrderSettings = {
  /** Names on the next order before the batch is worth placing. */
  minBatch: number;
};

export const DEFAULT_CARD_ORDER_SETTINGS: CardOrderSettings = {
  minBatch: DEFAULT_CARD_ORDER_MIN_BATCH
};

// Anything unreadable falls back to the default rather than throwing: a bad row
// in a settings table must not take the Business cards page down with it.
function normalize(raw: unknown): CardOrderSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CARD_ORDER_SETTINGS };
  const value = (raw as { minBatch?: unknown }).minBatch;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > CARD_ORDER_MIN_BATCH_MAX) return { ...DEFAULT_CARD_ORDER_SETTINGS };
  return { minBatch: n };
}

export async function getCardOrderSettings(): Promise<CardOrderSettings> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return { ...DEFAULT_CARD_ORDER_SETTINGS };
  try {
    return normalize(JSON.parse(setting.valueJson));
  } catch {
    return { ...DEFAULT_CARD_ORDER_SETTINGS };
  }
}

export async function saveCardOrderSettings(input: unknown): Promise<CardOrderSettings> {
  const normalized = normalize(input);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(normalized) },
    update: { valueJson: JSON.stringify(normalized) }
  });
  return normalized;
}
