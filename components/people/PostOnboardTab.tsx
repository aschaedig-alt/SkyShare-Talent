"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Archive, CalendarClock, Building2, Trash2, ListChecks, MessageSquareText, MessageSquareWarning, RefreshCw, Send, X } from "lucide-react";
import { CheckinRatingRequestDialog, StateChip } from "@/components/people/CheckinRatingRequestDialog";
import { cancelReasonText, type RatingRequestView } from "@/lib/onboarding/checkin-rating-request-shared";
import type { Checkin, EmploymentStatus, GridTaskStatus, PostOnboardHire } from "@/lib/data/onboarding";
import { MAINTENANCE_TASKS } from "@/lib/onboarding/tasks";
import { BulkActionBar, bulkUpdateHires, bulkDeleteHires, type BulkAction, type BulkPatch } from "@/components/people/BulkActionBar";
import { SendTaskEmailButton } from "@/components/people/SendTaskEmailButton";
import { undoTaskEmailSkip } from "@/app/people/actions";
import type { TaskSkipRecord } from "@/lib/front/task-email";
import { EmptyState, Input } from "@/components/ui";
import { formatCalendarDayShort, formatMomentDateShort } from "@/lib/dates/display";
import { CheckinRatingModal } from "@/components/people/CheckinRatingModal";
import { CHECKIN_RATING_TASK_KEY, ratingPoints, type CheckinRatingView } from "@/lib/onboarding/checkin-rating";
import { pointsText } from "@/lib/interviews/scorecard";
import { CheckinReplyModal, LEVEL_STYLE } from "@/components/people/CheckinReplyModal";
import { NO_REPLY_AFTER_DAYS, REPLY_LEVEL_LABEL, needsFollowUp, type CheckinReplyView } from "@/lib/onboarding/checkin-reply";

/** The reply to show in a cell: an unhandled one that needs follow-up first, else the latest. */
function pickReply(list: CheckinReplyView[] | undefined): CheckinReplyView | null {
  if (!list?.length) return null;
  return list.find((r) => needsFollowUp(r.level) && !r.handledAt) ?? list[0];
}

type ReplyFilter = "" | "replied" | "action" | "waiting";

// Quality of Hire, Dec 10 2026: ticking the 90-day check-in done asks for the
// hiring manager's rating first (HR enters it from the manager - his call, Nov 10).
const RATED_CHECKIN = CHECKIN_RATING_TASK_KEY;

// startDate is a chosen calendar day (UTC); onboardedAt is the moment they were
// marked onboarded, so it reads in Mountain. See lib/dates/display.ts.
function fmtDate(iso: string | null) {
  return formatCalendarDayShort(iso) || "—";
}
function fmtMoment(iso: string | null) {
  return formatMomentDateShort(iso) || "—";
}

const POST_ONBOARD_BULK_ACTIONS: BulkAction[] = [
  { kind: "choice", key: "checkin", label: "Mark check-in done", icon: ListChecks, options: MAINTENANCE_TASKS.map((t) => ({ value: t.key, label: t.label })) },
  { kind: "patch", key: "archive", label: "Archive", icon: Archive, patch: { stage: "ARCHIVED" }, confirm: true, tone: "danger" },
  { kind: "date", key: "orientation", label: "Set orientation date", icon: CalendarClock },
  { kind: "text", key: "dept", label: "Set department", icon: Building2, placeholder: "Department" },
  { kind: "delete", key: "delete", label: "Delete", icon: Trash2 }
];

export function PostOnboardTab({
  hires: initial,
  emailTaskKeys,
  taskSends,
  taskSkips
}: {
  hires: PostOnboardHire[];
  /** Check-in keys pointed at a Front template in Manage tasks. Only those get an
   *  envelope, so this grid stays scannable rather than growing an icon per cell. */
  emailTaskKeys: string[];
  /** hireId -> taskKey -> when this app actually sent that check-in email. A
   *  check-in ticked by hand is not a send, so the envelope must not offer to
   *  "resend" one that has never gone out. */
  taskSends: Record<string, Record<string, string>>;
  /** hireId -> taskKey -> who skipped that email, and when. */
  taskSkips: Record<string, Record<string, TaskSkipRecord>>;
}) {
  const router = useRouter();
  const [hires, setHires] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const emailKeys = useMemo(() => new Set(emailTaskKeys), [emailTaskKeys]);
  // Kept here so a skip, or undoing one, shows at once without a reload.
  const [skips, setSkips] = useState(taskSkips);

  // 90-day ratings, loaded once for the people on this list.
  const [ratings, setRatings] = useState<Record<string, CheckinRatingView>>({});
  const [rating, setRating] = useState<{ hire: PostOnboardHire; tick: Checkin | null } | null>(null);
  useEffect(() => {
    const ids = initial.map((h) => h.id);
    if (!ids.length) return;
    let live = true;
    void fetch(`/api/onboarding/checkin-ratings?ids=${encodeURIComponent(ids.join(","))}`)
      .then((r) => (r.ok ? r.json() : { ratings: [] }))
      .then((d: { ratings?: CheckinRatingView[] }) => {
        if (live) setRatings(Object.fromEntries((d.ratings ?? []).map((x) => [x.newHireId, x])));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [initial]);

  // The no-login rating link sent to the hiring manager (feedback cmwcq16o7):
  // hireId -> its current request, plus the requests cancelled because the
  // employee left - those people have usually dropped off this list, so the tab
  // says it in a notice above the grid instead of on their row.
  const [requests, setRequests] = useState<Record<string, RatingRequestView>>({});
  const [leftNotices, setLeftNotices] = useState<RatingRequestView[]>([]);
  const [requestReload, setRequestReload] = useState(0);
  const [openRequest, setOpenRequest] = useState<PostOnboardHire | null>(null);
  useEffect(() => {
    const ids = initial.map((h) => h.id);
    let live = true;
    void fetch(`/api/onboarding/checkin-rating-requests?ids=${encodeURIComponent(ids.join(","))}`)
      .then((r) => (r.ok ? r.json() : { requests: [], leftNotices: [] }))
      .then((d: { requests?: RatingRequestView[]; leftNotices?: RatingRequestView[] }) => {
        if (!live) return;
        setRequests(Object.fromEntries((d.requests ?? []).map((x) => [x.hireId, x])));
        setLeftNotices(d.leftNotices ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [initial, requestReload]);

  async function dismissLeftNotice(hireId: string) {
    setLeftNotices((cur) => cur.filter((n) => n.hireId !== hireId));
    await fetch("/api/onboarding/checkin-rating-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge", hireId })
    }).catch(() => {});
  }

  // Check-in email replies (lib/onboarding/checkin-reply.ts), HR only - a non-HR
  // session gets a 403 here and the grid simply shows no reply icons.
  // hireId -> taskKey -> replies, newest first.
  const [replies, setReplies] = useState<Record<string, Record<string, CheckinReplyView[]>>>({});
  const [replyReload, setReplyReload] = useState(0);
  const [openReply, setOpenReply] = useState<CheckinReplyView | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  useEffect(() => {
    const ids = initial.map((h) => h.id);
    if (!ids.length) return;
    let live = true;
    void fetch(`/api/onboarding/checkin-replies?ids=${encodeURIComponent(ids.join(","))}`)
      .then((r) => (r.ok ? r.json() : { replies: [] }))
      .then((d: { replies?: CheckinReplyView[] }) => {
        if (!live) return;
        const map: Record<string, Record<string, CheckinReplyView[]>> = {};
        for (const r of d.replies ?? []) ((map[r.hireId] ??= {})[r.taskKey] ??= []).push(r);
        setReplies(map);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [initial, replyReload]);

  function replaceReply(saved: CheckinReplyView) {
    setReplies((cur) => {
      const list = (cur[saved.hireId]?.[saved.taskKey] ?? []).map((r) => (r.messageId === saved.messageId ? saved : r));
      return { ...cur, [saved.hireId]: { ...(cur[saved.hireId] ?? {}), [saved.taskKey]: list } };
    });
    setOpenReply(saved);
  }

  async function checkForReplies() {
    setScanning(true);
    setScanNote(null);
    try {
      const res = await fetch("/api/onboarding/checkin-replies/scan", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { found?: unknown[]; errors?: string[]; message?: string };
      if (!res.ok) throw new Error(data.message || "Could not check Front.");
      const n = data.found?.length ?? 0;
      setScanNote(`${n === 0 ? "No new replies" : n === 1 ? "1 new reply" : `${n} new replies`}${data.errors?.length ? ` · ${data.errors.length} problem(s), see the server log` : ""}`);
      setReplyReload((x) => x + 1);
    } catch (e) {
      setScanNote(e instanceof Error ? e.message : "Could not check Front.");
    } finally {
      setScanning(false);
    }
  }

  /** Sent long enough ago to expect an answer, and nothing has come back. */
  function waitingOnReply(hireId: string, key: string): boolean {
    const sent = taskSends[hireId]?.[key];
    if (!sent || replies[hireId]?.[key]?.length) return false;
    return Date.now() - new Date(sent).getTime() >= NO_REPLY_AFTER_DAYS * 86_400_000;
  }

  // Filters. Applied in the browser rather than the server: this list is the
  // post-onboard cohort, which is tens of rows, and it is already fully loaded —
  // a round trip per keystroke would be slower and lose the check-in state that
  // has been toggled optimistically.
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [replyFilter, setReplyFilter] = useState<ReplyFilter>("");

  const departments = useMemo(
    () => [...new Set(hires.map((h) => h.department).filter((d): d is string => Boolean(d && d.trim())))].sort((a, b) => a.localeCompare(b)),
    [hires]
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return hires.filter((h) => {
      if (dept && h.department !== dept) return false;
      if (status && h.employmentStatus !== status) return false;
      // Outstanding = still to do. A skipped (N/A) check-in is handled.
      if (outstandingOnly && !h.checkins.some((c) => c.status === "TODO")) return false;
      if (replyFilter) {
        const mine = Object.values(replies[h.id] ?? {}).flat();
        if (replyFilter === "replied" && !mine.length) return false;
        if (replyFilter === "action" && !mine.some((r) => needsFollowUp(r.level) && !r.handledAt)) return false;
        if (replyFilter === "waiting" && !h.checkins.some((c) => waitingOnReply(h.id, c.key))) return false;
      }
      if (!needle) return true;
      return [h.name, h.position, h.department].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
    // waitingOnReply reads replies and taskSends, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hires, q, dept, status, outstandingOnly, replyFilter, replies, taskSends]);

  const filtered = visible.length !== hires.length;

  // For the people on this list: emails sent, how many have answered, how many still need someone.
  const replyCounts = useMemo(() => {
    let sent = 0;
    let replied = 0;
    let action = 0;
    for (const h of hires) {
      for (const key of Object.keys(taskSends[h.id] ?? {})) {
        if (!key.startsWith("checkin_")) continue;
        sent++;
        const list = replies[h.id]?.[key] ?? [];
        if (list.length) replied++;
        if (list.some((r) => needsFollowUp(r.level) && !r.handledAt)) action++;
      }
    }
    return { sent, replied, action };
  }, [hires, taskSends, replies]);
  function clearFilters() {
    setQ("");
    setDept("");
    setStatus("");
    setOutstandingOnly(false);
    setReplyFilter("");
  }

  // Selection tracks what is ON SCREEN. Select-all must never reach a row a
  // filter is hiding — a bulk archive of rows you cannot see is unrecoverable.
  const allSelected = visible.length > 0 && visible.every((h) => selected.has(h.id));
  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) => {
      const n = new Set(s);
      for (const h of visible) {
        if (allSelected) n.delete(h.id);
        else n.add(h.id);
      }
      return n;
    });
  }
  async function applyBulk(patch: BulkPatch) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    const res = await bulkUpdateHires(ids, patch);
    setBusy(false);
    if (!res.ok) return;
    if (patch.stage) setHires((cur) => cur.filter((h) => !selected.has(h.id)));
    setSelected(new Set());
    router.refresh();
  }
  async function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    const res = await bulkDeleteHires(ids);
    setBusy(false);
    if (!res.ok) {
      window.alert(res.message ?? "Could not delete.");
      return;
    }
    setHires((cur) => cur.filter((h) => !selected.has(h.id)));
    setSelected(new Set());
    router.refresh();
  }

  async function bulkCheckin(_actionKey: string, key: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding-tasks/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hireIds: ids, key, status: "DONE" })
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; archivedIds?: string[]; message?: string };
      if (!res.ok || !data.ok) {
        window.alert(data.message ?? "Could not update check-ins.");
        return;
      }
      const archived = new Set(data.archivedIds ?? []);
      setHires((cur) =>
        cur
          .filter((h) => !archived.has(h.id))
          .map((h) =>
            selected.has(h.id)
              ? { ...h, checkins: h.checkins.map((c) => (c.key === key ? { ...c, status: "DONE" as GridTaskStatus, dueSoon: false } : c)) }
              : h
          )
      );
      setSelected(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setEmployment(hireId: string, status: EmploymentStatus) {
    const prev = hires;
    // Terminating moves the employee to Archived, so drop them from this list.
    setHires((cur) => (status === "TERMINATED" ? cur.filter((h) => h.id !== hireId) : cur.map((h) => (h.id === hireId ? { ...h, employmentStatus: status } : h))));
    try {
      const res = await fetch(`/api/new-hires/${hireId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employmentStatus: status })
      });
      if (!res.ok) throw new Error();
      // Leaving cancels an open rating link; re-read so the notice says so.
      if (status === "TERMINATED") setRequestReload((x) => x + 1);
      if (status === "TERMINATED") router.refresh();
    } catch {
      setHires(prev);
    }
  }

  /** Mark a step's email skipped here - the dialog has already done it on the server. */
  function markSkipped(hireId: string, key: string, rec: TaskSkipRecord, archived: boolean) {
    if (archived) {
      setHires((cur) => cur.filter((h) => h.id !== hireId));
      router.refresh();
      return;
    }
    setSkips((cur) => ({ ...cur, [hireId]: { ...(cur[hireId] ?? {}), [key]: rec } }));
    setHires((cur) =>
      cur.map((h) =>
        h.id === hireId ? { ...h, checkins: h.checkins.map((x) => (x.key === key ? { ...x, status: "NA" as GridTaskStatus, dueSoon: false } : x)) } : h
      )
    );
  }

  async function undoSkip(h: PostOnboardHire, c: Checkin) {
    if (!confirm(`Undo skipping ${h.name}'s ${c.short} check-in? It goes back to not done.`)) return;
    const res = await undoTaskEmailSkip(h.id, c.key);
    if (!res.ok) {
      alert(res.error ?? "Couldn't undo that.");
      return;
    }
    setSkips((cur) => {
      const next = { ...cur, [h.id]: { ...(cur[h.id] ?? {}) } };
      delete next[h.id][c.key];
      return next;
    });
    // Back to not done here too - this grid keeps its own copy of the rows, so a
    // refresh alone would leave the cell reading N/A. DUE is the server's rule
    // (getPostOnboardHires): past the start date plus the check-in's days.
    const due = MAINTENANCE_TASKS.find((m) => m.key === c.key)?.dueDays ?? null;
    const startMs = h.startDate ? new Date(h.startDate).getTime() : null;
    const dueSoon = due !== null && startMs !== null && Date.now() >= startMs + due * 86_400_000;
    setHires((cur) =>
      cur.map((x) =>
        x.id === h.id ? { ...x, checkins: x.checkins.map((y) => (y.key === c.key ? { ...y, status: "TODO" as GridTaskStatus, dueSoon } : y)) } : x
      )
    );
  }

  async function toggle(hireId: string, c: Checkin) {
    if (!c.id) return;
    // Ticking the 90-day check-in done asks for the manager's rating first.
    if (c.key === RATED_CHECKIN && c.status !== "DONE") {
      const hire = hires.find((h) => h.id === hireId);
      if (hire) {
        setRating({ hire, tick: c });
        return;
      }
    }
    await markCheckin(hireId, c);
  }

  async function markCheckin(hireId: string, c: Checkin) {
    if (!c.id) return;
    const next: GridTaskStatus = c.status === "DONE" ? "TODO" : "DONE";
    const prev = hires;
    setHires((cur) =>
      cur.map((h) =>
        h.id === hireId
          ? { ...h, checkins: h.checkins.map((x) => (x.id === c.id ? { ...x, status: next, dueSoon: next === "DONE" ? false : x.dueSoon } : x)) }
          : h
      )
    );
    try {
      const res = await fetch(`/api/onboarding-tasks/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      if (!res.ok) throw new Error();
      const data = (await res.json().catch(() => ({}))) as { archived?: boolean };
      // All check-ins done → the server moved them to Archived. Drop them here.
      if (data.archived) {
        setHires((cur) => cur.filter((h) => h.id !== hireId));
        router.refresh();
      }
    } catch {
      setHires(prev);
    }
  }

  if (hires.length === 0) {
    return <EmptyState title="No post-onboard employees yet." description="Mark an active hire as onboarded and they will appear here." />;
  }

  const heads = hires[0].checkins.map((c) => c.short);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, position, department…"
          aria-label="Search post-onboard employees"
          className="w-64"
        />
        <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter by department" className={"rounded border border-brand-lea/20 bg-white px-2 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by employment status" className={"rounded border border-brand-lea/20 bg-white px-2 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"}>
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="CONTRACT">Contract</option>
          <option value="TERMINATED">Terminated</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-grey dark:text-slate-400">
          <input type="checkbox" checked={outstandingOnly} onChange={(e) => setOutstandingOnly(e.target.checked)} className="h-4 w-4" />
          Outstanding check-ins only
        </label>
        <select value={replyFilter} onChange={(e) => setReplyFilter(e.target.value as ReplyFilter)} aria-label="Filter by check-in reply" className={"rounded border border-brand-lea/20 bg-white px-2 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"}>
          <option value="">Any reply</option>
          <option value="replied">Replied</option>
          <option value="action">Needs action</option>
          <option value="waiting">No reply after {NO_REPLY_AFTER_DAYS} days</option>
        </select>
        {replyCounts.sent > 0 ? (
          <span className="text-xs text-brand-grey dark:text-slate-400" title="Check-in emails sent from this app, for the people on this list">
            {replyCounts.sent} sent · {replyCounts.replied} replied ·{" "}
            <span className={clsx(replyCounts.action > 0 && "font-semibold text-brand-lea dark:text-amber-200")}>{replyCounts.action} need action</span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void checkForReplies()}
          disabled={scanning}
          title="Look in Front for replies to the check-in emails now (it also runs every morning)"
          className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow disabled:opacity-60 dark:border-white/10 dark:text-slate-100"
        >
          <RefreshCw className={clsx("h-3 w-3", scanning && "animate-spin")} />
          {scanning ? "Checking…" : "Check for replies"}
        </button>
        {scanNote ? <span className="text-xs text-brand-grey dark:text-slate-400">{scanNote}</span> : null}
        <span className="ml-auto text-xs text-brand-grey dark:text-slate-400">
          {filtered ? `${visible.length} of ${hires.length}` : `${hires.length}`} shown
        </span>
        {filtered ? (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-100"
          >
            Clear
          </button>
        ) : null}
      </div>
      {rating ? (
        <CheckinRatingModal
          key={rating.hire.id}
          open
          name={rating.hire.name}
          newHireId={rating.hire.id}
          initial={ratings[rating.hire.id] ?? null}
          onClose={() => setRating(null)}
          onSaved={(saved, result) => {
            // The server ticked the 90-day check-in itself; mirror it here (this grid
            // keeps its own copy of the rows), and drop the person if that archived them.
            setRatings((cur) => ({ ...cur, [saved.newHireId]: saved }));
            const hireId = rating.hire.id;
            setRating(null);
            if (result.archived) {
              setHires((cur) => cur.filter((h) => h.id !== hireId));
              router.refresh();
            } else if (result.checkinDone) {
              setHires((cur) =>
                cur.map((h) =>
                  h.id === hireId
                    ? { ...h, checkins: h.checkins.map((c) => (c.key === RATED_CHECKIN ? { ...c, status: "DONE" as GridTaskStatus, dueSoon: false } : c)) }
                    : h
                )
              );
            }
          }}
          onSkip={
            rating.tick
              ? () => {
                  const tick = rating.tick as Checkin;
                  setRating(null);
                  void markCheckin(rating.hire.id, tick);
                }
              : undefined
          }
        />
      ) : null}
      {leftNotices.length ? (
        <div className="space-y-1 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="font-semibold">90-day rating links cancelled because the employee left</div>
          {leftNotices.map((n) => (
            <div key={n.hireId} className="flex flex-wrap items-center gap-2">
              <Link href={`/people/${n.hireId}`} className="font-semibold hover:underline">
                {n.hireName}
              </Link>
              <span>
                sent {formatMomentDateShort(n.lastSentAt)} to {n.toName ?? n.to}, not answered · {cancelReasonText(n)} ({formatMomentDateShort(n.cancelledAt)})
              </span>
              <button
                type="button"
                onClick={() => void dismissLeftNotice(n.hireId)}
                title="Dismiss this notice (the request stays cancelled)"
                aria-label={`Dismiss the notice for ${n.hireName}`}
                className="ml-auto inline-flex items-center rounded p-0.5 transition hover:bg-amber-100 dark:hover:bg-amber-500/20"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {openRequest ? (
        <CheckinRatingRequestDialog
          key={openRequest.id}
          hireId={openRequest.id}
          hireName={openRequest.name}
          request={requests[openRequest.id] ?? null}
          onClose={() => setOpenRequest(null)}
          onChanged={(view) => setRequests((cur) => ({ ...cur, [view.hireId]: view }))}
        />
      ) : null}
      {openReply ? <CheckinReplyModal key={openReply.messageId} reply={openReply} onClose={() => setOpenReply(null)} onSaved={replaceReply} /> : null}
      <BulkActionBar count={selected.size} actions={POST_ONBOARD_BULK_ACTIONS} onApply={applyBulk} onChoice={bulkCheckin} onDelete={deleteSelected} onClear={() => setSelected(new Set())} busy={busy} />
      <div className="overflow-hidden rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-brand-lea/10 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:border-white/10 dark:text-slate-400">
              <th className="w-10 px-3 py-3 text-center"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 align-middle" /></th>
              <th className="px-4 py-3 text-left">Employee</th>
              <th className="px-4 py-3 text-left">Department</th>
              <th className="px-4 py-3 text-left">Started</th>
              <th className="px-4 py-3 text-left">Onboarded</th>
              <th className="px-4 py-3 text-left">Status</th>
              {heads.map((h) => (
                <th key={h} className="px-3 py-3 text-center">{h}</th>
              ))}
              <th className="px-3 py-3 text-center" title="The hiring manager's 90-day rating of the four core values">Values</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((h) => {
              const terminated = h.employmentStatus === "TERMINATED";
              return (
              <tr key={h.id} className={clsx("row-wash border-b border-brand-lea/5 dark:border-white/10 dark:hover:bg-white/5", selected.has(h.id) ? "bg-brand-gold/10" : terminated && "bg-brand-cloudDancer/30 dark:bg-white/5")}>
                <td className="px-3 py-3 text-center">
                  <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleOne(h.id)} aria-label={`Select ${h.name}`} className="h-4 w-4 align-middle" />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/people/${h.id}`} className={clsx("font-semibold hover:underline", terminated ? "text-brand-grey dark:text-slate-400" : "text-brand-lea dark:text-slate-100")}>{h.name}</Link>
                  <div className="text-xs text-brand-grey dark:text-slate-400">{h.position ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-brand-grey dark:text-slate-400">{h.department ?? "—"}</td>
                <td className="px-4 py-3 text-brand-grey dark:text-slate-400">{fmtDate(h.startDate)}</td>
                <td className="px-4 py-3 text-brand-grey dark:text-slate-400">{fmtMoment(h.onboardedAt)}</td>
                <td className="px-4 py-3">
                  <select
                    value={h.employmentStatus}
                    onChange={(e) => setEmployment(h.id, e.target.value as EmploymentStatus)}
                    className={clsx(
                      "rounded border px-2 py-1 text-xs font-semibold outline-none transition",
                      terminated
                        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
                        : h.employmentStatus === "CONTRACT"
                          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                    )}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="TERMINATED">Terminated</option>
                  </select>
                </td>
                {h.checkins.map((c) => {
                  const skip = skips[h.id]?.[c.key];
                  return (
                  <td key={c.key} className="px-3 py-3 text-center">
                    <span className="inline-flex items-center gap-0.5">
                    {c.status === "NA" ? (
                      // Skipped: says so, and who and when, instead of DUE. One click undoes it.
                      <button
                        type="button"
                        onClick={() => void undoSkip(h, c)}
                        title={
                          skip
                            ? `Skipped${skip.skippedBy ? ` by ${skip.skippedBy}` : ""} on ${formatMomentDateShort(skip.skippedAt)} - click to undo`
                            : "Not applicable - click to undo"
                        }
                        className="inline-flex items-center rounded border border-brand-lea/15 bg-brand-cloudDancer/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-grey transition hover:bg-brand-gold/10 hover:text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:text-slate-100"
                      >
                        {skip ? "Skipped" : "N/A"}
                      </button>
                    ) : (
                    <button
                      type="button"
                      onClick={() => toggle(h.id, c)}
                      title={c.status === "DONE" ? "Done — click to undo" : c.dueSoon ? "Due — click when complete" : "Click when complete"}
                      className="inline-flex items-center justify-center rounded transition hover:bg-brand-gold/10"
                    >
                      {c.status === "DONE" ? (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                          <svg width="13" height="13" viewBox="0 0 12 12"><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </span>
                      ) : c.dueSoon ? (
                        <span className="inline-flex animate-pulse items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-2 ring-red-300 dark:ring-red-500/40">
                          due
                        </span>
                      ) : (
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-brand-grey/30" />
                      )}
                    </button>
                    )}
                    {/* Only the check-ins that have been pointed at a template get
                        an envelope. Putting one on all five would add a column of
                        icons to a grid whose whole job is being scannable. A
                        skipped one has nothing left to send until it is undone. */}
                    {emailKeys.has(c.key) && c.status !== "NA" ? (
                      <SendTaskEmailButton
                        compact
                        hireId={h.id}
                        taskKey={c.key}
                        sentAt={taskSends[h.id]?.[c.key] ?? null}
                        taskLabel={`${c.short} check-in — ${h.name}`}
                        taskStatus={c.status}
                        canEdit
                        onSkipped={(rec, archived) => markSkipped(h.id, c.key, rec, archived)}
                        onSent={() =>
                          setHires((cur) =>
                            cur.map((x) =>
                              x.id === h.id
                                ? {
                                    ...x,
                                    checkins: x.checkins.map((y) =>
                                      y.key === c.key ? { ...y, status: "DONE" as GridTaskStatus, dueSoon: false } : y
                                    )
                                  }
                                : x
                            )
                          )
                        }
                      />
                    ) : null}
                    {(() => {
                      const r = pickReply(replies[h.id]?.[c.key]);
                      if (r) {
                        const handled = Boolean(r.handledAt);
                        const urgent = needsFollowUp(r.level) && !handled;
                        const Icon = urgent ? MessageSquareWarning : MessageSquareText;
                        const more = (replies[h.id]?.[c.key]?.length ?? 1) - 1;
                        return (
                          <button
                            type="button"
                            onClick={() => setOpenReply(r)}
                            title={`Replied ${formatMomentDateShort(r.receivedAt)} · ${handled ? "Handled" : REPLY_LEVEL_LABEL[r.level]}: ${r.triage.summary}${more > 0 ? ` (+${more} more)` : ""}`}
                            aria-label={`${h.name} replied to the ${c.short} check-in: ${handled ? "handled" : REPLY_LEVEL_LABEL[r.level]}`}
                            className="relative inline-flex items-center justify-center rounded p-1 transition hover:bg-brand-gold/15 dark:hover:bg-white/10"
                          >
                            <Icon className={clsx("h-4 w-4", handled ? "text-brand-lea dark:text-slate-300" : LEVEL_STYLE[r.level].icon)} />
                            {urgent ? <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-red-600" /> : null}
                          </button>
                        );
                      }
                      if (waitingOnReply(h.id, c.key)) {
                        return (
                          <span
                            className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-brand-grey/80 dark:text-slate-500"
                            title={`Sent ${formatMomentDateShort(taskSends[h.id]?.[c.key])}, no reply yet`}
                          >
                            no reply
                          </span>
                        );
                      }
                      return null;
                    })()}
                    </span>
                  </td>
                  );
                })}
                <td className="px-3 py-3 text-center">
                  {ratings[h.id] ? (
                    <button
                      type="button"
                      onClick={() => setRating({ hire: h, tick: null })}
                      title={`Rated${ratings[h.id].managerName ? ` by ${ratings[h.id].managerName}` : ""} - click to edit`}
                      className="whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-gold/10 dark:text-slate-100"
                    >
                      {pointsText(ratingPoints(ratings[h.id].ratings))}
                      {ratings[h.id].wouldHireAgain === null ? null : (
                        <span className={clsx("ml-1 font-normal", ratings[h.id].wouldHireAgain ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
                          {ratings[h.id].wouldHireAgain ? "· again" : "· not again"}
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRating({ hire: h, tick: null })}
                      className="rounded border border-brand-lea/20 px-2 py-0.5 text-[11px] font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100"
                    >
                      Rate
                    </button>
                  )}
                  {(() => {
                    // The manager's no-login link: its status once sent, else a Send
                    // button while there is no rating yet (feedback cmwcq16o7).
                    const req = requests[h.id];
                    if (req) {
                      const when = req.state === "COMPLETED" ? req.completedAt : req.state === "CANCELLED" ? req.cancelledAt : req.lastSentAt;
                      return (
                        <button
                          type="button"
                          onClick={() => setOpenRequest(h)}
                          title={`Rating link to ${req.toName ?? req.to} - click for status, resend or cancel`}
                          className="mt-1 flex w-full items-center justify-center gap-1 whitespace-nowrap rounded px-1 py-0.5 text-[10px] text-brand-grey transition hover:bg-brand-gold/10 dark:text-slate-400"
                        >
                          <StateChip view={req} />
                          {formatMomentDateShort(when)}
                        </button>
                      );
                    }
                    if (ratings[h.id] || terminated) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => setOpenRequest(h)}
                        title="Email the hiring manager a link to rate this person - no login needed"
                        className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-brand-lea transition hover:shadow-glow dark:text-slate-100"
                      >
                        <Send className="h-3 w-3" />
                        Send to manager
                      </button>
                    );
                  })()}
                </td>
              </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7 + heads.length} className="px-4 py-8 text-center text-sm text-brand-grey dark:text-slate-400">
                  No post-onboard employees match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="border-t border-brand-lea/10 px-4 py-3 text-xs text-brand-grey dark:border-white/10 dark:text-slate-400">
        Check-ins are 30 / 60 / 90-day, benefits and the social media announcement — tell me the ones you actually run and I will swap them in.
      </p>
      </div>
    </div>
  );
}
