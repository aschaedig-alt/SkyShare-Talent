"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";

const LABEL = "text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400";
const SELECT =
  "mt-1 w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

/**
 * fixedEventId: opened from an event's Party store tab (Nov 25 2026). The store
 * belongs to that event, so there is no event picker, and the tab simply reloads
 * to show the new store rather than going to the old stores page.
 */
export function NewStoreForm({ events, fixedEventId }: { events: { id: string; name: string }[]; fixedEventId?: string }) {
  const router = useRouter();
  const christmas = events.find((e) => /christmas|holiday/i.test(e.name));
  const [name, setName] = useState("Christmas party store");
  const [eventId, setEventId] = useState(fixedEventId ?? christmas?.id ?? "");
  const [credit, setCredit] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/events/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, eventId, startingCredit: credit })
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    setBusy(false);
    if (!res.ok || !data.id) {
      setError(data.message ?? "Could not open the store.");
      return;
    }
    if (fixedEventId) router.refresh();
    else router.push(`/events/store/${data.id}`);
  }

  return (
    <div className={`mt-3 grid gap-3 sm:items-end ${fixedEventId ? "sm:grid-cols-[1fr_8rem_auto]" : "sm:grid-cols-[1fr_1fr_8rem_auto]"}`}>
      <label className="block">
        <span className={LABEL}>Name</span>
        <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={fixedEventId ? "hidden" : "block"}>
        <span className={LABEL}>Event</span>
        <select className={SELECT} value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">No event</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={LABEL}>Credit each ($)</span>
        <Input className="mt-1" inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value)} />
      </label>
      <Button onClick={create} disabled={busy || !name.trim()}>
        {busy ? "Opening…" : "Open store"}
      </Button>
      {error ? <p className="text-sm text-red-600 sm:col-span-4 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
