"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useDialogClose } from "@/lib/hooks/useDialogClose";

/**
 * The side drawer the Post-onboard grid opens for one person (his pick, design
 * #17 of the Nov 13 2026 Post-onboard Designs page): the grid stays a compact
 * all-status view, and every action — mark done, skip, send the check-in email,
 * read a reply, rate, send the rating link — lives here.
 *
 * Built like components/interviews/InterviewDrawer.tsx: a genuinely fixed-height
 * shell whose body is the one scroll container (both axes pinned), the page
 * behind locked while it is open, focus moved in and returned on close, Tab kept
 * inside, and Escape / the X / a click on the dim area all closing it.
 *
 * `escapeEnabled` is switched off by the caller while a dialog opened FROM the
 * drawer is up, so one Escape closes that dialog, not both.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PostOnboardDrawer({
  title,
  eyebrow,
  subtitle,
  onClose,
  escapeEnabled = true,
  children
}: {
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  onClose: () => void;
  escapeEnabled?: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestClose = useDialogClose(onClose, escapeEnabled);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      if (returnTo && returnTo.isConnected) returnTo.focus();
    };
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-brand-lea/30 dark:bg-black/50" onClick={requestClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-[var(--skyshare-page)] text-left shadow-2xl outline-none sm:max-w-[560px]"
      >
        <div className="flex items-start gap-2 border-b border-brand-lea/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-brand-panel">
          <div className="min-w-0 flex-1">
            {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">{eyebrow}</p> : null}
            <h2 className="truncate text-lg font-semibold text-brand-lea dark:text-slate-100">{title}</h2>
            {subtitle ? <div className="text-xs text-brand-grey dark:text-slate-400">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            data-dialog-close
            onClick={requestClose}
            aria-label="Close"
            className="rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea hover:shadow-glow dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* The one scroll container: the shell is fixed-height, so it scrolls itself. */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">{children}</div>
      </div>
    </div>
  );
}
