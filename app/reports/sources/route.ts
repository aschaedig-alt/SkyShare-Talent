import { NextResponse, type NextRequest } from "next/server";

// The Sources report moved into the Reports library on 2026-11-24. Old links (a
// candidate profile linked here, and anything bookmarked) keep working. A route
// handler rather than a page so it is a real 308: a page under the Reports layout
// would answer 200 and redirect in the browser.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/reports/hiring/sources", request.url), 308);
}
