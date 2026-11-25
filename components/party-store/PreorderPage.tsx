"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { formatCents } from "@/lib/party-store/shared";
import type { getLinkView } from "@/lib/party-store/server";

type LinkView = NonNullable<Awaited<ReturnType<typeof getLinkView>>>;

// The employee's own page: what credit is left, what's in stock, place a
// pre-order, cancel one HR hasn't filled yet. Phone first.

const BUTTON =
  "w-full rounded bg-brand-lea px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-eden disabled:opacity-40 dark:bg-brand-eden";
const STEP =
  "flex h-10 w-10 items-center justify-center rounded border border-brand-lea/20 text-brand-lea transition hover:shadow-glow disabled:opacity-30 dark:border-white/15 dark:text-slate-100";

const STATUS_LABEL: Record<string, string> = {
  COMPLETE: "Bought at the party",
  PENDING: "Pre-ordered · HR will get it to you",
  FULFILLED: "Picked up",
  CANCELED: "Canceled · credit returned"
};

export function PreorderPage({ token, initial }: { token: string; initial: LinkView }) {
  const [view, setView] = useState(initial);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const total = view.items.reduce((sum, i) => sum + i.priceCents * (cart[i.id] ?? 0), 0);
  const over = total > view.balanceCents;
  const api = `/api/store/${encodeURIComponent(token)}`;

  async function reload() {
    const res = await fetch(api, { cache: "no-store" });
    if (res.ok) setView((await res.json()) as LinkView);
  }

  function bump(id: string, delta: number, onHand: number) {
    setError(null);
    setCart((cur) => {
      const next = Math.max(0, Math.min(onHand, (cur[id] ?? 0) + delta));
      return { ...cur, [id]: next };
    });
  }

  async function order() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const lines = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity }));
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines })
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.message ?? "That didn't go through. Try again.");
      await reload();
      return;
    }
    setCart({});
    setNotice("Pre-order placed. HR will let you know when it's ready to pick up.");
    await reload();
  }

  async function cancel(orderId: string) {
    if (!window.confirm("Cancel this pre-order? The credit comes back to you.")) return;
    setError(null);
    const res = await fetch(`${api}?order=${encodeURIComponent(orderId)}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) setError(data.message ?? "Couldn't cancel it.");
    await reload();
  }

  const inCart = Object.values(cart).some((q) => q > 0);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">{view.storeName}</p>
      <h1 className="mt-1 text-2xl font-semibold text-brand-lea dark:text-slate-100">Hi {view.firstName}</h1>

      <div className="mt-4 rounded bg-brand-lea p-4 text-white">
        <p className="text-sm text-white/75">Store credit left</p>
        <p className="text-4xl font-bold text-brand-gold">{formatCents(view.balanceCents)}</p>
        <p className="mt-1 text-xs text-white/70">Of the {formatCents(view.startingCents)} you started with. It doesn&apos;t expire.</p>
      </div>

      {notice ? (
        <p className="mt-4 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
          {notice}
        </p>
      ) : null}

      {view.balanceCents > 0 ? (
        view.preordersOpen ? (
          <section className="mt-6">
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Pick what you&apos;d like</h2>
            <ul className="mt-2 space-y-2">
              {view.items.map((item) => {
                const qty = cart[item.id] ?? 0;
                const soldOut = item.onHand <= 0;
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded border border-brand-lea/15 bg-white p-3 dark:border-white/10 dark:bg-brand-panel"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">{item.name}</p>
                      <p className="text-xs text-brand-grey dark:text-slate-400">
                        {formatCents(item.priceCents)} · {soldOut ? "sold out" : `${item.onHand} available`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button className={STEP} aria-label={`One fewer ${item.name}`} disabled={qty === 0} onClick={() => bump(item.id, -1, item.onHand)}>
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center font-semibold tabular-nums text-brand-lea dark:text-slate-100">{qty}</span>
                      <button
                        className={STEP}
                        aria-label={`One more ${item.name}`}
                        disabled={soldOut || qty >= item.onHand}
                        onClick={() => bump(item.id, 1, item.onHand)}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex items-baseline justify-between text-sm">
              <span className="text-brand-grey dark:text-slate-400">Order total</span>
              <span className="text-lg font-semibold text-brand-lea dark:text-slate-100">{formatCents(total)}</span>
            </div>
            {over ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">That&apos;s more than your credit left.</p> : null}
            {error ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
            <button className={`${BUTTON} mt-3`} disabled={!inCart || over || busy} onClick={order}>
              {busy ? "Placing…" : "Place pre-order"}
            </button>
          </section>
        ) : (
          <p className="mt-6 rounded border border-brand-lea/15 p-3 text-sm text-brand-grey dark:border-white/10 dark:text-slate-400">
            Pre-orders are paused right now. Your credit is safe; check back later.
          </p>
        )
      ) : (
        <p className="mt-6 text-sm text-brand-grey dark:text-slate-400">You&apos;ve used all your credit. Enjoy!</p>
      )}

      {view.orders.length ? (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Your orders</h2>
          <ul className="mt-2 divide-y divide-brand-lea/10 dark:divide-white/10">
            {view.orders.map((o) => (
              <li key={o.id} className="py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm text-brand-lea dark:text-slate-100">{o.lines.map((l) => `${l.quantity} × ${l.itemName}`).join(", ")}</p>
                  <p className="shrink-0 text-sm font-semibold text-brand-lea dark:text-slate-100">{formatCents(o.totalCents)}</p>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="text-xs text-brand-grey dark:text-slate-400">{STATUS_LABEL[o.status] ?? o.status}</p>
                  {o.kind === "PREORDER" && o.status === "PENDING" ? (
                    <button onClick={() => cancel(o.id)} className="text-xs text-red-600 hover:underline dark:text-red-400">
                      Cancel
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-10 text-center text-[11px] text-brand-grey dark:text-slate-500">
        This link is just for you. Questions? Ask HR.
      </p>
    </main>
  );
}
