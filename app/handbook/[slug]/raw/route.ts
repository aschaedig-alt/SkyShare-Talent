import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { renderHandbookHtml } from "@/lib/handbook/render";

export const dynamic = "force-dynamic";

// Serves a SOP as a standalone HTML document (with the mermaid loader injected)
// for the viewer's <iframe src>. A real URL — not srcdoc — so subresources like
// /vendor/mermaid.min.js resolve against the app origin normally, and the page
// can be opened directly for debugging.
//
// REQUIRES A SIGNED-IN USER, and middleware.ts separately lists /handbook. Both
// ends on purpose: this route is reachable independently of the page that frames
// it, so gating only the page would be theatre — the same reasoning written on
// the vCard route, which is the hole this one turned out to be a copy of. It
// shipped with no guard at all and served every internal SOP to anyone with the
// URL until Aug 22. The iframe in SopFrame is same-origin and carries cookies,
// so a signed-in reader is unaffected.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  const { slug } = await params;
  const rendered = await renderHandbookHtml(slug);
  if (!rendered) return new Response("Not found", { status: 404 });
  return new Response(rendered.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
