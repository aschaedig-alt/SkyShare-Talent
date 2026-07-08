import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, requireApiUser } from "@/lib/auth/route-auth";

type RouteContext = { params: Promise<{ id: string }> };

const strOrNull = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

const select = { id: true, label: true, title: true, skyops: true, mobile: true, email: true, web: true, sortOrder: true } as const;

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await context.params;
  const variants = await prisma.businessCardVariant.findMany({ where: { newHireId: id }, orderBy: { sortOrder: "asc" }, select });
  return NextResponse.json({ variants });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const label = strOrNull(body.label);
  if (!label) return NextResponse.json({ message: "A card label is required (e.g. \"Recruiting\")." }, { status: 400 });

  const count = await prisma.businessCardVariant.count({ where: { newHireId: id } });
  const variant = await prisma.businessCardVariant.create({
    data: {
      newHireId: id,
      label,
      title: strOrNull(body.title),
      skyops: strOrNull(body.skyops),
      mobile: strOrNull(body.mobile),
      email: strOrNull(body.email),
      web: strOrNull(body.web),
      sortOrder: count
    },
    select
  });
  return NextResponse.json({ variant });
}
