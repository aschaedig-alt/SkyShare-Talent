"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Which checklist sections this viewer has folded away.
 *
 * Asked for on 2026-09-22 (feedback cmuctrf78): "once a section is complete in
 * the onboarding checklist, i want to be able to minimize it. i dont want to be
 * able to minimize it before all items in that section are complete though."
 * Enforcing the second half is the CALLER's job — this only remembers the choice.
 * A section that becomes incomplete again (a step flipped back to To do) must
 * render open whatever is stored here, because an unfinished step hidden behind
 * a chevron is a step nobody does.
 *
 * Remembered PER VIEWER, in this browser, and keyed by SECTION rather than by
 * person. Folding Offer away on one hire is a statement about what she does not
 * need to look at, so it carries to the next hire whose Offer is also done —
 * which is what makes the fold worth doing at all on a checklist she opens many
 * times a day. localStorage is the right store for exactly that kind of
 * per-viewer convenience: nobody else is affected, and losing it (a private
 * window, cleared site data) only means everything starts open, which is safe.
 *
 * Read after mount, not during render: the server has no localStorage, so a
 * render-time read would disagree with the server's HTML and React would throw
 * the hydration away. The cost is one frame with everything open.
 */
const STORAGE_KEY = "journey.checklist.collapsed";

function read(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function write(keys: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // Blocked or full storage: the fold still works for this page view.
  }
}

export function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCollapsed(read());
  }, []);

  /** Fold (true) or unfold (false) several sections at once. */
  const setSections = useCallback((keys: string[], fold: boolean) => {
    setCollapsed((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (fold) next.add(key);
        else next.delete(key);
      }
      write(next);
      return next;
    });
  }, []);

  return { collapsed, setSections };
}
