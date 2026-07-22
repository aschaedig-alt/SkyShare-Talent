"use client";

import { useEffect } from "react";

/**
 * Warn before unsaved org-chart edits are thrown away.
 *
 * Both charts keep every change local until an explicit Save, which means the
 * ordinary ways of leaving a page — reloading, closing the tab, or clicking any
 * link (the sidebar, or a pilot's name linking to their candidate profile) —
 * silently discarded the whole session's work. Added after a real loss: a full
 * "Edit all" pass across many cards, gone, with nothing asking first.
 *
 * This covers only the exits React cannot see. In-app controls that discard on
 * purpose (Cancel / Done / leaving edit mode) confirm at their own call sites,
 * where they can say something specific about what is about to be lost.
 */
export function useUnsavedGuard(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;

    // Reload, tab close, or leaving the app entirely. The browser substitutes
    // its own wording — setting returnValue is just the legacy requirement.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    // Client-side navigation never fires beforeunload, so catch link clicks in
    // the capture phase, before the router gets them.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      // Modified clicks open a new tab — this page and its edits survive.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return; // in-page anchor, no navigation
      if (anchor.target && anchor.target !== "_self") return; // opens a new tab

      if (window.confirm(message)) return; // they chose to leave
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
