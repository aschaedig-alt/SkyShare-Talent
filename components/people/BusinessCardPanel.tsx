"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCard, Copy, Check, AlertTriangle } from "lucide-react";
import { buildBusinessCard, formatCardText } from "@/lib/business-cards/card";
import { BusinessCardVisual } from "@/components/business-cards/BusinessCardVisual";

// The person's ready-to-order card, on their profile. Same rules as the batch
// page — pilots/cabin attendants get the SkyOps line, everyone else SkyLove.
export function BusinessCardPanel({
  name,
  position,
  phone,
  ssEmail
}: {
  name: string;
  position: string | null;
  phone: string | null;
  ssEmail: string | null;
}) {
  const card = buildBusinessCard({ name, position, phone, ssEmail });
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatCardText(card));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-brand-lea dark:text-slate-100">
          <CreditCard className="h-4 w-4" /> Business card
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-black transition hover:bg-brand-gold/90 dark:text-slate-100"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy for printer"}
          </button>
          <Link href="/business-cards" className="text-xs font-semibold text-brand-eden transition hover:text-brand-lea dark:text-slate-300">
            All cards
          </Link>
        </div>
      </div>

      <div className="mt-3 rounded bg-brand-cloudDancer/40 p-4 dark:bg-white/5">
        <BusinessCardVisual card={card} />
      </div>

      {card.missing.length ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Add a {card.missing.join(" and ")} to this profile to complete the card.
        </p>
      ) : null}
    </section>
  );
}
