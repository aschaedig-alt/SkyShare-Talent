"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cap an element's height so its bottom edge lands on the bottom of the viewport.
 *
 * Exists to kill a SECOND scrollbar. A tall table in a box with a fixed cap
 * (max-h-[75vh]) leaves the page itself still taller than the screen, so the
 * right-hand side grows two vertical scrollbars: the page's and the box's. The
 * cap has to be "whatever is left below me", not a guessed fraction of the
 * viewport — then the page ends exactly at the fold, the outer scrollbar has
 * nothing to scroll, and the inner one is the only one on screen.
 *
 * Measured rather than computed in CSS because what sits above the box varies:
 * page header, tab strip, and a bulk-action bar that appears only once rows are
 * selected. calc() cannot see any of that; a measurement can, which is why this
 * re-measures on resize AND whenever the document's size changes.
 *
 * The top is taken document-relative (rect.top + scrollY) so the answer does not
 * change while the page happens to be scrolled mid-measure.
 */
export function useFillViewportHeight<T extends HTMLElement>({
  gutter = 24,
  min = 320
}: { gutter?: number; min?: number } = {}) {
  const ref = useRef<T | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const documentTop = el.getBoundingClientRect().top + window.scrollY;
    setMaxHeight(Math.max(min, Math.round(window.innerHeight - documentTop - gutter)));
  }, [gutter, min]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    // Catches the bulk-action bar appearing/disappearing above the box, which
    // moves our top edge without any resize event firing.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [measure]);

  return { ref, maxHeight };
}
