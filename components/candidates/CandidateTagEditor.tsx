"use client";

import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Plus, X, Check, Archive } from "lucide-react";
import { HISTORICAL_CHIP_CLASS, TAG_COLORS, tagChipClass, tagDotClass, type TagChip } from "@/lib/tags/colors";

/**
 * Tags under the candidate's name: add, remove, recolour, and read what the
 * import left behind.
 *
 * Until now this screen could only REMOVE a tag — the DELETE route shipped
 * without a POST — so a tag taken off by mistake was gone for good and no tag
 * could be applied by hand at all.
 */
export function CandidateTagEditor({
  candidateId,
  chips,
  canEdit,
  onChange
}: {
  candidateId: string;
  chips: TagChip[];
  canEdit: boolean;
  onChange: (chips: TagChip[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistorical, setShowHistorical] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ label: string; color: string | null }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = chips.filter((c) => !c.historical);
  const historical = chips.filter((c) => c.historical);

  // The existing vocabulary, so a second "Hot lead" reuses the first rather than
  // creating a near-duplicate that filters separately.
  useEffect(() => {
    if (!adding || suggestions.length) return;
    fetch("/api/tags")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d?.tags) && setSuggestions(d.tags.map((t: { label: string; color: string | null }) => ({ label: t.label, color: t.color }))))
      .catch(() => undefined);
  }, [adding, suggestions.length]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function addTag(label: string, color?: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmed, color })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Could not add that tag.");
        return;
      }
      const next = chips.filter((c) => c.label.toLowerCase() !== trimmed.toLowerCase());
      onChange([{ label: data.tag.label, color: data.tag.color, historical: false }, ...next]);
      setDraft("");
      setAdding(false);
    } catch {
      setError("Could not add that tag.");
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(label: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label })
      });
      if (res.ok) onChange(chips.filter((c) => c.label !== label));
    } finally {
      setBusy(false);
      setArmed(null);
    }
  }

  async function recolour(label: string, color: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, color })
      });
      if (res.ok) onChange(chips.map((c) => (c.label === label ? { ...c, color } : c)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {current.map((tag) => (
          <CurrentTag
            key={tag.label}
            tag={tag}
            canEdit={canEdit}
            armed={armed === tag.label}
            busy={busy}
            onArm={() => setArmed(tag.label)}
            onDisarm={() => setArmed((c) => (c === tag.label ? null : c))}
            onRemove={() => void removeTag(tag.label)}
            onRecolour={(c) => void recolour(tag.label, c)}
          />
        ))}

        {canEdit && !adding ? (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded border border-dashed border-brand-lea/30 px-2 py-0.5 text-[11px] font-semibold text-brand-eden transition hover:border-brand-gold hover:bg-brand-gold/10 dark:border-white/20 dark:text-slate-300"
          >
            <Plus className="h-3 w-3" /> Add tag
          </button>
        ) : null}

        {adding ? (
          <span className="inline-flex items-center gap-1">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addTag(draft);
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                }
              }}
              placeholder="Hot lead"
              maxLength={60}
              list={`tag-suggestions-${candidateId}`}
              className="w-36 rounded border border-brand-lea/25 px-2 py-0.5 text-[11px] text-brand-lea focus:border-brand-gold focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
            />
            <datalist id={`tag-suggestions-${candidateId}`}>
              {suggestions.map((s) => (
                <option key={s.label} value={s.label} />
              ))}
            </datalist>
            <button
              onClick={() => void addTag(draft)}
              disabled={busy || !draft.trim()}
              className="rounded border border-brand-gold bg-brand-gold/20 px-1.5 py-0.5 text-[11px] font-semibold text-brand-lea disabled:opacity-40 dark:text-slate-100"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setDraft("");
                setError(null);
              }}
              className="rounded border border-brand-lea/20 px-1.5 py-0.5 text-[11px] text-brand-grey dark:border-white/10 dark:text-slate-400"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : null}
      </div>

      {error ? <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">{error}</p> : null}

      {/* Everything the JazzHR import left behind, out of the way but readable.
          Keeping one moves it up into the coloured set rather than copying it —
          the tag is already on this person, it just was not chosen by anybody. */}
      {historical.length > 0 ? (
        <div>
          <button
            onClick={() => setShowHistorical((v) => !v)}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Archive className="h-3 w-3" />
            {showHistorical ? "Hide" : "Show"} historical tags ({historical.length})
          </button>

          {showHistorical ? (
            <div className="mt-1 rounded border border-brand-lea/10 bg-brand-cloudDancer/30 p-2 dark:border-white/10 dark:bg-white/5">
              <p className="mb-1.5 text-[10.5px] leading-snug text-brand-grey dark:text-slate-400">
                Carried over from JazzHR. They describe a process we no longer run, so they stay grey and out of the
                way. {canEdit ? "Keep one to make it a current tag." : ""}
              </p>
              <div className="flex flex-wrap gap-1">
                {historical.map((tag) => (
                  <span
                    key={tag.label}
                    className={clsx(
                      "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium",
                      HISTORICAL_CHIP_CLASS
                    )}
                  >
                    {tag.label}
                    {canEdit ? (
                      <button
                        onClick={() => void addTag(tag.label)}
                        disabled={busy}
                        title={`Keep "${tag.label}" as a current tag`}
                        className="-mr-1 rounded px-1 leading-none text-brand-eden transition hover:bg-brand-lea/10 hover:text-brand-lea disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10"
                      >
                        keep
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A current tag: colour swatch on click, two-click removal. */
function CurrentTag({
  tag,
  canEdit,
  armed,
  busy,
  onArm,
  onDisarm,
  onRemove,
  onRecolour
}: {
  tag: TagChip;
  canEdit: boolean;
  armed: boolean;
  busy: boolean;
  onArm: () => void;
  onDisarm: () => void;
  onRemove: () => void;
  onRecolour: (color: string) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <span
        className={clsx(
          "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold",
          armed ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : tagChipClass(tag.label, tag.color)
        )}
      >
        {canEdit && !armed ? (
          <button
            onClick={() => setPicking((v) => !v)}
            title="Change this tag's colour"
            className={clsx("h-2 w-2 shrink-0 rounded", tagDotClass(tag.label, tag.color))}
            aria-label={`Change the colour of ${tag.label}`}
          />
        ) : null}
        {armed ? `Remove "${tag.label}"?` : tag.label}
        {canEdit ? (
          <button
            onClick={() => (armed ? onRemove() : onArm())}
            onBlur={onDisarm}
            disabled={busy}
            aria-label={armed ? `Confirm removing ${tag.label}` : `Remove ${tag.label}`}
            className="-mr-1 rounded px-0.5 leading-none transition hover:opacity-70 disabled:opacity-40"
          >
            {armed ? "✓" : "×"}
          </button>
        ) : null}
      </span>

      {picking ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setPicking(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 flex w-max gap-1 rounded border border-brand-lea/15 bg-white p-1.5 shadow-panel dark:border-white/10 dark:bg-brand-panel">
            {TAG_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => {
                  onRecolour(c.value);
                  setPicking(false);
                }}
                title={c.label}
                aria-label={c.label}
                className={clsx("h-4 w-4 rounded transition hover:scale-110", c.dot)}
              />
            ))}
          </div>
        </>
      ) : null}
    </span>
  );
}
