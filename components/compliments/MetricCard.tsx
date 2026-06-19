import { clsx } from "clsx";
import type { ReactNode } from "react";
import { Card } from "@/components/compliments/Card";

type Trend = {
  direction: "up" | "down" | "flat";
  label: string;
};

type MetricCardProps = {
  label: string;
  value: ReactNode;
  /** Optional secondary line under the value (e.g. "$4.80 value"). */
  sublabel?: string;
  trend?: Trend;
};

/** Metric tile: 12–13px label, 28px/500 number, optional trend delta (handoff §3). */
export function MetricCard({ label, value, sublabel, trend }: MetricCardProps) {
  return (
    <Card padding="sm">
      <p className="text-xs font-medium text-brand-grey dark:text-slate-400">{label}</p>
      <p className="mt-2 text-[28px] font-medium leading-none text-brand-lea dark:text-slate-100">{value}</p>
      {sublabel ? <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">{sublabel}</p> : null}
      {trend ? (
        <p
          className={clsx(
            "mt-1.5 text-xs",
            trend.direction === "up" && "text-value-teamwork-dark",
            trend.direction === "down" && "text-brand-red",
            trend.direction === "flat" && "text-brand-grey dark:text-slate-400"
          )}
        >
          {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} {trend.label}
        </p>
      ) : null}
    </Card>
  );
}
