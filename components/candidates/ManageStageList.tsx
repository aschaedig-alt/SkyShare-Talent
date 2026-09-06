"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Undo2, X } from "lucide-react";
import type { CandidateStage } from "@/lib/candidates/stages";

/**
 * The pipeline stage list, editable.
 *
 * Edits are held locally and saved in one go, because order is part of the
 * meaning — the list IS the pipeline, read top to bottom — and saving on every
 * keystroke would write a dozen half-finished vocabularies to a shared database.
 *
 * NOTHING HERE MIGRATES ANYBODY. Renaming or retiring changes what the pickers
 * offer; every candidate keeps the value stored on them, and one no longer on
 * the list shows under "Current" in the dropdown rather than being rewritten.
 * The counts beside each stage are there so retiring one is an informed choice.
 */
export function ManageStageList({
  stages,
  usage,
  canEdit
}: {
  stages: CandidateStage[];
  /** candidates per stage, keyed lowercase. */
  usage: Record<string, number>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [list, setList] = useState<CandidateStage[]>(stages);
  const [adding, setAdding] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(list) !== JSON.stringify(stages);

  function update(i: number, patch: Partial<CandidateStage>) {
    setList((l) => l.map((s, n) => (n === i ? { ...s, ...patch } : s)));
    setSaved(false);
  }
  function move(i: number, by: number) {
    setList((l) => {
      const next = [...l];
      const j = i + by;
      if (j < 0 || j >= next.length) return l;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setSaved(false);
  }
  function retire(i: number) {
    setList((l) => l.filter((_, n) => n !== i));
    setSaved(false);
  }
  function add() {
    const value = adding.trim();
    if (!value) return;
    if (list.some((s) => s.value.toLowerCase() === value.toLowerCase())) {
      setError(`"${value}" is already on the list.`);
      return;
    }
    setList((l) => [...l, { value, group: "Open" }]);
    setAdding("");
    setError(null);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/candidate-stages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: list })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Could not save the stage list.");
      }
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the stage list.");
    } finally {
      setSaving(false);
    }
  }

  // Stages people are on that are NOT on the working list — either retired here
  // and not yet saved, or left over from the import.
  const listed = new Set(list.map((s) => s.value.toLowerCase()));
  const orphans = Object.entries(usage)
    .filter(([k]) => !listed.has(k))
    .sort((a, b) => b[1] - a[1]);

  return (
    <div>
      {error && (
        <p className="border-b border-brand-lea/10 px-5 py-2 text-xs text-brand-red dark:border-white/10 dark:text-red-300">
          {error}
        </p>
      )}

      <ol className="divide-y divide-brand-lea/10 dark:divide-white/10">
        {list.map((s, i) => {
          const n = usage[s.value.toLowerCase()] ?? 0;
          return (
            <li key={`${s.value}-${i}`} className="flex flex-wrap items-center gap-2 px-5 py-2">
              <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-brand-grey dark:text-slate-500">
                {i + 1}
              </span>

              {canEdit ? (
                <input
                  value={s.value}
                  onChange={(e) => update(i, { value: e.target.value })}
                  maxLength={40}
                  aria-label={`Stage ${i + 1} name`}
                  className="w-[190px] rounded border border-brand-lea/15 bg-white px-2 py-1 text-xs font-semibold text-brand-lea outline-none focus:border-transparent focus:shadow-[0_0_0_2px_rgba(234,170,0,0.5)] dark:border-white/15 dark:bg-brand-field dark:text-slate-100"
                />
              ) : (
                <span className="w-[190px] text-xs font-semibold text-brand-lea dark:text-slate-100">
                  {s.value}
                </span>
              )}

              {canEdit ? (
                <select
                  value={s.group}
                  onChange={(e) => update(i, { group: e.target.value === "Closed" ? "Closed" : "Open" })}
                  aria-label={`Is ${s.value} open or closed`}
                  className="cursor-pointer rounded border border-brand-lea/15 bg-white px-1.5 py-1 text-[11px] font-semibold text-brand-lea outline-none dark:border-white/15 dark:bg-brand-field dark:text-slate-100"
                >
                  <option value="Open">Open</option>
                  <option value="Closed">Closed</option>
                </select>
              ) : (
                <span className="text-[11px] text-brand-grey dark:text-slate-400">{s.group}</span>
              )}

              <span className="text-[11px] tabular-nums text-brand-grey dark:text-slate-400">
                {n > 0 ? `${n.toLocaleString()} ${n === 1 ? "candidate" : "candidates"}` : "nobody"}
              </span>

              <span className="flex-1" />

              {canEdit && (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${s.value} up`}
                    className="rounded border border-brand-lea/15 p-1 text-brand-grey transition hover:text-brand-lea disabled:opacity-30 dark:border-white/15 dark:text-slate-400"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === list.length - 1}
                    aria-label={`Move ${s.value} down`}
                    className="rounded border border-brand-lea/15 p-1 text-brand-grey transition hover:text-brand-lea disabled:opacity-30 dark:border-white/15 dark:text-slate-400"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => retire(i)}
                    aria-label={`Retire ${s.value}`}
                    title={
                      n > 0
                        ? `Stop offering this. The ${n.toLocaleString()} candidate${n === 1 ? "" : "s"} on it keep it — it shows as "Current" in their dropdown.`
                        : "Stop offering this stage."
                    }
                    className="rounded border border-brand-lea/15 p-1 text-brand-grey transition hover:text-brand-red disabled:opacity-30 dark:border-white/15 dark:text-slate-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {orphans.length > 0 && (
        <div className="border-t border-brand-lea/10 bg-brand-cloudDancer/50 px-5 py-3 dark:border-white/10 dark:bg-white/5">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
            On candidates, not on the list
          </p>
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            Nobody is being rewritten — these still show in their own dropdown under
            &ldquo;Current&rdquo;. Add one back above if it should be offered again.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {orphans.map(([k, n]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 rounded border border-brand-lea/15 bg-white px-2 py-0.5 text-[11px] text-brand-lea dark:border-white/15 dark:bg-brand-panel dark:text-slate-100"
              >
                {k} <span className="tabular-nums text-brand-grey dark:text-slate-400">{n.toLocaleString()}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-t border-brand-lea/10 px-5 py-3 dark:border-white/10">
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a stage…"
            maxLength={40}
            aria-label="New stage name"
            className="w-[190px] rounded border border-brand-lea/15 bg-white px-2 py-1 text-xs text-brand-lea outline-none focus:border-transparent focus:shadow-[0_0_0_2px_rgba(234,170,0,0.5)] dark:border-white/15 dark:bg-brand-field dark:text-slate-100"
          />
          <button
            type="button"
            onClick={add}
            className="inline-flex items-center gap-1 rounded border border-brand-lea/15 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/15 dark:text-slate-100"
          >
            <Plus className="h-3 w-3" /> Add
          </button>

          <span className="flex-1" />

          {dirty && (
            <button
              type="button"
              onClick={() => {
                setList(stages);
                setError(null);
                setSaved(false);
              }}
              className="inline-flex items-center gap-1 rounded border border-brand-lea/15 px-2.5 py-1 text-xs font-semibold text-brand-grey transition hover:shadow-glow dark:border-white/15 dark:text-slate-400"
            >
              <Undo2 className="h-3 w-3" /> Discard
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="rounded border border-brand-lea bg-brand-lea px-3 py-1 text-xs font-semibold text-white transition hover:shadow-glow disabled:opacity-40"
          >
            {saving ? "Saving…" : dirty ? "Save the list" : saved ? "Saved" : "No changes"}
          </button>
        </div>
      )}
    </div>
  );
}
