import { prisma } from "@/lib/prisma";
import { DEFAULT_EMAIL_TEMPLATES, type EmailTemplateDef } from "@/lib/orientation/defaults";

const SCOPE = "workspace";
const KEY = "orientation-email-templates";

function makeKey(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
  const rand = (globalThis as { crypto?: Crypto }).crypto?.randomUUID().slice(0, 6) ?? Math.floor(Math.random() * 1e6).toString(36);
  return `tpl_${slug || "email"}_${rand}`;
}

async function read(): Promise<EmailTemplateDef[] | null> {
  const s = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!s?.valueJson) return null;
  try {
    const p = JSON.parse(s.valueJson) as { items?: EmailTemplateDef[] };
    return Array.isArray(p.items) ? p.items.filter((t) => t && t.key && typeof t.name === "string") : null;
  } catch {
    return null;
  }
}

async function write(items: EmailTemplateDef[]) {
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify({ items }) },
    update: { valueJson: JSON.stringify({ items }) }
  });
}

async function materialize(): Promise<EmailTemplateDef[]> {
  const stored = await read();
  if (stored) return stored;
  const seed = DEFAULT_EMAIL_TEMPLATES.map((t) => ({ ...t }));
  await write(seed);
  return seed;
}

export async function getEmailTemplates(): Promise<EmailTemplateDef[]> {
  return (await read()) ?? DEFAULT_EMAIL_TEMPLATES.map((t) => ({ ...t }));
}

export async function addEmailTemplate(name: string, subject: string, body: string): Promise<EmailTemplateDef[]> {
  const n = name.trim().slice(0, 80);
  if (!n) throw new Error("Template name is required.");
  const items = await materialize();
  items.push({ key: makeKey(n), name: n, subject: subject.trim().slice(0, 200), body: body.slice(0, 8000) });
  await write(items);
  return items;
}

export async function editEmailTemplate(key: string, patch: Partial<Pick<EmailTemplateDef, "name" | "subject" | "body">>): Promise<EmailTemplateDef[]> {
  const items = await materialize();
  const t = items.find((x) => x.key === key);
  if (!t) throw new Error("Template not found.");
  if (patch.name !== undefined) t.name = patch.name.trim().slice(0, 80) || t.name;
  if (patch.subject !== undefined) t.subject = patch.subject.trim().slice(0, 200);
  if (patch.body !== undefined) t.body = patch.body.slice(0, 8000);
  await write(items);
  return items;
}

export async function removeEmailTemplate(key: string): Promise<EmailTemplateDef[]> {
  const items = await materialize();
  await write(items.filter((x) => x.key !== key));
  return getEmailTemplates();
}
