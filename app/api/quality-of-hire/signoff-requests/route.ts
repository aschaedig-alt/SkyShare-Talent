import { NextResponse } from "next/server";

// sendMany sends one email after another through Front; give it room for a long list.
export const maxDuration = 300;
import { authFailureResponse, requireApiUser } from "@/lib/auth/route-auth";
import { cancelSignoffRequest, listSignoffRecipients, listSignoffRequests, sendSignoffRequest, sendSignoffToMany } from "@/lib/quality-of-hire/signoff-requests";

// HR's side of the definitions sign-off links (Reports > Sign-off). Admins only, the
// same line as the rest of Quality of Hire: the answers name people's departments
// and their views on how hires are judged.
//
//   GET                                   every request, newest first
//   GET ?recipients=1                     who the send screen offers: suggested sign-offs first, then every current employee
//   POST { action: "sendMany", recipients: [{ name, email, departments }], subject, body }   one link each
//   POST { action: "send", id?, to, toName, departments, subject, body }   new, or resend the same link
//   POST { action: "cancel", id }

async function admin() {
  const auth = await requireApiUser();
  if (!auth.ok) return { error: authFailureResponse(auth) };
  if (auth.user.role !== "ADMIN") return { error: NextResponse.json({ message: "Only an admin can send Quality of Hire sign-offs." }, { status: 403 }) };
  return { user: auth.user };
}

export async function GET(request: Request) {
  const a = await admin();
  if ("error" in a) return a.error;
  if (new URL(request.url).searchParams.get("recipients")) return NextResponse.json(await listSignoffRecipients());
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
  if (body.action === "sendMany") {
    const list = Array.isArray(body.recipients) ? body.recipients : [];
    const recipients = list
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
      .map((r) => ({ name: str(r.name) || null, email: str(r.email), departments: Array.isArray(r.departments) ? r.departments.filter((d): d is string => typeof d === "string") : [] }));
    if (!recipients.length) return NextResponse.json({ message: "Pick at least one person." }, { status: 400 });
    return NextResponse.json(await sendSignoffToMany({ recipients, subject: str(body.subject) || null, bodyHtml: typeof body.body === "string" ? body.body : null, actor }));
  }
  if (body.action === "cancel") {
    const request_ = await cancelSignoffRequest(str(body.id), actor);
    if (!request_) return NextResponse.json({ message: "There is no open request to cancel." }, { status: 400 });
    return NextResponse.json({ ok: true, request: request_ });
  }
  return NextResponse.json({ message: "Unknown action." }, { status: 400 });
}
