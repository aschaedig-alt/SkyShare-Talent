"use client";

import { useMemo, useState } from "react";
import type { CrewGroup, Seat } from "@/lib/fleet/staffing/types";
import { normSeat } from "@/lib/fleet/staffing/compute";
import {
  BUCKET_LABEL,
  SHEET_URL,
  cardKey,
  cardLabel,
  type CrewSeat,
  type PersonBucket,
  type Placement,
  type Suggestion
} from "@/lib/fleet/sheet-scan/compare";
import { applySuggestion } from "@/lib/fleet/sheet-scan/apply";
import type { ScanState } from "@/lib/fleet/sheet-scan/store.server";

/**
 * "Suggested changes from the sheet" on the crew chart (feedback cmw13vxfx).
 *
 * His ask, Nov 3: for each suggestion "I want to see the current info and the
 * suggestion you are giving, then the option to keep it as is, change to your
 * suggestion or change with modifications." So every card shows the chart's
 * current state beside the sheet's, the exact sheet row it came from, and those
 * three choices. Nothing changes the chart until somebody presses one.
 *
 * Applying goes through the chart's own save (onApply -> postRoster), so a
 * change from a suggestion is exactly like a change made by hand. Disabled
 * while the chart has unsaved hand edits, because saving a suggestion saves the
 * WHOLE chart and would quietly save those edits too.
 */

type Props = {
  initial: ScanState;
  /** True when `initial` was compared just now for this page and is not stored yet. */
  unsaved: boolean;
  groups: CrewGroup[];
  links: Record<string, string>;
  /** Saves the chart; resolves true when the save worked. */
  onApply: (next: { groups: CrewGroup[]; links: Record<string, string> }) => Promise<boolean>;
  /** Why the buttons are off right now, or null when they are usable. */
  blockedReason: string | null;
};

const SEAT_LABEL: Record<CrewSeat, string> = { pic: "Captain", sic: "First officer" };
const BUCKETS: PersonBucket[] = ["line", "train", "cand", "candInt", "offered"];

const btn =
  "rounded border px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const btnQuiet = `${btn} border-brand-lea/20 bg-white text-brand-lea dark:border-white/15 dark:bg-white/5 dark:text-slate-100 hover:border-brand-gold hover:shadow-glow`;
const btnMain = `${btn} border-brand-lea bg-brand-lea text-white hover:bg-brand-eden dark:border-brand-gold dark:bg-brand-gold dark:text-brand-lea`;
const field = "w-full rounded border border-brand-lea/20 bg-white px-2 py-1 text-xs text-brand-lea dark:border-white/15 dark:bg-brand-field dark:text-slate-100";

export function SheetSuggestions({ initial, unsaved, groups, links, onApply, blockedReason }: Props) {
  const [state, setState] = useState<ScanState>(initial);
  const [isUnsaved, setIsUnsaved] = useState(unsaved);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: Suggestion; reopen: boolean } | null>(null);
  const [showDecided, setShowDecided] = useState(false);
  const [showSpellings, setShowSpellings] = useState(false);
  const [open, setOpen] = useState(true);

  const label = useMemo(() => {
    const m = new Map(groups.map((g) => [cardKey(g), cardLabel(g)]));
    return (card: string) => m.get(card) ?? card.replace("|", " · ");
  }, [groups]);
  const cards = useMemo(() => groups.filter((g) => !g.poolFlown).map((g) => ({ key: cardKey(g), label: cardLabel(g) })), [groups]);
  const place = (p: Placement) => `${BUCKET_LABEL[p.bucket]} — ${label(p.card)}, ${SEAT_LABEL[p.seat]}`;

  const all = state.result?.suggestions ?? [];
  const pending = all.filter((s) => !state.decided[s.id]);
  const decided = all.filter((s) => state.decided[s.id]);

  const post = async (body: unknown): Promise<ScanState | null> => {
    const res = await fetch("/api/fleet/crew-sheet-suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    return (await res.json()) as ScanState;
  };

  const scanNow = async () => {
    setBusy("scan");
    setError(null);
    const next = await post({ action: "scan" });
    setBusy(null);
    if (!next) return setError({ id: "scan", text: "The scan could not run — check that you are signed in as an admin." });
    setState(next);
    setIsUnsaved(false);
  };

  /** Record a decision. A failed save is SAID, never shown as done: a "keep as is"
      that did not stick would quietly come back tomorrow as if nobody had looked. */
  const decide = async (s: Suggestion, decision: "kept" | "applied" | "modified"): Promise<boolean> => {
    const next = await post({ action: "decide", id: s.id, decision });
    if (next) {
      setState(next);
      setIsUnsaved(false);
      return true;
    }
    setError({ id: s.id, text: "Your choice could not be saved — please try again." });
    return false;
  };

  const apply = async (s: Suggestion, decision: "applied" | "modified", reopen = true) => {
    setBusy(s.id);
    setError(null);
    const next = applySuggestion({ groups, links }, s, { reopenOldSeat: reopen });
    if ("error" in next) {
      setBusy(null);
      return setError({ id: s.id, text: next.error });
    }
    const ok = await onApply(next);
    if (ok) {
      // The chart change is saved even if recording the decision fails; the
      // next scan will then find nothing to suggest for it anyway.
      await decide(s, decision);
      setEditing(null);
    } else setError({ id: s.id, text: "The chart could not be saved — nothing was changed." });
    setBusy(null);
  };

  /** What the chart has NOW for this suggestion, in plain words. */
  const current = (s: Suggestion): string => {
    switch (s.kind) {
      case "add": {
        const g = groups.find((x) => cardKey(x) === s.to.card);
        const seat = g ? normSeat(g[s.to.seat] as Seat | null | undefined) : null;
        return `Not on the chart.${seat ? ` ${label(s.to.card)} ${SEAT_LABEL[s.to.seat].toLowerCase()}s: ${seat.open} open, ${seat.parked} on hold.` : ""}`;
      }
      case "move":
        return place(s.from);
      case "remove":
        return place(s.from);
      case "rename":
        return `${s.from} — ${label(s.at.card)}, ${SEAT_LABEL[s.at.seat]}`;
      case "seats":
        return `${s.current.open} open, ${s.current.parked} on hold`;
    }
  };
  /** What the sheet suggests. */
  const suggested = (s: Suggestion): string => {
    switch (s.kind) {
      case "add":
        return `Add as ${place(s.to)}`;
      case "move":
        return place(s.to);
      case "remove":
        return `Take ${s.name} off this seat (it reopens). ${s.reason}.`;
      case "rename":
        return `Rename to ${s.to}`;
      case "seats":
        return `${s.suggested.open} open, ${s.suggested.parked} on hold`;
    }
  };
  const title = (s: Suggestion): string => {
    switch (s.kind) {
      case "add":
        return `Add ${s.name}`;
      case "move":
        return `Move ${s.name}`;
      case "remove":
        return `Is ${s.name} still on this aircraft?`;
      case "rename":
        return `${s.from} → ${s.to}?`;
      case "seats":
        return `Seat count — ${label(s.card)}, ${SEAT_LABEL[s.seat].toLowerCase()}s`;
    }
  };
  const sourceText = (s: Suggestion) =>
    s.kind === "remove" ? "Sheet: not on any aircraft tab" : `Sheet: ${s.source.tab} tab${s.source.row ? `, row ${s.source.row}` : ""} — ${s.source.text}`;

  // ---- the "Change with modifications" form, per kind. A plain function CALLED
  // from the JSX, not a component: declared inside this one it would be a new
  // component type on every render, and the inputs would lose focus after each
  // keystroke (the same trap as the chart header boxes).
  const modForm = (e: NonNullable<typeof editing>) => {
    const d = e.draft;
    const set = (patch: Partial<Suggestion>) => setEditing({ ...e, draft: { ...d, ...patch } as Suggestion });
    const setPlace = (key: "to" | "from" | "at", patch: Partial<Placement>) =>
      setEditing({ ...e, draft: { ...d, [key]: { ...(d as unknown as Record<string, Placement>)[key], ...patch } } as Suggestion });
    const placeFields = (key: "to" | "at", p: Placement) => (
      <>
        <label className="text-[11px] font-semibold text-brand-eden dark:text-slate-400">
          Aircraft
          <select className={field} value={p.card} onChange={(ev) => setPlace(key, { card: ev.target.value })}>
            {cards.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-brand-eden dark:text-slate-400">
          Seat
          <select className={field} value={p.seat} onChange={(ev) => setPlace(key, { seat: ev.target.value as CrewSeat })}>
            <option value="pic">Captain</option>
            <option value="sic">First officer</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-brand-eden dark:text-slate-400">
          Status
          <select className={field} value={p.bucket} onChange={(ev) => setPlace(key, { bucket: ev.target.value as PersonBucket })}>
            {BUCKETS.map((b) => (
              <option key={b} value={b}>{BUCKET_LABEL[b]}</option>
            ))}
          </select>
        </label>
      </>
    );
    return (
      <div className="mt-2 rounded border border-brand-gold/50 bg-brand-gold/5 p-2.5">
        <div className="grid gap-2 sm:grid-cols-4">
          {d.kind === "add" || d.kind === "move" ? (
            <>
              <label className="text-[11px] font-semibold text-brand-eden dark:text-slate-400">
                Name
                <input className={field} value={d.name} disabled={d.kind === "move"} onChange={(ev) => set({ name: ev.target.value } as Partial<Suggestion>)} />
              </label>
              {placeFields("to", d.to)}
            </>
          ) : null}
          {d.kind === "rename" ? (
            <label className="text-[11px] font-semibold text-brand-eden dark:text-slate-400 sm:col-span-2">
              New name
              <input className={field} value={d.to} onChange={(ev) => set({ to: ev.target.value } as Partial<Suggestion>)} />
            </label>
          ) : null}
          {d.kind === "seats" ? (
            <>
              <label className="text-[11px] font-semibold text-brand-eden dark:text-slate-400">
                Open seats
                <input type="number" min={0} className={field} value={d.suggested.open} onChange={(ev) => set({ suggested: { ...d.suggested, open: Number(ev.target.value) } } as Partial<Suggestion>)} />
              </label>
              <label className="text-[11px] font-semibold text-brand-eden dark:text-slate-400">
                On hold
                <input type="number" min={0} className={field} value={d.suggested.parked} onChange={(ev) => set({ suggested: { ...d.suggested, parked: Number(ev.target.value) } } as Partial<Suggestion>)} />
              </label>
            </>
          ) : null}
        </div>
        {d.kind === "move" || d.kind === "remove" ? (
          <label className="mt-2 flex items-center gap-1.5 text-[11px] text-brand-lea dark:text-slate-100">
            <input type="checkbox" checked={e.reopen} onChange={(ev) => setEditing({ ...e, reopen: ev.target.checked })} />
            Reopen the seat they leave as an open seat
          </label>
        ) : null}
        <div className="mt-2 flex gap-2">
          <button className={btnMain} disabled={!!busy || !!blockedReason} onClick={() => void apply(d, "modified", e.reopen)}>
            Save this change
          </button>
          <button className={btnQuiet} onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const row = (s: Suggestion, isDecided: boolean) => (
    <li key={s.id} className="rounded border border-brand-lea/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">{title(s)}</p>
        {isDecided ? (
          <span className="rounded bg-brand-sweet/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-eden dark:text-slate-400">
            {state.decided[s.id].decision === "kept" ? "Kept as is" : state.decided[s.id].decision === "applied" ? "Suggestion used" : "Changed with modifications"}
          </span>
        ) : null}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded bg-brand-cloudDancer/70 dark:bg-white/5 px-2.5 py-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-eden dark:text-slate-400">On the chart now</p>
          <p className="mt-0.5 text-xs text-brand-lea dark:text-slate-100">{current(s)}</p>
        </div>
        <div className="rounded bg-brand-gold/10 px-2.5 py-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300">The sheet says</p>
          <p className="mt-0.5 text-xs text-brand-lea dark:text-slate-100">{suggested(s)}</p>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-brand-eden dark:text-slate-400">
        {sourceText(s)} ·{" "}
        <a href={SHEET_URL} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          open the sheet
        </a>
      </p>
      {!isDecided ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={btnQuiet} disabled={!!busy} onClick={() => void decide(s, "kept")}>
            Keep as is
          </button>
          <button className={btnMain} disabled={!!busy || !!blockedReason} title={blockedReason ?? undefined} onClick={() => void apply(s, "applied")}>
            {busy === s.id ? "Saving…" : "Use suggestion"}
          </button>
          <button className={btnQuiet} disabled={!!busy || !!blockedReason} title={blockedReason ?? undefined} onClick={() => setEditing({ id: s.id, draft: structuredClone(s), reopen: true })}>
            Change with modifications
          </button>
        </div>
      ) : null}
      {editing?.id === s.id ? modForm(editing) : null}
      {error?.id === s.id ? <p className="mt-1.5 text-[11px] font-semibold text-red-700">{error.text}</p> : null}
    </li>
  );

  const scanned = state.scannedAt ? new Date(state.scannedAt).toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  return (
    <section className="mb-4 rounded border border-brand-lea/10 bg-white p-3.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => setOpen((v) => !v)} className="text-left">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-gold">Sheet check</span>
          <span className="ml-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
            {pending.length === 0 ? "Chart matches the sheet" : `${pending.length} suggested change${pending.length === 1 ? "" : "s"} from Recruiting Status Tracking`}
          </span>
          <span className="ml-2 text-[11px] text-brand-eden dark:text-slate-400">{open ? "hide" : "show"}</span>
        </button>
        <div className="flex items-center gap-2 text-[11px] text-brand-eden dark:text-slate-400">
          {isUnsaved ? <span>Compared just now — the daily scan has not stored one yet</span> : scanned ? <span>Last scanned {scanned} MT</span> : <span>Not scanned yet</span>}
          <button className={btnQuiet} disabled={busy === "scan"} onClick={() => void scanNow()}>
            {busy === "scan" ? "Scanning…" : "Scan now"}
          </button>
        </div>
      </div>
      {state.error ? <p className="mt-2 rounded bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-800 dark:bg-red-500/15 dark:text-red-300">{state.error}</p> : null}
      {error?.id === "scan" ? <p className="mt-2 text-xs font-semibold text-red-700">{error.text}</p> : null}
      {open ? (
        <>
          {state.result ? (
            <p className="mt-1.5 text-[11px] text-brand-eden dark:text-slate-400">
              {state.result.agree} people match the sheet exactly.
              {state.result.spellings.length ? (
                <>
                  {" "}
                  <button className="underline-offset-2 hover:underline" onClick={() => setShowSpellings((v) => !v)}>
                    {state.result.spellings.length} name{state.result.spellings.length === 1 ? " is" : "s are"} spelled differently on the sheet
                  </button>{" "}
                  (not suggested — the chart&apos;s spelling is kept).
                </>
              ) : null}
            </p>
          ) : null}
          {showSpellings && state.result ? (
            <ul className="mt-1 list-disc pl-5 text-[11px] text-brand-eden dark:text-slate-400">
              {state.result.spellings.map((x) => (
                <li key={`${x.tab}-${x.row}`}>
                  Sheet &ldquo;{x.sheet}&rdquo;, chart &ldquo;{x.chart}&rdquo; ({x.tab} tab, row {x.row})
                </li>
              ))}
            </ul>
          ) : null}
          {blockedReason && pending.length ? <p className="mt-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300">{blockedReason}</p> : null}
          {pending.length ? <ul className="mt-2.5 space-y-2">{pending.map((s) => row(s, false))}</ul> : null}
          {decided.length ? (
            <div className="mt-2.5">
              <button className="text-[11px] font-semibold text-brand-eden dark:text-slate-400 underline-offset-2 hover:underline" onClick={() => setShowDecided((v) => !v)}>
                {showDecided ? "Hide" : "Show"} {decided.length} already decided
              </button>
              {showDecided ? <ul className="mt-2 space-y-2">{decided.map((s) => row(s, true))}</ul> : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
