"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { R } from "@/components/reports/report-ui";
import { formatCents, type StoreOrderView, type StoreSummary } from "@/lib/party-store/shared";
import type { StoreCall } from "@/components/party-store/PartyStoreWorkspace";

const WHEN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const STATUS: Record<string, { label: string; tone: string }> = {
  COMPLETE: { label: "Sold", tone: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200" },
  PENDING: { label: "To fill", tone: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200" },
  FULFILLED: { label: "Picked up", tone: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200" },
  CANCELED: { label: "Refunded", tone: "border-brand-lea/15 text-brand-grey dark:border-white/10 dark:text-slate-400" }
};

const FILTERS = [
  { key: "PENDING", label: "Pre-orders to fill" },
  { key: "PREORDER", label: "All pre-orders" },
  { key: "SALE", label: "Party sales" },
  { key: "ALL", label: "Everything" }
] as const;

export function OrdersTab({ summary, call }: { summary: StoreSummary; call: StoreCall }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>(summary.totals.pendingPreorders ? "PENDING" : "ALL");
  const [error, setError] = useState<string | null>(null);

  const rows = summary.orders.filter((o) => {
    if (filter === "PENDING") return o.kind === "PREORDER" && o.status === "PENDING";
    if (filter === "PREORDER") return o.kind === "PREORDER";
    if (filter === "SALE") return o.kind === "SALE";
    return true;
  });

  async function act(o: StoreOrderView, action: "cancel" | "fulfill" | "unfulfill") {
    if (
      action === "cancel" &&
      !window.confirm(`Refund ${formatCents(o.totalCents)} to ${o.personName}? The items go back into stock. The order is kept, marked refunded.`)
    )
      return;
    setError(null);
    const result = await call(`/api/events/store/orders/${o.id}`, { action }, "PATCH");
    if (!result.ok) setError(result.message ?? "That did not save.");
  }

  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div>
          <h2 className={R.title}>Orders</h2>
          <p className={R.lede}>
            Every sale and pre-order. Mark a pre-order picked up when it&apos;s handed over. A refund gives back the credit
            and puts the items back in stock.
          </p>
        </div>
        <div className={R.controls}>
          <a href={`/api/events/store/${summary.store.id}/export?kind=orders`} className={R.smallButton}>
            <Download className="h-3 w-3" /> Orders CSV
          </a>
        </div>
      </div>

      <div className={`${R.segmentGroup} mt-3 flex-wrap`}>
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`${R.segment} ${filter === f.key ? R.segmentOn : R.segmentOff}`}>
            {f.label}
          </button>
        ))}
      </div>

      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <ul className="mt-3 divide-y divide-brand-lea/10 dark:divide-white/10">
        {rows.length === 0 ? (
          <li className="py-4 text-center text-sm text-brand-grey dark:text-slate-400">Nothing here.</li>
        ) : (
          rows.map((o) => {
            const status = STATUS[o.status] ?? STATUS.COMPLETE;
            return (
              <li key={o.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                    {o.personName}{" "}
                    <span className="font-normal text-brand-grey dark:text-slate-400">
                      · {o.kind === "SALE" ? "party sale" : "pre-order"} · {WHEN.format(new Date(o.createdAt))}
                    </span>
                  </p>
                  <p className="text-xs text-brand-grey dark:text-slate-400">
                    {o.lines.map((l) => `${l.quantity} × ${l.itemName}`).join(", ")}
                    {o.createdBy ? ` · by ${o.createdBy}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{formatCents(o.totalCents)}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
                  {o.kind === "PREORDER" && o.status === "PENDING" ? (
                    <button onClick={() => act(o, "fulfill")} className={R.smallButton}>
                      Mark picked up
                    </button>
                  ) : null}
                  {o.kind === "PREORDER" && o.status === "FULFILLED" ? (
                    <button onClick={() => act(o, "unfulfill")} className={R.smallButton}>
                      Undo pick-up
                    </button>
                  ) : null}
                  {o.status !== "CANCELED" ? (
                    <button onClick={() => act(o, "cancel")} className="text-[11px] text-red-600 hover:underline dark:text-red-400">
                      Refund
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
