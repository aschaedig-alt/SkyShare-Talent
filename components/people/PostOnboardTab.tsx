"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Archive, CalendarClock, Building2, Trash2, ListChecks, MessageSquareText, MessageSquareWarning, RefreshCw, Send, SkipForward, X } from "lucide-react";
import { BulkRatingSendDialog } from "@/components/people/BulkRatingSendDialog";
import { CheckinRatingRequestDialog, StateChip } from "@/components/people/CheckinRatingRequestDialog";
import { cancelReasonText, type RatingRequestView } from "@/lib/onboarding/checkin-rating-request-shared";
import type { Checkin, EmploymentStatus, GridTaskStatus, PostOnboardHire } from "@/lib/data/onboarding";
import { MAINTENANCE_TASKS } from "@/lib/onboarding/tasks";
import { BulkActionBar, bulkUpdateHires, bulkDeleteHires, type BulkAction, type BulkPatch } from "@/components/people/BulkActionBar";
import { SendTaskEmailButton } from "@/components/people/SendTaskEmailButton";
import { skipTaskEmail, skipTasksBulk, undoTaskEmailSkip } from "@/app/people/actions";
import type { TaskSkipRecord } from "@/lib/front/task-email";
import { EmptyState, Input } from "@/components/ui";
import { formatMomentDateShort } from "@/lib/dates/display";
import { DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";
import { CheckinRatingModal } from "@/components/people/CheckinRatingModal";
import { RATED_CHECKINS, ratedCheckin, ratedCheckinForTask, ratingPoints, scaleSummary, type CheckinRatingView, type RatedCheckin } from "@/lib/onboarding/checkin-rating";
import { pointsText } from "@/lib/interviews/scorecard";
import { CheckinReplyModal, LEVEL_STYLE } from "@/components/people/CheckinReplyModal";
import { PostOnboardDrawer } from "@/components/people/PostOnboardDrawer";
import { NO_REPLY_AFTER_DAYS, REPLY_LEVEL_LABEL, needsFollowUp, type CheckinReplyView } from "@/lib/onboarding/checkin-reply";

/** The reply to show in a cell: an unhandled one that needs follow-up first, else the latest. */
function pickReply(list: CheckinReplyView[] | undefined): CheckinReplyView | null {
  if (!list?.length) return null;
  return list.find((r) => needsFollowUp(r.level) && !r.handledAt) ?? list[0];
}

type ReplyFilter = "" | "replied" | "action" | "waiting";

// The rated check-ins (90-day, 6-month, 12-month - lib/onboarding/checkin-rating.ts
// RATED_CHECKINS): ticking one done asks for the manager's rating first, and each
// carries its own rating and rating link under its tick.
/** Map key for one person's rating or rating link at one check-in. */
const rk = (hireId: string, dayMark: number) => `${hireId}:${dayMark}`;

// startDate is a chosen calendar day (UTC); onboardedAt is the moment they were
// marked onboarded, so it reads in Mountain. See lib/dates/display.ts.
function fmtMoment(iso: string | null) {
  return formatMomentDateShort(iso) || "—";
}

const POST_ONBOARD_BULK_ACTIONS: BulkAction[] = [
  { kind: "choice", key: "checkin", label: "Mark check-in done", icon: ListChecks, options: MAINTENANCE_TASKS.map((t) => ({ value: t.key, label: t.label })) },
  // For older check-ins that fell due before the check-ins existed and did not happen (his ask, Nov 14 2026).
  { kind: "choice", key: "skip", label: "Mark check-in skipped", icon: SkipForward, options: MAINTENANCE_TASKS.map((t) => ({ value: t.key, label: t.label })) },
  // One email per manager with a link per person (his ask, Nov 14 2026). Opens a
  // dialog that groups the ticked people by supervisor; nothing sends from here.
  { kind: "choice", key: "sendRating", label: "Send manager check-in", icon: Send, options: RATED_CHECKINS.map((c) => ({ value: String(c.dayMark), label: c.title })) },
  { kind: "patch", key: "archive", label: "Archive", icon: Archive, patch: { stage: "ARCHIVED" }, confirm: true, tone: "danger" },
  { kind: "date", key: "orientation", label: "Set orientation date", icon: CalendarClock },
  { kind: "text", key: "dept", label: "Set department", icon: Building2, placeholder: "Department" },
  { kind: "delete", key: "delete", label: "Delete", icon: Trash2 }
];

/** A header cell that sticks to the top of the window, with its own background and bottom rule.
 * top-12 below lg: AppShell draws a fixed h-12 top bar there (z-30), which would cover a
 * header stuck at top-0. lg and up has no bar. */
const HEAD_CELL =
  "sticky top-12 lg:top-0 z-10 bg-white py-3 shadow-[inset_0_-1px_0_rgba(13,44,67,0.1)] dark:bg-brand-panel dark:shadow-[inset_0_-1px_0_rgba(255,255,255,0.1)]";

/**
 * THE LAYOUT (his pick, design #17 of the Nov 13 2026 Post-onboard Designs page):
 * one all-status view, columns grouped by what they are, narrow sideways names,
 * a due-count row, and every action in a drawer that opens from any cell. His
 * column order: Employee | Department | Started | Status | Social | 401k |
 * 30-day | 60-day | 90-day | 6-month | 12-month, then space on the right left
 * empty on purpose for columns added later.
 *
 * 90-day, 6-month and 12-month ARE the manager check-ins (his words): one column
 * each, the tick and the manager's rating / rating link in the same cell.
 * A check-in key not listed here (a future one) joins Check-ins at the end, so a
 * new task never silently disappears from the grid.
 */
const COLUMN_GROUPS: Array<{ key: "task" | "ck" | "mgr"; label: string; keys: string[] }> = [
  { key: "task", label: "One-time tasks", keys: ["social_announcement", "benefits_enrolled"] },
  { key: "ck", label: "Check-ins", keys: ["checkin_30", "checkin_60"] },
  { key: "mgr", label: "Manager check-ins", keys: ["checkin_90", "checkin_180", "checkin_365"] }
];
/** His word for the benefits step on this grid (Nov 13 2026): 401k. */
const COLUMN_LABEL: Record<string, string> = { benefits_enrolled: "401k" };
const columnLabel = (c: { key: string; short: string }) => COLUMN_LABEL[c.key] ?? c.short;

const STATUS_LETTER: Record<EmploymentStatus, string> = { ACTIVE: "A", TERMINATED: "T", CONTRACT: "C" };
const STATUS_WORD: Record<EmploymentStatus, string> = { ACTIVE: "Active", TERMINATED: "Terminated", CONTRACT: "Contract" };
const STATUS_TONE: Record<EmploymentStatus, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  CONTRACT: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  TERMINATED: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
};

/** Group tints: the manager check-ins get a faint gold wash, the tasks a faint blue one. */
const GROUP_TINT: Record<"task" | "ck" | "mgr", string> = {
  task: "bg-brand-sweet/[0.08] dark:bg-white/[0.03]",
  ck: "",
  mgr: "bg-brand-gold/[0.07] dark:bg-brand-gold/[0.06]"
};
/** Opaque versions for the sticky header, or rows show through it while scrolling. */
const GROUP_HEAD: Record<"task" | "ck" | "mgr", string> = {
  task: "bg-[#f6f9fc] dark:bg-[#11273e]",
  ck: "bg-white dark:bg-brand-panel",
  mgr: "bg-[#fefbf1] dark:bg-[#162a3a]"
};
const GROUP_RULE: Record<"task" | "ck" | "mgr", string> = {
  task: "shadow-[inset_0_-2px_0_rgba(13,44,67,0.15)] dark:shadow-[inset_0_-2px_0_rgba(255,255,255,0.15)]",
  ck: "shadow-[inset_0_-2px_0_#a6c9e7]",
  mgr: "shadow-[inset_0_-2px_0_rgba(234,170,0,0.6)]"
};

/**
 * Dates on this grid are calendar days (start date + N days, read in UTC), written
 * MM/DD/YYYY - his format, Nov 14 2026. The cells under a check-in use MM/DD/YY
 * only because MM/DD/YYYY does not fit a 52px column; the hover gives the full one.
 */
function mdy(ms: number, shortYear = false): string {
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${mm}/${dd}/${shortYear ? yyyy.slice(2) : yyyy}`;
}
/**
 * Sample A of the Nov 14 2026 Post-onboard Review (his pick). An open check-in shows
 * how late it is (+43d) or how soon it falls due (in 77d), not the date. Lateness
 * steps up at 15 days, and from STALE_AFTER_DAYS it greys out with a "skip?" hint
 * and no Send - by then the check-in is probably better skipped than sent late.
 * 45 is where the review's slider started; change it here.
 */
const STALE_AFTER_DAYS = 45;
const LATE_STEP_DAYS = 15;
/**
 * Skim colours (his ask, Nov 14 2026: "easier when skimming the list"; settled the
 * same day after the five-reviewer audit). Only a check-in that needs HR gets a
 * tile: light yellow from SOON_DAYS out to the due day, light red once past due.
 * Not due yet is plain text, no tile (his pick: the grey tiles drowned the few that
 * matter). Once a manager rating link is sent, the check-in is no longer HR's
 * problem: its days lose their colour and the caption is a light-grey pill with a
 * paper plane and the sent date (his words: "once the check-in has been sent, even
 * if late, I don't need the red text anymore"). Done, skipped and N/A carry no tile.
 */
const SOON_DAYS = 14;
const TILE = {
  soon: "bg-amber-50 ring-1 ring-amber-200/70 dark:bg-amber-500/10 dark:ring-amber-500/20",
  late: "bg-red-50 ring-1 ring-red-200/70 dark:bg-red-500/10 dark:ring-red-500/25"
} as const;
const SENT_PILL = "inline-flex items-center gap-1 whitespace-nowrap rounded bg-slate-100 px-1.5 py-px text-[10px] font-medium tabular-nums text-brand-lea dark:bg-white/10 dark:text-slate-200";

/** Today's calendar day in the office time zone, as UTC midnight - the same on the server and in the browser, so the day counts hydrate cleanly. */
function officeTodayUtc(): number {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function mdyIso(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? "—" : mdy(ms);
}

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
  /** The person whose drawer is open (design #17: every action lives there). */
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emailKeys = useMemo(() => new Set(emailTaskKeys), [emailTaskKeys]);
  // Kept here so a skip, or undoing one, shows at once without a reload.
  const [skips, setSkips] = useState(taskSkips);

  // Check-in ratings (90-day, 6-month, 12-month), loaded once for the people on this list, keyed rk(hireId, dayMark).
  const [ratings, setRatings] = useState<Record<string, CheckinRatingView>>({});
  const [rating, setRating] = useState<{ hire: PostOnboardHire; tick: Checkin | null; checkin: RatedCheckin } | null>(null);
  useEffect(() => {
    const ids = initial.map((h) => h.id);
    if (!ids.length) return;
    let live = true;
    void fetch(`/api/onboarding/checkin-ratings?ids=${encodeURIComponent(ids.join(","))}`)
      .then((r) => (r.ok ? r.json() : { ratings: [] }))
      .then((d: { ratings?: CheckinRatingView[] }) => {
        if (live) setRatings(Object.fromEntries((d.ratings ?? []).map((x) => [rk(x.newHireId, x.dayMark), x])));
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
  // The two moments that animate (globals.css .po-done-anim / .po-slide-in): a cell
  // that became DONE, or a rating link that became PENDING, since the last render.
  // Nothing animates on first load - only a change made while the page is open.
  const prevDoneRef = useRef<Set<string> | null>(null);
  const prevSentRef = useRef<Set<string> | null>(null);
  const doneNow = useMemo(() => {
    const out = new Set<string>();
    for (const h of hires) for (const c of h.checkins) if (c.status === "DONE") out.add(`${h.id}:${c.key}`);
    return out;
  }, [hires]);
  const justDone = useMemo(() => {
    const prev = prevDoneRef.current;
    return prev ? new Set([...doneNow].filter((k) => !prev.has(k))) : new Set<string>();
  }, [doneNow]);
  useEffect(() => {
    prevDoneRef.current = doneNow;
  }, [doneNow]);
  const sentNow = useMemo(
    () => new Set(Object.entries(requests).filter(([, v]) => v.state === "PENDING").map(([k, v]) => `${k}@${v.lastSentAt}`)),
    [requests]
  );
  const justSent = useMemo(() => {
    const prev = prevSentRef.current;
    return prev ? new Set([...sentNow].filter((k) => !prev.has(k)).map((k) => k.split("@")[0])) : new Set<string>();
  }, [sentNow]);
  useEffect(() => {
    prevSentRef.current = sentNow;
  }, [sentNow]);
  const todayUtc = useMemo(() => officeTodayUtc(), []);
  const [bulkSend, setBulkSend] = useState<{ hireIds: string[]; dayMark: number } | null>(null);
  const [openRequest, setOpenRequest] = useState<{ hire: PostOnboardHire; checkin: RatedCheckin } | null>(null);
  useEffect(() => {
    const ids = initial.map((h) => h.id);
    let live = true;
    void fetch(`/api/onboarding/checkin-rating-requests?ids=${encodeURIComponent(ids.join(","))}`)
      .then((r) => (r.ok ? r.json() : { requests: [], leftNotices: [] }))
      .then((d: { requests?: RatingRequestView[]; leftNotices?: RatingRequestView[] }) => {
        if (!live) return;
        setRequests(Object.fromEntries((d.requests ?? []).map((x) => [rk(x.hireId, x.dayMark), x])));
        setLeftNotices(d.leftNotices ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [initial, requestReload]);

  async function dismissLeftNotice(hireId: string, dayMark: number) {
    setLeftNotices((cur) => cur.filter((n) => !(n.hireId === hireId && n.dayMark === dayMark)));
    await fetch("/api/onboarding/checkin-rating-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "acknowledge", hireId, dayMark })
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

  async function bulkCheckin(actionKey: string, key: string) {
    if (actionKey === "skip") return bulkSkip(key);
    if (actionKey === "sendRating") {
      if (selected.size) setBulkSend({ hireIds: [...selected], dayMark: Number(key) });
      return;
    }
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

  /** Bulk "Mark check-in skipped": counts first, asks, then only the open steps go N/A. */
  async function bulkSkip(key: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const label = MAINTENANCE_TASKS.find((t) => t.key === key)?.label ?? key;
    setBusy(true);
    try {
      const pre = await skipTasksBulk(ids, key, true);
      if (!pre.ok) {
        window.alert(pre.error ?? "Couldn't count those check-ins.");
        return;
      }
      // Open AND done ones change (his call, Nov 14 2026); a done one with a saved
      // manager rating, or one already skipped, is left as it is.
      const left = [
        pre.doneRated ? `${pre.doneRated} done with a saved rating` : "",
        pre.alreadySkipped ? `${pre.alreadySkipped} already skipped` : "",
        pre.missing ? `${pre.missing} without this check-in` : ""
      ].filter(Boolean);
      const total = pre.open + pre.done;
      if (total === 0) {
        window.alert(`Nothing to skip for the ${label}${left.length ? ` (${left.join(", ")})` : ""}.`);
        return;
      }
      const parts = [pre.open ? `${pre.open} still open` : "", pre.done ? `${pre.done} marked done, which will change to skipped` : ""].filter(Boolean).join(" and ");
      const ask = `Mark the ${label} skipped for ${total} ${total === 1 ? "person" : "people"} (${parts})? It reads "Skipped", not done, and nobody is emailed.${left.length ? ` ${left.join(", ")} - left as they are.` : ""} Each can be undone one at a time from the person's drawer.`;
      if (!window.confirm(ask)) return;
      const res = await skipTasksBulk(ids, key);
      if (!res.ok || !res.skippedAt) {
        window.alert(res.error ?? "Couldn't skip those check-ins.");
        return;
      }
      const skippedIds = new Set(res.skippedIds ?? []);
      const archived = new Set(res.archivedIds ?? []);
      const rec: TaskSkipRecord = { skippedAt: res.skippedAt, skippedBy: res.skippedBy ?? null };
      setSkips((cur) => {
        const next = { ...cur };
        for (const id of skippedIds) next[id] = { ...(next[id] ?? {}), [key]: rec };
        return next;
      });
      setHires((cur) =>
        cur
          .filter((h) => !archived.has(h.id))
          .map((h) =>
            skippedIds.has(h.id)
              ? { ...h, checkins: h.checkins.map((c) => (c.key === key ? { ...c, status: "NA" as GridTaskStatus, dueSoon: false } : c)) }
              : h
          )
      );
      setSelected(new Set());
      if (archived.size) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function setEmployment(hireId: string, status: EmploymentStatus) {
    const who = hires.find((h) => h.id === hireId);
    // A one-letter dropdown is easy to hit by accident, and Terminated is not a
    // small change: it moves them to Archived and cancels any open rating link,
    // so nobody contacts their supervisor. Ask first.
    if (status === "TERMINATED" && !window.confirm(`Mark ${who?.name ?? "this person"} as terminated? They move to Archived and any open rating link is cancelled, so their supervisor is not contacted.`)) return;
    if (status === "TERMINATED" && drawerId === hireId) setDrawerId(null);
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

  /**
   * Skip a check-in from the drawer - for the older ones that should have happened
   * before the check-ins existed: not done, because it didn't happen (his ask,
   * Nov 14 2026). Same server step as the email dialog's skip: N/A, who and when
   * recorded, and the last outstanding one finishes post-onboarding.
   */
  async function skipCheckin(h: PostOnboardHire, c: Checkin) {
    const rated = ratedCheckinForTask(c.key);
    const req = rated ? requests[rk(h.id, rated.dayMark)] : undefined;
    const openLink = req && req.state === "PENDING" ? " The rating link already sent stays open - cancel it from the link if it should not be answered." : "";
    if (!confirm(`Mark ${h.name}'s ${columnLabel(c)} as skipped? It reads "Skipped", not done, and nobody is emailed.${openLink}`)) return;
    const res = await skipTaskEmail(h.id, c.key);
    if (!res.ok || !res.skippedAt) {
      alert(res.error ?? "Couldn't skip that.");
      return;
    }
    markSkipped(h.id, c.key, { skippedAt: res.skippedAt, skippedBy: res.skippedBy ?? null }, !!res.archived);
    if (res.archived) setDrawerId(null);
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
    // Ticking a rated check-in done asks for the manager's rating first.
    const rated = ratedCheckinForTask(c.key);
    if (rated && c.status !== "DONE") {
      const hire = hires.find((h) => h.id === hireId);
      if (hire) {
        setRating({ hire, tick: c, checkin: rated });
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

  /**
   * Under a rated check-in's tick: the manager's rating (points, or Rate) and the
   * no-login rating link (its status, or Send). Nothing for other check-ins, or for
   * a skipped one. The 90-day, 6-month and 12-month each have their own.
   */
  function ratingControls(h: PostOnboardHire, c: Checkin, terminated: boolean) {
    const checkin = ratedCheckinForTask(c.key);
    if (!checkin || c.status === "NA") return null;
    const saved = ratings[rk(h.id, checkin.dayMark)];
    const req = requests[rk(h.id, checkin.dayMark)];
    return (
      <div className="mt-1 flex flex-col items-center gap-0.5">
        {saved ? (
          <button
            type="button"
            onClick={() => setRating({ hire: h, tick: null, checkin })}
            title={`${checkin.short} rating${saved.managerName ? ` by ${saved.managerName}` : ""}: ${scaleSummary(saved)} - click to edit`}
            className="flex flex-wrap items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-gold/10 dark:text-slate-100"
          >
            {pointsText(ratingPoints(saved.ratings))}
            {saved.wouldHireAgain === null ? null : (
              <span className={clsx("ml-1 font-normal", saved.wouldHireAgain ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
                {saved.wouldHireAgain ? "· again" : "· not again"}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setRating({ hire: h, tick: null, checkin })}
            title={`Enter the manager's ${checkin.short} rating`}
            className="rounded border border-brand-lea/20 px-2 py-0.5 text-[11px] font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100"
          >
            Rate
          </button>
        )}
        {req ? (
          <button
            type="button"
            onClick={() => setOpenRequest({ hire: h, checkin })}
            title={`${checkin.short} rating link to ${req.toName ?? req.to} - click for status, resend or cancel`}
            className="flex flex-wrap items-center justify-center gap-1 rounded px-1 py-0.5 text-[10px] text-brand-grey transition hover:bg-brand-gold/10 dark:text-slate-400"
          >
            <StateChip view={req} />
            {formatMomentDateShort(req.state === "COMPLETED" ? req.completedAt : req.state === "CANCELLED" ? req.cancelledAt : req.lastSentAt)}
          </button>
        ) : saved || terminated ? null : (
          <button
            type="button"
            onClick={() => setOpenRequest({ hire: h, checkin })}
            title={`Email the hiring manager the ${checkin.short} rating link - no login needed`}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold text-brand-lea transition hover:shadow-glow dark:text-slate-100"
          >
            <Send className="h-3 w-3" />
            Send
          </button>
        )}
      </div>
    );
  }

  if (hires.length === 0) {
    return <EmptyState title="No post-onboard employees yet." description="Mark an active hire as onboarded and they will appear here." />;
  }

  // Column plan from the check-ins the rows actually carry (see COLUMN_GROUPS).
  const present = hires[0].checkins.map((c) => ({ key: c.key, short: c.short }));
  const placed = new Set(COLUMN_GROUPS.flatMap((g) => g.keys));
  const groups = COLUMN_GROUPS.map((g) => ({
    ...g,
    cols: [...g.keys.filter((k) => present.some((c) => c.key === k)), ...(g.key === "ck" ? present.filter((c) => !placed.has(c.key)).map((c) => c.key) : [])]
      .map((k) => present.find((c) => c.key === k)!)
  })).filter((g) => g.cols.length);
  const plan = groups.flatMap((g) => g.cols.map((c, i) => ({ ...c, group: g.key, first: i === 0 })));
  /**
   * Column widths (Sample A, Nov 14 2026; widened the same day - "a little more
   * space on both sides" of the five dated check-ins). Social and 401k only ever
   * hold a circle, so they stay narrow; the five dated check-ins get the room. The
   * name column is fixed - names and job titles wrap rather than leave a wide empty
   * gap - and Department and Started fold under the name below xl (1280), so a
   * 1024-wide window (with its scrollbar) never scrolls sideways.
   *   xl and up:  36 + 168 + 112 + 84 + 44 + 2 x 52 + 5 x 68 = 888px, the rest free.
   *   below xl:   36 + 150 + 44 + 2 x 48 + 5 x 60 = 626px.
   * ROOM FOR MORE COLUMNS LATER, in this order: (1) a new column takes the free
   * column on the right (about 340px at 1536, about 75px at 1280); (2) past that,
   * fold Department and Started under the name at every width, which frees 196px;
   * (3) then merge Social and 401k into one "Tasks 0/2" column, which frees 60px.
   */

  /** When a dated check-in falls due: start date + its days (lib/onboarding/tasks.ts). */
  function dueAt(h: PostOnboardHire, key: string): number | null {
    const days = MAINTENANCE_TASKS.find((m) => m.key === key)?.dueDays ?? null;
    if (days === null || !h.startDate) return null;
    return new Date(h.startDate).getTime() + days * 86_400_000;
  }

  /** Whole days past due (positive) or until due (negative) for a dated check-in. */
  function daysLate(at: number | null): number | null {
    return at === null ? null : Math.round((todayUtc - at) / 86_400_000);
  }

  /**
   * The top slot of a cell: one mark, always 24px tall and centred.
   *   open, dated    -> +43d (late, red; deeper red from 15 days; grey and dashed from
   *                     STALE_AFTER_DAYS) or "in 77d" (not due yet, quiet grey). A red
   *                     left rule marks late so it never relies on colour alone.
   *   done           -> filled green bubble with a check (draws itself when just done)
   *   skipped        -> filled light-orange bubble with an x
   *   not applicable -> the grey N/A tag
   *   open, undated  -> the empty circle (Social, 401k)
   * SKIPPED and N/A are both stored N/A; the skip record (skips[hire][key]) tells them apart.
   */
  function markEl(c: Checkin, skipped: boolean, at: number | null, animate: boolean, linkOut = false) {
    if (c.status === "NA")
      return skipped ? (
        <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2.5 2.5 L7.5 7.5 M7.5 2.5 L2.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </span>
      ) : (
        <span className="inline-flex h-[22px] items-center rounded bg-brand-cloudDancer/70 px-1 text-[9px] font-bold uppercase tracking-wide text-brand-grey dark:bg-white/10 dark:text-slate-400">N/A</span>
      );
    if (c.status === "DONE")
      return (
        <span className={clsx("relative inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", animate && "po-done-anim")}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      );
    const late = daysLate(at);
    if (late === null) return <span className="inline-block h-[22px] w-[22px] rounded-full border-2 border-brand-grey/60 dark:border-slate-400/60" />;
    if (late <= 0) return <span className="whitespace-nowrap text-[11px] tabular-nums text-brand-grey dark:text-slate-400">{late === 0 ? "today" : `in ${-late}d`}</span>;
    // Sent: still shows how late, but in plain ink - it is with the manager now.
    if (linkOut) return <span className="whitespace-nowrap text-[11px] tabular-nums text-brand-lea dark:text-slate-200">+{late}d</span>;
    const tone =
      late >= STALE_AFTER_DAYS
        ? "border border-dashed border-brand-grey/50 border-l-2 border-l-brand-grey/70 text-brand-grey dark:border-slate-500 dark:text-slate-400"
        : late >= LATE_STEP_DAYS
          ? "border-l-2 border-l-red-600 bg-red-100 font-bold text-red-800 dark:border-l-red-400 dark:bg-red-500/25 dark:text-red-200"
          : "border-l-2 border-l-red-600 bg-red-50 font-semibold text-red-700 dark:border-l-red-400 dark:bg-red-500/15 dark:text-red-300";
    return <span className={clsx("inline-flex h-[22px] items-center whitespace-nowrap rounded px-1.5 text-[11px] tabular-nums", tone)}>+{late}d</span>;
  }

  function stateWord(c: Checkin, skipped = false) {
    return c.status === "DONE" ? "Done" : c.status === "NA" ? (skipped ? "Skipped" : "N/A") : c.dueSoon ? "Due" : "To do";
  }

  /** The bottom slot of a cell: what it shows, and the same as words for the cell's label. */
  function captionOf(h: PostOnboardHire, c: Checkin, group: string, at: number | null, skipped: boolean): { node: React.ReactNode; text: string } | null {
    const late = c.status === "TODO" ? daysLate(at) : null;
    const rated = ratedCheckinForTask(c.key);
    // Every caption the same: 10px, lower case, medium, grey (his ask, Nov 14 2026: no mixed caps).
    const cap = "whitespace-nowrap text-[10px] font-medium text-brand-grey dark:text-slate-400";
    if (group === "mgr" && rated) {
      const saved = ratings[rk(h.id, rated.dayMark)];
      const req = requests[rk(h.id, rated.dayMark)];
      if (saved) return { node: <span className="whitespace-nowrap text-[10px] font-medium text-emerald-700 dark:text-emerald-300">★ rated</span>, text: "rated" };
      if (req && req.state === "PENDING")
        return {
          node: (
            <span className={clsx(SENT_PILL, justSent.has(rk(h.id, rated.dayMark)) && "po-slide-in")}>
              {/* The plane and the date in a light-grey pill (his pick). "SENT 11/14" did not
                  fit a 60px cell; the words are in the cell label and hover. */}
              <Send className="h-2.5 w-2.5" aria-hidden />
              {mdy(new Date(req.lastSentAt).getTime(), true).slice(0, 5)}
            </span>
          ),
          text: `rating link sent ${formatMomentDateShort(req.lastSentAt)}`
        };
      if (c.status === "DONE") return { node: <span className={cap}>done</span>, text: "" };
    } else if (c.status !== "NA") {
      const r = pickReply(replies[h.id]?.[c.key]);
      if (r) {
        const urgent = needsFollowUp(r.level) && !r.handledAt;
        const Icon = urgent ? MessageSquareWarning : MessageSquareText;
        return { node: <Icon className={clsx("h-3.5 w-3.5", r.handledAt ? "text-brand-lea dark:text-slate-300" : LEVEL_STYLE[r.level].icon)} aria-hidden />, text: urgent ? "reply needs action" : "replied" };
      }
      if (waitingOnReply(h.id, c.key)) return { node: <span className={cap}>no reply</span>, text: "no reply yet" };
    }
    if (c.status === "NA" && skipped && at !== null)
      return { node: <span className={clsx(cap, "tabular-nums")}>was {mdy(at, true).slice(0, 5)}</span>, text: `was due ${mdy(at)}` };
    if (late !== null && late >= STALE_AFTER_DAYS) return { node: <span className={cap}>skip?</span>, text: "probably better skipped" };
    return null;
  }

  /**
   * One grid cell: two fixed slots, a 24px mark over a 24px caption, so every row is
   * the same height and every mark sits on one line (Sample A). The mark (and the
   * caption, when there is one) opens the person's drawer; a late manager check-in,
   * before the stale line, puts a real Send button in the caption slot instead.
   */
  function gridCell(h: PostOnboardHire, c: Checkin, group: string) {
    const skipped = Boolean(skips[h.id]?.[c.key]);
    const rated = ratedCheckinForTask(c.key);
    const at = dueAt(h, c.key);
    const late = c.status === "TODO" ? daysLate(at) : null;
    const showSend =
      group === "mgr" && rated && c.status === "TODO" && late !== null && late > 0 && late < STALE_AFTER_DAYS &&
      !ratings[rk(h.id, rated.dayMark)] && !requests[rk(h.id, rated.dayMark)] && h.employmentStatus !== "TERMINATED";
    const caption = showSend ? null : captionOf(h, c, group, at, skipped);
    const linkOut = Boolean(rated && requests[rk(h.id, rated.dayMark)]?.state === "PENDING" && !ratings[rk(h.id, rated.dayMark)]);
    const tile = c.status !== "TODO" || linkOut || late === null ? "" : late > 0 ? TILE.late : late >= -SOON_DAYS ? TILE.soon : "";
    let when = "";
    if (at !== null && late !== null) when = late > 0 ? `, ${late} days late, was due ${mdy(at)}` : late === 0 ? ", due today" : `, due ${mdy(at)}, in ${-late} days`;
    else if (at !== null && c.status === "NA" && skipped) when = `, was due ${mdy(at)}`;
    const label = `${h.name}, ${columnLabel(c)}: ${stateWord(c, skipped)}${when}${caption?.text ? `, ${caption.text}` : ""}. Open actions`;
    // min-h-0: globals.css gives every button a 36px minimum tap target, which made
    // these 24px slots (and the Send button) 31.5px tall regardless of their class.
    const slot = "flex h-6 min-h-0 w-full items-center justify-center rounded transition hover:bg-brand-gold/10 hover:shadow-glow";
    return (
      <div className={clsx("grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[24px_24px] items-center justify-items-center gap-0.5 rounded py-0.5", tile)}>
        <button type="button" onClick={() => setDrawerId(h.id)} title={label} aria-label={label} className={slot}>
          {markEl(c, skipped, c.status === "TODO" ? at : null, justDone.has(`${h.id}:${c.key}`), linkOut)}
        </button>
        {showSend && rated ? (
          <button
            type="button"
            onClick={() => setOpenRequest({ hire: h, checkin: rated })}
            title={`Email the hiring manager the ${rated.short} rating link - no login needed`}
            aria-label={`Send ${h.name}'s ${rated.short} rating link`}
            className="inline-flex h-[18px] min-h-0 items-center gap-0.5 rounded border border-red-400 px-1.5 text-[11px] font-bold leading-none text-red-700 transition hover:shadow-glow dark:border-red-500/50 dark:text-red-300"
          >
            <Send className="h-2.5 w-2.5" aria-hidden /> Send
          </button>
        ) : caption ? (
          <button type="button" onClick={() => setDrawerId(h.id)} tabIndex={-1} aria-hidden className={slot}>
            {caption.node}
          </button>
        ) : (
          <span aria-hidden />
        )}
      </div>
    );
  }

  /** Every action for one check-in, as a row in the drawer. */
  function drawerRow(h: PostOnboardHire, c: Checkin, terminated: boolean) {
    const skip = skips[h.id]?.[c.key];
    const at = dueAt(h, c.key);
    const r = pickReply(replies[h.id]?.[c.key]);
    const action =
      "rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100";
    return (
      <div key={c.key} className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-brand-lea/10 py-3 last:border-b-0 dark:border-white/10">
        <div className="flex w-36 shrink-0 items-center gap-2">
          {markEl(c, Boolean(skip), null, false)}
          <div>
            <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{columnLabel(c)}</div>
            <div className="text-[11px] text-brand-grey dark:text-slate-400">
              {c.status === "NA" && skip
                ? `Skipped${skip.skippedBy ? ` by ${skip.skippedBy}` : ""} ${formatMomentDateShort(skip.skippedAt)}`
                : at
                  ? `${c.status === "DONE" ? "Was due" : "Due"} ${mdy(at)}`
                  : stateWord(c, Boolean(skip))}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {c.status === "NA" ? (
            <button type="button" onClick={() => void undoSkip(h, c)} className={action}>
              Undo skip
            </button>
          ) : (
            <button type="button" onClick={() => void toggle(h.id, c)} className={clsx(action, c.status !== "DONE" && c.dueSoon && "border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-300")}>
              {c.status === "DONE" ? "Undo done" : "Mark done"}
            </button>
          )}
          {c.status === "TODO" && c.id ? (
            <button
              type="button"
              onClick={() => void skipCheckin(h, c)}
              title="It didn't happen (for example, it was due before check-ins existed): mark it skipped, not done"
              className={action}
            >
              Mark skipped
            </button>
          ) : null}
          {emailKeys.has(c.key) && c.status !== "NA" ? (
            <SendTaskEmailButton
              hireId={h.id}
              taskKey={c.key}
              sentAt={taskSends[h.id]?.[c.key] ?? null}
              taskLabel={`${c.short} check-in — ${h.name}`}
              taskStatus={c.status}
              canEdit
              onSkipped={(rec, archived) => markSkipped(h.id, c.key, rec, archived)}
              onSent={() =>
                setHires((cur) =>
                  cur.map((x) => (x.id === h.id ? { ...x, checkins: x.checkins.map((y) => (y.key === c.key ? { ...y, status: "DONE" as GridTaskStatus, dueSoon: false } : y)) } : x))
                )
              }
            />
          ) : null}
          {r ? (
            <button type="button" onClick={() => setOpenReply(r)} className={clsx(action, "inline-flex items-center gap-1")}>
              {needsFollowUp(r.level) && !r.handledAt ? <MessageSquareWarning className="h-3.5 w-3.5" /> : <MessageSquareText className="h-3.5 w-3.5" />}
              Reply · {r.handledAt ? "handled" : REPLY_LEVEL_LABEL[r.level]}
            </button>
          ) : waitingOnReply(h.id, c.key) ? (
            <span className="text-[11px] text-brand-grey dark:text-slate-400">Sent {formatMomentDateShort(taskSends[h.id]?.[c.key])}, no reply yet</span>
          ) : null}
          {ratingControls(h, c, terminated)}
        </div>
      </div>
    );
  }

  const drawerHire = drawerId ? hires.find((h) => h.id === drawerId) ?? null : null;

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
      {drawerHire ? (
        <PostOnboardDrawer
          title={drawerHire.name}
          eyebrow="Post-onboard"
          escapeEnabled={!rating && !openRequest && !openReply}
          onClose={() => setDrawerId(null)}
          subtitle={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{drawerHire.position ?? "—"}</span>
              <span>· {drawerHire.department ?? "—"}</span>
              <span>· started {mdyIso(drawerHire.startDate)}</span>
              <span>· onboarded {fmtMoment(drawerHire.onboardedAt)}</span>
              <Link href={`/people/${drawerHire.id}`} className="font-semibold text-brand-lea underline-offset-2 hover:underline dark:text-slate-100">
                Open profile
              </Link>
            </span>
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            <span className="text-xs font-semibold text-brand-grey dark:text-slate-400">Status</span>
            <select
              value={drawerHire.employmentStatus}
              onChange={(e) => void setEmployment(drawerHire.id, e.target.value as EmploymentStatus)}
              aria-label={`${drawerHire.name} employment status`}
              className={clsx("rounded border px-2 py-1 text-xs font-semibold outline-none transition hover:shadow-glow", STATUS_TONE[drawerHire.employmentStatus])}
            >
              <option value="ACTIVE">Active</option>
              <option value="CONTRACT">Contract</option>
              <option value="TERMINATED">Terminated</option>
            </select>
          </div>
          <div className="rounded bg-white px-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
            {plan.map((col) => {
              const c = drawerHire.checkins.find((x) => x.key === col.key);
              return c ? drawerRow(drawerHire, c, drawerHire.employmentStatus === "TERMINATED") : null;
            })}
          </div>
        </PostOnboardDrawer>
      ) : null}
      {rating ? (
        <CheckinRatingModal
          key={rk(rating.hire.id, rating.checkin.dayMark)}
          open
          name={rating.hire.name}
          newHireId={rating.hire.id}
          dayMark={rating.checkin.dayMark}
          initial={ratings[rk(rating.hire.id, rating.checkin.dayMark)] ?? null}
          onClose={() => setRating(null)}
          onSaved={(saved, result) => {
            // The server ticked that check-in itself; mirror it here (this grid
            // keeps its own copy of the rows), and drop the person if that archived them.
            setRatings((cur) => ({ ...cur, [rk(saved.newHireId, saved.dayMark)]: saved }));
            const hireId = rating.hire.id;
            const taskKey = rating.checkin.taskKey;
            setRating(null);
            if (result.archived) {
              setHires((cur) => cur.filter((h) => h.id !== hireId));
              router.refresh();
            } else if (result.checkinDone) {
              setHires((cur) =>
                cur.map((h) =>
                  h.id === hireId
                    ? { ...h, checkins: h.checkins.map((c) => (c.key === taskKey ? { ...c, status: "DONE" as GridTaskStatus, dueSoon: false } : c)) }
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
          <div className="font-semibold">Rating links cancelled because the employee left</div>
          {leftNotices.map((n) => (
            <div key={rk(n.hireId, n.dayMark)} className="flex flex-wrap items-center gap-2">
              <Link href={`/people/${n.hireId}`} className="font-semibold hover:underline">
                {n.hireName}
              </Link>
              <span>
                {ratedCheckin(n.dayMark)?.short ?? "3-month"} link sent {formatMomentDateShort(n.lastSentAt)} to {n.toName ?? n.to}, not answered · {cancelReasonText(n)} ({formatMomentDateShort(n.cancelledAt)})
              </span>
              <button
                type="button"
                onClick={() => void dismissLeftNotice(n.hireId, n.dayMark)}
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
          key={rk(openRequest.hire.id, openRequest.checkin.dayMark)}
          hireId={openRequest.hire.id}
          hireName={openRequest.hire.name}
          dayMark={openRequest.checkin.dayMark}
          request={requests[rk(openRequest.hire.id, openRequest.checkin.dayMark)] ?? null}
          onClose={() => setOpenRequest(null)}
          onChanged={(view) => setRequests((cur) => ({ ...cur, [rk(view.hireId, view.dayMark)]: view }))}
        />
      ) : null}
      {bulkSend ? (
        <BulkRatingSendDialog
          hireIds={bulkSend.hireIds}
          dayMark={bulkSend.dayMark}
          onClose={() => setBulkSend(null)}
          onSent={(views) => {
            setRequests((cur) => ({ ...cur, ...Object.fromEntries(views.map((v) => [rk(v.hireId, v.dayMark), v])) }));
            setSelected(new Set());
          }}
        />
      ) : null}
      {openReply ? <CheckinReplyModal key={openReply.messageId} reply={openReply} onClose={() => setOpenReply(null)} onSaved={replaceReply} /> : null}
      <BulkActionBar count={selected.size} actions={POST_ONBOARD_BULK_ACTIONS} onApply={applyBulk} onChoice={bulkCheckin} onDelete={deleteSelected} onClear={() => setSelected(new Set())} busy={busy} />
      {/* NO sideways scroll and a header that stays put (feedback cmwfsem9x), now in
          his picked layout (design #17). The table is fixed-layout at the panel's
          width: fixed narrow columns on the left, and the last column takes what is
          left, kept empty on purpose for columns added later. The header row is
          sticky against the WINDOW, which only works because nothing between here
          and <main> clips overflow - do not put overflow-hidden or overflow-x-auto
          back on these wrappers, or the header stops sticking. */}
      <div className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        {/* The skim colours, said once (see TILE). */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-brand-lea/10 px-3 py-2 text-[11px] text-brand-grey dark:border-white/10 dark:text-slate-400">
          {(
            [
              [TILE.soon, `Due within ${SOON_DAYS} days`],
              [TILE.late, "Past due"]
            ] as const
          ).map(([tone, text]) => (
            <span key={text} className="inline-flex items-center gap-1.5">
              <span className={clsx("inline-block h-3.5 w-5 rounded", tone)} aria-hidden />
              {text}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className={SENT_PILL} aria-hidden>
              <Send className="h-2.5 w-2.5" />
              11/14
            </span>
            Rating link sent - waiting on the manager
          </span>
        </div>
        {/* PHONES (below md): one card per person instead of the table - the 7 check-in
            columns cannot fit a phone without a sideways scroll, and his standing rule
            (Nov 14 2026) is that everything works on mobile, always. Same cells, same
            drawer, same A / T / C status; the cards just stack. */}
        <div className="divide-y divide-brand-lea/10 md:hidden dark:divide-white/10">
          <div className="px-3 py-2 text-[11px] text-brand-grey dark:text-slate-400">
            {visible.length} {visible.length === 1 ? "person" : "people"}
          </div>
          {visible.map((h) => {
            const terminated = h.employmentStatus === "TERMINATED";
            return (
              <div key={h.id} className={clsx("grid gap-2 px-3 py-3", selected.has(h.id) ? "bg-brand-gold/10" : terminated && "bg-brand-cloudDancer/30 dark:bg-white/5")}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleOne(h.id)} aria-label={`Select ${h.name}`} className="mt-1 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/people/${h.id}`} className={clsx("font-semibold hover:underline", terminated ? "text-brand-grey dark:text-slate-400" : "text-brand-lea dark:text-slate-100")}>
                      {h.name}
                    </Link>
                    <div className="break-words text-xs leading-snug text-brand-grey dark:text-slate-400">{h.position ?? "—"}</div>
                    <div className="text-xs leading-snug text-brand-grey dark:text-slate-400">
                      {h.department ?? "—"} · <span className="tabular-nums">started {mdyIso(h.startDate)}</span>
                    </div>
                  </div>
                  <select
                    value={h.employmentStatus}
                    onChange={(e) => void setEmployment(h.id, e.target.value as EmploymentStatus)}
                    aria-label={`${h.name} employment status`}
                    title={`${STATUS_WORD[h.employmentStatus]} - A Active · T Terminated · C Contract`}
                    className={clsx("h-8 w-[52px] shrink-0 cursor-pointer rounded border px-1 text-center text-xs font-bold outline-none transition hover:shadow-glow", STATUS_TONE[h.employmentStatus])}
                  >
                    {(["ACTIVE", "TERMINATED", "CONTRACT"] as EmploymentStatus[]).map((v) => (
                      <option key={v} value={v} title={STATUS_WORD[v]}>
                        {STATUS_LETTER[v]}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Two-item groups sit side by side; the three manager check-ins take a full row. */}
                <div className="grid grid-cols-2 gap-1">
                {groups.map((g) => (
                  <div key={g.key} className={clsx("rounded border border-brand-lea/10 px-1 pb-1 dark:border-white/10", g.cols.length > 2 && "col-span-2")}>
                    <div className="px-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-brand-edenOnDark">{g.label}</div>
                    <div className="grid" style={{ gridTemplateColumns: `repeat(${g.cols.length}, minmax(0, 1fr))` }}>
                      {g.cols.map((col) => {
                        const c = h.checkins.find((x) => x.key === col.key);
                        return (
                          <div key={col.key} className="grid justify-items-center gap-0.5 px-0.5 pt-1">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-grey dark:text-slate-400">{columnLabel(col)}</span>
                            {c ? gridCell(h, c, g.key) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            );
          })}
          {visible.length === 0 ? <p className="px-4 py-8 text-center text-sm text-brand-grey dark:text-slate-400">No post-onboard employees match these filters.</p> : null}
        </div>
        <table className="hidden w-full table-fixed text-sm md:table">
          <colgroup>
            <col style={{ width: 36 }} />
            <col className="w-[150px] xl:w-[168px]" />
            <col className="hidden xl:table-column" style={{ width: 112 }} />
            <col className="hidden xl:table-column" style={{ width: 84 }} />
            <col style={{ width: 44 }} />
            {plan.map((c) => (
              <col key={c.key} className={c.group === "task" ? "w-[48px] xl:w-[52px]" : "w-[60px] xl:w-[68px]"} />
            ))}
            <col />
          </colgroup>
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-brand-edenOnDark">
              <th colSpan={2} />
              <th colSpan={2} className="hidden xl:table-cell" />
              {groups.map((g) => (
                <th key={g.key} colSpan={g.cols.length + (g.key === "task" ? 1 : 0)} className={clsx("border-l border-brand-lea/10 px-1 pb-1.5 pt-2.5 text-center leading-tight dark:border-white/10", GROUP_HEAD[g.key], GROUP_RULE[g.key], g.key === "mgr" && "text-brand-lea dark:text-slate-100")}>
                  {g.label}
                </th>
              ))}
              <th />
            </tr>
            <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
              <th className={clsx(HEAD_CELL, "rounded-tl px-2 text-center align-bottom")}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 align-middle" />
              </th>
              <th className={clsx(HEAD_CELL, "px-3 text-left align-bottom")}>Employee</th>
              <th className={clsx(HEAD_CELL, "hidden px-2 text-left align-bottom xl:table-cell")}>Department</th>
              <th className={clsx(HEAD_CELL, "hidden px-2 text-left align-bottom xl:table-cell")}>Started</th>
              <th className={clsx(HEAD_CELL, GROUP_HEAD.task, "h-[92px] border-l border-brand-lea/10 px-0 text-center align-bottom dark:border-white/10")} title="Employment status: A Active · T Terminated · C Contract">
                <span className="inline-block whitespace-nowrap [writing-mode:vertical-rl] rotate-180">Status</span>
              </th>
              {plan.map((c) => (
                <th key={c.key} className={clsx(HEAD_CELL, GROUP_HEAD[c.group as "task"], "h-[92px] px-0 text-center align-bottom", c.first && c.group !== "task" && "border-l border-brand-lea/10 dark:border-white/10")} title={columnLabel(c)}>
                  <span className="inline-block whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{columnLabel(c)}</span>
                </th>
              ))}
              <th className={clsx(HEAD_CELL, "rounded-tr border-l border-dashed border-brand-lea/10 dark:border-white/10")} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {/* How many are due in each column, for the people shown. */}
            <tr className="border-b-2 border-brand-lea/10 text-[11px] text-brand-grey dark:border-white/10 dark:text-slate-400">
              <td colSpan={2} className="px-3 py-1.5">
                {visible.length} {visible.length === 1 ? "person" : "people"} · need you now ↓
              </td>
              <td colSpan={2} className="hidden xl:table-cell" />
              <td className={clsx("border-l border-brand-lea/10 dark:border-white/10", GROUP_TINT.task)} />
              {plan.map((c) => {
                // Past due AND still HR's to act on: a sent rating link or a saved rating no
                // longer counts (his ask, Nov 14 2026), so the number matches the red tiles.
                const rc = ratedCheckinForTask(c.key);
                const n = visible.filter((h) =>
                  h.checkins.some(
                    (x) =>
                      x.key === c.key && x.status === "TODO" && x.dueSoon &&
                      !(rc && (requests[rk(h.id, rc.dayMark)]?.state === "PENDING" || ratings[rk(h.id, rc.dayMark)]))
                  )
                ).length;
                return (
                  <td key={c.key} className={clsx("py-1.5 text-center tabular-nums", GROUP_TINT[c.group as "task"], c.first && c.group !== "task" && "border-l border-brand-lea/10 dark:border-white/10")}>
                    {n ? <span className="font-bold text-red-700 dark:text-red-300">{n}</span> : "—"}
                  </td>
                );
              })}
              <td className="border-l border-dashed border-brand-lea/10 dark:border-white/10" />
            </tr>
            {visible.map((h) => {
              const terminated = h.employmentStatus === "TERMINATED";
              return (
                <tr key={h.id} className={clsx("row-wash border-b border-brand-lea/5 dark:border-white/10 dark:hover:bg-white/5", selected.has(h.id) ? "bg-brand-gold/10" : terminated && "bg-brand-cloudDancer/30 dark:bg-white/5")}>
                  <td className="px-2 py-1.5 text-center align-middle">
                    <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleOne(h.id)} aria-label={`Select ${h.name}`} className="h-4 w-4 align-middle" />
                  </td>
                  <td className="px-3 py-1.5 align-middle">
                    <Link href={`/people/${h.id}`} className={clsx("font-semibold hover:underline", terminated ? "text-brand-grey dark:text-slate-400" : "text-brand-lea dark:text-slate-100")}>
                      {h.name}
                    </Link>
                    <div className="break-words text-xs leading-snug text-brand-grey dark:text-slate-400">{h.position ?? "—"}</div>
                    {/* Below xl, Department and Started fold in here instead of their own columns. */}
                    <div className="text-xs leading-snug text-brand-grey dark:text-slate-400 xl:hidden">
                      {h.department ?? "—"} · <span className="tabular-nums">{mdyIso(h.startDate)}</span>
                    </div>
                  </td>
                  <td className="hidden break-words px-2 py-1.5 align-middle text-xs text-brand-grey dark:text-slate-400 xl:table-cell">
                    {h.department ?? "—"}
                  </td>
                  <td className="hidden px-2 py-1.5 align-middle text-xs tabular-nums text-brand-grey dark:text-slate-400 xl:table-cell">{mdyIso(h.startDate)}</td>
                  <td className="border-l border-brand-lea/10 px-1 py-1.5 text-center align-middle dark:border-white/10">
                    <select
                      value={h.employmentStatus}
                      onChange={(e) => void setEmployment(h.id, e.target.value as EmploymentStatus)}
                      aria-label={`${h.name} employment status`}
                      title={`${STATUS_WORD[h.employmentStatus]} - A Active · T Terminated · C Contract`}
                      className={clsx("h-6 w-[38px] cursor-pointer rounded border px-0.5 text-center text-[11px] font-bold outline-none transition hover:shadow-glow", STATUS_TONE[h.employmentStatus])}
                    >
                      {(["ACTIVE", "TERMINATED", "CONTRACT"] as EmploymentStatus[]).map((v) => (
                        <option key={v} value={v} title={STATUS_WORD[v]}>
                          {STATUS_LETTER[v]}
                        </option>
                      ))}
                    </select>
                  </td>
                  {plan.map((col) => {
                    const c = h.checkins.find((x) => x.key === col.key);
                    return (
                      <td key={col.key} className={clsx("px-1 py-1.5 text-center align-middle", col.first && col.group !== "task" && "border-l border-brand-lea/10 dark:border-white/10")}>
                        {c ? gridCell(h, c, col.group) : null}
                      </td>
                    );
                  })}
                  <td className="border-l border-dashed border-brand-lea/10 dark:border-white/10" />
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6 + plan.length} className="px-4 py-8 text-center text-sm text-brand-grey dark:text-slate-400">
                  No post-onboard employees match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-brand-lea/10 px-4 py-3 text-xs text-brand-grey dark:border-white/10 dark:text-slate-400">
          <span>
            <b className="text-brand-lea dark:text-slate-100">Status:</b> A Active · T Terminated · C Contract
          </span>
          <span>Click any check-in to open the person: mark done, skip, send the email, read a reply, rate, or send the rating link.</span>
        </p>
      </div>
    </div>
  );
}
