"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X, Lightbulb, Bug, HelpCircle, Check, Loader } from "lucide-react";
import { clsx } from "clsx";

type FeedbackType = "IDEA" | "BUG" | "QUESTION";

const TYPES: Array<{ value: FeedbackType; label: string; icon: typeof Lightbulb }> = [
  { value: "IDEA", label: "Idea", icon: Lightbulb },
  { value: "BUG", label: "Bug", icon: Bug },
  { value: "QUESTION", label: "Question", icon: HelpCircle }
];

export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("IDEA");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setType("IDEA");
    setMessage("");
    setDone(false);
    setError(null);
  }

  function close() {
    setOpen(false);
    // brief delay so the closing animation doesn't show a reset form
    setTimeout(reset, 200);
  }

  async function submit() {
    if (message.trim().length < 2) {
      setError("Please enter a bit more detail.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: message.trim(), page: pathname })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "Unable to send feedback.");
      }
      setDone(true);
      setTimeout(close, 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded bg-brand-lea px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-eden"
          aria-label="Send feedback"
        >
          <MessageSquare className="h-5 w-5" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {/* Click-away backdrop (transparent) */}
      {open && <div className="fixed inset-0 z-30" onClick={close} aria-hidden="true" />}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 w-[min(360px,calc(100vw-2.5rem))] rounded-xl border border-brand-lea/15 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-brand-lea/10 px-4 py-3">
            <span className="text-sm font-semibold text-brand-lea">Send feedback</span>
            <button onClick={close} className="text-brand-grey hover:text-brand-lea" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {done ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-5 w-5 text-emerald-700" />
              </div>
              <p className="text-sm font-semibold text-brand-lea">Thanks for the feedback!</p>
              <p className="text-xs text-brand-grey">We&apos;ll take a look.</p>
            </div>
          ) : (
            <div className="p-4">
              {/* Type chips */}
              <div className="mb-3 flex gap-2">
                {TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = type === t.value;
                  return (
                    <button
                      key={t.value}
                      onClick={() => setType(t.value)}
                      className={clsx(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition",
                        active
                          ? "border-brand-lea bg-brand-lea text-white"
                          : "border-brand-lea/15 bg-white text-brand-grey hover:bg-brand-cloudDancer/40"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                autoFocus
                placeholder={
                  type === "BUG"
                    ? "What went wrong? What were you trying to do?"
                    : type === "QUESTION"
                      ? "What would you like to know?"
                      : "What would make this better?"
                }
                className="w-full resize-none rounded-lg border border-brand-lea/20 px-3 py-2 text-sm focus:border-brand-lea focus:outline-none"
              />

              <p className="mt-2 flex items-center gap-1 text-[11px] text-brand-grey">
                <span className="truncate">Auto-attached: this page &amp; your account</span>
              </p>

              {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}

              <button
                onClick={submit}
                disabled={submitting}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand-lea px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
              >
                {submitting && <Loader className="h-4 w-4 animate-spin" />}
                {submitting ? "Sending…" : "Send feedback"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
