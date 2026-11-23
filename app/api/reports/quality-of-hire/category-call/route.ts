import { NextResponse } from "next/server";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { periodKey } from "@/lib/quality-of-hire/situational";
import { setCategoryCall } from "@/lib/quality-of-hire/category-calls";
import { isCallCategory } from "@/lib/quality-of-hire/categories";

// Reports > Quality of Hire: record HR's call on one hire (Satisfactory, Neutral, Bad and
// so on), or clear it so the rules decide again. Admin only, like the rest of the tab.
// See lib/quality-of-hire/category-calls.ts.
//
//   POST { newHireId, start: "YYYY-MM-DD", category: "NEUTRAL", note }   make the call
//   POST { newHireId, start, category: null }                            clear it

const MAX_NOTE = 160;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  if (auth.user.role !== "ADMIN") return NextResponse.json({ message: "Only an admin can change the Quality of Hire data." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { newHireId?: unknown; start?: unknown; category?: unknown; note?: unknown };
  const id = typeof body.newHireId === "string" ? body.newHireId.trim() : "";
  const start = typeof body.start === "string" ? body.start.trim() : "";
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return NextResponse.json({ message: "Which hire?" }, { status: 400 });

  if (body.category === null) {
    await setCategoryCall(periodKey(id, start), null);
    return NextResponse.json({ ok: true });
  }
  if (!isCallCategory(body.category)) return NextResponse.json({ message: "Pick a category." }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE) : "";
  await setCategoryCall(periodKey(id, start), { category: body.category, note: note || null, by: auth.user.email ?? auth.user.name ?? null, at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
