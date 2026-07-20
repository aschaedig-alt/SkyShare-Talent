"use client";

import { useEffect } from "react";

// The keyboard half of "a popup must close by X, Escape, AND clicking off it."
// Call this inside any open dialog/panel/flyout with its close handler; it wires
// Escape-to-close and cleans up after itself. Pair with a backdrop `onClick` for
// click-off, and tag the close button with `data-dialog-close` (so the view-only
// CSS never disables it). Pass `enabled` to attach unconditionally and gate on the
// open state.
export function useDialogClose(onClose: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, onClose]);
}
