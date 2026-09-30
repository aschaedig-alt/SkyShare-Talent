import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { canWriteModule } from "@/lib/auth/module-write-access";
import { logActivity } from "@/lib/activity/logger";
import { sourceKey } from "@/lib/sources/normalize";

// Reports > Sources: give a spelling its tidy name, or fold one tidy name into
// another. The spellings on applications and candidates are never touched - only
// the SourceAlias list that names them - so any change here is undone by making
// the opposite change, and every change is logged (SOURCE_NAME_CHANGED).
//
//   POST { spelling, name }        this spelling (and every variant sharing its key) means `name`
//   POST { rename: { from, to } }  every spelling named `from` is now named `to`

type Body = { spelling?: unknown; name?: unknown; rename?: { from?: unknown; to?: unknown } };

const MAX = 60;
const tidy = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  if (!(await canWriteModule(auth.user, "reports", "edit"))) {
    return NextResponse.json({ message: "You do not have permission to change source names." }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as Body;
  const who = auth.user.email ?? auth.user.name ?? "unknown";

  if (body.rename) {
    const from = tidy(body.rename.from);
    const to = tidy(body.rename.to);
    if (!from || !to) return NextResponse.json({ message: "Say which name to fold, and into which." }, { status: 400 });
    if (to.length > MAX) return NextResponse.json({ message: `A source name is at most ${MAX} characters.` }, { status: 400 });
    if (from === to) return NextResponse.json({ ok: true, changed: 0 });
    const res = await prisma.sourceAlias.updateMany({ where: { canonical: from }, data: { canonical: to, updatedBy: who } });
    await logActivity({
      userId: auth.user.id ?? undefined,
      userEmail: auth.user.email ?? undefined,
      activityType: "SOURCE_NAME_CHANGED",
      description: `Source "${from}" folded into "${to}" (${res.count} spelling${res.count === 1 ? "" : "s"})`,
      entityType: "SourceAlias",
      entityId: from,
      metadata: { from, to, spellings: res.count }
    });
    return NextResponse.json({ ok: true, changed: res.count });
  }

  const spelling = tidy(body.spelling);
  const name = tidy(body.name);
  const key = sourceKey(spelling);
  if (!key) return NextResponse.json({ message: "Which spelling?" }, { status: 400 });
  if (!name) return NextResponse.json({ message: "Give it a name." }, { status: 400 });
  if (name.length > MAX) return NextResponse.json({ message: `A source name is at most ${MAX} characters.` }, { status: 400 });

  const before = await prisma.sourceAlias.findUnique({ where: { key }, select: { canonical: true } });
  if (before?.canonical === name) return NextResponse.json({ ok: true, changed: 0 });
  await prisma.sourceAlias.upsert({ where: { key }, create: { key, canonical: name, updatedBy: who }, update: { canonical: name, updatedBy: who } });
  await logActivity({
    userId: auth.user.id ?? undefined,
    userEmail: auth.user.email ?? undefined,
    activityType: "SOURCE_NAME_CHANGED",
    description: before ? `Source spelling "${spelling}" moved from "${before.canonical}" to "${name}"` : `Source spelling "${spelling}" named "${name}"`,
    entityType: "SourceAlias",
    entityId: key,
    metadata: { spelling, key, from: before?.canonical ?? null, to: name }
  });
  return NextResponse.json({ ok: true, changed: 1 });
}
