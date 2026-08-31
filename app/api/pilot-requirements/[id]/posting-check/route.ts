import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { checkRequirementAgainstPosting } from "@/lib/requirements/posting-check";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Check one requirement's gates against the job posting they came from.
 *
 * READ-ONLY — this writes nothing. Accepting a finding fills the editor form, and
 * the existing PATCH on /api/pilot-requirements/[id] is still what saves it.
 *
 * Gated on requirements:WRITE rather than read, deliberately. The check itself only
 * reads, but it spends model budget on every call, and its whole purpose is to
 * propose edits — someone who cannot act on the findings has no reason to be able
 * to run it.
 *
 * POST rather than GET because it is not cacheable and not idempotent in cost.
 */
export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireApiPermission("requirements:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const result = await checkRequirementAgainstPosting(id);
    if (!result.ok) {
      // A requirement with no stored posting text is an ordinary, expected outcome,
      // not a server fault — say what is missing rather than failing opaquely.
      return NextResponse.json({ message: result.error ?? "The posting could not be read." }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Posting check error:", error);
    return NextResponse.json({ message: "Unable to check this requirement against its posting." }, { status: 500 });
  }
}
