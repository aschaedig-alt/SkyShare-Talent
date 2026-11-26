import { prisma } from "@/lib/prisma";
import type { BaselineNumbers } from "@/lib/quality-of-hire/baseline";

// The FROZEN baseline. Until an admin freezes it, the baseline page shows live numbers,
// which move every time HR makes a call or a check-in comes in. Freezing keeps a copy
// of the numbers as they stood, with who froze it and when, so the Dec 17 readout and
// every later quarter compare against the same figures. Same shape as the other
// Quality of Hire settings: one WorkspaceSetting, no schema change, no person touched.
//
// Unfreezing does not throw the copy away: it moves to `earlier`, so a mistaken freeze
// or unfreeze can be seen and redone. Nothing else reads `earlier`.

const SCOPE = "workspace";
const KEY = "qoh-baseline";

export type FrozenBaseline = { numbers: BaselineNumbers; frozenAt: string; frozenBy: string | null };
type Stored = { current: FrozenBaseline | null; earlier: Array<FrozenBaseline & { unfrozenAt: string; unfrozenBy: string | null }> };

async function read(): Promise<Stored> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return { current: null, earlier: [] };
  try {
    const parsed = JSON.parse(row.valueJson) as Partial<Stored>;
    return { current: parsed.current ?? null, earlier: Array.isArray(parsed.earlier) ? parsed.earlier : [] };
  } catch {
    return { current: null, earlier: [] };
  }
}

async function write(value: Stored): Promise<void> {
  const valueJson = JSON.stringify(value);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson },
    update: { valueJson }
  });
}

export async function getFrozenBaseline(): Promise<FrozenBaseline | null> {
  return (await read()).current;
}

/** Freeze these numbers. Refused if a baseline is already frozen: unfreeze first. */
export async function freezeBaseline(numbers: BaselineNumbers, by: string | null): Promise<FrozenBaseline | null> {
  const s = await read();
  if (s.current) return null;
  const current: FrozenBaseline = { numbers, frozenAt: new Date().toISOString(), frozenBy: by };
  await write({ current, earlier: s.earlier });
  return current;
}

/** Back to live numbers; the frozen copy is kept in `earlier`. */
export async function unfreezeBaseline(by: string | null): Promise<boolean> {
  const s = await read();
  if (!s.current) return false;
  await write({ current: null, earlier: [...s.earlier, { ...s.current, unfrozenAt: new Date().toISOString(), unfrozenBy: by }] });
  return true;
}
