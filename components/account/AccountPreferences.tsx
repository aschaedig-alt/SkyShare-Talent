"use client";

import { useMemo, useState } from "react";
import { Home, Check } from "lucide-react";
import type { HomeChoice } from "@/lib/data/user-home";

export function AccountPreferences({
  email,
  choices,
  current,
  defaultHome
}: {
  email: string | null;
  choices: HomeChoice[];
  current: string;
  defaultHome: string;
}) {
  const [value, setValue] = useState(current || defaultHome);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Group the pages the way the sidebar does, for a scannable dropdown.
  const grouped = useMemo(() => {
    const map = new Map<string, HomeChoice[]>();
    for (const c of choices) {
      const list = map.get(c.group) ?? [];
      list.push(c);
      map.set(c.group, list);
    }
    return [...map.entries()];
  }, [choices]);

  const dirty = (value || defaultHome) !== (current || defaultHome);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/user-home", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ href: value })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setMsg({ ok: true, text: value === defaultHome ? "Reset to Command Center." : "Saved — this is your home page now." });
      } else {
        setMsg({ ok: false, text: data.error ?? "Couldn't save." });
      }
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Account</p>
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">My preferences</h1>
        {email ? <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">Signed in as {email}</p> : null}
      </section>

      <section className="max-w-xl rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex items-center gap-2 text-brand-lea dark:text-slate-100">
          <Home className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Default home page</h2>
        </div>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Where you land when you sign in and when you click the Home button. Only pages you can open are listed.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-semibold text-brand-grey dark:text-slate-400">Home page</span>
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
            >
              <option value={defaultHome}>Command Center (default)</option>
              {grouped.map(([group, items]) => (
                <optgroup key={group} label={group}>
                  {items
                    .filter((i) => i.href !== defaultHome)
                    .map((i) => (
                      <option key={i.href} value={i.href}>
                        {i.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold/90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {msg ? (
          <div
            className={
              msg.ok
                ? "mt-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
            }
          >
            {msg.text}
          </div>
        ) : null}
      </section>
    </div>
  );
}
