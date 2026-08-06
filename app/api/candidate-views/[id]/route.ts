import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import {
  deleteCandidateView,
  getCandidateView,
  MAX_CANDIDATES_PER_VIEW,
  updateCandidateView
} from "@/lib/data/candidate-views";

type Context = { params: Promise<{ id: string }> };

// GET /api/candidate-views/[id]
export async function GET(_request: Request, { params }: Context) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  const view = await getCandidateView(id);
  if (!view) return NextResponse.json({ message: "No such view." }, { status: 404 });
  return NextResponse.json({ ok: true, view });
}

// PATCH /api/candidate-views/[id] — rename, re-note, or replace the member list.
export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    const body = (await request.json()) as { name?: unknown; note?: unknown; candidateIds?: unknown };

    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.filter((value): value is string => typeof value === "string")
      : undefined;
    if (candidateIds && candidateIds.length === 0) {
      return NextResponse.json({ message: "A view needs at least one candidate." }, { status: 400 });
    }
    if (candidateIds && candidateIds.length > MAX_CANDIDATES_PER_VIEW) {
      return NextResponse.json(
        { message: `A view holds at most ${MAX_CANDIDATES_PER_VIEW} candidates.` },
        { status: 400 }
      );
    }

    const view = await updateCandidateView(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      note: body.note === undefined ? undefined : typeof body.note === "string" ? body.note : null,
      candidateIds
    });
    if (!view) return NextResponse.json({ message: "No such view." }, { status: 404 });
    return NextResponse.json({ ok: true, view });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to update the view." }, { status: 500 });
  }
}

// DELETE /api/candidate-views/[id]
export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  const removed = await deleteCandidateView(id);
  if (!removed) return NextResponse.json({ message: "No such view." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
