import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

// Permanently delete new hires (and their cascading onboarding data). Destructive
// and irreversible — the UI gates this behind an explicit confirmation. Separate
// from the bulk-update route so a delete can never be triggered by an update path.
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
    if (ids.length === 0) {
      return NextResponse.json({ message: "Select at least one person." }, { status: 400 });
    }
    if (ids.length > 200) {
      return NextResponse.json({ message: "Too many at once — select 200 or fewer." }, { status: 400 });
    }

    const result = await prisma.newHire.deleteMany({ where: { id: { in: ids } } });
    return NextResponse.json({ ok: true, count: result.count });
  } catch (error) {
    console.error("New hire bulk delete error:", error);
    return NextResponse.json(
      { message: "Unable to delete. Someone selected may have linked records (e.g. recognition) — remove those first." },
      { status: 500 }
    );
  }
}
