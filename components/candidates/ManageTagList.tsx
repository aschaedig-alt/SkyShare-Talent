"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CandidateTagOption } from "@/lib/data/candidates";
import { TAG_COLORS, autoTagColor, tagChipClass, type TagColor } from "@/lib/tags/colors";

/**
 * The tag vocabulary, with the one edit that actually saves today: colour.
 *
 * A Tag is shared by every candidate carrying it, so a recolour is a one-time
 * action across all of them — which is the point, and why it is worth doing from
 * a list of every tag rather than from one person's profile.
 *
 * Optimistic, and it puts the old colour back if the save fails, so the swatch
 * can never show a colour the database does not have.
 */
export function ManageTagList({
  tags,
  canEdit
}: {
  tags: CandidateTagOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [colors, setColors] = useState<Record<string, string | null>>(
    () => Object.fromEntries(tags.map((t) => [t.label, t.color]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [merging, setMerging] = useState<string | null>(null);
  const [mergeInto, setMergeInto] = useState("");

  async function rename(label: string) {
    const newLabel = draft.trim();
    if (!newLabel || newLabel === label) {
      setRenaming(null);
      return;
    }
    setBusy(label);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, newLabel })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        // A 409 here means the name is taken — the server says "merge instead",
        // which is a real instruction rather than a failure.
        throw new Error(data.message ?? "Could not rename that tag.");
      }
      setRenaming(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename that tag.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(label: string) {
    const n = tags.find((t) => t.label === label)?.total ?? 0;
    // Deleting takes the label off everyone who has it — unlike merge, which
    // keeps those people and moves them somewhere else. Irreversible, so it asks
    // with the count rather than offering an undo it cannot honour, and points
    // at merge in case that is what was actually meant.
    const ok = window.confirm(
      `Delete "${label}"?\n\n` +
        (n > 0
          ? `${n.toLocaleString()} candidate${n === 1 ? "" : "s"} carry it and will lose it.\n\n`
          : "Nobody is carrying it.\n\n") +
        "This cannot be undone. To keep the people and just change the label, use Merge instead."
    );
    if (!ok) return;

    setBusy(label);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Could not delete that tag.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that tag.");
    } finally {
      setBusy(null);
    }
  }

  async function merge(label: string) {
    const into = mergeInto;
    if (!into) return;
    const n = tags.find((t) => t.label === label)?.total ?? 0;
    // IRREVERSIBLE: nothing records which candidates came from which side, so
    // this asks first rather than offering an undo it cannot honour.
    const ok = window.confirm(
      `Merge "${label}" into "${into}"?\n\n` +
        `${n.toLocaleString()} candidate${n === 1 ? "" : "s"} carrying "${label}" will carry "${into}" instead, ` +
        `and "${label}" will be deleted.\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setBusy(label);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: label, into })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Could not merge those tags.");
      }
      setMerging(null);
      setMergeInto("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not merge those tags.");
    } finally {
      setBusy(null);
    }
  }

  // Tags nobody has ever applied by hand are shown apart: 38 came in from the
  // import carrying most of the links, and mixing them in buries the handful of
  // labels somebody actually chose.
  const chosen = tags.filter((t) => !t.historical);
  const imported = tags.filter((t) => t.historical);

  async function recolour(label: string, color: TagColor) {
    const previous = colors[label] ?? null;
    if (previous === color) return;
    setColors((c) => ({ ...c, [label]: color }));
    setBusy(label);
    setError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Could not change that colour.");
      }
      router.refresh();
    } catch (e) {
      setColors((c) => ({ ...c, [label]: previous }));
      setError(e instanceof Error ? e.message : "Could not change that colour.");
    } finally {
      setBusy(null);
    }
  }

  function Row({ tag }: { tag: CandidateTagOption }) {
    const color = colors[tag.label] ?? null;
    const isRenaming = renaming === tag.label;
    const isMerging = merging === tag.label;

    return (
      <div className="flex flex-wrap items-center gap-3 px-5 py-2.5">
        {isRenaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void rename(tag.label); }
              if (e.key === "Escape") { e.preventDefault(); setRenaming(null); }
            }}
            maxLength={60}
            aria-label={`New name for ${tag.label}`}
            className="w-[220px] rounded border border-brand-lea/20 bg-white px-2 py-1 text-[11px] font-semibold text-brand-lea outline-none focus:border-transparent focus:shadow-[0_0_0_2px_rgba(234,170,0,0.5)] dark:border-white/20 dark:bg-brand-field dark:text-slate-100"
          />
        ) : (
          <span
            className={`inline-flex shrink-0 items-center rounded border px-2 py-[3px] text-[11px] font-semibold ${tagChipClass(
              tag.label,
              color
            )} ${busy === tag.label ? "opacity-50" : ""}`}
          >
            {tag.label}
          </span>
        )}
        <span className="text-xs tabular-nums text-brand-grey dark:text-slate-400">
          {tag.live.toLocaleString()} live
          {tag.total !== tag.live && ` · ${tag.total.toLocaleString()} total`}
        </span>

        {isMerging && (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-brand-grey dark:text-slate-400">into</span>
            <select
              autoFocus
              value={mergeInto}
              onChange={(e) => setMergeInto(e.target.value)}
              aria-label={`Merge ${tag.label} into`}
              className="rounded border border-brand-lea/20 bg-white px-1.5 py-1 text-[11px] font-semibold text-brand-lea dark:border-white/20 dark:bg-brand-field dark:text-slate-100"
            >
              <option value="">Pick a tag…</option>
              {tags
                .filter((t) => t.label !== tag.label)
                .map((t) => (
                  <option key={t.label} value={t.label}>
                    {t.label} ({t.total.toLocaleString()})
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!mergeInto || busy === tag.label}
              onClick={() => void merge(tag.label)}
              className="rounded border border-brand-lea bg-brand-lea px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              Merge
            </button>
            <button
              type="button"
              onClick={() => { setMerging(null); setMergeInto(""); }}
              className="rounded border border-brand-lea/15 px-2 py-1 text-[11px] font-semibold text-brand-grey dark:border-white/15 dark:text-slate-400"
            >
              Cancel
            </button>
          </span>
        )}

        <span className="flex-1" />
        {canEdit && !isRenaming && !isMerging && (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setRenaming(tag.label); setDraft(tag.label); setError(null); }}
              className="rounded border border-brand-lea/15 px-2 py-0.5 text-[11px] font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/15 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => { setMerging(tag.label); setMergeInto(""); setError(null); }}
              title={`Fold "${tag.label}" into another tag. This cannot be undone.`}
              className="rounded border border-brand-lea/15 px-2 py-0.5 text-[11px] font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/15 dark:text-slate-400 dark:hover:text-slate-100"
            >
              Merge
            </button>
            <button
              type="button"
              onClick={() => void remove(tag.label)}
              title={`Delete "${tag.label}" and take it off everyone carrying it.`}
              className="rounded border border-brand-lea/15 px-2 py-0.5 text-[11px] font-semibold text-brand-grey transition hover:text-brand-red dark:border-white/15 dark:text-slate-400 dark:hover:text-red-300"
            >
              Delete
            </button>
          </span>
        )}
        {canEdit && isRenaming && (
          <span className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void rename(tag.label)}
              disabled={busy === tag.label}
              className="rounded border border-brand-lea bg-brand-lea px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setRenaming(null)}
              className="rounded border border-brand-lea/15 px-2 py-1 text-[11px] font-semibold text-brand-grey dark:border-white/15 dark:text-slate-400"
            >
              Cancel
            </button>
          </span>
        )}
        {canEdit && !isRenaming && !isMerging && (
          <div className="flex flex-wrap gap-1">
            {TAG_COLORS.map((c) => {
              const on = (color ?? autoTagColor(tag.label)) === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => recolour(tag.label, c.value)}
                  aria-label={`${c.label} for ${tag.label}`}
                  title={c.label}
                  className={`h-4 w-4 rounded border transition ${c.dot} ${
                    on ? "border-brand-lea ring-1 ring-brand-gold" : "border-brand-lea/20"
                  }`}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <p className="border-b border-brand-lea/10 px-5 py-2 text-xs text-brand-red dark:border-white/10 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="divide-y divide-brand-lea/10 dark:divide-white/10">
        {chosen.length === 0 ? (
          <p className="px-5 py-4 text-xs text-brand-grey dark:text-slate-400">
            Nobody has applied a tag by hand yet — everything below came in with the import.
          </p>
        ) : (
          chosen.map((t) => <Row key={t.label} tag={t} />)
        )}
      </div>

      {imported.length > 0 && (
        <>
          <div className="border-y border-brand-lea/10 bg-brand-cloudDancer/60 px-5 py-2 dark:border-white/10 dark:bg-white/5">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
              From the import · {imported.length}
            </span>
          </div>
          <div className="divide-y divide-brand-lea/10 dark:divide-white/10">
            {imported.map((t) => (
              <Row key={t.label} tag={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
