"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X, Lightbulb, Bug, HelpCircle, Check, Loader, ImagePlus, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { useDialogClose } from "@/lib/hooks/useDialogClose";

type FeedbackType = "IDEA" | "BUG" | "QUESTION";

const TYPES: Array<{ value: FeedbackType; label: string; icon: typeof Lightbulb }> = [
  { value: "IDEA", label: "Idea", icon: Lightbulb },
  { value: "BUG", label: "Bug", icon: Bug },
  { value: "QUESTION", label: "Question", icon: HelpCircle }
];

// Context auto-captured with every submission. The pathname alone is not enough to
// act on a report: it drops the query string (so ?id= / ?tab= — i.e. WHICH record
// you were looking at — is lost), and it says nothing about screen size, which is
// usually the whole story behind "this button is cut off".
type FeedbackContext = {
  url: string;
  viewport: string;
  screen: string;
  dpr: number;
  theme: "light" | "dark";
  userAgent: string;
  errors?: string[];
};

// Recent runtime errors, captured passively via event listeners (no console
// monkey-patching) so a bug report can carry what actually blew up. Newest last.
const recentErrors: string[] = [];
function rememberError(msg: string) {
  recentErrors.push(msg.slice(0, 300));
  if (recentErrors.length > 5) recentErrors.shift();
}

function collectContext(): FeedbackContext | null {
  if (typeof window === "undefined") return null;
  return {
    url: window.location.href,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    dpr: window.devicePixelRatio ?? 1,
    theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    userAgent: navigator.userAgent,
    errors: recentErrors.length ? [...recentErrors] : undefined
  };
}

// Screenshot attachment. Kept in step with the server: same types, same 10 MB cap
// (lib/files/feedback-file-storage.ts), so a bad file is caught here with a clear
// message instead of costing a round-trip. SVG is excluded on both sides — it is a
// script-carrying document, not a picture.
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function imageProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type.toLowerCase())) return "Attach a PNG, JPG, GIF or WEBP image.";
  if (file.size > MAX_IMAGE_BYTES) return "That image is larger than the 10 MB limit.";
  return null;
}

// A pasted screenshot arrives as an unnamed blob ("image.png" at best), so give it
// a name that says where it came from — the admin reading this later gets the page
// in the filename without having to cross-reference anything.
function pastedImageName(pathname: string, type: string): string {
  const extension = type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const slug = pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "page";
  return `screenshot-${slug}.${extension}`;
}

export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("IDEA");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optional screenshot + its local preview URL.
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Passively remember runtime errors so a bug report can carry them.
  useEffect(() => {
    const onError = (e: ErrorEvent) => rememberError(`${e.message} (${e.filename ?? "?"}:${e.lineno ?? 0})`);
    const onRejection = (e: PromiseRejectionEvent) => rememberError(`Unhandled rejection: ${String(e.reason)}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Object URL for the thumbnail, revoked on change/unmount so we don't leak it.
  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  // Paste a screenshot straight in (Win+Shift+S then Ctrl+V). This is the whole
  // point: the moment someone can screenshot the problem, making them save a file
  // and find it in a dialog is what stops them bothering. Only while the panel is
  // open, so we never swallow a paste meant for the page underneath.
  useEffect(() => {
    if (!open || done) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])][0];
      if (!file || !file.type.startsWith("image/")) return; // a normal text paste
      e.preventDefault();
      const problem = imageProblem(file);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      setImage(new File([file], pastedImageName(pathname, file.type), { type: file.type }));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, done, pathname]);

  const hasDraft = message.trim().length > 0 || image !== null;

  function reset() {
    setType("IDEA");
    setMessage("");
    setDone(false);
    setError(null);
    setImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function chooseImage(file: File | undefined) {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setImage(file);
  }

  /**
   * Closing KEEPS what you typed. The whole workflow here is: start writing, go
   * and grab a screenshot (Win+Shift+S), come back and paste it in — and taking
   * that screenshot means clicking away from this panel. Wiping the draft on the
   * way out made the panel actively hostile to the thing it exists for.
   *
   * So this minimises rather than closes, and the tile shows a dot to say the
   * draft is still there. Only a successful send, or Clear, empties it.
   */
  function minimize() {
    setOpen(false);
    setError(null);
  }

  // Deliberately NOT guarded with isDirty — nothing is lost on close here.
  useDialogClose(minimize, open);

  async function submit() {
    if (message.trim().length < 2) {
      setError("Please enter a bit more detail.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Only reach for multipart when there is actually a file: the JSON path is
      // the common case and stays exactly as it was.
      let res: Response;
      if (image) {
        const form = new FormData();
        form.set("type", type);
        form.set("message", message.trim());
        form.set("page", pathname);
        form.set("context", JSON.stringify(collectContext()));
        form.set("image", image, image.name);
        // No Content-Type header — the browser must set the multipart boundary.
        res = await fetch("/api/feedback", { method: "POST", body: form });
      } else {
        res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, message: message.trim(), page: pathname, context: collectContext() })
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message ?? "Unable to send feedback.");
      }
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Rail tile, sitting with the other sidebar utilities. It used to float
          over the page, which is what let it be dragged off-screen and hide behind
          dialogs; in the rail neither is possible. The dot marks an unsent draft. */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "relative mt-2 flex h-9 w-9 items-center justify-center rounded transition print:hidden",
          open ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
        )}
        aria-label="Send feedback"
        title="Send feedback"
      >
        <MessageSquare className="h-5 w-5" />
        {hasDraft && !open && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-gold" title="You have an unsent draft" />
        )}
      </button>

      {/* Click-away backdrop (transparent) */}
      {open && <div className="fixed inset-0 z-[55]" onClick={minimize} aria-hidden="true" />}

      {/* Panel — anchored to the button's (possibly moved) location. */}
      {open && (
        <div className="fixed bottom-5 left-[76px] z-[60] w-[min(360px,calc(100vw-2.5rem))] rounded border border-brand-lea/15 bg-white shadow-2xl dark:border-white/10 dark:bg-brand-panel">
          <div className="flex items-center justify-between border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
            <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">Send feedback</span>
            <button onClick={minimize} data-dialog-close className="text-brand-grey hover:text-brand-lea dark:text-slate-400" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {done ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                <Check className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
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

              {/* Screenshot: pasted or picked. */}
              <input
                ref={fileInputRef}
                type="file"
                accept={IMAGE_TYPES.join(",")}
                className="hidden"
                onChange={(e) => chooseImage(e.target.files?.[0])}
              />

              {image && preview ? (
                <div className="mt-2 flex items-center gap-2 rounded border border-brand-lea/15 bg-brand-cloudDancer/30 p-2 dark:border-white/10 dark:bg-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote asset */}
                  <img src={preview} alt="" className="h-12 w-12 rounded object-cover" />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-brand-grey dark:text-slate-400">
                    {image.name}
                  </span>
                  <button
                    onClick={() => {
                      setImage(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="rounded p-1 text-brand-grey transition hover:text-red-600 dark:text-slate-400"
                    aria-label="Remove image"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-brand-lea/25 px-2 py-2 text-[11px] font-medium text-brand-grey transition hover:border-brand-lea hover:shadow-glow dark:border-white/15 dark:text-slate-400"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Add a screenshot — or just paste one
                </button>
              )}

              <p className="mt-2 flex items-center gap-1 text-[11px] text-brand-grey dark:text-slate-400">
                <span className="truncate">Auto-attached: this exact page, your screen size, browser &amp; account</span>
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
