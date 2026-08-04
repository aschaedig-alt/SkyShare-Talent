"use client";

import { useCallback, useEffect, useRef } from "react";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { useDialogClose } from "@/lib/hooks/useDialogClose";

// Shared modal shell — dimmed overlay + centered panel, matching the existing
// `fixed inset-0 z-50 … bg-black/50` pattern. Content, header, and footer are
// yours to compose; this just gives one consistent frame so modals stop being
// rebuilt from scratch each time.
//
// It closes THREE ways — Escape, the X in the corner, and a click on the
// backdrop — which is the app-wide rule (see lib/hooks/useDialogClose). It also
// does the things a dialog has to do to be usable with a keyboard: traps Tab
// inside the panel, locks the page behind it from scrolling, and hands focus
// back to whatever opened it.
//
// `busy` USED TO disable the backdrop, and since there was no X and no Escape
// either, a modal that was mid-save could not be closed by any means at all —
// a hung request left the user stuck in it. Saving and "cannot leave" are not
// the same thing: `busy` now only marks the dialog aria-busy. Guard the actual
// double submit where it belongs, on the submit button (`disabled={busy}`).
//
// Composing content: keep the top-right ~2rem of the panel clear, that corner
// belongs to the close button.

// Everything Tab can land on. Kept in one place so the trap and the initial
// focus agree on what counts.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Tailwind max-w-* class for the panel. Default max-w-md. */
  maxWidth?: string;
  /** Mid-save. Marks the dialog aria-busy; it does NOT prevent closing. */
  busy?: boolean;
  className?: string;
  /**
   * Accessible name for the dialog. Optional and not rendered — panels compose
   * their own heading — but a screen reader announcing "dialog" and nothing else
   * is close to useless, so pass the same words the heading uses.
   */
  title?: string;
};

export function Modal({ open, onClose, children, maxWidth = "max-w-md", busy = false, className, title }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  // Escape-to-close, from the same hook every other dialog in the app uses.
  useDialogClose(onClose, open);

  // Lock the page behind the dialog. Restore the EXACT previous inline value
  // rather than assuming it was "": a page (or an outer modal) that had already
  // set its own overflow would otherwise be left unscrollable once this closes.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Remember who had focus before this opened and give it back on close, so a
  // keyboard user lands back on the button they opened it from instead of at
  // the top of the document.
  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const back = returnFocusTo.current;
      if (back && back.isConnected) back.focus();
    };
  }, [open]);

  // Put focus inside on open — without it, Tab starts from the page behind the
  // dialog and the trap has nothing to hold on to. Children that set autoFocus
  // have already claimed it by this point; don't fight them.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();
  }, [open]);

  // Tab cycles inside the panel instead of walking off into the page behind it.
  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (items.length === 0) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Dialog"}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={clsx("relative w-full rounded bg-white p-5 shadow-2xl outline-none dark:bg-brand-panel", maxWidth, className)}
      >
        <button
          type="button"
          data-dialog-close
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2.5 top-2.5 rounded p-1 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
