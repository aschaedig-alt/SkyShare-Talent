import { NextResponse } from "next/server";
import { authFailureResponse, requireApiUser } from "@/lib/auth/route-auth";
import { resolveRequirementHome } from "@/lib/data/pilot-requirements";

/**
 * The old Pilot Requirements page, kept as a forwarding address.
 *
 * A pilot requirement is now a tab on the job that owns it, so there is no page
 * here any more. Links to it still exist — bookmarks, the candidate profile, the
 * command center tile, the crew org chart — so each one lands where the
 * requirement lives now:
 *
 *   /pilot-requirements?id=<req>  ->  /recruiting-jobs/<job>?tab=requirement&req=<req>
 *                                     (following merges to the job that survived),
 *                                     or /recruiting-jobs/requirements/<req> for one
 *                                     with no job
 *   /pilot-requirements           ->  /recruiting-jobs (a ?q= search is carried over)
 *
 * A ROUTE HANDLER rather than a page on purpose: a redirect thrown from a page in
 * this app arrives as a 200 once the layout has started streaming, which neither a
 * bookmark nor a check over HTTP can tell from a real page. This answers a real 307
 * before anything renders.
 *
 * Scoring setup is untouched at /pilot-requirements/scoring; a child segment can
 * sit under a route handler.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const target = new URL("/recruiting-jobs", url.origin);

  if (id) {
    const home = await resolveRequirementHome(id);
    if (home.exists && home.jobId) {
      target.pathname = `/recruiting-jobs/${home.jobId}`;
      target.searchParams.set("tab", "requirement");
      target.searchParams.set("req", id);
    } else if (home.exists) {
      target.pathname = `/recruiting-jobs/requirements/${id}`;
    }
    // An id that matches nothing lands on the jobs list rather than an error: the
    // link was to a page that no longer exists, and the list is its replacement.
  } else {
    const query = url.searchParams.get("q")?.trim();
    if (query) target.searchParams.set("q", query);
  }

  return NextResponse.redirect(target, 307);
}
