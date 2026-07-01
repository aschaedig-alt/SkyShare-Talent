"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import type { GridTaskStatus, MilestoneData } from "@/lib/data/onboarding";

function Glyph({ status }: { status: GridTaskStatus }) {
  if (status === "DONE")
    return (
      <span className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg width="11" height="11" viewBox="0 0 12 12">
          <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  if (status === "TODO") return <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-brand-grey/40" />;
  return <span className="text-brand-grey/50">–</span>;
}

export function OnboardingMilestonesTab({ data }: { data: MilestoneData }) {
  const router = useRouter();
  const { milestones, hires } = data;
  const [managing, setManaging] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [items, setItems] = useState(milestones);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(milestones.map((m) => [m.key, m.label])));
    setItems(milestones);
  }, [milestones]);

  function onDrop(targetKey: string) {
    if (!dragKey || dragKey === targetKey) {
      setDragKey(null);
      return;
    }
    const next = [...items];
    const from = next.findIndex((m) => m.key === dragKey);
    const to = next.findIndex((m) => m.key === targetKey);
    if (from === -1 || to === -1) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    setDragKey(null);
    void call("PATCH", { order: next.map((m) => m.key) });
  }

  async function call(method: string, body: unknown, url = "/api/onboarding-milestones") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(p?.message ?? "Something went wrong.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const addMilestone = async () => {
    if (!newLabel.trim()) {
      setError("Enter a milestone name.");
      return;
    }
    await call("POST", { label: newLabel });
    setNewLabel("");
  };
  const saveLabel = (key: string) => call("PATCH", { key, label: drafts[key] });
  const removeMilestone = (key: string) => call("DELETE", null, `/api/onboarding-milestones?key=${encodeURIComponent(key)}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-grey dark:text-slate-400">All onboarding milestones. Click a name to open the hire and tick items off.</p>
        <button
          onClick={() => setManaging((m) => !m)}
          className={clsx(
            "rounded border px-3 py-1.5 text-sm font-semibold transition hover:shadow-glow",
            managing ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-lea hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"
          )}
        >
          {managing ? "Done managing" : "Manage milestones"}
        </button>
      </div>
      {error ? <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}

      {managing && (
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Manage milestones</h2>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">Drag the handle to reorder. Rename inline, remove, or add a milestone. Renaming updates them everywhere; removing a custom milestone deletes its tracking.</p>
          <div className="mt-3 space-y-2">
            {items.map((m, i) => {
              const dirty = (drafts[m.key] ?? m.label) !== m.label;
              return (
                <div
                  key={m.key}
                  draggable
                  onDragStart={() => setDragKey(m.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(m.key)}
                  className={clsx("flex items-center gap-2 rounded transition", dragKey === m.key && "opacity-50")}
                >
                  <span className="cursor-grab select-none px-1 text-brand-grey/60" title="Drag to reorder">⋮⋮</span>
                  <span className="w-5 text-right text-xs text-brand-grey dark:text-slate-400">{i + 1}</span>
                  <input
                    value={drafts[m.key] ?? m.label}
                    onChange={(e) => setDrafts({ ...drafts, [m.key]: e.target.value })}
                    onKeyDown={(e) => e.key === "Enter" && dirty && saveLabel(m.key)}
                    className="flex-1 rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10"
                  />
                  {m.custom ? (
                    <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">custom</span>
                  ) : null}
                  <button
                    onClick={() => saveLabel(m.key)}
                    disabled={busy || !dirty}
                    className="rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => removeMilestone(m.key)}
                    disabled={busy}
                    className="rounded border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addMilestone()}
              placeholder="New milestone name"
              className="flex-1 rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10"
            />
            <button onClick={addMilestone} disabled={busy} className="rounded bg-brand-lea px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
              + Add milestone
            </button>
          </div>
        </section>
      )}

      {hires.length === 0 ? (
        <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:text-slate-400 dark:ring-white/10">No active hires.</p>
      ) : (
        <div className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 border-b border-r border-brand-lea/10 bg-white px-3 py-2 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400">
                    New hire
                  </th>
                  {milestones.map((m) => (
                    <th key={m.key} className="border-b border-brand-lea/10 px-2 py-2 align-bottom dark:border-white/10" style={{ width: 78, minWidth: 78 }}>
                      <div className="mx-auto flex min-h-[48px] w-[68px] items-end justify-center text-center font-medium leading-tight text-brand-grey dark:text-slate-400">
                        <span className="whitespace-normal break-words">{m.label}</span>
                      </div>
                    </th>
                  ))}
                  <th className="border-b border-brand-lea/10 px-3 py-2 text-left align-bottom text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:border-white/10 dark:text-slate-400" style={{ minWidth: 130 }}>
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody>
                {hires.map((h) => {
                  const pct = h.total > 0 ? Math.round((h.done / h.total) * 100) : 0;
                  return (
                    <tr key={h.id} className="hover:bg-brand-cloudDancer/30 dark:bg-white/5">
                      <td className="sticky left-0 z-10 border-b border-r border-brand-lea/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-brand-panel">
                        <Link href={`/people/${h.id}`} className="font-medium text-brand-lea hover:underline transition hover:shadow-glow dark:text-slate-100">{h.name}</Link>
                        <div className="text-[10px] text-brand-grey dark:text-slate-400">
                          {h.position ?? "—"}
                          {h.department ? ` · ${h.department}` : ""}
                        </div>
                      </td>
                      {h.statuses.map((s, i) => (
                        <td key={milestones[i].key} className="border-b border-brand-lea/5 text-center dark:border-white/10">
                          <Glyph status={s} />
                        </td>
                      ))}
                      <td className="border-b border-brand-lea/5 px-3 py-2 dark:border-white/10">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-20 overflow-hidden rounded-full bg-brand-cloudDancer dark:bg-white/5">
                            <span className={clsx("block h-full rounded-full", h.done === h.total ? "bg-emerald-500" : "bg-brand-gold")} style={{ width: `${pct}%` }} />
                          </span>
                          <span className="text-[11px] text-brand-grey dark:text-slate-400">{h.done}/{h.total}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
