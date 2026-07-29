"use client";

import { useState } from "react";

/**
 * Direct link out to this person's own Paycom record.
 *
 * There is no reliable URL formula from paycomPersonId alone — Paycom does
 * not expose a stable public deep-link pattern, so guessing one risks a link
 * that silently points at the wrong person, or nowhere. This is filled in
 * once by a person who has the real link open in Paycom, then it just works
 * from here on.
 *
 * COLOUR NOTE: Paycom's exact brand hex is in their internal brand-standards
 * PDF, which is not something these tools could open. This is a close,
 * confident green in the same family — swap it for the exact value if the
 * real brand kit is ever on hand.
 */
const PAYCOM_GREEN = "#2E9E5B";
const PAYCOM_GREEN_DARK = "#227A46";

export function PaycomLinkBadge({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in Paycom"
      aria-label="Open in Paycom"
      className="inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:brightness-110"
      style={{ backgroundColor: PAYCOM_GREEN }}
    >
      <PaycomMark tone="solid" />
      Paycom
    </a>
  );
}

/** Small square initial badge — not a reproduction of Paycom's own logo artwork. */
function PaycomMark({ tone = "solid", className = "h-3.5 w-3.5" }: { tone?: "solid" | "outline"; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] text-[9px] font-black leading-none ${className}`}
      style={tone === "solid" ? { backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" } : { backgroundColor: PAYCOM_GREEN, color: "#fff" }}
      aria-hidden="true"
    >
      P
    </span>
  );
}

/**
 * The header-level control: shows the badge once a link exists, or a small
 * "+ Paycom" affordance for anyone who can edit while it is still empty.
 * Prompt-based entry (not a modal) — this is a single URL, once, and a modal
 * would be more chrome than the task needs.
 */
export function PaycomLinkControl({
  candidateId,
  paycomLink,
  canEdit
}: {
  candidateId: string;
  paycomLink: string | null;
  canEdit: boolean;
}) {
  const [link, setLink] = useState(paycomLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addLink() {
    const url = window.prompt("Paste this person's Paycom link:");
    if (!url) return;
    const trimmed = url.trim();
    if (!/^https?:\/\/\S+$/i.test(trimmed)) {
      setError("That doesn't look like a link — it should start with http:// or https://.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paycomLink: trimmed })
      });
      if (res.ok) {
        setLink(trimmed);
      } else {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? "Couldn't save that link.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (link) return <PaycomLinkBadge href={link} />;
  if (!canEdit) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={addLink}
        disabled={busy}
        title="Paste a link to this person's Paycom record"
        className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50"
        style={{ borderColor: PAYCOM_GREEN, color: PAYCOM_GREEN_DARK }}
      >
        <PaycomMark tone="outline" />
        {busy ? "Saving…" : "+ Paycom"}
      </button>
      {error && <span className="text-[10px] font-semibold text-red-700 dark:text-red-300">{error}</span>}
    </div>
  );
}
