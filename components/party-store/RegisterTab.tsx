"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui";
import { R } from "@/components/reports/report-ui";
import { CREDIT_STATUS_LABEL, formatCents, type StoreSummary } from "@/lib/party-store/shared";
import type { StoreCall } from "@/components/party-store/PartyStoreWorkspace";

const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" });

export function RegisterTab({ summary, call }: { summary: StoreSummary; call: StoreCall }) {
  const storeId = summary.store.id;
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [asPreorder, setAsPreorder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return summary.people
      .filter((p) => p.current && `${p.name} ${p.department ?? ""}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [query, summary.people]);

  const person = summary.people.find((p) => p.newHireId === personId) ?? null;
  const items = summary.items.filter((i) => i.active);
  const cartLines = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartTotal = cartLines.reduce((sum, [id, qty]) => sum + (items.find((i) => i.id === id)?.priceCents ?? 0) * qty, 0);
  const over = person ? cartTotal > person.balanceCents : false;

  function pick(id: string) {
    setPersonId(id);
    setCart({});
    setQuery("");
    setError(null);
    setNotice(null);
  }

  function bump(itemId: string, delta: number) {
    setError(null);
    setCart((cur) => {
      const item = items.find((i) => i.id === itemId);
      const next = Math.max(0, (cur[itemId] ?? 0) + delta);
      if (item && next > item.onHand) {
        setError(item.onHand > 0 ? `Only ${item.onHand} ${item.name} left.` : `${item.name} is sold out.`);
        return cur;
      }
      return { ...cur, [itemId]: next };
    });
  }

  async function checkIn(checkedIn: boolean) {
    if (!person) return;
    setBusy(true);
    const result = await call(`/api/events/store/${storeId}/checkin`, { newHireId: person.newHireId, checkedIn });
    setBusy(false);
    if (!result.ok) setError(result.message ?? "Could not check in.");
  }

  async function charge() {
    if (!person || !cartLines.length) return;
    setBusy(true);
    setError(null);
    const result = await call(`/api/events/store/${storeId}/orders`, {
      newHireId: person.newHireId,
      kind: asPreorder ? "PREORDER" : "SALE",
      lines: cartLines.map(([itemId, quantity]) => ({ itemId, quantity }))
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Could not charge that.");
      return;
    }
    const left = typeof result.data?.balanceCents === "number" ? result.data.balanceCents : null;
    setNotice(
      `${asPreorder ? "Pre-order placed" : "Charged"} ${formatCents(cartTotal)} to ${person.name}.` +
        (left !== null ? ` ${formatCents(left)} left.` : "")
    );
    setCart({});
    setAsPreorder(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      {/* Who */}
      <section className={R.panel}>
        <h2 className={R.title}>Who&apos;s here</h2>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-grey" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a name"
            autoFocus
            className="w-full rounded border border-brand-lea/20 bg-white py-3 pl-9 pr-3 text-base text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
          />
        </div>
        {query.trim() ? (
          <ul className="mt-2 divide-y divide-brand-lea/10 rounded border border-brand-lea/10 dark:divide-white/10 dark:border-white/10">
            {matches.length === 0 ? (
              <li className="px-3 py-3 text-sm text-brand-grey dark:text-slate-400">
                No current employee by that name. Contractors and guests don&apos;t have store credit.
              </li>
            ) : (
              matches.map((p) => (
                <li key={p.newHireId}>
                  <button
                    onClick={() => pick(p.newHireId)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-brand-cloudDancer/60 dark:hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{p.name}</span>
                      <span className="block truncate text-[11px] text-brand-grey dark:text-slate-400">{p.department ?? "No department"}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      <span className="block font-semibold text-brand-lea dark:text-slate-100">{formatCents(p.balanceCents)}</span>
                      <span className="block text-[11px] text-brand-grey dark:text-slate-400">
                        {p.checkedInAt ? "checked in" : "not here yet"}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}

        {person ? (
          <div className="mt-4 rounded border border-brand-lea/15 p-4 dark:border-white/10">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-lg font-semibold text-brand-lea dark:text-slate-100">{person.name}</p>
                <p className="text-xs text-brand-grey dark:text-slate-400">
                  {person.department ?? "No department"} · {CREDIT_STATUS_LABEL[person.status]}
                </p>
              </div>
              {person.checkedInAt ? (
                <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
                  <Check className="h-3.5 w-3.5" /> Checked in {TIME.format(new Date(person.checkedInAt))}
                </span>
              ) : (
                <Button onClick={() => checkIn(true)} disabled={busy}>
                  Check in
                </Button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                ["Starting", person.startingCents],
                ["Spent", person.saleCents + person.preorderCents],
                ["Left", person.balanceCents]
              ].map(([label, cents]) => (
                <div key={label as string} className={R.tile}>
                  <p className={R.tileLabel}>{label}</p>
                  <p className={R.tileValue}>{formatCents(cents as number)}</p>
                </div>
              ))}
            </div>
            {person.checkedInAt ? (
              <button
                onClick={() => checkIn(false)}
                className="mt-2 text-[11px] text-brand-grey underline-offset-2 hover:underline dark:text-slate-400"
              >
                Undo check-in
              </button>
            ) : null}
          </div>
        ) : (
          <p className={R.footnote}>Search for someone to check them in or ring them up.</p>
        )}
      </section>

      {/* What */}
      <section className={R.panel}>
        <div className={R.header}>
          <h2 className={R.title}>Register</h2>
          {!summary.store.registerOpen ? (
            <span className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
              Register closed (Settings)
            </span>
          ) : null}
        </div>
        {items.length === 0 ? (
          <p className={R.note}>No items yet. Add what you&apos;re selling on the Inventory tab.</p>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {items.map((item) => {
              const qty = cart[item.id] ?? 0;
              const soldOut = item.onHand <= 0;
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-2 rounded border p-3 ${
                    qty > 0
                      ? "border-brand-lea ring-1 ring-brand-gold dark:border-brand-gold"
                      : "border-brand-lea/15 dark:border-white/10"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{item.name}</p>
                    <p className="text-[11px] text-brand-grey dark:text-slate-400">
                      {formatCents(item.priceCents)} ·{" "}
                      {soldOut ? (
                        <span className="font-semibold text-red-600 dark:text-red-400">sold out</span>
                      ) : (
                        `${item.onHand} left`
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label={`One fewer ${item.name}`}
                      onClick={() => bump(item.id, -1)}
                      disabled={qty === 0}
                      className="flex h-9 w-9 items-center justify-center rounded border border-brand-lea/20 text-brand-lea transition hover:shadow-glow disabled:opacity-30 dark:border-white/15 dark:text-slate-100"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums text-brand-lea dark:text-slate-100">{qty}</span>
                    <button
                      aria-label={`One more ${item.name}`}
                      onClick={() => bump(item.id, 1)}
                      disabled={soldOut || !person}
                      className="flex h-9 w-9 items-center justify-center rounded border border-brand-lea/20 text-brand-lea transition hover:shadow-glow disabled:opacity-30 dark:border-white/15 dark:text-slate-100"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 border-t border-brand-lea/10 pt-3 dark:border-white/10">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-brand-grey dark:text-slate-400">
              {person ? (
                <>
                  Total <span className="text-xl font-semibold text-brand-lea dark:text-slate-100">{formatCents(cartTotal)}</span> of{" "}
                  {formatCents(person.balanceCents)} left
                </>
              ) : (
                "Pick who you're ringing up first."
              )}
            </p>
            <label className="flex items-center gap-2 text-xs text-brand-grey dark:text-slate-400">
              <input
                type="checkbox"
                checked={asPreorder}
                onChange={(e) => setAsPreorder(e.target.checked)}
                className="h-4 w-4 accent-brand-gold"
              />
              Pre-order (hand it over later)
            </label>
          </div>
          {over ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">That&apos;s more than {person?.name} has left.</p> : null}
          {error ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          {notice ? <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCart({})} disabled={!cartLines.length || busy}>
              Clear
            </Button>
            <Button
              onClick={charge}
              disabled={!person || !cartLines.length || over || busy || (!asPreorder && !summary.store.registerOpen)}
            >
              {busy ? "Charging…" : asPreorder ? "Place pre-order" : "Charge to balance"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
