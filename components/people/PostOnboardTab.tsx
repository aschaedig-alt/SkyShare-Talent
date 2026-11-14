"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Archive, CalendarClock, Building2, Trash2, ListChecks, MessageSquareText, MessageSquareWarning, RefreshCw, Send, SkipForward, X } from "lucide-react";
import { CheckinRatingRequestDialog, StateChip } from "@/components/people/CheckinRatingRequestDialog";
import { cancelReasonText, type RatingRequestView } from "@/lib/onboarding/checkin-rating-request-shared";
import type { Checkin, EmploymentStatus, GridTaskStatus, PostOnboardHire } from "@/lib/data/onboarding";
import { MAINTENANCE_TASKS } from "@/lib/onboarding/tasks";
import { BulkActionBar, bulkUpdateHires, bulkDeleteHires, type BulkAction, type BulkPatch } from "@/components/people/BulkActionBar";
import { SendTaskEmailButton } from "@/components/people/SendTaskEmailButton";
import { skipTaskEmail, skipTasksBulk, undoTaskEmailSkip } from "@/app/people/actions";
import type { TaskSkipRecord } from "@/lib/front/task-email";
import { EmptyState, Input } from "@/components/ui";
import { formatCalendarDayShort, formatMomentDateShort } from "@/lib/dates/display";
import { CheckinRatingModal } from "@/components/people/CheckinRatingModal";
import { ratedCheckin, ratedCheckinForTask, ratingPoints, scaleSummary, type CheckinRatingView, type RatedCheckin } from "@/lib/onboarding/checkin-rating";
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
function fmtDate(iso: string | null) {
  return formatCalendarDayShort(iso) || "—";
}
function fmtMoment(iso: string | null) {
  return formatMomentDateShort(iso) || "—";
}

const POST_ONBOARD_BULK_ACTIONS: BulkAction[] = [
  { kind: "choice", key: "checkin", label: "Mark check-in done", icon: ListChecks, options: MAINTENANCE_TASKS.map((t) => ({ value: t.key, label: t.label })) },
  // For older check-ins that fell due before the check-ins existed and did not happen (his ask, Nov 14 2026).
  { kind: "choice", key: "skip", label: "Mark check-in skipped", icon: SkipForward, options: MAINTENANCE_TASKS.map((t) => ({ value: t.key, label: t.label })) },
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

/** month/day, for the small date under an upcoming check-in. */
function shortDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
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
      const left = [
        pre.done ? `${pre.done} already done` : "",
        pre.alreadySkipped ? `${pre.alreadySkipped} already skipped` : "",
        pre.missing ? `${pre.missing} without this check-in` : ""
      ].filter(Boolean);
      if (pre.open === 0) {
        window.alert(`Nothing to skip: none of the ${ids.length} selected have the ${label} still open${left.length ? ` (${left.join(", ")})` : ""}.`);
        return;
      }
      const ask = `Mark the ${label} skipped for ${pre.open} ${pre.open === 1 ? "person" : "people"}? It reads "Skipped", not done, and nobody is emailed.${left.length ? ` ${left.join(", ")} - left as they are.` : ""} Each can be undone one at a time from the person's drawer.`;
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
  const colWidth = (group: string) => (group === "mgr" ? 70 : 52);

  /** When a dated check-in falls due: start date + its days (lib/onboarding/tasks.ts). */
  function dueAt(h: PostOnboardHire, key: string): number | null {
    const days = MAINTENANCE_TASKS.find((m) => m.key === key)?.dueDays ?? null;
    if (days === null || !h.startDate) return null;
    return new Date(h.startDate).getTime() + days * 86_400_000;
  }

  /**
   * The round mark every cell starts with: done, due, to do, skipped, or N/A.
   * SKIPPED and N/A are both stored N/A; a skip record (skips[hire][key]) is what
   * tells them apart. Skipped = it should have happened and did not; N/A = it never
   * applied to this person. His call, Nov 14 2026: the grid shows the difference.
   */
  function markEl(c: Checkin, skipped = false) {
    if (c.status === "NA")
      return skipped ? (
        <span className="inline-flex h-[22px] items-center rounded bg-amber-100 px-1 text-[9px] font-bold uppercase text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Skipped</span>
      ) : (
        <span className="inline-flex h-[22px] items-center rounded bg-brand-cloudDancer/70 px-1 text-[9px] font-bold uppercase tracking-wide text-brand-grey dark:bg-white/10 dark:text-slate-400">N/A</span>
      );
    if (c.status === "DONE")
      return (
        <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      );
    if (c.dueSoon) return <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-red-600 text-[11px] font-bold text-white">!</span>;
    return <span className="inline-block h-[22px] w-[22px] rounded-full border-2 border-brand-grey/30 dark:border-slate-500/50" />;
  }

  function stateWord(c: Checkin, skipped = false) {
    return c.status === "DONE" ? "Done" : c.status === "NA" ? (skipped ? "Skipped" : "N/A") : c.dueSoon ? "Due" : "To do";
  }

  /** The small line under a mark: what is going on with that check-in, in a word. */
  function miniLine(h: PostOnboardHire, c: Checkin, group: string) {
    const rated = ratedCheckinForTask(c.key);
    if (group === "mgr" && rated) {
      const saved = ratings[rk(h.id, rated.dayMark)];
      const req = requests[rk(h.id, rated.dayMark)];
      if (saved) return <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">★ rated</span>;
      if (c.status === "NA") return null;
      if (req && req.state === "PENDING") return <span className="text-[10px] text-brand-grey dark:text-slate-400">sent {formatMomentDateShort(req.lastSentAt)}</span>;
      if (c.status === "DONE") return <span className="text-[10px] text-brand-grey dark:text-slate-400">done</span>;
      if (c.dueSoon) return null; // the Send button sits there instead
      const at = dueAt(h, c.key);
      return at ? <span className="text-[10px] text-brand-grey dark:text-slate-400">{shortDay(at)}</span> : null;
    }
    const r = pickReply(replies[h.id]?.[c.key]);
    if (r) {
      const urgent = needsFollowUp(r.level) && !r.handledAt;
      const Icon = urgent ? MessageSquareWarning : MessageSquareText;
      return <Icon className={clsx("h-3.5 w-3.5", r.handledAt ? "text-brand-lea dark:text-slate-300" : LEVEL_STYLE[r.level].icon)} aria-label={urgent ? "Reply needs action" : "Replied"} />;
    }
    if (waitingOnReply(h.id, c.key)) return <span className="text-[9px] font-semibold uppercase tracking-wide text-brand-grey/80 dark:text-slate-500">no reply</span>;
    if (c.status === "TODO" && c.dueSoon) return <span className="text-[10px] font-semibold text-red-700 dark:text-red-300">due</span>;
    return null;
  }

  /** One grid cell: the mark and its line open the person's drawer; a due manager check-in also gets Send. */
  function gridCell(h: PostOnboardHire, c: Checkin, group: string) {
    const skipped = Boolean(skips[h.id]?.[c.key]);
    const rated = ratedCheckinForTask(c.key);
    const showSend =
      group === "mgr" && rated && c.status === "TODO" && c.dueSoon && !ratings[rk(h.id, rated.dayMark)] && !requests[rk(h.id, rated.dayMark)] && h.employmentStatus !== "TERMINATED";
    const at = dueAt(h, c.key);
    return (
      <div className="flex flex-col items-center gap-0.5">
        <button
          type="button"
          onClick={() => setDrawerId(h.id)}
          title={`${h.name} · ${columnLabel(c)}: ${stateWord(c, skipped)}${at && c.status === "TODO" ? ` · due ${formatMomentDateShort(new Date(at).toISOString())}` : ""} - click for actions`}
          aria-label={`${h.name}, ${columnLabel(c)}: ${stateWord(c, skipped)}. Open actions`}
          className="flex min-h-[38px] w-full flex-col items-center justify-start gap-0.5 rounded px-0.5 py-0.5 transition hover:bg-brand-gold/10 hover:shadow-glow"
        >
          {markEl(c, skipped)}
          {miniLine(h, c, group)}
        </button>
        {showSend && rated ? (
          <button
            type="button"
            onClick={() => setOpenRequest({ hire: h, checkin: rated })}
            title={`Email the hiring manager the ${rated.short} rating link - no login needed`}
            className="inline-flex items-center gap-0.5 rounded border border-red-300 px-1.5 py-px text-[10px] font-bold text-red-700 transition hover:shadow-glow dark:border-red-500/40 dark:text-red-300"
          >
            <Send className="h-2.5 w-2.5" /> Send
          </button>
        ) : null}
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
          {markEl(c, Boolean(skip))}
          <div>
            <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{columnLabel(c)}</div>
            <div className="text-[11px] text-brand-grey dark:text-slate-400">
              {c.status === "NA" && skip
                ? `Skipped${skip.skippedBy ? ` by ${skip.skippedBy}` : ""} ${formatMomentDateShort(skip.skippedAt)}`
                : at
                  ? `${c.status === "DONE" ? "Was due" : "Due"} ${formatMomentDateShort(new Date(at).toISOString())}`
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
              <span>· started {fmtDate(drawerHire.startDate)}</span>
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
                {ratedCheckin(n.dayMark)?.short ?? "90-day"} link sent {formatMomentDateShort(n.lastSentAt)} to {n.toName ?? n.to}, not answered · {cancelReasonText(n)} ({formatMomentDateShort(n.cancelledAt)})
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
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-9" />
            <col className="w-[230px]" />
            <col className="w-[130px]" />
            <col className="w-[88px]" />
            <col className="w-[52px]" />
            {plan.map((c) => (
              <col key={c.key} style={{ width: colWidth(c.group) }} />
            ))}
            <col />
          </colgroup>
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-brand-edenOnDark">
              <th colSpan={5} />
              {groups.map((g) => (
                <th key={g.key} colSpan={g.cols.length} className={clsx("border-l border-brand-lea/10 px-1 pb-1.5 pt-2.5 text-center leading-tight dark:border-white/10", GROUP_HEAD[g.key], GROUP_RULE[g.key], g.key === "mgr" && "text-brand-lea dark:text-slate-100")}>
                  {g.label}
                </th>
              ))}
              <th />
            </tr>
            <tr className="text-[10px] font-bold uppercase tracking-[0.1em] text-brand-grey dark:text-slate-400">
              <th className={clsx(HEAD_CELL, "rounded-tl px-2 text-center")}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="h-4 w-4 align-middle" />
              </th>
              <th className={clsx(HEAD_CELL, "px-3 text-left align-bottom")}>Employee</th>
              <th className={clsx(HEAD_CELL, "px-2 text-left align-bottom")}>Department</th>
              <th className={clsx(HEAD_CELL, "px-2 text-left align-bottom")}>Started</th>
              <th className={clsx(HEAD_CELL, "h-[92px] px-0 text-center align-bottom")} title="Employment status: A Active · T Terminated · C Contract">
                <span className="inline-block whitespace-nowrap [writing-mode:vertical-rl] rotate-180">Status</span>
              </th>
              {plan.map((c) => (
                <th key={c.key} className={clsx(HEAD_CELL, GROUP_HEAD[c.group as "task"], "h-[92px] px-0 text-center align-bottom", c.first && "border-l border-brand-lea/10 dark:border-white/10")} title={columnLabel(c)}>
                  <span className="inline-block whitespace-nowrap [writing-mode:vertical-rl] rotate-180">{columnLabel(c)}</span>
                </th>
              ))}
              <th className={clsx(HEAD_CELL, "rounded-tr border-l border-dashed border-brand-lea/10 dark:border-white/10")} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {/* How many are due in each column, for the people shown. */}
            <tr className="border-b-2 border-brand-lea/10 text-[11px] text-brand-grey dark:border-white/10 dark:text-slate-400">
              <td colSpan={5} className="px-3 py-1.5">
                {visible.length} {visible.length === 1 ? "person" : "people"} · due now ↓
              </td>
              {plan.map((c) => {
                const n = visible.filter((h) => h.checkins.some((x) => x.key === c.key && x.status === "TODO" && x.dueSoon)).length;
                return (
                  <td key={c.key} className={clsx("py-1.5 text-center tabular-nums", GROUP_TINT[c.group as "task"], c.first && "border-l border-brand-lea/10 dark:border-white/10")}>
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
                  <td className="px-2 py-2.5 text-center align-top">
                    <input type="checkbox" checked={selected.has(h.id)} onChange={() => toggleOne(h.id)} aria-label={`Select ${h.name}`} className="mt-0.5 h-4 w-4 align-middle" />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Link href={`/people/${h.id}`} className={clsx("font-semibold hover:underline", terminated ? "text-brand-grey dark:text-slate-400" : "text-brand-lea dark:text-slate-100")}>
                      {h.name}
                    </Link>
                    <div className="truncate text-xs text-brand-grey dark:text-slate-400" title={h.position ?? undefined}>
                      {h.position ?? "—"}
                    </div>
                  </td>
                  <td className="break-words px-2 py-2.5 align-top text-xs text-brand-grey dark:text-slate-400">
                    {h.department ?? "—"}
                  </td>
                  <td className="px-2 py-2.5 align-top text-xs text-brand-grey dark:text-slate-400">{fmtDate(h.startDate)}</td>
                  <td className="px-1 py-2.5 text-center align-top">
                    <select
                      value={h.employmentStatus}
                      onChange={(e) => void setEmployment(h.id, e.target.value as EmploymentStatus)}
                      aria-label={`${h.name} employment status`}
                      title={`${STATUS_WORD[h.employmentStatus]} - A Active · T Terminated · C Contract`}
                      className={clsx("w-[42px] cursor-pointer rounded border px-0.5 py-0.5 text-center text-[11px] font-bold outline-none transition hover:shadow-glow", STATUS_TONE[h.employmentStatus])}
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
                      <td key={col.key} className={clsx("px-0.5 py-2 text-center align-top", GROUP_TINT[col.group as "task"], col.first && "border-l border-brand-lea/10 dark:border-white/10")}>
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
