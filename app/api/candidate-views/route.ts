import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isCandidateScopeNarrowed, visibleCandidateIdsFor } from "@/lib/data/candidates";
import {
  createCandidateView,
  listCandidateViews,
  MAX_CANDIDATES_PER_VIEW
} from "@/lib/data/candidate-views";

// GET /api/candidate-views — every saved view, newest first.
export async function GET() {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const views = await listCandidateViews();
  const viewer = auth.user.viewer;

  // isCandidateScopeNarrowed, NOT isCandidateAllowlisted. There are TWO narrowing
  // mechanisms and gating on the allowlist alone let the older one straight through:
  // a department-scoped hiring manager was handed the full candidateIds array of
  // every saved view on the workspace by this exact early return.
  if (!isCandidateScopeNarrowed(viewer)) {
    return NextResponse.json({ ok: true, views });
  }

  // Saved views are workspace-wide and each one carries its full candidateIds
  // array, which makes this route an id-enumeration amplifier: a view is a
  // hand-picked shortlist, and the ids alone are the key to every other
  // candidate route. Narrow each list to what this viewer may see, then drop the
  // views that come back empty — a shortlist containing none of their people is
  // not one they should be able to see the name and size of.
  // One batched resolve over the de-duplicated union of every view's ids rather than
  // a call per view: the department branch costs a query, and per-view would multiply
  // it by however many saved views exist.
  const allIds = [...new Set(views.flatMap((view) => view.candidateIds))];
  const visible = new Set(await visibleCandidateIdsFor(allIds, viewer));
  const scoped = views
    .map((view) => ({ ...view, candidateIds: view.candidateIds.filter((id) => visible.has(id)) }))
    .filter((view) => view.candidateIds.length > 0);

  return NextResponse.json({ ok: true, views: scoped });
}

// POST /api/candidate-views — { name, note?, candidateIds[] }
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const body = (await request.json()) as {
      name?: unknown;
      note?: unknown;
      candidateIds?: unknown;
    };

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ message: "Give the view a name." }, { status: 400 });
    }

    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds.filter((id): id is string => typeof id === "string")
      : [];
    if (candidateIds.length === 0) {
      return NextResponse.json({ message: "Select at least one candidate." }, { status: 400 });
    }
    if (candidateIds.length > MAX_CANDIDATES_PER_VIEW) {
      return NextResponse.json(
        { message: `A view holds at most ${MAX_CANDIDATES_PER_VIEW} candidates.` },
        { status: 400 }
      );
    }

    const view = await createCandidateView({
      name,
      note: typeof body.note === "string" ? body.note : null,
      candidateIds,
      createdByEmail: auth.user.email
    });

    return NextResponse.json({ ok: true, view });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to save the view." }, { status: 500 });
  }
}
