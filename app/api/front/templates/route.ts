import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { listTemplates } from "@/lib/front/templates";

// GET /api/front/templates — the Front message templates, so Manage tasks can
// offer them in a picker instead of asking anybody to find an rsp_ id.
//
// READ ONLY. Nothing in this app creates, edits or deletes a Front template; HR
// owns them in Front and that is where they are maintained.
export async function GET() {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ templates: await listTemplates() });
  } catch (error) {
    // Surfaced rather than swallowed: the usual causes are a missing
    // FRONT_API_TOKEN or a token without the Message templates read scope, and
    // both need a person, not a retry. An empty list would read as "Front has no
    // templates", which is the wrong thing to tell somebody.
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not read the templates from Front." },
      { status: 502 }
    );
  }
}
