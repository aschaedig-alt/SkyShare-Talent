import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { visibleCandidateIdsFor } from "@/lib/data/candidates";
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

  // Saved views are workspace-global with no owner filter, so this route would
  // otherwise hand an allowlist-scoped viewer the FULL member id list of any view
  // in the system — and an id is all the other candidate endpoints need. Narrow
  // the list to the people this viewer may see, and treat a view that ends up
  // empty as one that does not exist, so an empty result cannot be read as
  // confirmation that a view holds people they are not allowed to know about.
  // visibleCandidateIdsFor applies BOTH narrowings - the hand-picked allowlist and the
  // older department restriction. scopeCandidateIds implements only the first, which
  // left a department-scoped manager reading every id on any view in the system.
  const visibleIds = await visibleCandidateIdsFor(view.candidateIds, auth.user.viewer);
  if (visibleIds.length === 0 && view.candidateIds.length > 0) {
    return NextResponse.json({ message: "No such view." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, view: { ...view, candidateIds: visibleIds } });
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
