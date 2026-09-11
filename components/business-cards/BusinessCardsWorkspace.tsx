"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Search, Copy, Check, CreditCard, ExternalLink, AlertTriangle, Clock, Layers } from "lucide-react";
import type { BusinessCardRow } from "@/lib/data/business-cards";
import {
  formatCardText,
  formatCardsBatch,
  formatCardHtml,
  formatCardsHtml,
  cardOrderState,
  describeBatch,
  CARD_ORDER_MIN_BATCH_MAX,
  CARD_STATUSES,
  CARD_STATUS_LABEL,
  type CardStatus
} from "@/lib/business-cards/card";
import { updateCardOrderMinimum } from "@/app/business-cards/actions";
import { copyRich } from "@/lib/business-cards/copy";
import { BusinessCardVisual } from "@/components/business-cards/BusinessCardVisual";

type View = "all" | "new" | "needs" | "queued" | "ordered" | "received" | "notNeeded" | "missing";

// The tabs that are just "everyone currently at this order status". Changing a
// card's status re-derives the rows, so the person drops out of one status tab and
// appears under the new one automatically.
const STATUS_VIEW: Partial<Record<View, CardStatus>> = {
  needs: "NEEDED",
  queued: "QUEUED",
  ordered: "ORDERED",
  received: "RECEIVED",
  notNeeded: "NOT_NEEDED"
};

function fmtDay(iso: string | null) {
  return iso ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso)) : "";
}

const statusSelectClass = (status: string) =>
  clsx(
    "rounded border px-1.5 py-0.5 text-[11px] font-semibold outline-none transition",
    status === "RECEIVED"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
      : status === "QUEUED"
        ? "border-brand-sweet bg-brand-sweet/25 text-brand-lea dark:border-brand-sweet/40 dark:bg-brand-sweet/15 dark:text-brand-sweet"
        : status === "ORDERED"
        ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300"
        : status === "NOT_NEEDED"
          ? "border-brand-lea/20 bg-brand-cloudDancer/40 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
          : "border-brand-gold/50 bg-brand-gold/15 text-brand-lea dark:text-brand-gold"
  );

export function BusinessCardsWorkspace({ cards, minBatch: minBatchProp }: { cards: BusinessCardRow[]; minBatch: number }) {
  const [items, setItems] = useState(cards);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  // The minimum batch size, as saved in WorkspaceSetting. Held locally so the
  // count re-reads the moment she changes it, and re-synced whenever the server
  // sends a new value.
  const [minBatch, setMinBatch] = useState(minBatchProp);
  useEffect(() => {
    setMinBatch(minBatchProp);
  }, [minBatchProp]);
  const [minDraft, setMinDraft] = useState(String(minBatchProp));
  const [minMsg, setMinMsg] = useState<string | null>(null);
  const [savingMin, startSaveMin] = useTransition();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const statusFilter = STATUS_VIEW[view];
    return items.filter((r) => {
      if (view === "new" && !r.onboarding) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (view === "missing" && !r.card.missing.includes("email")) return false;
      if (!needle) return true;
      return [r.card.name, r.card.title, r.department].filter(Boolean).some((v) => v!.toLowerCase().includes(needle));
    });
  }, [items, q, view]);

  // People (not cards) that still need ordering before an upcoming orientation.
  const toOrder = useMemo(
    () => items.filter((r) => r.label === null && r.orderState.needsAction).sort((a, b) => (a.orderState.daysUntilOrientation ?? 0) - (b.orderState.daysUntilOrientation ?? 0)),
    [items]
  );

  // People on the next order whose orientation has already passed the usual
  // order-by date. Deliberately NOT an alarm: being on the next order is her
  // answer to "has anybody dealt with this person", and re-flashing it red is the
  // nagging she asked to stop. It is stated once, as a fact about the calendar,
  // because the one thing a queue cannot tell her by itself is that somebody on it
  // is out of runway. Primary cards only, so a person with two cards counts once.
  const queuedTight = useMemo(
    () =>
      items
        .filter((r) => r.label === null && r.status === "QUEUED" && r.orderState.pastOrderBy && (r.orderState.daysUntilOrientation ?? -99) >= -3)
        .sort((a, b) => (a.orderState.daysUntilOrientation ?? 0) - (b.orderState.daysUntilOrientation ?? 0)),
    [items]
  );

  function saveMinimum() {
    const next = Number(minDraft);
    setMinMsg(null);
    if (!Number.isInteger(next) || next < 1 || next > CARD_ORDER_MIN_BATCH_MAX) {
      setMinMsg(`Enter a whole number between 1 and ${CARD_ORDER_MIN_BATCH_MAX}.`);
      return;
    }
    startSaveMin(async () => {
      const res = await updateCardOrderMinimum(next);
      if (res.ok) {
        setMinBatch(res.minBatch ?? next);
        setMinMsg("Saved.");
        setTimeout(() => setMinMsg(null), 2400);
      } else {
        setMinMsg(res.error ?? "Could not save the minimum.");
      }
    });
  }

  // Counts are of PEOPLE (deduped across a person's primary + variant cards), since
  // status is shared across a person's cards.
  const peopleWith = (pred: (c: BusinessCardRow) => boolean) => new Set(items.filter(pred).map((c) => c.personId)).size;
  const staffCount = peopleWith(() => true);
  const newHireCount = peopleWith((c) => c.onboarding);
  const needsCount = peopleWith((c) => c.status === "NEEDED");
  const orderedCount = peopleWith((c) => c.status === "ORDERED");
  const receivedCount = peopleWith((c) => c.status === "RECEIVED");
  const queuedCount = peopleWith((c) => c.status === "QUEUED");
  const notNeededCount = peopleWith((c) => c.status === "NOT_NEEDED");
  // People whose card can't be finished because their company email is blank —
  // catch these BEFORE the cards go to the printer.
  const missingEmailCount = peopleWith((c) => c.card.missing.includes("email"));

  function toggle(key: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function setStatus(personId: string, next: string) {
    setItems((prev) => prev.map((r) => (r.personId === personId ? { ...r, status: next, orderState: cardOrderState(r.orientationDate, next, Date.now()) } : r)));
    try {
      await fetch(`/api/new-hires/${personId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessCardStatus: next }) });
    } catch {
      /* optimistic; a refresh will resync */
    }
  }

  // Mark all selected people (deduped) to one status in a single request.
  async function bulkSetStatus(next: CardStatus) {
    const ids = [...new Set(selectedRows.map((r) => r.personId))];
    if (ids.length === 0) return;
    setItems((prev) => prev.map((r) => (ids.includes(r.personId) ? { ...r, status: next, orderState: cardOrderState(r.orientationDate, next, Date.now()) } : r)));
    setSelected(new Set());
    setBulkMsg(`Marked ${ids.length} ${ids.length === 1 ? "person" : "people"} ${CARD_STATUS_LABEL[next].toLowerCase()}.`);
    setTimeout(() => setBulkMsg(null), 2600);
    try {
      await fetch("/api/new-hires/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, patch: { businessCardStatus: next } }) });
    } catch {
      /* optimistic; a refresh will resync */
    }
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.key));
  const selectedRows = rows.filter((r) => selected.has(r.key));

  async function copyOne(row: BusinessCardRow) {
    if (await copyRich(formatCardText(row.card), formatCardHtml(row.card))) {
      setCopiedId(row.key);
      setTimeout(() => setCopiedId((c) => (c === row.key ? null : c)), 1600);
    }
  }

  async function copySelected() {
    const target = selectedRows.length ? selectedRows : rows;
    const cards = target.map((r) => r.card);
    const ok = await copyRich(formatCardsBatch(cards), formatCardsHtml(cards));
    setBulkMsg(ok ? `Copied ${target.length} card${target.length === 1 ? "" : "s"} — paste into your printer email.` : "Couldn't copy to the clipboard.");
    setTimeout(() => setBulkMsg(null), 2600);
  }

  // `attention` tabs glow amber when non-empty — they represent work still to do.
  const tabs: { key: View; label: string; count: number; attention?: boolean }[] = [
    { key: "all", label: "All staff", count: staffCount },
    { key: "new", label: "New hires", count: newHireCount },
    { key: "needs", label: "Needs cards", count: needsCount, attention: true },
    // Between "needs" and "ordered" on purpose: the tabs read left to right in the
    // order the work actually happens, and being on the next order sits there.
    { key: "queued", label: "On the next order", count: queuedCount },
    { key: "ordered", label: "Ordered", count: orderedCount },
    { key: "received", label: "Received", count: receivedCount },
    { key: "notNeeded", label: "Not needed", count: notNeededCount },
    { key: "missing", label: "Missing email", count: missingEmailCount, attention: true }
  ];

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">People</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-brand-lea dark:text-slate-100">
          <CreditCard className="h-6 w-6" /> Business cards
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
          Cards are built from each person&apos;s record and ordered in bulk ahead of orientation. Mark each one On the next order as it comes up, then Ordered and Received once the batch goes to the printer — or Not needed. Select the ones to order and copy them straight into your printer email.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={clsx(
                "rounded px-3 py-1.5 text-sm font-semibold transition",
                view === t.key ? "bg-brand-lea text-white" : "border border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400",
                t.attention && t.count > 0 && view !== t.key ? "border-amber-400 text-amber-700 dark:text-amber-300" : ""
              )}
            >
              {t.label} <span className="opacity-70">· {t.count}</span>
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey dark:text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, title, department"
              className="w-64 rounded border border-brand-lea/20 py-2 pl-8 pr-3 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            />
          </div>
        </div>
      </section>

      {/* Orientation deadline reminder */}
      {toOrder.length > 0 ? (
        <section className="rounded border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            <h2 className="text-sm font-bold text-amber-800 dark:text-amber-200">
              {toOrder.length} {toOrder.length === 1 ? "card" : "cards"} to order before orientation
            </h2>
            {view !== "needs" ? (
              <button onClick={() => setView("needs")} className="ml-auto text-xs font-semibold text-amber-800 underline dark:text-amber-200">
                Show needed
              </button>
            ) : null}
          </div>
          <ul className="mt-2 space-y-1">
            {toOrder.slice(0, 8).map((r) => (
              <li key={r.personId} className="flex flex-wrap items-center gap-x-2 text-xs text-amber-900 dark:text-amber-100">
                <Link href={`/people/${r.personId}`} className="font-semibold underline">
                  {r.card.name}
                </Link>
                <span className="text-amber-700 dark:text-amber-300/80">{r.card.title}</span>
                <span className="ml-auto font-medium">
                  {r.orderState.overdue ? (
                    <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3" /> Order now · orientation {fmtDay(r.orientationDate)}
                    </span>
                  ) : (
                    <>Order by {fmtDay(r.orderState.orderByISO)} · orientation {fmtDay(r.orientationDate)}</>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {toOrder.length > 8 ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">+ {toOrder.length - 8} more — see the “Needs cards” tab.</p> : null}
        </section>
      ) : null}

      {/* The next order — how full the batch is against the size she aims for.
          A TARGET, never a gate, and that is her wording (2026-09-11): "we can't
          really have any hard gates either way", because in an emergency the printer
          will run a single card, it just costs more. So nothing here blocks, a hire
          can finish onboarding with their card merely on this list, and the count is
          shown as progress toward a goal rather than a threshold to clear. */}
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Layers className="h-4 w-4 text-brand-eden dark:text-brand-sweet" />
          <h2 className="text-sm font-bold text-brand-lea dark:text-slate-100">The next order</h2>
          <p
            className={clsx(
              "text-sm",
              queuedCount >= minBatch && queuedCount > 0 ? "font-semibold text-brand-lea dark:text-slate-100" : "text-brand-grey dark:text-slate-400"
            )}
          >
            {describeBatch(queuedCount, minBatch)}
          </p>
          {queuedCount > 0 && view !== "queued" ? (
            <button onClick={() => setView("queued")} className="text-xs font-semibold text-brand-eden underline dark:text-brand-sweet">
              Show them
            </button>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label
              className="flex items-center gap-2 text-xs font-semibold text-brand-grey dark:text-slate-400"
              title="A target, not a limit. The printer will run a single card in a hurry — it just costs more."
            >
              Target names
              <input
                type="number"
                min={1}
                max={CARD_ORDER_MIN_BATCH_MAX}
                value={minDraft}
                onChange={(e) => setMinDraft(e.target.value)}
                className="w-16 rounded border border-brand-lea/20 px-2 py-1 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
              />
            </label>
            <button
              onClick={saveMinimum}
              disabled={savingMin || minDraft === String(minBatch)}
              className="rounded border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-50 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
            >
              {savingMin ? "Saving…" : "Save"}
            </button>
            {minMsg ? <span className="text-xs font-medium text-brand-grey dark:text-slate-400">{minMsg}</span> : null}
          </div>
        </div>

        {queuedTight.length > 0 ? (
          <div className="mt-3 border-t border-brand-lea/10 pt-2 dark:border-white/10">
            <p className="text-xs font-semibold text-brand-grey dark:text-slate-400">
              Running short on time — already past the usual order-by date, and still waiting on the batch:
            </p>
            <ul className="mt-1 space-y-1">
              {queuedTight.slice(0, 8).map((r) => (
                <li key={r.personId} className="flex flex-wrap items-center gap-x-2 text-xs text-brand-grey dark:text-slate-400">
                  <Link href={`/people/${r.personId}`} className="font-semibold text-brand-eden underline dark:text-brand-sweet">
                    {r.card.name}
                  </Link>
                  <span>{r.card.title}</span>
                  <span className="ml-auto inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Orientation {fmtDay(r.orientationDate)}
                  </span>
                </li>
              ))}
            </ul>
            {queuedTight.length > 8 ? <p className="mt-1 text-xs text-brand-grey dark:text-slate-500">+ {queuedTight.length - 8} more on the “On the next order” tab.</p> : null}
          </div>
        ) : null}
      </section>

      {/* Bulk order bar */}
      <div className="flex flex-wrap items-center gap-2 rounded bg-white px-3 py-2 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <label className="flex items-center gap-2 text-xs font-semibold text-brand-lea dark:text-slate-100">
          <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.key)))} className="h-4 w-4" />
          Select all ({rows.length})
        </label>
        <span className="text-xs text-brand-grey dark:text-slate-400">{selected.size} selected</span>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-l border-brand-lea/10 pl-2 dark:border-white/10">
            <span className="text-xs font-semibold text-brand-grey dark:text-slate-400">Mark:</span>
            {/* QUEUED leads: adding a batch of people to the next order is the
                action this page is for, and it was the one status you could only
                set one person at a time. */}
            {(["QUEUED", "RECEIVED", "NEEDED", "ORDERED", "NOT_NEEDED"] as CardStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => bulkSetStatus(s)}
                className="rounded border border-brand-lea/20 px-2 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
              >
                {CARD_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        ) : null}

        <button onClick={copySelected} className="ml-auto inline-flex items-center gap-1.5 rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:bg-brand-gold/90">
          <Copy className="h-3.5 w-3.5" /> {selected.size ? `Copy ${selected.size} for printer` : "Copy all for printer"}
        </button>
      </div>
      {bulkMsg ? <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">{bulkMsg}</div> : null}

      {/* Card gallery */}
      {rows.length === 0 ? (
        <div className="rounded border border-brand-lea/10 bg-white p-8 text-center text-sm text-brand-grey shadow-panel dark:border-white/10 dark:bg-brand-panel dark:text-slate-400">
          {view === "needs"
            ? "No one is marked as needing a card."
            : view === "queued"
              ? "Nothing on the next order yet. Mark people On the next order as their cards come up, and they wait here until the batch is worth placing."
              : view === "ordered"
                ? "No cards are marked ordered."
                : view === "received"
                  ? "No cards are marked received."
                  : view === "notNeeded"
                    ? "No one is marked not needed."
                    : view === "missing"
                      ? "No one is missing a company email."
                      : view === "new"
                        ? "No one is currently going through onboarding."
                        : "No matching staff."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const isSel = selected.has(r.key);
            return (
              <div key={r.key} className={clsx("rounded bg-white p-4 shadow-panel ring-1 transition dark:bg-brand-panel", isSel ? "ring-2 ring-brand-gold" : "ring-brand-lea/10 dark:ring-white/10")}>
                <div className="mb-2 flex items-center gap-2">
                  <input type="checkbox" checked={isSel} onChange={() => toggle(r.key)} aria-label={`Select ${r.card.name}`} className="h-4 w-4" />
                  {r.label ? <span className="rounded bg-brand-lea/10 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-lea dark:bg-white/10 dark:text-slate-200">{r.label}</span> : null}
                  {r.onboarding && !r.label ? <span className="rounded bg-brand-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-lea dark:text-brand-gold">New hire</span> : null}
                  <div className="ml-auto flex items-center gap-1">
                    <Link href={`/people/${r.personId}`} title="Open profile" className="rounded p-1.5 text-brand-grey transition hover:bg-brand-gold/15 hover:text-brand-eden dark:text-slate-400 dark:hover:bg-white/10">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    <button onClick={() => copyOne(r)} title="Copy this card" className="rounded p-1.5 text-brand-grey transition hover:bg-brand-gold/15 hover:text-brand-eden dark:text-slate-400 dark:hover:bg-white/10">
                      {copiedId === r.key ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <BusinessCardVisual card={r.card} />
                {/* Order status — shared across a person's cards */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand-lea/10 pt-2 dark:border-white/10">
                  <select value={r.status} onChange={(e) => setStatus(r.personId, e.target.value)} className={statusSelectClass(r.status)}>
                    {CARD_STATUSES.map((s) => (
                      <option key={s} value={s}>{CARD_STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  {r.orderState.needsAction ? (
                    <span className={clsx("inline-flex items-center gap-1 text-[11px] font-medium", r.orderState.overdue ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
                      {r.orderState.overdue ? <AlertTriangle className="h-3 w-3" /> : null}
                      {r.orderState.overdue ? "Order now" : `Order by ${fmtDay(r.orderState.orderByISO)}`}
                    </span>
                  ) : null}
                  {/* Queued and out of runway — said in gray, once, not in red. */}
                  {r.status === "QUEUED" && r.orderState.pastOrderBy && (r.orderState.daysUntilOrientation ?? -99) >= -3 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-grey dark:text-slate-400">
                      <Clock className="h-3 w-3" /> Orientation {fmtDay(r.orientationDate)}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
