import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/route-auth";
import { canWriteModule } from "@/lib/auth/module-write-access";
import { updateArchivedRound, type UpdateArchiveInput } from "@/lib/data/onboarding-rounds";

type RouteContext = { params: Promise<{ id: string; archiveId: string }> };

// Correct the dates on an archived round. The archive freezes whatever the
// checklist said the moment a new round started — including anything ticked that
// day to catch the record up — so reconstructing when things actually happened is
// a human job. See updateArchivedRound.
export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return (auth as { ok: false; response: NextResponse }).response;
  if (!(await canWriteModule(auth.user, "people", "edit"))) {
    return NextResponse.json({ message: "You do not have permission to edit employees." }, { status: 403 });
  }

  const { id, archiveId } = await context.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const input: UpdateArchiveInput = {};

    if (Array.isArray(body.tasks)) {
      input.tasks = body.tasks
        .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === "object")
        .filter((t) => typeof t.key === "string")
        .map((t) => ({
          key: t.key as string,
          status: typeof t.status === "string" ? t.status : undefined,
          completedAt: typeof t.completedAt === "string" || t.completedAt === null ? (t.completedAt as string | null) : undefined
        }));
    }
    for (const field of ["position", "department", "startDate", "offerSentDate", "offerSignedDate", "orientationDate", "onboardedAt"] as const) {
      const v = body[field];
      if (typeof v === "string") input[field] = v;
      else if (v === null) input[field] = null;
    }

    return NextResponse.json(await updateArchivedRound(id, archiveId, input));
  } catch (error) {
    console.error("Update archived round error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to save those dates." },
      { status: 500 }
    );
  }
}
