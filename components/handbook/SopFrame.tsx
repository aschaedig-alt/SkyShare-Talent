"use client";

import { useEffect, useState } from "react";

// Renders a SOP as its own isolated document via <iframe srcdoc>, so the SOP's
// own CSS (which styles bare h1/.step/body) can never collide with the app's
// styles. The SOP reports its rendered height (after mermaid draws) and we grow
// the iframe to fit, so there is no inner scrollbar — it reads as one page.

export function SopFrame({ html, title }: { html: string; title: string }) {
  const [height, setHeight] = useState(900);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { __handbook_height?: unknown } | null;
      if (data && typeof data === "object" && typeof data.__handbook_height === "number") {
        const next = Math.ceil(data.__handbook_height);
        if (Number.isFinite(next) && next > 0) setHeight(Math.max(400, next + 8));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      title={title}
      srcDoc={html}
      loading="lazy"
      // Our own repo content. allow-same-origin lets it load /vendor/mermaid and
      // postMessage its height; allow-popups lets the SOP's "open in new tab"
      // links (maps, Meet) work.
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="w-full rounded border border-brand-lea/10 bg-white shadow-panel dark:border-white/10"
      style={{ height, colorScheme: "light" }}
    />
  );
}
