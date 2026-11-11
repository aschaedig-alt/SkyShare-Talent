import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

type RouteContext = { params: Promise<{ applicationId: string }> };

const MAX = 80;
const tidy = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX) : undefined);

/**
 * Who recruited for this hire and who is the hiring manager - set on the offer.
 * Quality of Hire tracking from Dec 10 2026 needs both on every offer, so the
 * outcome of a hire can be read against who made it. Both columns already
 * existed on CandidateApplication and were empty on every row.
 *
 *   POST { recruiterName?, hiringManager? }   a field left out is unchanged; "" clears it
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { applicationId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { recruiterName?: unknown; hiringManager?: unknown };
  const recruiterName = tidy(body.recruiterName);
  const hiringManager = tidy(body.hiringManager);
  if (recruiterName === undefined && hiringManager === undefined) {
    return NextResponse.json({ message: "Nothing to save." }, { status: 400 });
  }

  const exists = await prisma.candidateApplication.findUnique({ where: { id: applicationId }, select: { id: true } });
  if (!exists) return NextResponse.json({ message: "Application not found." }, { status: 404 });

  const saved = await prisma.candidateApplication.update({
    where: { id: applicationId },
    data: {
      ...(recruiterName !== undefined && { recruiterName: recruiterName || null }),
      ...(hiringManager !== undefined && { hiringManager: hiringManager || null })
    },
    select: { recruiterName: true, hiringManager: true }
  });
  return NextResponse.json({ ok: true, ...saved });
}
