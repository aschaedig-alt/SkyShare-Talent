import { prisma } from "@/lib/prisma";

// Who gets cc'd on orientation email.
//
// This list started life as red text inside the Front template ("cc: (each new
// employees supervisor), HR hrotasks@, Morgan, Ricky, Hannah, Kevin, Aimee"),
// which meant changing it required editing HTML in a Front template — fragile,
// and people change roles far more often than the email body changes. So it
// lives here as an editable setting instead.
//
// The hire's own SUPERVISOR is deliberately NOT in this list: that address comes
// from the hire's record at send time, per person.

const SCOPE = "orientation";
const KEY = "email-cc";

/** The list as it stood in the Front template — the fallback until it's edited. */
const SEED_CC = [
  "hrotasks@skyshare.com",
  "mlangholf@skyshare.com",
  "rlee@skyshare.com",
  "hbyers@skyshare.com",
  "ksherman@skyshare.com",
  "aschaedig@skyshare.com"
];

export type OrientationCc = {
  addresses: string[];
  /** False when nothing has been customised and we're serving the seed list. */
  customized: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Coerce stored/posted input into a clean, de-duplicated address list. */
export function normalizeCcList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const e = raw.trim().toLowerCase();
    if (!e || !EMAIL_RE.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/** Addresses cc'd on every orientation email (excluding the supervisor). */
export async function getOrientationCc(): Promise<OrientationCc> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return { addresses: [...SEED_CC], customized: false };
  try {
    const parsed = normalizeCcList(JSON.parse(row.valueJson));
    // An empty saved list is a legitimate choice (cc nobody), so honour it.
    return { addresses: parsed, customized: true };
  } catch {
    return { addresses: [...SEED_CC], customized: false };
  }
}

/** Replace the cc list. Invalid entries are dropped rather than saved. */
export async function saveOrientationCc(input: unknown): Promise<string[]> {
  const addresses = normalizeCcList(input);
  const value = JSON.stringify(addresses);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
  return addresses;
}

/** Drop the customised list, going back to the addresses from the template. */
export async function resetOrientationCc(): Promise<string[]> {
  await prisma.workspaceSetting.deleteMany({ where: { scope: SCOPE, key: KEY } });
  return [...SEED_CC];
}
