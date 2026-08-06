import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
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
  return NextResponse.json({ ok: true, views });
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
