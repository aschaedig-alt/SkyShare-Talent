import { NextResponse } from "next/server";
import { clearGuestCookie } from "@/lib/exec-hunt/http";

// PUBLIC - "I'm someone else": a phone handed to another guest drops its token so
// the next claim starts a brand-new guest. Deletes nothing - the previous guest's
// finds stay theirs.
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearGuestCookie(response);
  return response;
}
