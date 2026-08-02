"use client";

import { useState } from "react";
import type { TrainingConfirmation, TrainingHireType, TrainingPool } from "@/lib/fleet/staffing/training";

// The small pieces of the Training table: a compact date cell, and the three
// colour-coded pickers. Split out of TrainingTab so the table body stays
// readable — that file is a wide grid and every extra inline branch made it
// harder to see the row structure.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-06-28" -> "6/28/26". A two-digit year because the full one costs ~14px
    per column across five date columns and tells you nothing you did not know. */
export function shortDate(iso: string | undefined): string {
  if (!iso || !ISO.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

/**
 * A date that READS as short text and EDITS as a real picker.
 *
 * A native date input cannot be reformatted — the browser prints it in the
 * system locale, so "mm/dd/yyyy" is not ours to shorten — and Chrome will not
 * render one below about 110px. Five of those is over half the table. So the
 * resting state is plain text at ~58px, and clicking swaps in the native input
 * (with its calendar) just for the cell being edited.
 */
export function DateCell({
  value,
  onChange,
  canEdit,
  label
}: {
  value: string | undefined;
  onChange: (next: string) => void;
  canEdit: boolean;
  label: string;
}) {
  const [editing, setEditing] = useState(false);

  if (!canEdit) return <span>{shortDate(value) || "—"}</span>;

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        // Closing on blur keeps exactly one cell expanded at a time. Escape and
        // Enter both close it too, so the keyboard is not a trap.
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`dbtn${value ? "" : " empty"}`}
      title={`${label} — click to change`}
      onClick={() => setEditing(true)}
    >
      {shortDate(value) || "—"}
    </button>
  );
}

/** Background / border / text for a coded value. Uses the chart's own tokens so
    dark mode remaps them for free. */
type Tone = { bg: string; bd: string; fg: string };

const NEUTRAL: Tone = { bg: "var(--n100)", bd: "var(--n300)", fg: "var(--n600)" };
const GREEN: Tone = { bg: "var(--fill-soft)", bd: "var(--green)", fg: "var(--fill-fg)" };
const GOLD: Tone = { bg: "var(--train-bg)", bd: "var(--gold)", fg: "var(--train-fg)" };
const RED: Tone = { bg: "var(--cand-bg)", bd: "var(--accent)", fg: "var(--cand-fg)" };
const BLUE: Tone = { bg: "var(--int-bg)", bd: "var(--int-bd)", fg: "var(--int-fg)" };

/** INTERNAL is the notable one — an existing employee changing seat — so it
    carries the colour and External stays neutral. Colouring the common case
    would just tint most of the column. */
export const hireTypeTone = (v: TrainingHireType | undefined): Tone => (v === "Internal" ? GREEN : NEUTRAL);

/** SS neutral (the default pool), M gold to match the chart's managed band,
    PDP blue because it is a distinct programme rather than a fleet. */
export const poolTone = (v: TrainingPool | undefined): Tone => (v === "M" ? GOLD : v === "PDP" ? BLUE : NEUTRAL);

export const confirmationTone = (v: TrainingConfirmation): Tone =>
  v === "Confirmed" ? GREEN : v === "Tentative" ? GOLD : v === "Canceled" ? RED : NEUTRAL;

/** A select styled by its own value, so the colour is the answer rather than a
    legend you have to learn. Read-only mode renders the same colours as a chip
    so the two views do not look like different data. */
export function TonedSelect({
  value,
  tone,
  options,
  onChange,
  canEdit,
  label,
  allowBlank = true
}: {
  value: string;
  tone: Tone;
  options: readonly string[];
  onChange: (next: string) => void;
  canEdit: boolean;
  label: string;
  allowBlank?: boolean;
}) {
  const style: React.CSSProperties = {
    background: tone.bg,
    borderColor: tone.bd,
    color: tone.fg,
    fontWeight: 700,
    width: "auto",
    minWidth: 62
  };

  if (!canEdit) {
    return (
      <span
        style={{
          ...style,
          display: "inline-block",
          border: `1px solid ${tone.bd}`,
          borderRadius: 4,
          padding: "1px 6px",
          fontSize: 10.5
        }}
      >
        {value || "—"}
      </span>
    );
  }

  return (
    <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} style={style}>
      {allowBlank ? <option value="">—</option> : null}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
