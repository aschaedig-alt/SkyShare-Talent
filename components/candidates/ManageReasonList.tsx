"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DISPOSITION_LABEL,
  type DispositionGroup,
  type DispositionOverrides
} from "@/lib/candidates/buckets";

export type ReasonWording = {
  /** Exactly as stored on the application, prefix and all. */
  raw: string;
  /** The tidied key an override is filed under. */
  key: string;
  /** The group it currently falls into. */
  group: DispositionGroup;
  /** True when a person chose that group rather than the pattern guessing it. */
  chosen: boolean;
  count: number;
};

const GROUPS = Object.keys(DISPOSITION_LABEL) as DispositionGroup[];

/**
 * Every disposition wording on file, with the two things you can do to it.
 *
 * RECATEGORISE (the dropdown) is reversible and touches no application — it
 * stores "this wording means that group", overriding the pattern matcher.
 * "Use the pattern" clears the override and the guess comes back.
 *
 * REWORD (the text box) is NOT reversible: it rewrites the text on every
 * application carrying that wording, which is data imported from Paycom.
 * Rewording one to match another is how two wordings become one. It asks with
 * the exact count first, taken from the server rather than from this page.
 */
export function ManageReasonList({
  wordings,
  canEdit
}: {
  wordings: ReasonWording[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<DispositionOverrides>(() =>
    Object.fromEntries(wordings.filter((w) => w.chosen).map((w) => [w.key, w.group]))
  );
  const [rewording, setRewording] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function saveOverrides(next: DispositionOverrides) {
    setOverrides(next);
    setError(null);
    try {
      const res = await fetch("/api/disposition-reasons", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides: next })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Could not save that grouping.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that grouping.");
    }
  }

  function recategorise(w: ReasonWording, value: string) {
    const next = { ...overrides };
    if (value === "__pattern__") delete next[w.key];
    else next[w.key] = value as DispositionGroup;
    void saveOverrides(next);
  }

  async function reword(w: ReasonWording) {
    const into = draft.trim();
    if (!into || into === w.raw) {
      setRewording(null);
      return;
    }
    setBusy(w.raw);
    setError(null);
    setNote(null);
    try {
      // Ask the SERVER how many rows this touches before committing — this page
      // knows a count, but the database is what decides.
      const dry = await fetch("/api/disposition-reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: w.raw, into, dryRun: true })
      });
      const dryData = (await dry.json().catch(() => ({}))) as { affected?: number; message?: string };
      if (!dry.ok) throw new Error(dryData.message ?? "Could not check that rewording.");

      const n = dryData.affected ?? 0;
      const existing = wordings.find((x) => x.raw === into);
      const ok = window.confirm(
        `Reword "${w.raw}" to "${into}"?\n\n` +
          `${n.toLocaleString()} application${n === 1 ? "" : "s"} will be changed.` +
          (existing
            ? `\n\n"${into}" already exists on ${existing.count.toLocaleString()}, so these two become one wording.`
            : "") +
          "\n\nThis rewrites text imported from Paycom and cannot be undone."
      );
      if (!ok) return;

      const res = await fetch("/api/disposition-reasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: w.raw, into })
      });
      const data = (await res.json().catch(() => ({}))) as { affected?: number; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Could not reword that.");

      setNote(`Reworded ${(data.affected ?? 0).toLocaleString()} applications.`);
      setRewording(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reword that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && (
        <p className="border-b border-brand-lea/10 px-5 py-2 text-xs text-brand-red dark:border-white/10 dark:text-red-300">
          {error}
        </p>
      )}
      {note && (
        <p className="border-b border-brand-lea/10 px-5 py-2 text-xs text-emerald-700 dark:border-white/10 dark:text-emerald-300">
          {note}
        </p>
      )}

      <div className="divide-y divide-brand-lea/10 dark:divide-white/10">
        {wordings.map((w) => {
          const isRewording = rewording === w.raw;
          const current = overrides[w.key];
          return (
            <div key={w.raw} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              {isRewording ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); void reword(w); }
                    if (e.key === "Escape") { e.preventDefault(); setRewording(null); }
                  }}
                  maxLength={200}
                  aria-label={`New wording for ${w.raw}`}
                  className="w-[320px] rounded border border-brand-lea/20 bg-white px-2 py-1 text-xs text-brand-lea outline-none focus:border-transparent focus:shadow-[0_0_0_2px_rgba(234,170,0,0.5)] dark:border-white/20 dark:bg-brand-field dark:text-slate-100"
                />
              ) : (
                <span className="min-w-0 max-w-[320px] flex-1 text-xs text-brand-lea dark:text-slate-100">
                  {w.raw}
                </span>
              )}

              <span className="shrink-0 text-xs tabular-nums text-brand-grey dark:text-slate-400">
                {w.count.toLocaleString()}
              </span>

              {canEdit ? (
                <select
                  value={current ?? "__pattern__"}
                  onChange={(e) => recategorise(w, e.target.value)}
                  aria-label={`Group for ${w.raw}`}
                  title={
                    current
                      ? "You chose this group. Switch to “Use the pattern” to go back to the automatic guess."
                      : "Grouped automatically from the wording. Pick a group to override it."
                  }
                  className={`shrink-0 cursor-pointer rounded border px-1.5 py-1 text-[11px] font-semibold outline-none ${
                    current
                      ? "border-brand-gold/60 bg-brand-gold/10 text-brand-lea dark:text-slate-100"
                      : "border-brand-lea/15 bg-white text-brand-grey dark:border-white/15 dark:bg-brand-field dark:text-slate-400"
                  }`}
                >
                  <option value="__pattern__">Use the pattern ({DISPOSITION_LABEL[w.group]})</option>
                  {GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {DISPOSITION_LABEL[g]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="shrink-0 text-[11px] text-brand-grey dark:text-slate-400">
                  {DISPOSITION_LABEL[w.group]}
                </span>
              )}

              {canEdit && (
                <span className="flex shrink-0 items-center gap-1.5">
                  {isRewording ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void reword(w)}
                        disabled={busy === w.raw}
                        className="rounded border border-brand-lea bg-brand-lea px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                      >
                        {busy === w.raw ? "Checking…" : "Reword"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRewording(null)}
                        className="rounded border border-brand-lea/15 px-2 py-1 text-[11px] font-semibold text-brand-grey dark:border-white/15 dark:text-slate-400"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setRewording(w.raw); setDraft(w.raw); setError(null); setNote(null); }}
                      title="Change the wording on every application carrying it. Match another wording exactly to merge the two."
                      className="rounded border border-brand-lea/15 px-2 py-0.5 text-[11px] font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/15 dark:text-slate-400 dark:hover:text-slate-100"
                    >
                      Reword / merge
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
