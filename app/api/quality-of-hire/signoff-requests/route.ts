import { NextResponse } from "next/server";
import { authFailureResponse, requireApiUser } from "@/lib/auth/route-auth";
import { cancelSignoffRequest, listSignoffRequests, sendSignoffRequest } from "@/lib/quality-of-hire/signoff-requests";

// HR's side of the definitions sign-off links (Reports > Sign-off). Admins only, the
// same line as the rest of Quality of Hire: the answers name people's departments
// and their views on how hires are judged.
//
//   GET                                   every request, newest first
//   POST { action: "send", id?, to, toName, departments, subject, body }   new, or resend the same link
//   POST { action: "cancel", id }

async function admin() {
  const auth = await requireApiUser();
  if (!auth.ok) return { error: authFailureResponse(auth) };
  if (auth.user.role !== "ADMIN") return { error: NextResponse.json({ message: "Only an admin can send Quality of Hire sign-offs." }, { status: 403 }) };
  return { user: auth.user };
}

export async function GET() {
  const a = await admin();
  if ("error" in a) return a.error;
  return NextResponse.json({ requests: await listSignoffRequests() });
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function POST(request: Request) {
  const a = await admin();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const actor = a.user.email ?? a.user.name ?? null;
  if (body.action === "send") {
    const result = await sendSignoffRequest({
      id: str(body.id) || null,
      to: str(body.to),
      toName: str(body.toName) || null,
      departments: Array.isArray(body.departments) ? body.departments.filter((d): d is string => typeof d === "string") : [],
      subject: str(body.subject) || null,
      bodyHtml: typeof body.body === "string" ? body.body : null,
      actor
    });
    if (!result.ok) return NextResponse.json({ message: (result as { error: string }).error }, { status: 400 });
    return NextResponse.json(result);
  }
  if (body.action === "cancel") {
    const request_ = await cancelSignoffRequest(str(body.id), actor);
    if (!request_) return NextResponse.json({ message: "There is no open request to cancel." }, { status: 400 });
    return NextResponse.json({ ok: true, request: request_ });
  }
  return NextResponse.json({ message: "Unknown action." }, { status: 400 });
}
