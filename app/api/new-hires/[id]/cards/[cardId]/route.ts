import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = { params: Promise<{ id: string; cardId: string }> };

const strOrNull = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

const select = { id: true, label: true, title: true, skyops: true, mobile: true, email: true, web: true, sortOrder: true } as const;

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id, cardId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const data: Record<string, string | null> = {};
  for (const field of ["title", "skyops", "mobile", "email", "web"]) {
    if (field in body) data[field] = strOrNull(body[field]);
  }
  if ("label" in body) {
    const label = strOrNull(body.label);
    if (!label) return NextResponse.json({ message: "A card label is required." }, { status: 400 });
    data.label = label;
  }

  const variant = await prisma.businessCardVariant.update({ where: { id: cardId, newHireId: id }, data, select });
  return NextResponse.json({ variant });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id, cardId } = await context.params;
  await prisma.businessCardVariant.deleteMany({ where: { id: cardId, newHireId: id } });
  return NextResponse.json({ ok: true });
}
