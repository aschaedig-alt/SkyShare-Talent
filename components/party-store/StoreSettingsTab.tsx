"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { R } from "@/components/reports/report-ui";
import { formatCents, type StoreSummary } from "@/lib/party-store/shared";
import type { StoreCall } from "@/components/party-store/PartyStoreWorkspace";

export function StoreSettingsTab({ summary, call }: { summary: StoreSummary; call: StoreCall }) {
  const s = summary.store;
  const [name, setName] = useState(s.name);
  const [credit, setCredit] = useState((s.startingCreditCents / 100).toString());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    const result = await call(`/api/events/store/${s.id}`, body, "PATCH");
    setBusy(false);
    setMessage(result.ok ? done : result.message ?? "That did not save.");
  }

  const toggle = (label: string, hint: string, on: boolean, key: "registerOpen" | "preordersOpen") => (
    <label className="flex items-start gap-3 rounded border border-brand-lea/10 p-3 dark:border-white/10">
      <input
        type="checkbox"
        checked={on}
        disabled={busy}
        onChange={(e) => save({ [key]: e.target.checked }, `${label} ${e.target.checked ? "on" : "off"}.`)}
        className="mt-0.5 h-4 w-4 accent-brand-gold"
      />
      <span>
        <span className="block text-sm font-semibold text-brand-lea dark:text-slate-100">{label}</span>
        <span className="block text-xs text-brand-grey dark:text-slate-400">{hint}</span>
      </span>
    </label>
  );

  return (
    <section className={R.panel}>
      <h2 className={R.title}>Settings</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="block">
            <span className={R.sectionLabel}>Store name</span>
            <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className={R.sectionLabel}>Starting credit per employee ($)</span>
            <Input className="mt-1" inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value)} />
            <span className="mt-1 block text-[11px] text-brand-grey dark:text-slate-400">
              Now {formatCents(s.startingCreditCents)}. A change only reaches people who haven&apos;t been checked in, rung up
              or sent a link yet — anyone already started keeps what they began with.
            </span>
          </label>
          <Button onClick={() => save({ name, startingCredit: credit }, "Saved.")} disabled={busy}>
            Save
          </Button>
        </div>
        <div className="space-y-3">
          {toggle("Register open", "Sales at the party. Turn off when the store closes for the night.", s.registerOpen, "registerOpen")}
          {toggle(
            "Pre-orders open",
            "Employees can spend leftover credit from their personal link. No expiry today.",
            s.preordersOpen,
            "preordersOpen"
          )}
        </div>
      </div>
      {message ? <p className={R.note}>{message}</p> : null}
    </section>
  );
}
