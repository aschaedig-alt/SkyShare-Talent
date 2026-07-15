"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X, Lightbulb, Bug, HelpCircle, Check, Loader } from "lucide-react";
import { clsx } from "clsx";

type FeedbackType = "IDEA" | "BUG" | "QUESTION";

const TYPES: Array<{ value: FeedbackType; label: string; icon: typeof Lightbulb }> = [
  { value: "IDEA", label: "Idea", icon: Lightbulb },
  { value: "BUG", label: "Bug", icon: Bug },
  { value: "QUESTION", label: "Question", icon: HelpCircle }
];

// Where the user has dragged the button to, if anywhere. null = default corner.
type Position = { x: number; y: number };
const POSITION_KEY = "feedback-button-position";
const EDGE = 8; // keep this far from the viewport edges

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// Anchor the open panel near the (possibly moved) button, clamped on-screen.
function panelPosition(pos: Position): { left: number; top: number } | undefined {
  if (typeof window === "undefined") return undefined;
  const panelW = Math.min(360, window.innerWidth - 40);
  const panelH = 340; // approximate; clamp just keeps it fully visible
  return {
    left: clamp(pos.x, EDGE, window.innerWidth - panelW - EDGE),
    top: clamp(pos.y, EDGE, window.innerHeight - panelH - EDGE)
  };
}

export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("IDEA");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draggable position (shift-click + drag). Persisted so it stays out of the way.
  const [pos, setPos] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  // Set true at the end of a drag so the trailing click doesn't open the panel.
  const suppressClickRef = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Position>;
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          setPos({ x: parsed.x, y: parsed.y });
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  function startDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!e.shiftKey) return; // plain click opens the panel; shift-drag moves it
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    const { width, height } = rect;
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      suppressClickRef.current = true;
      setPos({
        x: clamp(ev.clientX - offsetX, EDGE, window.innerWidth - width - EDGE),
        y: clamp(ev.clientY - offsetY, EDGE, window.innerHeight - height - EDGE)
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(false);
      setPos((current) => {
        if (current) {
          try {
            localStorage.setItem(POSITION_KEY, JSON.stringify(current));
          } catch {
            /* ignore */
          }
        }
        return current;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function handleClick(e: React.MouseEvent) {
    if (e.shiftKey) return; // shift is reserved for dragging
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return; // this click is the tail end of a drag
    }
    setOpen(true);
  }

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
      {/* Floating button. Shift-click + drag to reposition (stays out of the
          way when resizing panels); position persists across reloads. */}
      {!open && (
        <button
          onPointerDown={startDrag}
          onClick={handleClick}
          style={pos ? { left: pos.x, top: pos.y, bottom: "auto", right: "auto" } : undefined}
          className={clsx(
            "fixed z-40 flex items-center gap-2 rounded bg-brand-lea px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-brand-eden print:hidden",
            !pos && "bottom-5 right-5",
            dragging ? "cursor-grabbing select-none" : "cursor-pointer"
          )}
          aria-label="Send feedback"
          title="Shift-click and drag to move"
        >
          <MessageSquare className="h-5 w-5" />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {/* Click-away backdrop (transparent) */}
      {open && <div className="fixed inset-0 z-30" onClick={close} aria-hidden="true" />}

      {/* Panel — anchored to the button's (possibly moved) location. */}
      {open && (
        <div
          style={pos ? panelPosition(pos) : undefined}
          className={clsx(
            "fixed z-40 w-[min(360px,calc(100vw-2.5rem))] rounded border border-brand-lea/15 bg-white shadow-2xl dark:border-white/10 dark:bg-brand-panel",
            !pos && "bottom-5 right-5"
          )}
        >
          <div className="flex items-center justify-between border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
            <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">Send feedback</span>
            <button onClick={close} className="text-brand-grey hover:text-brand-lea dark:text-slate-400" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {done ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <Check className="h-5 w-5 text-emerald-700" />
              </div>
              <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">Thanks for the feedback!</p>
              <p className="text-xs text-brand-grey dark:text-slate-400">We&apos;ll take a look.</p>
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
                        "flex flex-1 items-center justify-center gap-1.5 rounded border px-2 py-2 text-xs font-semibold transition hover:shadow-glow",
                        active
                          ? "border-brand-lea bg-brand-lea text-white"
                          : "border-brand-lea/15 bg-white text-brand-grey hover:bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
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
                className="w-full resize-none rounded border border-brand-lea/20 px-3 py-2 text-sm focus:border-brand-lea focus:outline-none dark:border-white/10"
              />

              <p className="mt-2 flex items-center gap-1 text-[11px] text-brand-grey dark:text-slate-400">
                <span className="truncate">Auto-attached: this page &amp; your account</span>
              </p>

              {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

              <button
                onClick={submit}
                disabled={submitting}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-brand-lea px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
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
