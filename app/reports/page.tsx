import { ReportsGlance, type GlanceData } from "@/components/reports/ReportsGlance";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { getRollingTurnover } from "@/lib/data/rolling-turnover";
import { getHeadcountHistory } from "@/lib/data/headcount-history";
import { getFleetStaffing } from "@/lib/data/fleet-staffing";
import { getTravelSpendReport } from "@/lib/data/travel";
import { getQualityOfHire } from "@/lib/quality-of-hire/report";
import { DECIDED, categorize } from "@/lib/quality-of-hire/categories";
import { DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";
import { early } from "@/lib/quality-of-hire/summary";

export const dynamic = "force-dynamic";

// Reports > At a glance. Only the figures travel to the browser, never the rosters
// behind them: Headcount's history names past employees, and Hire quality (admins
// only) names why people left.
export default async function ReportsGlancePage() {
  const { role } = await requireModulePageAccess("reports");
  const isHr = role === "ADMIN";
  const [turnover, headcount, staffing, travel, qoh] = await Promise.all([
    getRollingTurnover(),
    getHeadcountHistory(),
    getFleetStaffing(),
    getTravelSpendReport(),
    isHr ? getQualityOfHire() : Promise.resolve(null)
  ]);

  const today = headcount.years.find((y) => y.isToday) ?? null;
  const lastYearEnd = today ? headcount.years.find((y) => y.year === today.year - 1) ?? null : null;

  // The year Hiring travel opens on: this one (a booked future trip never takes it over).
  const thisYear = Number(new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TIMEZONE, year: "numeric" }).format(new Date()));
  const yearTrips = travel.trips.filter((t) => t.year === thisYear);
  const travelTotal = yearTrips.reduce((s, t) => s + t.total, 0);

  // Hire quality's own "everyone, all years" view: contractors at hire left out.
  const hires = qoh ? qoh.hires.filter((h) => !h.contractor) : [];
  const cats = hires.map((h) => categorize(h).category);
  const count = (c: string) => cats.filter((x) => x === c).length;
  const decided = DECIDED.reduce((s, c) => s + count(c), 0);

  const data: GlanceData = {
    turnover,
    headcount: today
      ? {
          today: today.employees,
          pilots: today.pilots,
          others: today.employees - today.pilots,
          change: today.employees - (lastYearEnd?.employees ?? today.employees),
          sinceYear: today.year - 1
        }
      : null,
    seats: { filled: staffing.totals.filled, target: staffing.totals.target, open: staffing.totals.open, training: staffing.totals.training },
    travel: yearTrips.length
      ? {
          year: thisYear,
          total: travelTotal,
          trips: yearTrips.length,
          hiredShare: travelTotal ? yearTrips.filter((t) => t.hired).reduce((s, t) => s + t.total, 0) / travelTotal : null
        }
      : null,
    quality: qoh
      ? {
          leftEarly: early(hires),
          since: hires.length ? Math.min(...hires.map((h) => h.year)) : null,
          good: count("GOOD"),
          bad: count("BAD"),
          regretted: count("REGRETTED"),
          decided
        }
      : null
  };

  return <ReportsGlance data={data} />;
}
