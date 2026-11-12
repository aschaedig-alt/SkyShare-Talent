"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import type { InterviewDetail } from "@/lib/data/interview-detail";
import { InterviewBody } from "@/components/interviews/InterviewDetailWorkspace";
import { useDialogClose } from "@/lib/hooks/useDialogClose";
import { formatCalendarDayShort } from "@/lib/dates/display";

/**
 * An interview, opened in a drawer over the list it was clicked from.
 *
 * Aimee, Nov 11 2026 (feedback cmwco78eg), on /interviews/<id>: "this view is
 * weird. im not sure i love it opening into an entirely new page." It was also
 * split: the write-up lived on the candidate's Interviews tab and the scorecards
 * on their own page. The drawer shows both, each open and each collapsible (her
 * pick: "auto expand with the ability to collapse").
 *
 * /interviews/<id> still exists as the full page. Every way in is a real link to
 * it, so ctrl-click and right-click still open a new tab (CLAUDE.md: anything
 * that changes the whole screen is a real link); only a plain click is turned
 * into "open the drawer". The open drawer is also in the URL as ?interview=<id>,
 * so a pasted link reopens it.
 *
 * Scroll: the drawer is a genuinely fixed-height shell (the full viewport
 * height), so its body is the one scroll container, both axes pinned. The page
 * behind is locked while it is open, so there is still one scrollbar.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

export const INTERVIEW_PARAM = "interview";

/**
 * Which interview's drawer is open, mirrored into the URL (?interview=<id>) so a
 * pasted link reopens it. replaceState rather than a navigation: opening a
 * drawer swaps a pane on the same page, it is not a new screen.
 *
 * The open id is LOCAL state, read from the URL once on load. Do not derive it
 * from useSearchParams alone: in this app a bare history.replaceState did not
 * re-render useSearchParams (tested Nov 11 2026 — the address bar changed, the
 * drawer never opened). The effect below still follows a real navigation that
 * changes the param.
 */
export function useInterviewDrawerParam() {
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get(INTERVIEW_PARAM);
  const [openId, setOpenId] = useState<string | null>(fromUrl);

  useEffect(() => {
    setOpenId(fromUrl);
  }, [fromUrl]);

  const setParam = useCallback((id: string | null) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set(INTERVIEW_PARAM, id);
    else url.searchParams.delete(INTERVIEW_PARAM);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  return {
    openId,
    open: useCallback((id: string) => setParam(id), [setParam]),
    close: useCallback(() => setParam(null), [setParam])
  };
}

/** True for a click the browser should handle itself: new tab, new window, download. */
export function isModifiedClick(event: React.MouseEvent) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/**
 * A real link to /interviews/<id> whose plain click opens the drawer instead.
 * Ctrl/cmd/shift/middle-click and the right-click menu behave like any link.
 */
export function InterviewDrawerLink({
  interviewId,
  onOpen,
  className,
  title,
  children
}: {
  interviewId: string;
  onOpen: (id: string) => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/interviews/${interviewId}`}
      className={className}
      title={title}
      onClick={(event) => {
        if (isModifiedClick(event)) return;
        event.preventDefault();
        onOpen(interviewId);
      }}
    >
      {children}
    </Link>
  );
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; detail: InterviewDetail };

export function InterviewDrawer({
  interviewId,
  onClose,
  siblings,
  onNavigate,
  showCandidate = true
}: {
  interviewId: string;
  onClose: () => void;
  /** The list it was opened from, newest first, for the previous/next arrows. */
  siblings?: string[];
  onNavigate?: (id: string) => void;
  /** Off on the candidate's own page, where the name is already on screen. */
  showCandidate?: boolean;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editing, setEditing] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setState({ status: "loading" });
      try {
        const res = await fetch(`/api/interviews/${interviewId}`, { cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { message?: string };
          throw new Error(res.status === 404 ? "This interview could not be found." : body.message ?? "Could not load this interview.");
        }
        setState({ status: "ready", detail: (await res.json()) as InterviewDetail });
      } catch (caught) {
        setState({ status: "error", message: caught instanceof Error ? caught.message : "Could not load this interview." });
      }
    },
    [interviewId]
  );

  useEffect(() => {
    setEditing(false);
    void load();
  }, [load]);

  // Escape, the X and a click on the dim area all close it, and all three ask
  // first while a scorecard is half-written.
  const requestClose = useDialogClose(onClose, true, {
    isDirty: editing,
    message: "You have a scorecard open that isn't saved. Close and lose it?"
  });

  // Lock the page behind, restoring whatever it had before.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Focus in on open, and back to whatever opened it on close.
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

  const index = siblings ? siblings.indexOf(interviewId) : -1;
  const prevId = index > 0 ? siblings![index - 1] : null;
  const nextId = index >= 0 && index < siblings!.length - 1 ? siblings![index + 1] : null;

  function step(id: string | null) {
    if (!id || !onNavigate) return;
    if (editing && !window.confirm("You have a scorecard open that isn't saved. Leave it?")) return;
    onNavigate(id);
  }

  const detail = state.status === "ready" ? state.detail : null;
  const iconBtn =
    "rounded p-1.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100";

  return (
    <div className="fixed inset-0 z-50" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-brand-lea/30 dark:bg-black/50" onClick={requestClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={detail ? `${detail.title} interview` : "Interview"}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-[var(--skyshare-page)] text-left shadow-2xl outline-none sm:max-w-[680px]"
      >
        {/* Header */}
        <div className="flex items-start gap-2 border-b border-brand-lea/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-brand-panel">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Interview</p>
            <h2 className="truncate text-lg font-semibold text-brand-lea dark:text-slate-100">{detail?.title ?? " "}</h2>
            {detail ? (
              <p className="text-xs text-brand-grey dark:text-slate-400">
                {showCandidate ? (
                  <>
                    <Link href={`/candidates/${detail.candidate.id}?tab=interviews`} className="font-semibold text-brand-lea underline-offset-2 hover:underline dark:text-slate-100">
                      {detail.candidate.displayName}
                    </Link>
                    {" · "}
                  </>
                ) : null}
                {formatCalendarDayShort(detail.startDateTime)}
                {detail.job ? ` · ${detail.job.title}` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {siblings && siblings.length > 1 ? (
              <>
                <button type="button" onClick={() => step(prevId)} disabled={!prevId} className={iconBtn} title="Newer interview" aria-label="Newer interview">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => step(nextId)} disabled={!nextId} className={iconBtn} title="Older interview" aria-label="Older interview">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            ) : null}
            <Link
              href={`/interviews/${interviewId}`}
              className="ml-1 inline-flex items-center gap-1 rounded border border-brand-lea/20 px-2 py-1 text-[11px] font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Full page
            </Link>
            <button type="button" data-dialog-close onClick={requestClose} className={iconBtn} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body: the one scroll container (see the note at the top). */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
          {state.status === "loading" ? (
            <p className="py-10 text-center text-sm text-brand-grey dark:text-slate-400">Loading…</p>
          ) : state.status === "error" ? (
            <div className="rounded bg-white p-4 text-sm shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
              <p className="font-semibold text-red-700 dark:text-red-300">{state.message}</p>
              <button type="button" onClick={() => void load()} className="mt-2 text-xs font-semibold text-brand-lea underline-offset-2 hover:underline dark:text-slate-100">
                Try again
              </button>
            </div>
          ) : (
            <InterviewBody
              key={state.detail.id}
              detail={state.detail}
              onChanged={() => void load({ quiet: true })}
              onEditingChange={setEditing}
            />
          )}
        </div>
      </div>
    </div>
  );
}
