import Link from "next/link";
import { R } from "@/components/reports/report-ui";
import type { DepartmentBudgets as Data, PersonRef } from "@/lib/data/values-in-action";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function People({ people, viaSupervisor = false }: { people: PersonRef[]; viaSupervisor?: boolean }) {
  if (!people.length) return <span className={R.muted}>Nobody yet</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {people.map((p, i) => (
        <span key={p.id}>
          <Link href={`/people/${p.id}`} className={R.link}>
            {p.name}
          </Link>
          {i < people.length - 1 ? <span className={R.muted}>,</span> : null}
        </span>
      ))}
      {viaSupervisor ? (
        <span className={R.chip} title="No manager sits in this department, so the team's supervisor spends its budget">
          supervisor
        </span>
      ) : null}
    </span>
  );
}

/**
 * Values in Action department budgets for one quarter. Each department's budget
 * is its headcount on the quarter's first day x the per-person rate, and every
 * manager in the department draws from it.
 */
export function DepartmentBudgets({ data }: { data: Data }) {
  const first = shortDay(data.quarter.startDay);

  return (
    <section className={R.panel} aria-labelledby="via-budgets-title">
      <div className={R.header}>
        <div>
          <p className={R.eyebrow}>Values in Action</p>
          <h2 id="via-budgets-title" className={R.title}>
            Department budgets · {data.quarter.label}
          </h2>
          <p className={R.lede}>
            Each department gets <span className={R.term}>{usd.format(data.perPersonUsd)} per employee</span> for the
            quarter, counted on {first}. Full and part time count; contractors and no-starts do not. Every manager in
            a department shares its budget; where no manager sits in a department, the team&apos;s supervisor spends
            it.
          </p>
        </div>
      </div>

      <div className={R.hero}>
        <div className={R.heroRow}>
          <span className={R.heroFigure}>{usd.format(data.totalBudgetUsd)}</span>
          <span className={R.heroText}>
            to recognize people with this quarter, across {data.departments.filter((d) => d.headcount > 0).length}{" "}
            departments
          </span>
        </div>
        <p className={R.heroSub}>
          {data.totalHeadcount} employees on {first} × {usd.format(data.perPersonUsd)}
        </p>
      </div>

      <div className={R.tiles}>
        <div className={R.tile}>
          <p className={R.tileLabel}>Employees counted</p>
          <p className={R.tileValue}>{data.totalHeadcount}</p>
          <p className={R.tileSub}>on {first}</p>
        </div>
        <div className={R.tile}>
          <p className={R.tileLabel}>Managers</p>
          <p className={R.tileValue}>{data.managerCount}</p>
          <p className={R.tileSub}>supervise at least one employee</p>
        </div>
        <div className={R.tile}>
          <p className={R.tileLabel}>Spent by a supervisor</p>
          <p className={R.tileValue}>{data.spentBySupervisors.length}</p>
          <p className={R.tileSub}>
            departments with no manager inside
            {data.withoutManager.length > 0 ? ` · ${data.withoutManager.length} with nobody` : ""}
          </p>
        </div>
        <div className={R.tile}>
          <p className={R.tileLabel}>Spelled two ways</p>
          <p className={R.tileValue}>{data.likelyDuplicates.length}</p>
          <p className={R.tileSub}>possible duplicate departments</p>
        </div>
      </div>

      {data.withoutManager.length > 0 || data.likelyDuplicates.length > 0 ? (
        <div className={R.note}>
          {data.withoutManager.length > 0 ? (
            <p>
              <span className={R.strong}>Nobody can spend:</span> {data.withoutManager.join(", ")}. No manager sits
              there and none of its current employees has a supervisor on file.
            </p>
          ) : null}
          {data.likelyDuplicates.length > 0 ? (
            <p className={data.withoutManager.length > 0 ? "mt-1" : undefined}>
              <span className={R.strong}>Possibly the same department:</span>{" "}
              {data.likelyDuplicates.map((g) => g.join(" / ")).join("; ")}. Budgets follow each profile&apos;s
              department exactly as written, so fixing the spelling on the profiles merges them.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={R.box}>
        <p className={R.sectionLabel}>By department</p>

        {/* Phone: one card per department. */}
        <ul className="mt-2 space-y-2 sm:hidden">
          {data.departments.map((d) => (
            <li key={d.department} className={R.tile}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={R.listTitle}>{d.department}</p>
                <p className="text-sm font-semibold tabular-nums text-brand-lea dark:text-slate-100">{usd.format(d.budgetUsd)}</p>
              </div>
              <p className={R.tileSub}>{d.headcount} employees</p>
              <div className="mt-1 text-sm">
                <People people={d.spenders} viaSupervisor={d.spentBySupervisors} />
              </div>
            </li>
          ))}
        </ul>

        {/* Wider screens: the table. */}
        <div className={`${R.tableWrap} hidden sm:block`}>
          <table className={R.table}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Department</th>
                <th className={`${R.th} text-right`}>Employees</th>
                <th className={`${R.th} text-right`}>Budget</th>
                <th className={R.th}>Who can spend it</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {data.departments.map((d) => (
                <tr key={d.department} className={R.tr}>
                  <td className={`${R.td} font-semibold text-brand-lea dark:text-slate-100`}>{d.department}</td>
                  <td className={R.num}>{d.headcount}</td>
                  <td className={R.num}>{usd.format(d.budgetUsd)}</td>
                  <td className={R.td}>
                    <People people={d.spenders} viaSupervisor={d.spentBySupervisors} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className={R.footnote}>
        Counted from employment history where it exists, otherwise each profile&apos;s start and last day.
        {data.countedWithoutStartDate.length > 0
          ? ` ${data.countedWithoutStartDate.length} current employees have no start date on file and are counted as already working on ${first}.`
          : ""}{" "}
        Whether unused budget rolls over, and borrowing from next quarter, are still to be decided.
      </p>
    </section>
  );
}
