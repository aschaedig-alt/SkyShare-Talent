import { prisma } from "@/lib/prisma";

// Which checklist tasks send an email, and which Front template each one uses.
//
// WHY THIS IS A SETTING AND NOT CODE. Two checklist items already send mail —
// "Start Your Onboarding Journey" and the contacts link — and each needed a
// hand-written module, a template id pasted into it, a bespoke button and a
// deploy. That is the wrong shape for a checklist whose steps she adds herself:
// a task she creates on Tuesday cannot wait for a release to be able to send the
// email that IS the task. So the wiring is data, edited from the same Manage
// tasks panel the task was created in.
//
// The two bespoke sends are deliberately NOT migrated here. They do more than
// fill a template — the contacts one injects a freshly-read share link, and both
// carry their own send records and history — so they keep their own buttons, and
// this config skips any task that already has one. See EXCLUDED below.

const SCOPE = "workspace";
const KEY = "onboarding-task-emails";

/**
 * Which address the mail goes to.
 *
 *   personal  personal email, falling back to the SkyShare one
 *   company   SkyShare email, falling back to the personal one
 *   custom    addresses typed in by hand, the same for every hire
 *
 * The first two fall back, and the preview always says which of them it actually
 * resolved to, because the right answer depends on WHEN in the checklist the task
 * sits: before "Create a Company Gmail" there is no company address to send to,
 * and after it there usually is.
 *
 * CUSTOM EXISTS BECAUSE SOME STEPS DO NOT EMAIL THE HIRE AT ALL (asked for
 * 2026-09-02). "2. PRD Request to ITS" is addressed to IT, not the pilot, so with
 * only the two options above the mail would have gone to the wrong person - the
 * one thing worse than not being able to send it. A custom list never falls back:
 * an internal address that is wrong should fail loudly, not quietly reroute to a
 * new hire.
 */
export type TaskEmailAudience = "personal" | "company" | "custom";

export type TaskEmailConfig = {
  /** Front message template id (rsp_...). */
  templateId: string;
  /** Remembered so the panel and the preview can name the template without a
   *  round trip, and so a template deleted in Front still says what it WAS. */
  templateName: string;
  audience: TaskEmailAudience;
  /** Only read when audience is "custom" - the addresses she typed in. Kept on
   *  the config when she switches away, so flipping back does not lose them. */
  to: string[];
  cc: string[];
  /** Prepend "Hi <first name>," in the template's own font. Off for templates
   *  that already open with their own greeting. */
  greeting: boolean;
};

export type TaskEmailMap = Record<string, TaskEmailConfig>;

/** Tasks whose send is hand-built and must not be re-wired from here. */
export const EXCLUDED_TASK_KEYS = new Set(["onboarding_journey", "contacts_link_sent"]);

function parseAudience(v: unknown): TaskEmailAudience {
  return v === "company" ? "company" : v === "custom" ? "custom" : "personal";
}

function parseConfig(v: unknown): TaskEmailConfig | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.templateId !== "string" || !o.templateId) return null;
  return {
    templateId: o.templateId,
    templateName: typeof o.templateName === "string" ? o.templateName : o.templateId,
    audience: parseAudience(o.audience),
    to: parseAddressList(Array.isArray(o.to) ? o.to.filter((x): x is string => typeof x === "string") : []),
    cc: Array.isArray(o.cc) ? o.cc.filter((x): x is string => typeof x === "string") : [],
    greeting: o.greeting !== false
  };
}

export async function getTaskEmailMap(): Promise<TaskEmailMap> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as Record<string, unknown>;
    const out: TaskEmailMap = {};
    for (const [taskKey, value] of Object.entries(parsed)) {
      if (EXCLUDED_TASK_KEYS.has(taskKey)) continue;
      const cfg = parseConfig(value);
      if (cfg) out[taskKey] = cfg;
    }
    return out;
  } catch {
    return {};
  }
}

export async function getTaskEmailConfig(taskKey: string): Promise<TaskEmailConfig | null> {
  return (await getTaskEmailMap())[taskKey] ?? null;
}

async function writeMap(map: TaskEmailMap): Promise<void> {
  const value = JSON.stringify(map);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Turn what was typed into a recipient box into addresses. Anything that is not
 *  an address is dropped rather than sent, because a malformed recipient is
 *  rejected by Front at send time — which would fail the whole send for one typo.
 *
 *  Used for BOTH the cc list and the custom To list. Dropping silently is the
 *  right answer for a cc and the wrong one for a To, where losing the only
 *  address would leave nothing to send to — so setTaskEmail checks the To list is
 *  non-empty AFTER this runs and refuses to save otherwise, which turns a typo
 *  into an error at setup time rather than a surprise at send time. */
export function parseAddressList(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : input.split(/[,;\s]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of parts) {
    const addr = raw.trim().toLowerCase();
    if (!addr || !EMAIL.test(addr) || seen.has(addr)) continue;
    seen.add(addr);
    out.push(addr);
  }
  return out.slice(0, 10);
}

export async function setTaskEmail(taskKey: string, config: Omit<TaskEmailConfig, "templateName"> & { templateName?: string }): Promise<void> {
  if (EXCLUDED_TASK_KEYS.has(taskKey)) {
    throw new Error("That task already sends its own email and is wired up in code.");
  }
  if (!config.templateId.trim()) throw new Error("Choose a Front template.");
  const audience = parseAudience(config.audience);
  const to = parseAddressList(config.to ?? []);
  // Refused rather than saved empty: a custom send has no fallback by design, so
  // saving it with nothing in the To box would produce a Send button that can only
  // ever fail, and it would fail in front of whoever pressed it rather than here.
  if (audience === "custom" && to.length === 0) {
    throw new Error("Type at least one email address to send to, or choose the hire personal or SkyShare address instead.");
  }
  const map = await getTaskEmailMap();
  map[taskKey] = {
    templateId: config.templateId.trim(),
    templateName: (config.templateName ?? config.templateId).trim(),
    audience,
    to,
    cc: parseAddressList(config.cc),
    greeting: config.greeting !== false
  };
  await writeMap(map);
}

export async function clearTaskEmail(taskKey: string): Promise<void> {
  const map = await getTaskEmailMap();
  delete map[taskKey];
  await writeMap(map);
}
