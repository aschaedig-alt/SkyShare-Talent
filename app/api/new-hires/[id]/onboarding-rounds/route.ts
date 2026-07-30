import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/route-auth";
import { canWriteModule } from "@/lib/auth/module-write-access";
import { getOnboardingArchives, startOnboardingRound } from "@/lib/data/onboarding-rounds";
import { isRoundReason } from "@/lib/onboarding/rounds";

type RouteContext = { params: Promise<{ id: string }> };

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return (auth as { ok: false; response: NextResponse }).response;
  const { id } = await context.params;
  return NextResponse.json({ archives: await getOnboardingArchives(id) });
}

// Start a new round of onboarding for someone who has already been through it —
// a rehire, or a move big enough to need the paperwork done again. Archives the
// current checklist first; see lib/data/onboarding-rounds.ts.
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return (auth as { ok: false; response: NextResponse }).response;
  if (!(await canWriteModule(auth.user, "people", "edit"))) {
    return NextResponse.json({ message: "You do not have permission to edit employees." }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!isRoundReason(body.reason)) {
      return NextResponse.json({ message: "Pick a reason for the new onboarding." }, { status: 400 });
    }
    const effectiveDate = parseDate(body.effectiveDate);
    if (!effectiveDate) {
      return NextResponse.json({ message: "A valid effective date is required." }, { status: 400 });
    }
    const carryOver = Array.isArray(body.carryOver) ? body.carryOver.filter((k): k is string => typeof k === "string") : undefined;

    const result = await startOnboardingRound(id, {
      reason: body.reason,
      note: typeof body.note === "string" ? body.note : null,
      position: typeof body.position === "string" ? body.position : null,
      department: typeof body.department === "string" ? body.department : null,
      effectiveDate,
      carryOver,
      recordRoleChange: body.recordRoleChange !== false,
      archivedBy: auth.user.email ?? auth.user.name ?? null
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Start onboarding round error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to start a new onboarding." },
      { status: 500 }
    );
  }
}
