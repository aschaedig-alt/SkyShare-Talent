"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { R } from "@/components/reports/report-ui";
import { formatCents, type StoreItemView, type StoreSummary } from "@/lib/party-store/shared";
import type { StoreCall } from "@/components/party-store/PartyStoreWorkspace";

// What the store has. The count you type is the STARTING count — what came in
// the boxes. Sold and held are worked out from the orders; on hand is what is left.

function ItemRow({ item, call }: { item: StoreItemView; call: StoreCall }) {
  const [error, setError] = useState<string | null>(null);

  async function save(body: Record<string, unknown>) {
    setError(null);
    const result = await call(`/api/events/store/items/${item.id}`, body, "PATCH");
    if (!result.ok) setError(result.message ?? "That change did not save.");
  }

  async function remove() {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    const result = await call(`/api/events/store/items/${item.id}`, undefined, "DELETE");
    if (!result.ok) setError(result.message ?? "Could not delete it.");
  }

  const committed = item.sold + item.held;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          key={`n-${item.name}`}
          defaultValue={item.name}
          className="min-w-0 flex-1 basis-48"
          aria-label="Item name"
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== item.name && save({ name: e.target.value })}
        />
        <label className="flex items-center gap-1 text-xs text-brand-grey dark:text-slate-400">
          $
          <Input
            key={`p-${item.priceCents}`}
            defaultValue={(item.priceCents / 100).toString()}
            inputMode="decimal"
            className="w-20"
            aria-label="Price"
            onBlur={(e) => e.target.value !== (item.priceCents / 100).toString() && save({ price: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-brand-grey dark:text-slate-400">
          Started with
          <Input
            key={`q-${item.startingQty}`}
            defaultValue={String(item.startingQty)}
            inputMode="numeric"
            className="w-20"
            aria-label="Starting count"
            onBlur={(e) => e.target.value !== String(item.startingQty) && save({ quantity: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-grey dark:text-slate-400">
        <span>Sold {item.sold}</span>
        <span>Held for pre-orders {item.held}</span>
        <span className={item.onHand <= 5 ? "font-semibold text-red-600 dark:text-red-400" : "font-semibold text-brand-lea dark:text-slate-100"}>
          On hand {item.onHand}
        </span>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={item.active}
            onChange={(e) => save({ active: e.target.checked })}
            className="h-3.5 w-3.5 accent-brand-gold"
          />
          For sale
        </label>
        {committed === 0 ? (
          <button onClick={remove} className="text-red-600 hover:underline dark:text-red-400">
            Delete
          </button>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </li>
  );
}

export function InventoryTab({ summary, call }: { summary: StoreSummary; call: StoreCall }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const result = await call(`/api/events/store/${summary.store.id}/items`, { name, price, quantity: qty });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Could not add it.");
      return;
    }
    setName("");
    setPrice("");
    setQty("");
  }

  const value = summary.items.reduce((sum, i) => sum + i.priceCents * Math.max(0, i.onHand), 0);

  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div>
          <h2 className={R.title}>Inventory</h2>
          <p className={R.lede}>
            Type how many you started with. Sold, held for pre-orders and on hand update from the orders. A size is its own
            item (&ldquo;Quarter-zip, L&rdquo;).
          </p>
        </div>
        <div className={R.controls}>
          <a href={`/api/events/store/${summary.store.id}/export?kind=inventory`} className={R.smallButton}>
            <Download className="h-3 w-3" /> Inventory CSV
          </a>
        </div>
      </div>

      {summary.items.length ? (
        <p className={R.note}>
          <span className={R.strong}>{summary.items.reduce((s, i) => s + Math.max(0, i.onHand), 0)}</span> items on hand, worth{" "}
          <span className={R.strong}>{formatCents(value)}</span> at store prices.
        </p>
      ) : null}

      <ul className="mt-2 divide-y divide-brand-lea/10 dark:divide-white/10">
        {summary.items.map((item) => (
          <ItemRow key={item.id} item={item} call={call} />
        ))}
      </ul>

      <div className="mt-4 border-t border-brand-lea/10 pt-3 dark:border-white/10">
        <p className={R.sectionLabel}>Add an item</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="SkyShare beanie" className="min-w-0 flex-1 basis-48" />
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price, e.g. 15" inputMode="decimal" className="w-32" />
          <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="How many" inputMode="numeric" className="w-28" />
          <Button onClick={add} disabled={busy || !name.trim() || !price.trim() || !qty.trim()}>
            Add
          </Button>
        </div>
        {error ? <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
    </section>
  );
}
