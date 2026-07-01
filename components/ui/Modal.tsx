"use client";

import { clsx } from "clsx";

// Shared modal shell — dimmed overlay + centered panel, matching the existing
// `fixed inset-0 z-50 … bg-black/50` pattern. Click-outside calls onClose unless
// `busy`. Content, header, and footer are yours to compose; this just gives one
// consistent frame so modals stop being rebuilt from scratch each time.

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Tailwind max-w-* class for the panel. Default max-w-md. */
  maxWidth?: string;
  /** When true, clicking the backdrop won't close (e.g. mid-save). */
  busy?: boolean;
  className?: string;
};

export function Modal({ open, onClose, children, maxWidth = "max-w-md", busy = false, className }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !busy && onClose()} />
      <div className={clsx("relative w-full rounded bg-white p-5 shadow-2xl dark:bg-brand-panel", maxWidth, className)}>{children}</div>
    </div>
  );
}
