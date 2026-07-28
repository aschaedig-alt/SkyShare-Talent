import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getReminderStatus, setReminderArmed } from "@/lib/orientation/reminder";

export const dynamic = "force-dynamic";

// Arm or disarm the automatic reminder for ONE session.
//
// Per-session on purpose: this is the only thing in the app that emails a real new
// hire unattended, so it is opted into one session at a time rather than being a
// global setting somebody inherits without knowing.

type Ctx = { params: Promise<{ id: string }> };

async function statusFor(id: string) {
  const session = await prisma.orientationSession.findUnique({ where: { id }, select: { date: true } });
  if (!session) return null;
  return getReminderStatus(id, session.date);
}

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const status = await statusFor(id);
  if (!status) return NextResponse.json({ message: "Session not found." }, { status: 404 });
  return NextResponse.json(status);
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let armed: unknown;
  try {
    ({ armed } = (await request.json()) as { armed?: unknown });
  } catch {
    return NextResponse.json({ message: "Expected { armed: boolean }." }, { status: 400 });
  }
  if (typeof armed !== "boolean") {
    return NextResponse.json({ message: "Expected { armed: boolean }." }, { status: 400 });
  }

  const before = await statusFor(id);
  if (!before) return NextResponse.json({ message: "Session not found." }, { status: 404 });

  await setReminderArmed(id, armed);
  return NextResponse.json(await statusFor(id));
}
