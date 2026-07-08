import type { BusinessCard } from "@/lib/business-cards/card";

// The card's information as a clean box that matches the site's own type + colors
// (red labels, dark values, grey title). No logo/QR/card-chrome — the printer
// owns the physical design; this is the fillable data, pulled from the profile.

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="leading-tight">
      <div className="text-[11px] font-medium text-brand-red dark:text-red-400">{label}</div>
      {value ? (
        <div className="text-sm text-brand-black dark:text-slate-100">{value}</div>
      ) : (
        <div className="text-sm font-medium text-amber-600 dark:text-amber-400">— add on profile</div>
      )}
    </div>
  );
}

export function BusinessCardVisual({ card }: { card: BusinessCard }) {
  return (
    <div>
      <div className="text-base font-semibold text-brand-black dark:text-slate-100">{card.name || "—"}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{card.title || "—"}</div>
      <div className="mt-3 space-y-2">
        <Field label="skyops" value={card.skyops} />
        <Field label="mobile" value={card.mobile} />
        <Field label="email" value={card.email} />
        <Field label="web" value={card.web} />
      </div>
    </div>
  );
}
