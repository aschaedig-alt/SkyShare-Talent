"use client";

import { PilotProgressions } from "@/components/reports/ReportsWorkspace";
import type { ReportsData } from "@/lib/data/reports";

// The public, read-only view behind a share link. Reuses the exact same
// PilotProgressions component the app uses, so all the filters (Active/All,
// tenure, year) stay fully interactive — just wrapped in a bare, branded page.
export function SharedFleetProgression({
  upgrades,
  logoDataUrl
}: {
  upgrades: ReportsData["pilotUpgrades"];
  logoDataUrl?: string | null;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-brand-lea/10 bg-brand-lea">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">SkyShare · Talent analytics</p>
            <h1 className="text-lg font-semibold text-white">Fleet Progression — shared report</h1>
            <p className="mt-0.5 text-xs text-white/70">Live &amp; read-only. Use the filters below to change the view.</p>
          </div>
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt="SkyShare" className="h-10 w-auto object-contain" />
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <PilotProgressions upgrades={upgrades} />
        <p className="mt-4 text-center text-xs text-brand-grey dark:text-slate-400">
          Shared from SkyShare Journey. This is a read-only snapshot of live data; the link can be revoked at any time.
        </p>
      </main>
    </div>
  );
}
