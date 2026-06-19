import { Component, Lock, Palette, Type } from "lucide-react";
import { colorTokens, layoutTokens, typographyTokens } from "@/lib/formatting/brand";

function LockedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-brand-gold/22 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-brand-lea dark:text-slate-100">
      <Lock className="h-3 w-3" />
      Locked
    </span>
  );
}

export function TemplateTokensPanel() {
  return (
    <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
      <div className="border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-eden">
              2. Style & Brand Tokens
            </p>
            <h2 className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">Locked template and design system</h2>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-brand-gold/20 text-brand-lea dark:text-slate-100">
            <Lock className="h-4.5 w-4.5" />
          </div>
        </div>
      </div>

      <div className="space-y-6 p-5">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea dark:text-slate-100">
              <Palette className="h-4 w-4 text-brand-eden" />
              Color Palette
            </h3>
            <LockedBadge />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {colorTokens.map((token) => (
              <div
                key={token.key}
                className="group rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-2 transition hover:border-brand-gold/70 dark:border-white/10 dark:bg-white/5"
                title={`${token.label} is locked`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 rounded border border-black/10"
                    style={{ backgroundColor: token.value }}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-brand-lea dark:text-slate-100">{token.label}</div>
                    <div className="text-[11px] font-semibold text-brand-grey dark:text-slate-400">{token.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea dark:text-slate-100">
              <Type className="h-4 w-4 text-brand-eden" />
              Typography Scale
            </h3>
            <LockedBadge />
          </div>
          <div className="divide-y divide-brand-lea/8 overflow-hidden rounded border border-brand-lea/10 dark:divide-white/10 dark:border-white/10">
            {typographyTokens.map((token) => (
              <div key={token.key} className="flex items-center justify-between gap-3 bg-white px-3 py-2.5 dark:bg-[#10243a]">
                <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{token.label}</div>
                <div className="text-right text-xs font-semibold text-brand-grey dark:text-slate-400">{token.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-brand-lea dark:text-slate-100">
              <Component className="h-4 w-4 text-brand-eden" />
              Layout & Components
            </h3>
            <LockedBadge />
          </div>
          <div className="space-y-2">
            {layoutTokens.map((token) => (
              <div
                key={token.key}
                className="flex items-center justify-between gap-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
              >
                <div>
                  <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{token.label}</div>
                  <div className="text-xs text-brand-grey dark:text-slate-400">{token.value}</div>
                </div>
                <Lock className="h-4 w-4 shrink-0 text-brand-gold" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-brand-gold/40 bg-brand-gold/13 px-4 py-3 text-sm font-semibold leading-6 text-brand-lea dark:text-slate-100">
          Brand template settings are locked for daily editing. Job text and reusable content blocks remain editable.
        </div>
      </div>
    </section>
  );
}
