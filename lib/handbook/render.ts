import { readFile } from "node:fs/promises";
import path from "node:path";
import { chapterFileForSlug } from "./chapters";

// The SOP files in docs/sops are body fragments (they start at <title>/<style>,
// no <html>/<head>/<body>) — the artifact platform wraps them at publish time.
// For the in-app viewer we wrap them ourselves into a full document and inject
// the mermaid loader, then hand the string to an isolated <iframe srcdoc>.
//
// mermaid is served from /vendor/mermaid.min.js (see scripts/vendor-mermaid.mjs),
// self-hosted, no external calls. It loads ONLY inside this iframe on Handbook
// pages, so the rest of the app never carries it. After it draws the diagram the
// page height changes, so the iframe reports its height to the parent to resize.

const MERMAID_SNIPPET = `
<script src="/vendor/mermaid.min.js"></script>
<script>
  (function () {
    function report() {
      try {
        var h = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
        parent.postMessage({ __handbook_height: h }, "*");
      } catch (e) {}
    }
    function run() {
      if (!window.mermaid) { report(); return; }
      try {
        window.mermaid.initialize({ startOnLoad: false, theme: "base", securityLevel: "loose", flowchart: { htmlLabels: true } });
        var p = window.mermaid.run();
        if (p && p.then) { p.then(report).catch(report); } else { report(); }
      } catch (e) { report(); }
    }
    if (document.readyState === "complete") run();
    else window.addEventListener("load", run);
    window.addEventListener("resize", report);
    // A late fallback in case the diagram never resolves — never leaves the
    // frame collapsed.
    setTimeout(report, 1500);
  })();
</script>
`;

export type RenderedChapter = { title: string; html: string };

export async function renderHandbookHtml(slug: string): Promise<RenderedChapter | null> {
  const resolved = chapterFileForSlug(slug);
  if (!resolved) return null;

  // resolved.file comes only from our own CHAPTERS list, never from user input,
  // so there is no path-traversal surface — but join under a fixed root anyway.
  const filePath = path.join(process.cwd(), "docs", "sops", resolved.file);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>` +
    raw +
    MERMAID_SNIPPET +
    `</body></html>`;

  return { title: resolved.title, html };
}
