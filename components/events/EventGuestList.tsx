"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Mail, RefreshCw, Undo2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EmailBodyEditor } from "@/components/shared/EmailBodyEditor";
import {
  GUEST_STATUS_LABEL,
  type ApplySummary,
  type GuestListView,
  type GuestRow,
  type GuestStatus,
  type ResponseRow
} from "@/lib/events/guest-list-shared";

// The party guest list - the Guests tab of a company event (Aimee's feedback
// cmwwjwama + cmwwk53m7, Nov 25 2026). Every current employee is listed, like the
// party store. Mark attending / not attending / no response and change it any
// time; plus one, guest's name, allergies, and every other answer from the RSVP
// form. The live RSVP sheet is read each time the tab opens. Tick the people who
// have not answered and send them one reminder email, everyone in BCC. Upload a
// CSV, Excel file or PDF of answers. Rules: lib/events/guest-list.ts.
//
// Phone first (always-works-on-mobile): every person is a card on a phone and a
// grid row on a wide screen - no table, nothing scrolls sideways. The page scrolls;
// no box inside it does.

const CARD = "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const H2 = "text-base font-semibold text-brand-lea dark:text-slate-100";
const FIELD =
  "w-full rounded border border-brand-lea/20 bg-white px-2.5 py-1.5 text-sm text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const SMALL_BUTTON =
  "inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow disabled:opacity-50 dark:border-white/10 dark:text-slate-100";
const NAVY_BUTTON = "inline-flex items-center gap-1.5 rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow disabled:opacity-50";
const MUTED = "text-[11px] text-brand-grey dark:text-slate-400";

const STATUS_STYLE: Record<GuestStatus, string> = {
  CONFIRMED: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  DECLINED: "border-brand-lea/15 bg-brand-cloudDancer/60 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
  NO_RESPONSE: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
};
const FILTERS: Array<{ key: GuestStatus | "ALL"; label: string }> = [
  { key: "ALL", label: "Everyone" },
  { key: "CONFIRMED", label: "Attending" },
  { key: "DECLINED", label: "Not attending" },
  { key: "NO_RESPONSE", label: "No response" }
];

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

function SummaryBox({ s, title }: { s: ApplySummary & { rows?: number }; title: string }) {
  return (
    <div className="mt-2 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-3 text-xs text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">
        {s.rows !== undefined ? `${s.rows} responses read. ` : ""}
        {s.matched} matched to employees · {s.attending} attending · {s.notAttending} not attending · <b>{s.changed} would change</b>
        {s.keptManual ? ` · ${s.keptManual} kept as you changed them by hand` : ""}
        {s.unmatched ? ` · ${s.unmatched} could not be matched (listed after you apply)` : ""}
      </p>
      {s.changes.length ? (
        <ul className="mt-1.5 space-y-0.5 text-brand-grey dark:text-slate-400">
          {s.changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
          {s.changed > s.changes.length ? <li>and {s.changed - s.changes.length} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export function EventGuestList({
  eventId,
  eventName,
  eventWhen,
  canWrite
}: {
  eventId: string;
  eventName: string;
  /** "Friday, Dec 11 at South Valley Regional" - for the reminder's wording. */
  eventWhen: string;
  canWrite: boolean;
}) {
  const [list, setList] = useState<GuestListView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<GuestStatus | "ALL">("ALL");
  const [dept, setDept] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());

  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTab, setSheetTab] = useState("RSVP");
  const [sheetPreview, setSheetPreview] = useState<(ApplySummary & { rows: number }) | null>(null);
  const [upload, setUpload] = useState<{ fileName: string; rows: ResponseRow[]; preview: ApplySummary } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [remind, setRemind] = useState(false);

  const load = useCallback(
    async (sync: boolean) => {
      try {
        const res = await fetch(`/api/events/${eventId}/guests${sync ? "?sync=1" : ""}`);
        const data = (await res.json().catch(() => ({}))) as GuestListView & { message?: string; syncError?: string | null };
        if (!res.ok) throw new Error(data.message || "Could not load the guest list.");
        setList(data);
        setSyncError(data.syncError ?? null);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load the guest list.");
      }
    },
    [eventId]
  );
  // Opening the tab reads the linked sheet (at most once a minute) - her "real time".
  useEffect(() => {
    void load(canWrite);
  }, [load, canWrite]);

  async function post(action: string, payload: Record<string, unknown> = {}, label = action) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; list?: GuestListView; [k: string]: unknown };
      if (!res.ok) throw new Error(data.message || "That did not work.");
      if (data.list) setList(data.list);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => list?.rows ?? [], [list]);
  const counts = useMemo(() => {
    const c = { CONFIRMED: 0, DECLINED: 0, NO_RESPONSE: 0, plusOnes: 0 };
    for (const r of rows) {
      c[r.status]++;
      if (r.status === "CONFIRMED" && r.plusOne) c.plusOnes++;
    }
    return c;
  }, [rows]);
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) for (const d of (r.department ?? "").split("|").map((x) => x.trim()).filter(Boolean)) set.add(d);
    return [...set].sort();
  }, [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "ALL" || r.status === filter) &&
        (!dept || (r.department ?? "").split("|").some((d) => d.trim() === dept)) &&
        (!needle || `${r.name} ${r.position ?? ""} ${r.guestName ?? ""}`.toLowerCase().includes(needle))
    );
  }, [rows, filter, dept, q]);

  // Optimistic: the row changes at once, the server confirms with the fresh list.
  function patchRow(r: GuestRow, patch: Partial<GuestRow>) {
    setList((cur) => (cur ? { ...cur, rows: cur.rows.map((x) => (x.newHireId === r.newHireId ? { ...x, ...patch, source: "manual" } : x)) } : cur));
    void post("set", { newHireId: r.newHireId, ...patch }, `set:${r.newHireId}`);
  }

  async function bulkStatus(status: GuestStatus) {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(`Mark ${ids.length} ${ids.length === 1 ? "person" : "people"} as ${GUEST_STATUS_LABEL[status].toLowerCase()}?`)) return;
    for (const id of ids) await post("set", { newHireId: id, status }, "bulk");
    setSelected(new Set());
  }

  async function chooseFile(file: File) {
    setBusy("upload");
    setError(null);
    setUpload(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/events/${eventId}/guests/upload`, { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { message?: string; fileName: string; rows: ResponseRow[]; preview: ApplySummary };
      if (!res.ok) throw new Error(data.message || "Could not read that file.");
      setUpload({ fileName: data.fileName, rows: data.rows, preview: data.preview });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loadError) return <section className={CARD}><p className="text-sm text-red-700 dark:text-red-300">{loadError}</p></section>;
  if (!list) return <section className={CARD}><p className={MUTED}>Loading the guest list…</p></section>;

  const noResponseIds = shown.filter((r) => r.status === "NO_RESPONSE").map((r) => r.newHireId);
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.newHireId));
  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-4">
      {/* The count, the way the night is planned: people, plus ones, the head count. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Attending", counts.CONFIRMED, `${counts.plusOnes} bringing a plus one`],
          ["Head count", counts.CONFIRMED + counts.plusOnes, "employees and their guests"],
          ["Not attending", counts.DECLINED, ""],
          ["No response", counts.NO_RESPONSE, `of ${rows.length} invited`]
        ].map(([label, value, sub]) => (
          <div key={label as string} className={CARD}>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-brand-lea dark:text-slate-100">{value}</p>
            {sub ? <p className={MUTED}>{sub}</p> : null}
          </div>
        ))}
      </div>

      {/* Where the answers come from. */}
      {canWrite ? (
        <section className={CARD}>
          <h2 className={H2}>Answers from the RSVP sheet</h2>
          {list.sheet ? (
            <>
              <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
                Reading the <b>{list.sheet.tab}</b> tab of{" "}
                <a href={list.sheet.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-eden underline dark:text-brand-sweet">
                  the live sheet
                </a>{" "}
                every time this tab opens. Last read {when(list.sheet.lastSyncAt) || "never"}
                {list.sheet.lastSyncNote ? ` - ${list.sheet.lastSyncNote}` : ""}. Answers you change here are kept until that person fills the form in again.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={SMALL_BUTTON} disabled={Boolean(busy)} onClick={() => void post("sync", {}, "sync").then((d) => d && setNotice("Read the sheet."))}>
                  <RefreshCw className={clsx("h-3.5 w-3.5", busy === "sync" && "animate-spin")} aria-hidden /> Check the sheet now
                </button>
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  disabled={Boolean(busy)}
                  onClick={() => window.confirm("Stop reading this sheet? The answers already here stay.") && void post("unlinkSheet")}
                >
                  Stop reading this sheet
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
                Paste the link to the Google Sheet the RSVP form writes to. The sheet has to be shared (Viewer is enough) with the app&apos;s Google account. You see what it would change before anything is saved.
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                <input className={FIELD} value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Google Sheet link" />
                <input className={FIELD} value={sheetTab} onChange={(e) => setSheetTab(e.target.value)} placeholder="Tab" aria-label="Tab name" />
                <button
                  type="button"
                  className={NAVY_BUTTON}
                  disabled={!sheetUrl.trim() || Boolean(busy)}
                  onClick={() =>
                    void post("previewSheet", { url: sheetUrl, tab: sheetTab }, "preview").then((d) => d && setSheetPreview(d.preview as ApplySummary & { rows: number }))
                  }
                >
                  {busy === "preview" ? "Reading…" : "Preview"}
                </button>
              </div>
              {sheetPreview ? (
                <>
                  <SummaryBox s={sheetPreview} title="If you link this sheet:" />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={NAVY_BUTTON}
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void post("linkSheet", { url: sheetUrl, tab: sheetTab }, "link").then((d) => {
                          if (d) {
                            setSheetPreview(null);
                            setNotice("Linked. The sheet is read every time this tab opens.");
                          }
                        })
                      }
                    >
                      Link it and bring the answers in
                    </button>
                    <button type="button" className={SMALL_BUTTON} onClick={() => setSheetPreview(null)}>
                      Not now
                    </button>
                  </div>
                </>
              ) : null}
            </>
          )}
          {syncError ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{syncError}</p> : null}

          <div className="mt-4 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            <p className="text-sm text-brand-grey dark:text-slate-400">Or upload what you have - a CSV, an Excel file or a PDF of the answers. You see what it would change first.</p>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods,.pdf" className="sr-only" onChange={(e) => e.target.files?.[0] && void chooseFile(e.target.files[0])} />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={SMALL_BUTTON} disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" aria-hidden /> {busy === "upload" ? "Reading the file…" : "Upload a file"}
              </button>
              {list.canUndo ? (
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  disabled={Boolean(busy)}
                  onClick={() => window.confirm(`Undo "${list.undoNote}"? The answers it changed go back to what they were.`) && void post("undo").then((d) => d && setNotice(`Put back ${d.restored} answers.`))}
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo last update
                </button>
              ) : null}
            </div>
            {upload ? (
              <>
                <SummaryBox s={{ ...upload.preview, rows: upload.rows.length }} title={`From ${upload.fileName}:`} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={NAVY_BUTTON}
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void post("applyRows", { rows: upload.rows, fileName: upload.fileName }, "apply").then((d) => {
                        if (d) {
                          setUpload(null);
                          setNotice("Brought in. Undo last update puts it back if it was wrong.");
                        }
                      })
                    }
                  >
                    Bring these answers in
                  </button>
                  <button type="button" className={SMALL_BUTTON} onClick={() => setUpload(null)}>
                    Not now
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {list.unmatched.length ? (
            <div className="mt-4 border-t border-brand-lea/10 pt-3 dark:border-white/10">
              <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">Answers we could not match to an employee ({list.unmatched.length})</p>
              <p className={MUTED}>Usually a personal email address. Pick who it is and it is matched from now on.</p>
              <ul className="mt-2 space-y-2">
                {list.unmatched.map((u) => (
                  <li key={`${u.email ?? u.name}`} className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center">
                    <span className="min-w-0 break-words text-sm text-brand-lea dark:text-slate-100">
                      {u.email ?? u.name} <span className={MUTED}>· {GUEST_STATUS_LABEL[u.status]}{u.plusOne ? " · +1" : ""}{u.guestName ? ` (${u.guestName})` : ""}</span>
                    </span>
                    {u.email ? (
                      <select
                        className={FIELD}
                        defaultValue=""
                        aria-label={`Who is ${u.email}?`}
                        onChange={(e) => e.target.value && void post("match", { email: u.email, newHireId: e.target.value }, "match")}
                      >
                        <option value="">Who is this?</option>
                        {rows.map((r) => (
                          <option key={r.newHireId} value={r.newHireId}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={MUTED}>No email - set their answer on their row below.</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {notice ? <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
          {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        </section>
      ) : null}

      {/* The list. */}
      <section className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={H2}>Guests</h2>
          <span className={MUTED}>
            {shown.length} of {rows.length} shown
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const n = f.key === "ALL" ? rows.length : counts[f.key];
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                className={clsx(
                  "rounded px-2.5 py-1 text-xs font-semibold transition hover:shadow-glow",
                  on ? "bg-brand-lea text-white ring-1 ring-brand-gold" : "bg-brand-cloudDancer/60 text-brand-lea dark:bg-white/10 dark:text-slate-200"
                )}
              >
                {f.label} ({n})
              </button>
            );
          })}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input className={FIELD} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name, title or guest" aria-label="Search guests" />
          <select className={FIELD} value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {canWrite ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-y border-brand-lea/10 py-2 dark:border-white/10">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-brand-lea dark:text-slate-100">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={allShownSelected}
                onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((r) => r.newHireId)))}
              />
              Select all shown
            </label>
            <button type="button" className={SMALL_BUTTON} disabled={!noResponseIds.length} onClick={() => setSelected(new Set(noResponseIds))}>
              Select everyone with no response ({noResponseIds.length})
            </button>
            {selected.size ? (
              <>
                <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">{selected.size} selected</span>
                <button type="button" className={NAVY_BUTTON} disabled={Boolean(busy)} onClick={() => setRemind(true)}>
                  <Mail className="h-3.5 w-3.5" aria-hidden /> Email a reminder (BCC)
                </button>
                <select
                  className={clsx(FIELD, "w-auto")}
                  value=""
                  aria-label="Mark the selected people"
                  disabled={Boolean(busy)}
                  onChange={(e) => e.target.value && void bulkStatus(e.target.value as GuestStatus)}
                >
                  <option value="">Mark as…</option>
                  {(Object.keys(GUEST_STATUS_LABEL) as GuestStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {GUEST_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button type="button" className="text-xs font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <ul className="mt-1 divide-y divide-brand-lea/10 dark:divide-white/10">
          {shown.map((r) => {
            const expanded = open.has(r.newHireId);
            return (
              <li key={r.newHireId} className={clsx("py-2.5", selected.has(r.newHireId) && "bg-brand-gold/10")}>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 md:grid-cols-[auto_minmax(0,1.4fr)_9.5rem_7rem_minmax(0,1fr)] md:items-center">
                  {canWrite ? (
                    <input type="checkbox" className="mt-1 h-4 w-4 md:mt-0" checked={selected.has(r.newHireId)} onChange={() => toggle(r.newHireId)} aria-label={`Select ${r.name}`} />
                  ) : (
                    <span />
                  )}
                  <div className="min-w-0">
                    <Link href={`/people/${r.newHireId}`} className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100">
                      {r.name}
                    </Link>
                    <div className={clsx(MUTED, "truncate")}>{[r.position, r.department].filter(Boolean).join(" · ")}</div>
                  </div>
                  <div className="col-start-2 md:col-start-auto">
                    {canWrite ? (
                      <select
                        className={clsx("w-full rounded border px-2 py-1 text-xs font-semibold", STATUS_STYLE[r.status])}
                        value={r.status}
                        onChange={(e) => patchRow(r, { status: e.target.value as GuestStatus })}
                        aria-label={`${r.name}: attending?`}
                      >
                        {(Object.keys(GUEST_STATUS_LABEL) as GuestStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {GUEST_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={clsx("inline-block rounded border px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[r.status])}>{GUEST_STATUS_LABEL[r.status]}</span>
                    )}
                  </div>
                  <div className="col-start-2 md:col-start-auto">
                    {canWrite ? (
                      <select
                        className={FIELD}
                        value={r.plusOne === null ? "" : r.plusOne ? "yes" : "no"}
                        onChange={(e) => patchRow(r, { plusOne: e.target.value === "" ? null : e.target.value === "yes" })}
                        aria-label={`${r.name}: plus one?`}
                      >
                        <option value="">Plus one?</option>
                        <option value="yes">+1 yes</option>
                        <option value="no">No +1</option>
                      </select>
                    ) : (
                      <span className={MUTED}>{r.plusOne ? "+1" : r.plusOne === false ? "No +1" : ""}</span>
                    )}
                  </div>
                  <div className="col-start-2 min-w-0 md:col-start-auto">
                    {canWrite && r.plusOne ? (
                      <input
                        className={FIELD}
                        defaultValue={r.guestName ?? ""}
                        placeholder="Guest's name and relation"
                        aria-label={`${r.name}: guest's name`}
                        onBlur={(e) => e.target.value.trim() !== (r.guestName ?? "") && patchRow(r, { guestName: e.target.value })}
                      />
                    ) : (
                      <span className={clsx(MUTED, "break-words")}>{r.guestName ?? ""}</span>
                    )}
                  </div>
                </div>
                <div className="ml-6 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {r.allergies ? <span className="text-[11px] font-semibold text-red-700 dark:text-red-300">Allergies: {r.allergies}</span> : null}
                  {r.source ? (
                    <span className={MUTED}>
                      {r.source === "sheet" ? "From the RSVP form" : r.source === "upload" ? "From an upload" : `Changed here${r.changedBy ? ` by ${r.changedBy}` : ""}`}
                      {r.respondedAt ? ` · answered ${when(r.respondedAt)}` : ""}
                    </span>
                  ) : null}
                  {r.answers.length || canWrite ? (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-brand-eden hover:underline dark:text-brand-sweet"
                      aria-expanded={expanded}
                      onClick={() => setOpen((cur) => { const n = new Set(cur); if (n.has(r.newHireId)) n.delete(r.newHireId); else n.add(r.newHireId); return n; })}
                    >
                      {expanded ? "Hide answers" : r.answers.length ? `Their answers (${r.answers.length})` : "Allergies"}
                    </button>
                  ) : null}
                </div>
                {expanded ? (
                  <div className="ml-6 mt-2 space-y-1.5 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-2.5 text-xs dark:border-white/10 dark:bg-white/5">
                    {canWrite ? (
                      <label className="grid gap-1 font-semibold text-brand-lea dark:text-slate-100">
                        Food allergies
                        <input
                          className={FIELD}
                          defaultValue={r.allergies ?? ""}
                          placeholder="None"
                          onBlur={(e) => e.target.value.trim() !== (r.allergies ?? "") && patchRow(r, { allergies: e.target.value })}
                        />
                      </label>
                    ) : null}
                    {r.answers.map((a) => (
                      <div key={a.q}>
                        <p className="font-semibold text-brand-lea dark:text-slate-100">{a.q}</p>
                        <p className="whitespace-pre-line break-words text-brand-grey dark:text-slate-300">{a.a}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
          {shown.length === 0 ? <li className={clsx(MUTED, "py-4 text-center")}>Nobody matches.</li> : null}
        </ul>
        {list.reminders.length ? (
          <p className={clsx(MUTED, "mt-3")}>
            Reminders sent:{" "}
            {list.reminders
              .slice(-3)
              .map((m) => `${when(m.at)} to ${m.count}${m.mode !== "production" ? ` (test send, ${m.mode})` : ""}`)
              .join(" · ")}
          </p>
        ) : null}
      </section>

      {remind ? (
        <ReminderDialog
          eventName={eventName}
          eventWhen={eventWhen}
          people={rows.filter((r) => selected.has(r.newHireId))}
          onClose={() => setRemind(false)}
          onSend={async (subject, body) => {
            const d = await post("remind", { newHireIds: [...selected], subject, body }, "remind");
            if (!d) return false;
            const skipped = (d.skipped as string[] | undefined) ?? [];
            setNotice(
              `Sent to ${d.sent as number} in BCC${(d.mode as string) !== "production" ? ` (test send: ${d.mode as string})` : ""}.${skipped.length ? ` Not sent to ${skipped.join(", ")} - no SkyShare email on file.` : ""}`
            );
            setSelected(new Set());
            setRemind(false);
            return true;
          }}
          error={error}
          busy={busy === "remind"}
        />
      ) : null}
    </div>
  );
}

function escHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

function ReminderDialog({
  eventName,
  eventWhen,
  people,
  onClose,
  onSend,
  error,
  busy
}: {
  eventName: string;
  eventWhen: string;
  people: GuestRow[];
  onClose: () => void;
  onSend: (subject: string, body: string) => Promise<boolean>;
  error: string | null;
  busy: boolean;
}) {
  const [subject, setSubject] = useState(`Are you coming to ${eventName}?`);
  const [body, setBody] = useState<string | null>(null);
  const template = useMemo(
    () =>
      `<p>Hi everyone,</p><p>We haven't heard from you yet about ${escHtml(eventName)}${eventWhen ? `, ${escHtml(eventWhen)}` : ""}. All employees are invited and you're welcome to bring a plus one.</p><p>Could you let us know if you'll be there, and whether you're bringing a guest? Just reply to this email.</p><p>Thank you!<br />SkyShare HR</p>`,
    [eventName, eventWhen]
  );
  const missing = people.filter((p) => !p.email);
  return (
    <Modal open onClose={onClose} busy={busy} maxWidth="max-w-2xl" title="Email a reminder">
      <div className="p-5 text-left">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">Email a reminder to {people.length} {people.length === 1 ? "person" : "people"}</h2>
        <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
          One email from hrotasks@, with everyone in BCC, so nobody sees who else it went to. Replies come back to hrotasks@.
          {missing.length ? ` ${missing.map((p) => p.name).join(", ")} ${missing.length === 1 ? "has" : "have"} no SkyShare email and will be left out.` : ""}
        </p>
        <label className="mt-3 grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Subject
          <input className={FIELD} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <div className="mt-3">
          <EmailBodyEditor greeting="" template={template} edited={body} onChange={setBody} disabled={busy} source="app" note="Everyone gets the same message - there is no per-person greeting in a BCC email." />
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !subject.trim()}
            onClick={() => void onSend(subject, body ?? template)}
            className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow disabled:opacity-50"
          >
            {busy ? "Sending…" : `Send to ${people.length - missing.length} in BCC`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
