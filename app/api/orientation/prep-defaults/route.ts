import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getPrepDefaults, resetPrepDefaults, savePrepDefaults } from "@/lib/orientation/prep-defaults";

export const dynamic = "force-dynamic";

/** The standing prep checklist new sessions start from. */
export async function GET() {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getPrepDefaults());
}

/** Promote a list to the standing default, or reset back to the built-in one.
    Existing sessions are never touched — their checklist is a record of that day. */
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { tasks?: unknown; reset?: boolean };
    if (body?.reset === true) {
      const tasks = await resetPrepDefaults();
      return NextResponse.json({ ok: true, tasks, customized: false });
    }
    if (!Array.isArray(body?.tasks) || body.tasks.length === 0) {
      return NextResponse.json({ message: "A checklist with at least one task is required." }, { status: 400 });
    }
    const tasks = await savePrepDefaults(body.tasks);
    return NextResponse.json({ ok: true, tasks, customized: true });
  } catch (error) {
    console.error("Save prep defaults error:", error);
    return NextResponse.json({ message: "Unable to save the default checklist." }, { status: 500 });
  }
}
