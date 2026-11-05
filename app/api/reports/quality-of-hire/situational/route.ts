import { NextResponse } from "next/server";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { periodKey, setSituational } from "@/lib/quality-of-hire/situational";

// Reports > Quality of Hire: mark one exit as situational, or clear the mark.
// Admin only, like the rest of the tab. See lib/quality-of-hire/situational.ts.
//
//   POST { newHireId, start: "YYYY-MM-DD", situational: true, note }   mark it
//   POST { newHireId, start, situational: false }                       clear it

const MAX_NOTE = 120;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  if (auth.user.role !== "ADMIN") return NextResponse.json({ message: "Only an admin can change the Quality of Hire data." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { newHireId?: unknown; start?: unknown; situational?: unknown; note?: unknown };
  const id = typeof body.newHireId === "string" ? body.newHireId.trim() : "";
  const start = typeof body.start === "string" ? body.start.trim() : "";
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return NextResponse.json({ message: "Which hire?" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE) : "";

  if (body.situational === true) {
    if (!note) return NextResponse.json({ message: "Say what happened, for example \"Ogden FBO sale\"." }, { status: 400 });
    await setSituational(periodKey(id, start), { note, by: auth.user.email ?? auth.user.name ?? null, at: new Date().toISOString() });
  } else {
    await setSituational(periodKey(id, start), null);
  }
  return NextResponse.json({ ok: true });
}
