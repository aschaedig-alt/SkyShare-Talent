import { renderHandbookHtml } from "@/lib/handbook/render";

export const dynamic = "force-dynamic";

// Serves a SOP as a standalone HTML document (with the mermaid loader injected)
// for the viewer's <iframe src>. A real URL — not srcdoc — so subresources like
// /vendor/mermaid.min.js resolve against the app origin normally, and the page
// can be opened directly for debugging.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
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
