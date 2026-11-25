import { R } from "@/components/reports/report-ui";

// Rolling-turnover line charts, the Turnover Manager Dashboard's setup: the line,
// a dashed straight-line trend through it, and (on a department) the company line
// behind it for comparison.
//
// Drawn at the report spec's 720x240 on a wide screen. A phone gets its own
// narrower drawing instead of a sideways scrollbar (his rule, Nov 14 2026: every
// report works at 375px and 329px), so the 11px axis text stays 11px-ish there too.

type Props = {
  labels: string[];
  /** Tooltip names for each point ("December 2025"). */
  long: string[];
  values: number[];
  /** The company line, drawn thinner in gold behind a department's line. */
  company?: number[] | null;
  label: string;
  /** A small multiple: one drawing, no dots. */
  small?: boolean;
};

/** Least-squares straight line through the values, never below zero. */
export function trendOf(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values;
  const xm = (n - 1) / 2;
  const ym = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((v, i) => {
    num += (i - xm) * (v - ym);
    den += (i - xm) * (i - xm);
  });
  const slope = den ? num / den : 0;
  return values.map((_, i) => Math.max(0, ym + slope * (i - xm)));
}

function Drawing({ labels, long, values, company, label, W, H, small }: Props & { W: number; H: number }) {
  const L = small ? 34 : R.chart.padL;
  const Rr = small ? 10 : R.chart.padR;
  const T = small ? 10 : R.chart.padT;
  const B = small ? 22 : R.chart.padB;
  const all = [...values, ...(company ?? [])];
  const top = Math.max(10, Math.ceil((Math.max(...all, 0) * 1.12) / 10) * 10);
  const n = labels.length;
  const x = (i: number) => L + (n === 1 ? (W - L - Rr) / 2 : (i * (W - L - Rr)) / (n - 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const step = small ? Math.ceil(n / 3) : W < 500 ? 3 : 2;
  const trend = trendOf(values);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={label}>
      {[0, top / 2, top].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - Rr} y1={y(v)} y2={y(v)} stroke="currentColor" className={R.chart.gridLine} />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" className={R.chart.axisText}>
            {Math.round(v)}%
          </text>
        </g>
      ))}
      {labels.map((l, i) =>
        i % step === 0 || i === n - 1 ? (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className={R.chart.axisText}>
            {l}
          </text>
        ) : null
      )}
      {company ? <path d={path(company)} fill="none" strokeWidth={1.75} strokeLinejoin="round" className="stroke-brand-gold" /> : null}
      <path d={path(values)} fill="none" strokeWidth={small ? 2.5 : 3} strokeLinecap="round" strokeLinejoin="round" className="stroke-brand-lea dark:stroke-brand-sweet" />
      <path d={path(trend)} fill="none" strokeWidth={1.5} strokeDasharray="6 5" className="stroke-brand-lea opacity-80 dark:stroke-brand-sweet" />
      {small
        ? null
        : values.map((v, i) => (
            <circle
              key={i}
              cx={x(i)}
              cy={y(v)}
              r={i === n - 1 ? 4.5 : 3}
              className={i === n - 1 ? "fill-brand-gold" : "fill-brand-lea dark:fill-brand-sweet"}
            >
              {/* One string, not three text nodes: React 19 treats <title> children
                  specially, and split text failed hydration. */}
              <title>{`${long[i]}: ${v}%`}</title>
            </circle>
          ))}
    </svg>
  );
}

export function TurnoverChart(props: Props) {
  if (props.small) return <Drawing {...props} W={320} H={150} />;
  return (
    <>
      <div className="hidden sm:block">
        <Drawing {...props} W={R.chart.W} H={R.chart.H} />
      </div>
      <div className="sm:hidden">
        <Drawing {...props} W={360} H={220} />
      </div>
    </>
  );
}

export function TurnoverLegend({ withCompany }: { withCompany: boolean }) {
  return (
    <div className={R.legend}>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-lea dark:bg-brand-sweet" />
        {withCompany ? "Department" : "Company"}
      </span>
      {withCompany ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-gold" />
          Company
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-3.5 border-t-2 border-dashed border-brand-lea dark:border-brand-sweet" />
        Trend
      </span>
    </div>
  );
}
