"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { R } from "@/components/reports/report-ui";
import { formatCents, type StoreSummary } from "@/lib/party-store/shared";
import { RegisterTab } from "@/components/party-store/RegisterTab";
import { BalanceSheetTab } from "@/components/party-store/BalanceSheetTab";
import { InventoryTab } from "@/components/party-store/InventoryTab";
import { OrdersTab } from "@/components/party-store/OrdersTab";
import { StoreSettingsTab } from "@/components/party-store/StoreSettingsTab";

// The party store, one page: the check-in desk and register, the balance sheet,
// inventory, orders (incl. pre-orders to fill) and settings. Several people can
// run registers at once, so it re-reads the store every 10 seconds and after
// every action — the server is the only place a balance is decided.

export type StoreCall = (
  url: string,
  body?: unknown,
  method?: string
) => Promise<{ ok: boolean; message?: string; data?: Record<string, unknown> }>;

const TABS = [
  { key: "register", label: "Check-in & register" },
  { key: "balances", label: "Balance sheet" },
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
  { key: "settings", label: "Settings" }
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function PartyStoreWorkspace({ initial }: { initial: StoreSummary }) {
  const [summary, setSummary] = useState(initial);
  const [tab, setTab] = useState<TabKey>("register");
  const storeId = initial.store.id;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/events/store/${storeId}`, { cache: "no-store" });
    if (res.ok) setSummary((await res.json()) as StoreSummary);
  }, [storeId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const call: StoreCall = useCallback(
    async (url, body, method = "POST") => {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      await refresh();
      return { ok: res.ok, message: typeof data.message === "string" ? data.message : undefined, data };
    },
    [refresh]
  );

  const t = summary.totals;
  const pendingLabel = t.pendingPreorders ? ` (${t.pendingPreorders})` : "";

  return (
    <div className={R.page}>
      <Link href="/events/store" className="inline-flex text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">
        ← Party stores
      </Link>

      <section className={R.pageHeader}>
        <div className="min-w-0">
          <p className={R.eyebrow}>{summary.store.eventName ?? "Party store"}</p>
          <h1 className={R.pageTitle}>{summary.store.name}</h1>
          <p className={R.pageLede}>
            {formatCents(summary.store.startingCreditCents)} credit for each of {t.people} employees ·{" "}
            {summary.store.registerOpen ? "register open" : "register closed"} ·{" "}
            {summary.store.preordersOpen ? "pre-orders open" : "pre-orders closed"}
          </p>
        </div>
      </section>

      <div className={`${R.tiles.replace("mt-3 ", "")} grid-cols-2`}>
        {[
          ["Checked in", `${t.checkedIn} of ${t.people}`],
          ["Spent at the party", formatCents(t.spentAtPartyCents)],
          ["Pre-ordered", formatCents(t.preorderedCents)],
          ["Credit left", formatCents(t.leftCents)]
        ].map(([label, value]) => (
          <div key={label} className={`${R.tile} bg-white dark:bg-brand-panel`}>
            <p className={R.tileLabel}>{label}</p>
            <p className={R.tileValue}>{value}</p>
          </div>
        ))}
      </div>

      <div className={R.tabBar}>
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`${R.tab} ${tab === item.key ? R.segmentOn : R.segmentOff}`}
          >
            {item.label}
            {item.key === "orders" ? pendingLabel : ""}
          </button>
        ))}
      </div>

      {tab === "register" ? <RegisterTab summary={summary} call={call} /> : null}
      {tab === "balances" ? <BalanceSheetTab summary={summary} call={call} /> : null}
      {tab === "inventory" ? <InventoryTab summary={summary} call={call} /> : null}
      {tab === "orders" ? <OrdersTab summary={summary} call={call} /> : null}
      {tab === "settings" ? <StoreSettingsTab summary={summary} call={call} /> : null}
    </div>
  );
}
