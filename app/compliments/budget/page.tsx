import { clsx } from "clsx";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getComplimentsSettings } from "@/lib/compliments/settings";
import { getBudgetData } from "@/lib/data/compliments-budget";
import { Card } from "@/components/compliments/Card";
import { MetricCard } from "@/components/compliments/MetricCard";
import { RewardCatalogAdmin } from "@/components/compliments/RewardCatalogAdmin";
import { ProgramSettingsForm } from "@/components/compliments/ProgramSettingsForm";

export const dynamic = "force-dynamic";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default async function BudgetPage() {
  const { role } = await requireModulePageAccess("people");

  if (role !== "ADMIN") {
    return (
      <Card padding="lg">
        <div className="py-10 text-center">
          <p className="text-sm font-medium text-brand-lea">Budget & admin is for administrators</p>
          <p className="mt-1 text-sm text-brand-grey">
            This area manages reward costs and program budget. Ask an admin for access.
          </p>
        </div>
      </Card>
    );
  }

  const settings = await getComplimentsSettings();
  const b = await getBudgetData(settings);
  const overBudget = b.thisMonthSpendUsd > b.monthlyBudgetUsd && b.monthlyBudgetUsd > 0;
  const maxCategory = Math.max(1, ...b.byCategory.map((c) => c.dollars));
  const maxMonthly = Math.max(1, ...b.monthly.map((m) => Math.max(m.awardedUsd, m.redeemedUsd)));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-brand-lea">Budget &amp; cost overview</h2>
        <p className="text-sm text-brand-grey">
          What the recognition program costs — to share with leadership. {b.pointsPerDollar} points = $1.
        </p>
      </div>

      {/* Headline cost cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Outstanding liability"
          value={usd0.format(b.outstandingLiabilityUsd)}
          sublabel="owed in unredeemed points"
        />
        <MetricCard label="Redeemed to date" value={usd0.format(b.realizedSpendUsd)} sublabel="actually paid out" />
        <MetricCard
          label="Total program value"
          value={usd0.format(b.totalProgramValueUsd)}
          sublabel="redeemed + outstanding"
        />
        <MetricCard
          label="Projected annual cost"
          value={usd0.format(b.projectedAnnualUsd)}
          sublabel="at current redemption pace"
        />
      </div>

      {/* Budget vs actual + run rate */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="lg">
          <div className="flex items-baseline justify-between">
            <h3 className="text-base font-medium text-brand-lea">This month vs budget</h3>
            <span className="text-xs text-brand-grey">Target {usd0.format(b.monthlyBudgetUsd)}/mo</span>
          </div>
          <p className="mt-3 text-[28px] font-medium leading-none text-brand-lea">
            {usd2.format(b.thisMonthSpendUsd)}
          </p>
          <p className="mt-1 text-xs text-brand-grey">spent this month · {usd2.format(b.lastMonthSpendUsd)} last month</p>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-brand-cloudDancer">
            <div
              className={clsx("h-full rounded-full", overBudget ? "bg-brand-red" : "bg-value-teamwork")}
              style={{ width: `${Math.min(100, b.budgetUsedPct)}%` }}
            />
          </div>
          <p className={clsx("mt-2 text-xs", overBudget ? "text-brand-red" : "text-brand-grey")}>
            {overBudget
              ? `${b.budgetUsedPct}% of budget — over by ${usd2.format(b.thisMonthSpendUsd - b.monthlyBudgetUsd)}`
              : `${b.budgetUsedPct}% of budget used · ${usd2.format(b.budgetRemainingUsd)} remaining`}
          </p>
        </Card>

        <Card padding="lg">
          <h3 className="text-base font-medium text-brand-lea">Run rate &amp; outlook</h3>
          <dl className="mt-3 space-y-2.5 text-sm">
            <Row label="Projected monthly spend" value={usd2.format(b.projectedMonthlyUsd)} />
            <Row label="Projected annual spend" value={usd0.format(b.projectedAnnualUsd)} />
            <Row
              label="New points awarded / month"
              value={usd2.format(b.projectedMonthlyAwardedUsd)}
              hint="rate liability accrues"
            />
            <Row label="Liability per new hire" value={usd2.format(b.liabilityPerPersonUsd)} />
            <Row label="Awarded per new hire (all-time)" value={usd2.format(b.awardedPerPersonUsd)} />
          </dl>
        </Card>
      </div>

      {/* Breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card padding="lg">
          <h3 className="mb-4 text-base font-medium text-brand-lea">Spend by reward category</h3>
          {b.byCategory.length === 0 ? (
            <p className="text-sm text-brand-grey">No rewards have been redeemed yet.</p>
          ) : (
            <div className="space-y-3">
              {b.byCategory.map((c) => (
                <div key={c.category}>
                  <div className="mb-1 flex justify-between text-[13px]">
                    <span className="font-medium text-brand-lea">{c.label}</span>
                    <span className="text-brand-grey">
                      {usd2.format(c.dollars)} · {c.count}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-brand-cloudDancer">
                    <div
                      className="h-full rounded-full bg-brand-eden"
                      style={{ width: `${Math.round((c.dollars / maxCategory) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card padding="lg">
          <h3 className="mb-4 text-base font-medium text-brand-lea">Monthly trend</h3>
          <div className="mb-3 flex gap-4 text-xs text-brand-grey">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-brand-eden" /> Awarded
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-value-teamwork" /> Redeemed
            </span>
          </div>
          <div className="space-y-2.5">
            {b.monthly.map((m, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-xs text-brand-grey">{m.label}</span>
                <div className="flex-1 space-y-1">
                  <div className="h-2 overflow-hidden rounded-full bg-brand-cloudDancer">
                    <div
                      className="h-full rounded-full bg-brand-eden"
                      style={{ width: `${Math.round((m.awardedUsd / maxMonthly) * 100)}%` }}
                    />
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-brand-cloudDancer">
                    <div
                      className="h-full rounded-full bg-value-teamwork"
                      style={{ width: `${Math.round((m.redeemedUsd / maxMonthly) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="w-16 shrink-0 text-right text-xs text-brand-grey">{usd0.format(m.redeemedUsd)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Management */}
      <RewardCatalogAdmin rewards={b.byReward} pointsPerDollar={b.pointsPerDollar} />
      <ProgramSettingsForm settings={settings} />
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-brand-lea/5 pb-2 last:border-0">
      <dt className="text-brand-grey">
        {label}
        {hint ? <span className="ml-1 text-xs text-brand-grey/70">· {hint}</span> : null}
      </dt>
      <dd className="font-medium text-brand-lea">{value}</dd>
    </div>
  );
}
