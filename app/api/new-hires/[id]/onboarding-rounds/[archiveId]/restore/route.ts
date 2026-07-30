import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/route-auth";
import { canWriteModule } from "@/lib/auth/module-write-access";
import { restoreOnboardingRound } from "@/lib/data/onboarding-rounds";

type RouteContext = { params: Promise<{ id: string; archiveId: string }> };

// Undo the most recent "start a new onboarding": put the archived checklist and
// profile back and unwind the role/employment rows it created. Deliberately its
// own endpoint rather than a flag on the POST — this discards a checklist, and
// the UI types out what is about to happen before calling it.
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return (auth as { ok: false; response: NextResponse }).response;
  if (!(await canWriteModule(auth.user, "people", "edit"))) {
    return NextResponse.json({ message: "You do not have permission to edit employees." }, { status: 403 });
  }

  const { id, archiveId } = await context.params;
  try {
    const result = await restoreOnboardingRound(id, archiveId);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Restore onboarding round error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to undo that." },
      { status: 500 }
    );
  }
}
