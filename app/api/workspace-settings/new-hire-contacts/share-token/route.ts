import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { rotateShareToken, buildShareUrl } from "@/lib/new-hire-contacts/share-link";
import { logActivity } from "@/lib/activity/logger";

// Rotate the share token on the public new-hire contacts link.
//
// Under /api/workspace-settings so the middleware auth wall covers it, and
// additionally gated on settings:admin — the same permission that curates the
// contact list itself.
//
// A separate route from the config POST on purpose. Rotating is destructive in a
// way saving the contact sheet is not: every link already texted or emailed to a
// new hire stops working the moment this runs. Folding it into the config save
// would make an ordinary edit capable of cutting off in-flight hires.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const token = await rotateShareToken();

  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const host = request.headers.get("host") ?? url.host;
  const shareUrl = buildShareUrl(host ? `${proto}://${host}` : "", token);

  // Worth an audit entry: this is the action that silently breaks a link
  // somebody is holding, so "who rotated it, and when" is the question asked
  // when a new hire reports a dead link.
  await logActivity({
    userId: auth.user.id ?? undefined,
    userEmail: auth.user.email ?? undefined,
    activityType: "SHARE_LINK_ROTATED",
    description:
      "Rotated the new hire contacts share link — every link sent before now stopped working.",
    entityType: "new-hire-contacts"
  });

  return NextResponse.json({ shareUrl });
}
