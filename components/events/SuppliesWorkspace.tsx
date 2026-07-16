"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ExternalLink, Package } from "lucide-react";
import { Badge, Button, EmptyState, Input, Modal } from "@/components/ui";
import { SUPPLY_CATEGORIES, supplyCategoryLabel } from "@/lib/events/constants";
import type { SupplyItemView } from "@/lib/data/events";

const FIELD =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400";
const NUM =
  "w-20 rounded border border-brand-lea/15 bg-white px-1.5 py-1 text-xs text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

async function send(url: string, body: unknown, method = "PATCH") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.ok;
}

function stateBadge(item: SupplyItemView) {
  if (!item.active) return <Badge tone="neutral">Retired</Badge>;
  if (item.state === "OUT") return <Badge tone="danger">Order now</Badge>;
  if (item.state === "LOW") return <Badge tone="warning">Order soon</Badge>;
  return <Badge tone="success">OK</Badge>;
}

export function SuppliesWorkspace({ items }: { items: SupplyItemView[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("SWAG");
  const [unit, setUnit] = useState("each");
  const [onHand, setOnHand] = useState("0");
  const [threshold, setThreshold] = useState("0");
  const [vendor, setVendor] = useState("");
  const [reorderUrl, setReorderUrl] = useState("");

  const visible = useMemo(() => items.filter((i) => (showRetired ? true : i.active)), [items, showRetired]);
  const needsOrder = useMemo(() => items.filter((i) => i.active && i.state !== "OK"), [items]);
  const retiredCount = items.length - items.filter((i) => i.active).length;

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/events/supply-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          unit,
          onHand: Number.parseInt(onHand, 10) || 0,
          reorderThreshold: Number.parseInt(threshold, 10) || 0,
          vendor,
          reorderUrl
        })
      });
      const payload = (await res.json()) as { id?: string; message?: string };
      if (!res.ok) throw new Error(payload?.message ?? "Unable to add that supply.");
      setAdding(false);
      setName("");
      setVendor("");
      setReorderUrl("");
      setOnHand("0");
      setThreshold("0");
      setSaving(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add that supply.");
      setSaving(false);
    }
  }

  async function patch(item: SupplyItemView, body: Record<string, unknown>) {
    await send(`/api/events/supply-items/${item.id}`, body);
    router.refresh();
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Events &amp; Outreach</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Supplies</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
            The stock room. Committed is what upcoming events have claimed but not yet packed, so projected is what is
            really free — that is what the reorder flag watches.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/events" className="text-xs font-semibold text-brand-eden hover:underline dark:text-brand-sweet">
            ← Events
          </Link>
          <Button onClick={() => setAdding(true)}>+ New supply</Button>
        </div>
      </section>

      {needsOrder.length > 0 ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/15">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {needsOrder.length} {needsOrder.length === 1 ? "item needs" : "items need"} reordering
          </p>
          <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-300/80">
            {needsOrder.map((i) => `${i.name} (${i.projected} left)`).join(" · ")}
          </p>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title="The stock room is empty"
          description="Add the swag, print, and booth kit you take to events, with a reorder threshold for each."
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              + New supply
            </Button>
          }
        />
      ) : (
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                  <th className="py-2 pr-2">Item</th>
                  <th className="px-1 py-2">Category</th>
                  <th className="px-1 py-2 text-right">On hand</th>
                  <th className="px-1 py-2 text-right">Committed</th>
                  <th className="px-1 py-2 text-right">Projected</th>
                  <th className="px-1 py-2 text-right">Reorder at</th>
                  <th className="px-1 py-2">State</th>
                  <th className="px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <Fragment key={item.id}>
                    <tr
                      className={clsx(
                        "border-t border-brand-lea/10 dark:border-white/10",
                        !item.active && "opacity-60"
                      )}
                    >
                      <td className="py-2 pr-2">
                        <p className="font-semibold text-brand-lea dark:text-slate-100">{item.name}</p>
                        <p className="text-[11px] text-brand-grey dark:text-slate-400">
                          per {item.unit}
                          {item.vendor ? ` · ${item.vendor}` : ""}
                        </p>
                      </td>
                      <td className="px-1 py-2 text-brand-grey dark:text-slate-400">
                        {supplyCategoryLabel(item.category)}
                      </td>
                      <td className="px-1 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          defaultValue={item.onHand}
                          onBlur={(e) => {
                            const v = Math.max(0, Number.parseInt(e.target.value, 10) || 0);
                            if (v !== item.onHand) patch(item, { onHand: v });
                          }}
                          className={NUM}
                        />
                      </td>
                      <td className="px-1 py-2 text-right text-brand-grey dark:text-slate-400">
                        {item.committed > 0 ? (
                          <button
                            className="font-semibold text-brand-eden hover:underline dark:text-brand-sweet"
                            onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                          >
                            {item.committed}
                          </button>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td
                        className={clsx(
                          "px-1 py-2 text-right font-semibold",
                          item.state === "OUT"
                            ? "text-red-700 dark:text-red-300"
                            : item.state === "LOW"
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-brand-lea dark:text-slate-100"
                        )}
                      >
                        {item.projected}
                      </td>
                      <td className="px-1 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          defaultValue={item.reorderThreshold}
                          onBlur={(e) => {
                            const v = Math.max(0, Number.parseInt(e.target.value, 10) || 0);
                            if (v !== item.reorderThreshold) patch(item, { reorderThreshold: v });
                          }}
                          className={NUM}
                        />
                      </td>
                      <td className="px-1 py-2">{stateBadge(item)}</td>
                      <td className="px-1 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {item.reorderUrl ? (
                            <a
                              href={item.reorderUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-eden hover:underline dark:text-brand-sweet"
                            >
                              Order <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                          <button
                            className="text-[11px] text-brand-grey hover:underline dark:text-slate-400"
                            onClick={() => patch(item, { active: !item.active })}
                          >
                            {item.active ? "Retire" : "Restore"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded === item.id && item.claims.length > 0 ? (
                      <tr className="bg-brand-cloudDancer/40 dark:bg-white/5">
                        <td colSpan={8} className="px-2 py-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                            Claimed by
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {item.claims.map((c) => (
                              <li key={c.eventId} className="text-[11px]">
                                <Link
                                  href={`/events/${c.eventId}`}
                                  className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100"
                                >
                                  {c.eventName}
                                </Link>
                                <span className="text-brand-grey dark:text-slate-400">
                                  {" "}
                                  — {c.quantity} {item.unit}, {new Date(c.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {retiredCount > 0 ? (
            <button
              className="mt-3 text-[11px] font-semibold text-brand-grey hover:underline dark:text-slate-400"
              onClick={() => setShowRetired((v) => !v)}
            >
              {showRetired ? "Hide" : "Show"} {retiredCount} retired
            </button>
          ) : null}
        </section>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} busy={saving} maxWidth="max-w-lg">
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">New supply</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Reorder at is the projected count that trips the flag. Leave it 0 to only hear about it when it runs out.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={LABEL}>Name</span>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Branded hats" />
          </label>
          <label className="block">
            <span className={LABEL}>Category</span>
            <select className={`mt-1 ${FIELD}`} value={category} onChange={(e) => setCategory(e.target.value)}>
              {SUPPLY_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Unit</span>
            <Input className="mt-1" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="each" />
          </label>
          <label className="block">
            <span className={LABEL}>On hand</span>
            <Input className="mt-1" type="number" min={0} value={onHand} onChange={(e) => setOnHand(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>Reorder at</span>
            <Input className="mt-1" type="number" min={0} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>Vendor</span>
            <Input className="mt-1" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>Reorder link</span>
            <Input className="mt-1" value={reorderUrl} onChange={(e) => setReorderUrl(e.target.value)} placeholder="https://" />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAdding(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={create} disabled={saving || !name.trim()}>
            {saving ? "Adding…" : "Add supply"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
