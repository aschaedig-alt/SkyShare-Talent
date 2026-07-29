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

// Renders each diagram EXPLICITLY with mermaid.render(id, code) rather than
// mermaid.run(). run() has a flaky first-pass in v11 — it marks the element
// processed but sometimes produces no SVG, and then skips it on retry. render()
// returns the SVG string reliably; we swap it in ourselves. classDef cannot take
// a pattern fill (mermaid's parser rejects "fill:url(...)"), so the "system does
// it" nodes carry a solid fill and the dot texture is painted on afterwards by a
// CSS rule inside each SOP.
const MERMAID_SNIPPET = `
<script src="/vendor/mermaid.min.js"></script>
<script>
  (function () {
    function report() {
      try {
        // body.scrollHeight ONLY — documentElement.scrollHeight returns the
        // iframe VIEWPORT height once the parent grows the frame, which feeds
        // back into an ever-taller frame. body is the actual content height.
        var h = document.body ? document.body.scrollHeight : 0;
        if (h > 0) parent.postMessage({ __handbook_height: h }, "*");
      } catch (e) {}
    }
    async function draw() {
      if (!window.mermaid) { report(); return; }
      try {
        // htmlLabels:false → SVG <text> labels, which size to content and don't
        // clip (htmlLabels foreignObject mis-measures width in this build and
        // also swallows the space around <br/>).
        window.mermaid.initialize({ startOnLoad: false, theme: "base", securityLevel: "loose", flowchart: { htmlLabels: false, useMaxWidth: true } });
        var hasPattern = !!document.getElementById("autodot");
        var blocks = document.querySelectorAll("pre.mermaid, .mermaid");
        for (var i = 0; i < blocks.length; i++) {
          var el = blocks[i];
          try {
            var res = await window.mermaid.render("hb-mmd-" + i, el.textContent);
            // Replace the <pre> with a plain <div>: a <pre> defaults to a
            // monospace font that the mermaid labels inherit, which is WIDER than
            // the proportional font mermaid measured with — so the text overflows
            // and clips. A <div> inherits the page's proportional font, matching
            // the measurement, so nothing clips.
            var host = document.createElement("div");
            host.className = "hb-diagram";
            host.style.textAlign = "center";
            host.innerHTML = res.svg;
            el.replaceWith(host);
            if (res.bindFunctions) res.bindFunctions(host);
            // Paint the dot texture onto "the system does it" nodes. classDef
            // can't take a pattern fill and mermaid scopes its own fill with an
            // id + !important, so set it inline-important here (wins the cascade).
            if (hasPattern) {
              host.querySelectorAll("g.node.auto rect, g.node.auto polygon, g.node.auto path, g.node.auto ellipse").forEach(function (s) {
                s.style.setProperty("fill", "url(#autodot)", "important");
              });
            }
          } catch (e) { /* leave the source visible rather than blank */ }
        }
      } catch (e) {}
      report();
    }
    if (document.readyState === "complete") draw();
    else window.addEventListener("load", draw);
    window.addEventListener("resize", report);
    setTimeout(report, 1800);
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
