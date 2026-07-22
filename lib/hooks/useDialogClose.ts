"use client";

import { useCallback, useEffect } from "react";

/**
 * The keyboard half of "a popup must close by X, Escape, AND clicking off it."
 * Call this inside any open dialog/panel/flyout with its close handler; it wires
 * Escape-to-close and cleans up after itself. Pair with a backdrop `onClick` for
 * click-off, and tag the close button with `data-dialog-close` (so the view-only
 * CSS never disables it). Pass `enabled` to attach unconditionally and gate on the
 * open state.
 *
 * UNSAVED WORK: pass `{ isDirty: true }` and closing asks for confirmation first —
 * whether that close came from Escape, the X, or a click outside. Clicking beside
 * a dialog is easy to do by accident, and losing half-entered work to a stray
 * click is worse than one extra keypress. Use the RETURNED function for the
 * backdrop and the X so all three routes go through the same guard; wiring the raw
 * onClose straight to the backdrop quietly bypasses it.
 *
 * Not every dialog wants this. One whose content SURVIVES being closed — the
 * feedback panel keeps its draft on purpose, so you can go and take a screenshot —
 * should stay unguarded: there is nothing to lose, and a confirm box would just be
 * one more thing in the way.
 */
export function useDialogClose(
  onClose: () => void,
  enabled: boolean = true,
  options?: { isDirty?: boolean; message?: string }
) {
  const isDirty = options?.isDirty ?? false;
  const message = options?.message ?? "You have unsaved changes here. Close and lose them?";

  const requestClose = useCallback(() => {
    if (isDirty && typeof window !== "undefined" && !window.confirm(message)) return;
    onClose();
  }, [isDirty, message, onClose]);

  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") requestClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, requestClose]);

  return requestClose;
}
