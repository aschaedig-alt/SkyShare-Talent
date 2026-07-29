"use client";

import { useEffect, useState } from "react";

// Renders a SOP as its own document via an <iframe src> pointing at the raw
// route, so the SOP's own CSS (which styles bare h1/.step/body) can't collide
// with the app, and its mermaid diagrams draw from /vendor. The SOP reports its
// rendered height (after mermaid draws) and we grow the iframe to fit, so there
// is no inner scrollbar — it reads as one page.

export function SopFrame({ slug, title }: { slug: string; title: string }) {
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
      src={`/handbook/${slug}/raw`}
      className="w-full rounded border border-brand-lea/10 bg-white shadow-panel dark:border-white/10"
      style={{ height, colorScheme: "light" }}
    />
  );
}
