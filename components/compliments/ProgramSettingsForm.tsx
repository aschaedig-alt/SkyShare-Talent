"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Card } from "@/components/compliments/Card";
import { updateComplimentsSettings } from "@/app/compliments/admin-actions";
import type { ComplimentsSettings } from "@/lib/compliments/settings";

type Props = { settings: ComplimentsSettings };

export function ProgramSettingsForm({ settings }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    pointsPerDollar: String(settings.pointsPerDollar),
    monthlyBudgetUsd: String(settings.monthlyBudgetUsd),
    good: String(settings.strengthPoints.GOOD),
    great: String(settings.strengthPoints.GREAT),
    amazing: String(settings.strengthPoints.AMAZING)
  });
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const ratio = Number(form.pointsPerDollar) || settings.pointsPerDollar;
  const asDollars = (pts: string) => `$${(Number(pts) / (ratio || 100)).toFixed(2)}`;

  function save() {
    setNotice(null);
    startTransition(async () => {
      const res = await updateComplimentsSettings({
        pointsPerDollar: Number(form.pointsPerDollar),
        monthlyBudgetUsd: Number(form.monthlyBudgetUsd),
        strengthPoints: { GOOD: Number(form.good), GREAT: Number(form.great), AMAZING: Number(form.amazing) }
      });
      if (res.ok) {
        setNotice({ kind: "ok", text: "Settings saved." });
        router.refresh();
      } else {
        setNotice({ kind: "err", text: res.error ?? "Could not save settings." });
      }
    });
  }

  const labelCls = "block text-sm font-medium text-brand-lea dark:text-slate-100";
  const inputCls =
    "mt-1 w-full rounded-element border-[0.5px] border-brand-lea/20 px-3 py-2 text-sm outline-none focus:border-value-innovation focus:ring-2 focus:ring-value-innovation/30 dark:border-white/10";

  return (
    <Card padding="lg">
      <h3 className="mb-1 text-base font-medium text-brand-lea dark:text-slate-100">Program settings</h3>
      <p className="mb-4 text-xs text-brand-grey dark:text-slate-400">Company policy for points, conversion and budget.</p>

      {notice ? (
        <p
          className={clsx(
            "mb-4 rounded-element px-3 py-2 text-sm",
            notice.kind === "ok"
              ? "bg-value-teamwork-light text-value-teamwork-dark"
              : "bg-value-customerFocus-light text-value-customerFocus-dark"
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="ppd">
            Points per dollar
          </label>
          <input
            id="ppd"
            type="number"
            min={1}
            className={inputCls}
            value={form.pointsPerDollar}
            onChange={(e) => setForm({ ...form, pointsPerDollar: e.target.value })}
          />
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">{ratio} points = $1.00</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="budget">
            Monthly budget target ($)
          </label>
          <input
            id="budget"
            type="number"
            min={0}
            className={inputCls}
            value={form.monthlyBudgetUsd}
            onChange={(e) => setForm({ ...form, monthlyBudgetUsd: e.target.value })}
          />
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">Spend is tracked against this each month.</p>
        </div>
      </div>

      <div className="mt-5">
        <p className={labelCls}>Recognition point values</p>
        <p className="text-xs text-brand-grey dark:text-slate-400">How many points each recognition strength awards.</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
          {([
            ["good", "Good", form.good],
            ["great", "Great", form.great],
            ["amazing", "Amazing", form.amazing]
          ] as const).map(([key, label, val]) => (
            <div key={key}>
              <label className="text-xs font-medium text-brand-grey dark:text-slate-400" htmlFor={key}>
                {label}
              </label>
              <input
                id={key}
                type="number"
                min={0}
                className={inputCls}
                value={val}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
              <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">{asDollars(val)} value</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-element bg-brand-lea px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-eden disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save settings"}
        </button>
      </div>
    </Card>
  );
}
