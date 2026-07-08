"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Search, Copy, Check, AlertTriangle, CreditCard, ExternalLink } from "lucide-react";
import type { BusinessCardRow } from "@/lib/data/business-cards";
import { formatCardText, formatCardsBatch, type BusinessCard } from "@/lib/business-cards/card";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// A brand-styled preview that mirrors the printed card's contact layout.
function CardPreview({ card }: { card: BusinessCard }) {
  return (
    <div className="rounded bg-brand-lea px-4 py-3.5 text-white">
      <div className="text-base font-semibold leading-tight">{card.name || "—"}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-gold">{card.title || "—"}</div>
      <div className="mt-3 space-y-0.5 text-[11px] leading-relaxed text-white/85">
        <div>
          <span className="text-white/55">skyops</span> {card.skyops} &nbsp;·&nbsp; <span className="text-white/55">mobile</span> {card.mobile || "—"}
        </div>
        <div>
          <span className="text-white/55">email</span> {card.email || "—"} &nbsp;·&nbsp; <span className="text-white/55">web</span> {card.web}
        </div>
      </div>
    </div>
  );
}

export function BusinessCardsWorkspace({ cards }: { cards: BusinessCardRow[] }) {
  const [q, setQ] = useState("");
  const [newOnly, setNewOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cards.filter((r) => {
      if (newOnly && !r.onboarding) return false;
      if (!needle) return true;
      return [r.card.name, r.card.title, r.department].filter(Boolean).some((v) => v!.toLowerCase().includes(needle));
    });
  }, [cards, q, newOnly]);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedRows = rows.filter((r) => selected.has(r.id));

  async function copyOne(row: BusinessCardRow) {
    if (await copy(formatCardText(row.card))) {
      setCopiedId(row.id);
      setTimeout(() => setCopiedId((c) => (c === row.id ? null : c)), 1600);
    }
  }

  async function copySelected() {
    const target = selectedRows.length ? selectedRows : rows;
    const ok = await copy(formatCardsBatch(target.map((r) => r.card)));
    setBulkMsg(ok ? `Copied ${target.length} card${target.length === 1 ? "" : "s"} — paste into your printer email.` : "Couldn't copy to the clipboard.");
    setTimeout(() => setBulkMsg(null), 2600);
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">People</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-brand-lea dark:text-slate-100">
          <CreditCard className="h-6 w-6" /> Business cards
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
          Every card built from the person&apos;s record, in your printer&apos;s format — pilots &amp; cabin attendants get the SkyOps line, everyone else gets SkyLove. Select the ones to order and copy them straight into your email to the printer.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setNewOnly(false)}
            className={clsx("rounded px-3 py-1.5 text-sm font-semibold transition", !newOnly ? "bg-brand-lea text-white" : "border border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400")}
          >
            All staff <span className="opacity-70">· {cards.length}</span>
          </button>
          <button
            onClick={() => setNewOnly(true)}
            className={clsx("rounded px-3 py-1.5 text-sm font-semibold transition", newOnly ? "bg-brand-lea text-white" : "border border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400")}
          >
            New hires <span className="opacity-70">· {cards.filter((c) => c.onboarding).length}</span>
          </button>
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

      {/* Bulk order bar */}
      <div className="flex flex-wrap items-center gap-2 rounded bg-white px-3 py-2 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <label className="flex items-center gap-2 text-xs font-semibold text-brand-lea dark:text-slate-100">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
            className="h-4 w-4"
          />
          Select all ({rows.length})
        </label>
        <span className="text-xs text-brand-grey dark:text-slate-400">{selected.size} selected</span>
        <button
          onClick={copySelected}
          className="ml-auto inline-flex items-center gap-1.5 rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:bg-brand-gold/90 dark:text-slate-100"
        >
          <Copy className="h-3.5 w-3.5" /> {selected.size ? `Copy ${selected.size} for printer` : "Copy all for printer"}
        </button>
      </div>
      {bulkMsg ? <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">{bulkMsg}</div> : null}

      {/* Card gallery */}
      {rows.length === 0 ? (
        <div className="rounded border border-brand-lea/10 bg-white p-8 text-center text-sm text-brand-grey shadow-panel dark:border-white/10 dark:bg-brand-panel dark:text-slate-400">
          No matching staff.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const isSel = selected.has(r.id);
            return (
              <div
                key={r.id}
                className={clsx(
                  "overflow-hidden rounded shadow-panel ring-1 transition",
                  isSel ? "ring-2 ring-brand-gold" : "ring-brand-lea/10 dark:ring-white/10"
                )}
              >
                <div className="relative">
                  <CardPreview card={r.card} />
                  <label className="absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-white/95 shadow">
                    <input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} aria-label={`Select ${r.card.name}`} className="h-4 w-4" />
                  </label>
                </div>
                <div className="flex items-center gap-2 bg-white px-3 py-2 dark:bg-brand-panel">
                  {r.onboarding ? <span className="rounded-full bg-brand-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-lea dark:text-brand-gold">New hire</span> : null}
                  {r.card.missing.length ? (
                    <span title={`Missing ${r.card.missing.join(", ")}`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      <AlertTriangle className="h-3 w-3" /> No {r.card.missing.join(" / ")}
                    </span>
                  ) : null}
                  <div className="ml-auto flex items-center gap-1">
                    <Link href={`/people/${r.id}`} title="Open profile" className="rounded p-1.5 text-brand-grey transition hover:bg-brand-gold/15 hover:text-brand-eden dark:text-slate-400 dark:hover:bg-white/10">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                    <button onClick={() => copyOne(r)} title="Copy this card" className="rounded p-1.5 text-brand-grey transition hover:bg-brand-gold/15 hover:text-brand-eden dark:text-slate-400 dark:hover:bg-white/10">
                      {copiedId === r.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
