import { prisma } from "@/lib/prisma";
import { seatOf } from "@/lib/data/employee-journey";
import { periodsOf } from "@/lib/data/headcount-history";
import { isTestTagged } from "@/lib/testdata/markers";
import { latestBatch, type StoredBatch, type CalendarInterview, type ExitRow, type InterviewKind, type QohSource, type Voluntary } from "@/lib/quality-of-hire/imports";

// ---------------------------------------------------------------------------
// Quality of Hire - the Reports tab, Q4 2026 rock. His brief, 2026-10-27: use
// Journey and Paycom data to find past good and bad hires and learn from them;
// the measures he named are interviews per candidate, time from application to
// offer, how often offers are turned down, and early turnover. Protected
// characteristics stay out of it entirely - nothing here reads them.
//
// The rules are the baseline script's (scripts/qoh/qoh-baseline.cjs, committed
// 3aa7ec7), so the tab and the baseline cannot disagree:
//
//   A hire is one employment period, placed exactly as Headcount & Tenure places
//     people (periodsOf); a rehire counts again. Canceled and TEST records never count.
//   Left within 90 days / a year - only for hires old enough to have been measured,
//     and never for an exit dated by a yearly roster (Dec 31 up to 2022), whose real
//     last day is some time the next year.
//   Contractors at hire are listed but left out of every rate.
//   Pilot - the role at hire holds a seat (seatOf, as Headcount uses) or is a plain
//     "Pilot"; no role at hire in a plainly ground department is a non-pilot.
//   The application behind a hire - applied within a year of starting (hired or
//     signed first), else a signed offer on an older application.
//   Days application -> offer - only when that application was within the year and
//     the offer was a real one (not the 2026-07-20 backfill).
//   Interviews - the uploaded calendar file where it searched the hire, and the
//     interviews logged in the app (completed, not the offer call, not Jazz's one
//     evaluation form); the larger of the two, so neither double-counts the other.
//   Voluntary / involuntary - Paycom's Term Type, else its older Term Reason where
//     the meaning is plain, else HR's sheet. Unknown stays unknown.
// ---------------------------------------------------------------------------

const DAY = 86_400_000;
const FROM_YEAR = 2021; // Paycom's terminations start Dec 2021; earlier exits are roster-dated
const ROSTER_EXIT_LAST_YEAR = 2022;
const OFFER_BACKFILL_DAY = Date.UTC(2026, 6, 20);
/** The CEO's calendar id in the calendar file - "met Cory before hire" on the report. */
export const CEO_INTERVIEWER = "cb";
/** An exit row belongs to the hire period whose last day is within this of its term date. */
const EXIT_MATCH_DAYS = 45;

const NON_FLIGHT_DEPT = /fbo|accounting|finance|maintenance|\bmx\b|sales|marketing|human resources|safety|skyops|detailing|svr/i;

export type QohHire = {
  id: string;
  name: string;
  start: string;
  end: string | null;
  year: number;
  rehire: boolean;
  contractor: boolean;
  pilot: "Pilot" | "Non-pilot" | "Role not recorded";
  department: string;
  role: string | null;
  tenureDays: number;
  stillHere: boolean;
  /** The last day came from a yearly roster, so "within N days" cannot be answered. */
  rosterExit: boolean;
  /** The last day is Paycom's, standing in for a roster's Dec 31. */
  endFromPaycom: boolean;
  left90: 0 | 1 | null;
  left365: 0 | 1 | null;
  daysApplyToOffer: number | null;
  daysApplyToStart: number | null;
  /** null = nothing searched this hire (before the calendar file, and no app interviews). */
  interviews: number | null;
  interviewsFrom: "calendar" | "app" | null;
  kinds: Record<InterviewKind, number>;
  metCeo: boolean;
  /** Each interview counted, oldest first. App-logged ones carry no interviewer handles. */
  interviewList: Array<{ date: string; kind: InterviewKind; interviewers: string[] }>;
  voluntary: Voluntary | null;
  reason: string | null;
  typedFrom: ExitRow["typedFrom"];
};

export type QohMismatch = { id: string | null; name: string; paycomLeft: string | null; journey: string };

export type QohOfferYear = { year: number; reached: number; accepted: number; declined: number; rescinded: number; open: number };

export type QohImportInfo = { id: string; file: string; savedAt: string; uploadedBy: string | null; rows: number; matched: number } | null;

export type QualityOfHire = {
  asOf: string;
  hires: QohHire[];
  offers: QohOfferYear[];
  declineReasons: Array<{ reason: string; count: number }>;
  neverStarted: number;
  /** Paycom's leavers whose last day Journey does not have. */
  mismatches: QohMismatch[];
  imports: Record<QohSource, QohImportInfo>;
  /** The span of hires the calendar file searched, for saying what it covers. */
  calendarSpan: { from: string; to: string } | null;
  /** The calendar file's interviewer handles ("dcarter") to a person, where one has exactly that
      SkyShare address. A handle nobody has stays a handle - never a guessed name. */
  interviewers: Record<string, { name: string; id: string | null }>;
};

const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const days = (a: Date, b: Date) => Math.round((day(b) - day(a)) / DAY);

type Span = { startDate: Date; endDate: Date | null };
const covers = (p: Span, d: Date) => day(p.startDate) <= day(d) && (!p.endDate || day(p.endDate) >= day(d));

type Role = { title: string; seat: string | null; fleetPositionSlug: string | null; department: string | null; startDate: Date; endDate: Date | null };
function isPilotRole(r: Role): boolean {
  if (seatOf(r) !== null) return true;
  return /\bpilot\b/i.test(r.title) && !/\b(maintenance|mechanic|technician|dispatch|coordinator|scheduler|scheduling|recruit\w*|trainer)\b/i.test(r.title);
}
function roleOn(roles: Role[], d: Date): Role | null {
  let best: Role | null = null;
  for (const r of roles) if (covers(r, d) && (!best || r.startDate > best.startDate)) best = r;
  return best;
}

type App = {
  id: string;
  candidateId: string;
  appliedAt: Date | null;
  status: string | null;
  stage: string | null;
  disposition: string | null;
  offerStatus: string | null;
  offerSentAt: Date | null;
  offerSignedAt: Date | null;
  offerDeclinedAt: Date | null;
  offerDeclineReason: string | null;
};
const hiredLike = (a: App) => a.status === "Hired" || a.stage === "Hired" || a.disposition === "HIRED";
const offerSigned = (a: App) => a.offerStatus === "SIGNED" || a.offerStatus === "STARTED" || !!a.offerSignedAt;
const offerDeclined = (a: App) =>
  !hiredLike(a) && (a.offerStatus === "DECLINED" || !!a.offerDeclinedAt || a.status === "Declined Offer" || a.disposition === "Declined Offer");
const offerRescinded = (a: App) => a.offerStatus === "NOT_SENT" || a.status === "Rescind Offer";
const offerIsBackfill = (a: App) =>
  !!a.offerSentAt && day(a.offerSentAt) === OFFER_BACKFILL_DAY && !!a.offerSignedAt && a.offerSignedAt.getTime() === a.offerSentAt.getTime();
const declineReason = (a: App) =>
  (a.offerDeclineReason ?? "").trim() || (a.disposition && !/^(declined offer|offer)$/i.test(a.disposition) ? a.disposition : "") || "No reason recorded";
const isCancelled = (s: string | null) => /cancel|no.?show|declin|resched/i.test(s ?? "");

function group<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

// The app's interview types, in the calendar file's four kinds.
const APP_KIND: Record<string, InterviewKind> = {
  RECRUITER_SCREEN: "recruiter_screen",
  HIRING_MANAGER: "manager_video",
  TECHNICAL: "manager_video",
  PANEL: "manager_video",
  FINAL: "manager_video",
  SIM_EVAL: "in_person",
  OTHER: "other"
};

const zeroKinds = (): Record<InterviewKind, number> => ({ recruiter_screen: 0, manager_video: 0, in_person: 0, other: 0 });

type Saved<T> = (StoredBatch<T> & { id: string }) | null;
/** Files to use in place of the saved ones - a dry run of an upload, never stored. */
export type QohOverride = { terminations?: Saved<ExitRow>; termTypes?: Saved<ExitRow>; interviews?: Saved<CalendarInterview> };

export async function getQualityOfHire(now: Date = new Date(), override: QohOverride = {}): Promise<QualityOfHire> {
  const [people, apps, interviews, terminations, termTypes, calendar] = await Promise.all([
    prisma.newHire.findMany({
      where: { canceled: false },
      select: {
        id: true,
        name: true,
        tags: true,
        department: true,
        employmentStatus: true,
        startDate: true,
        terminationDate: true,
        candidateId: true,
        ssEmail: true,
        offerSentDate: true,
        offerSignedDate: true,
        employmentStints: { select: { startDate: true, endDate: true } },
        roleAssignments: { select: { title: true, seat: true, fleetPositionSlug: true, department: true, startDate: true, endDate: true } },
        contractPeriods: { select: { startDate: true, endDate: true } }
      }
    }),
    prisma.candidateApplication.findMany({
      select: {
        id: true, candidateId: true, appliedAt: true, status: true, stage: true, disposition: true,
        offerStatus: true, offerSentAt: true, offerSignedAt: true, offerDeclinedAt: true, offerDeclineReason: true
      }
    }),
    prisma.interview.findMany({
      where: { status: "COMPLETED", NOT: [{ source: "seed-demo" }, { source: "JAZZ" }, { interviewType: "OFFER" }] },
      select: { candidateId: true, interviewType: true, startDateTime: true, outcome: true }
    }),
    "terminations" in override ? override.terminations ?? null : latestBatch<ExitRow>("terminations"),
    "termTypes" in override ? override.termTypes ?? null : latestBatch<ExitRow>("termTypes"),
    "interviews" in override ? override.interviews ?? null : latestBatch<CalendarInterview>("interviews")
  ]);
  const neverStarted = (await prisma.newHire.findMany({ where: { canceled: true }, select: { tags: true } })).filter((h) => !isTestTagged(h.tags)).length;

  const appsBy = group(apps, (a) => a.candidateId);
  const ivBy = group(interviews, (i) => i.candidateId);
  const exitsBy = group([...(terminations?.rows ?? []).map((r) => ({ ...r, file: "paycom" as const })), ...(termTypes?.rows ?? []).map((r) => ({ ...r, file: "hr" as const }))], (r) => r.newHireId);
  const calBy = group(calendar?.rows ?? [], (r) => `${r.newHireId}|${r.startDate}`);
  const usedPaycom = new Set<unknown>();
  const calStarts = (calendar?.rows ?? []).map((r) => r.startDate).sort();
  const calendarSpan = calStarts.length ? { from: calStarts[0], to: calStarts[calStarts.length - 1] } : null;

  const hires: QohHire[] = [];
  for (const h of people) {
    if (isTestTagged(h.tags)) continue;
    const roles = [...h.roleAssignments].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const periods = periodsOf(h)
      .map((p) => ({ startDate: p.start, endDate: p.end }))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const contractorOn = (d: Date) =>
      h.contractPeriods.some((c) => covers(c, d)) ||
      (h.contractPeriods.length === 0 && h.employmentStatus === "CONTRACT" && periods.some((p) => !p.endDate && covers(p, d)));
    const myApps = h.candidateId ? appsBy.get(h.candidateId) ?? [] : [];
    const myIvs = h.candidateId ? ivBy.get(h.candidateId) ?? [] : [];

    periods.forEach((p, idx) => {
      const start = p.startDate;
      if (start.getUTCFullYear() < FROM_YEAR || day(start) > day(now)) return;
      let end = p.endDate;
      if (end && day(end) < day(start)) return; // a data error, left out as the baseline does
      let rosterExit = !!end && day(end) <= day(now) && end.getUTCMonth() === 11 && end.getUTCDate() === 31 && end.getUTCFullYear() <= ROSTER_EXIT_LAST_YEAR;
      // A roster's Dec 31 is only "gone by the next list". Paycom has the real last day
      // for anybody who left from Dec 2021 on (Kris Carley: roster 2022-12-31, Paycom
      // 2022-01-02), so where it has one inside that roster year or the next, use it.
      let endFromPaycom = false;
      if (rosterExit && end) {
        const rosterYear = end.getUTCFullYear();
        const real = (exitsBy.get(h.id) ?? []).find(
          (r) => r.file === "paycom" && r.termDate && dayOf(r.termDate) >= day(start) && [rosterYear, rosterYear + 1].includes(Number(r.termDate.slice(0, 4)))
        );
        if (real?.termDate) {
          end = new Date(dayOf(real.termDate));
          rosterExit = false;
          endFromPaycom = true;
        }
      }
      const left = !!end && day(end) <= day(now);
      const tenureDays = days(start, left && end ? end : now);
      const leftWithin = (n: number): 0 | 1 | null => {
        if (day(start) > day(now) - n * DAY) return null;
        if (!left || tenureDays > n) return 0;
        return rosterExit ? null : 1;
      };

      const role = roleOn(roles, start) ?? roles.find((r) => Math.abs(day(r.startDate) - day(start)) <= 60 * DAY && (!end || day(r.startDate) <= day(end))) ?? null;
      const department = role?.department || h.department || "";
      const pilot = role ? (isPilotRole(role) ? "Pilot" : "Non-pilot") : NON_FLIGHT_DEPT.test(department) ? "Non-pilot" : "Role not recorded";

      // the application behind this hire
      const appliedIn = (a: App, lo: number, hi: number) => !!a.appliedAt && day(a.appliedAt) >= day(start) - lo * DAY && day(a.appliedAt) <= day(start) + hi * DAY;
      const latest = (arr: App[]) => [...arr].sort((a, b) => (b.appliedAt?.getTime() ?? 0) - (a.appliedAt?.getTime() ?? 0))[0];
      const recent = myApps.filter((a) => appliedIn(a, 365, 7));
      const recentHired = recent.filter((a) => hiredLike(a) || offerSigned(a));
      const oldOffer = myApps.filter((a) => offerSigned(a) && appliedIn(a, 1500, 7) && (!a.offerSignedAt || Math.abs(day(a.offerSignedAt) - day(start)) <= 240 * DAY));
      const oldHired = myApps.filter((a) => hiredLike(a) && appliedIn(a, 720, 7));
      const app = recentHired.length ? latest(recentHired) : recent.length ? latest(recent) : oldOffer.length ? latest(oldOffer) : oldHired.length ? latest(oldHired) : null;
      const timingOk = !!app && recent.includes(app);
      const applied = app?.appliedAt ?? null;
      const beforeStart = (d: Date | null) => !!d && day(d) <= day(start) + 7 * DAY;
      let offerSent: Date | null = null;
      if (app?.offerSentAt && offerSigned(app) && !offerIsBackfill(app) && beforeStart(app.offerSentAt)) offerSent = app.offerSentAt;
      else if (h.offerSentDate && beforeStart(h.offerSentDate) && day(start) - day(h.offerSentDate) <= 240 * DAY) offerSent = h.offerSentDate;

      // interviews: the calendar where it searched, the app's own log, the larger
      const lo = applied ? day(applied) - DAY : day(start) - 365 * DAY;
      const appIvs = app
        ? myIvs.filter((i) => day(i.startDateTime) >= lo && day(i.startDateTime) <= day(start) && !isCancelled(i.outcome))
        : [];
      const cal = calBy.get(`${h.id}|${iso(start)}`);
      const calIvs = (cal ?? []).filter((r) => r.kind !== "none");
      const kinds = zeroKinds();
      let interviewsFrom: QohHire["interviewsFrom"] = null;
      let count: number | null = null;
      let interviewList: QohHire["interviewList"] = [];
      if (cal && calIvs.length >= appIvs.length) {
        for (const r of calIvs) kinds[r.kind as InterviewKind] += 1;
        count = calIvs.length;
        interviewsFrom = "calendar";
        interviewList = calIvs.map((r) => ({ date: r.date ?? "", kind: r.kind as InterviewKind, interviewers: r.interviewers }));
      } else if (appIvs.length || cal) {
        for (const i of appIvs) kinds[APP_KIND[i.interviewType] ?? "other"] += 1;
        count = appIvs.length;
        interviewsFrom = "app";
        interviewList = appIvs.map((i) => ({ date: iso(i.startDateTime), kind: APP_KIND[i.interviewType] ?? "other", interviewers: [] }));
      }

      // exit: the Paycom or HR row nearest this period's last day
      let exit: { voluntary: Voluntary | null; reason: string | null; typedFrom: ExitRow["typedFrom"] } = { voluntary: null, reason: null, typedFrom: null };
      if (left && end) {
        const near = (exitsBy.get(h.id) ?? []).filter((r) => r.termDate && Math.abs(dayOf(r.termDate) - day(end as Date)) <= EXIT_MATCH_DAYS * DAY);
        for (const r of near) if (r.file === "paycom") usedPaycom.add(r);
        const pick = near.find((r) => r.file === "paycom" && r.voluntary) ?? near.find((r) => r.file === "hr" && r.voluntary) ?? near.find((r) => r.reason) ?? null;
        if (pick) exit = { voluntary: pick.voluntary, reason: pick.reason, typedFrom: pick.typedFrom };
      }

      hires.push({
        id: h.id,
        name: h.name,
        start: iso(start),
        end: left && end ? iso(end) : null,
        year: start.getUTCFullYear(),
        rehire: idx > 0,
        contractor: contractorOn(start),
        pilot,
        department,
        role: role?.title ?? null,
        tenureDays,
        stillHere: !left,
        rosterExit,
        endFromPaycom,
        left90: leftWithin(90),
        left365: leftWithin(365),
        daysApplyToOffer: timingOk && applied && offerSent ? days(applied, offerSent) : null,
        daysApplyToStart: timingOk && applied ? days(applied, start) : null,
        interviews: count,
        interviewsFrom,
        kinds,
        metCeo: calIvs.some((r) => r.interviewers.includes(CEO_INTERVIEWER)),
        interviewList: interviewList.sort((a, b) => (a.date < b.date ? -1 : 1)),
        ...exit
      });
    });
  }
  hires.sort((a, b) => (a.start < b.start ? 1 : -1));

  // Paycom says they left and no employment period in Journey ends near that day -
  // usually a leaver Journey has not been told about yet. Listed, never fixed here.
  const names = new Map(people.map((p) => [p.id, { name: p.name, ends: periodsOf(p).map((x) => (x.end ? iso(x.end) : "still here")) }]));
  const mismatches: QohMismatch[] = (exitsBy.get(null) ?? [])
    .filter((r) => r.file === "paycom")
    .map((r) => ({ id: null, name: r.label, paycomLeft: r.termDate, journey: "no matching person" }));
  for (const [id, rows] of exitsBy) {
    if (!id) continue;
    for (const r of rows) {
      if (r.file !== "paycom" || usedPaycom.has(r) || !r.termDate) continue;
      const who = names.get(id);
      // a pre-2021 hire is outside this report, not a mismatch, when Journey's own end agrees
      if (who?.ends.some((e) => e !== "still here" && Math.abs(dayOf(e) - dayOf(r.termDate as string)) <= EXIT_MATCH_DAYS * DAY)) continue;
      mismatches.push({ id, name: who?.name ?? r.label, paycomLeft: r.termDate, journey: who?.ends.join(", ") || "no employment dates" });
    }
  }

  // Offers - every application that reached one, by the year applied. A candidate who
  // started within a year of applying accepted, whatever the application says; one row
  // per candidate per year, the best outcome.
  const startsBy = new Map<string, number[]>();
  for (const h of people) {
    if (!h.candidateId || isTestTagged(h.tags)) continue;
    startsBy.set(h.candidateId, periodsOf(h).map((p) => day(p.start)));
  }
  const started = (a: App) => !!a.appliedAt && (startsBy.get(a.candidateId) ?? []).some((s) => s >= day(a.appliedAt as Date) && s <= day(a.appliedAt as Date) + 365 * DAY);
  type Outcome = "accepted" | "declined" | "rescinded" | "open";
  const outcome = (a: App): Outcome | null =>
    hiredLike(a) || offerSigned(a) || started(a) ? "accepted" : offerDeclined(a) ? "declined" : offerRescinded(a) ? "rescinded" : a.offerStatus === "SENT" || a.status === "Offered" ? "open" : null;
  const rank: Record<Outcome, number> = { accepted: 3, declined: 2, rescinded: 1, open: 0 };
  const byYear = new Map<number, Map<string, Outcome>>();
  const reasons = new Map<string, number>();
  for (const a of apps) {
    const o = outcome(a);
    const when = a.appliedAt ?? a.offerSentAt;
    if (!o || !when || when.getUTCFullYear() < 2000) continue;
    const y = when.getUTCFullYear();
    const m = byYear.get(y) ?? byYear.set(y, new Map()).get(y)!;
    const prev = m.get(a.candidateId);
    if (!prev || rank[o] > rank[prev]) m.set(a.candidateId, o);
    if (o === "declined") reasons.set(declineReason(a), (reasons.get(declineReason(a)) ?? 0) + 1);
  }
  const offers: QohOfferYear[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, m]) => {
      const n = (o: Outcome) => [...m.values()].filter((x) => x === o).length;
      return { year, reached: m.size, accepted: n("accepted"), declined: n("declined"), rescinded: n("rescinded"), open: n("open") };
    });

  type Saved = { id: string; file: string; savedAt: string; uploadedBy: string | null; rows: Array<{ newHireId: string | null }> } | null;
  const info = (b: Saved): QohImportInfo =>
    b ? { id: b.id, file: b.file, savedAt: b.savedAt, uploadedBy: b.uploadedBy, rows: b.rows.length, matched: b.rows.filter((r) => r.newHireId).length } : null;

  // interviewer handles: a person's SkyShare address, else a login's; exact only
  const handles = new Set((calendar?.rows ?? []).flatMap((r) => r.interviewers));
  const interviewers: QualityOfHire["interviewers"] = {};
  const handleOf = (email: string | null) => (email && /@skyshare.com$/i.test(email.trim()) ? email.trim().toLowerCase().split("@")[0] : null);
  for (const p of people) {
    const h = handleOf(p.ssEmail);
    if (h && handles.has(h) && !isTestTagged(p.tags)) interviewers[h] = { name: p.name, id: p.id };
  }
  const users = await prisma.user.findMany({ where: { email: { endsWith: "@skyshare.com", mode: "insensitive" } }, select: { email: true, name: true } });
  for (const u of users) {
    const h = handleOf(u.email);
    if (h && handles.has(h) && !interviewers[h] && u.name) interviewers[h] = { name: u.name, id: null };
  }

  return {
    asOf: now.toISOString(),
    hires,
    offers,
    declineReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    neverStarted,
    mismatches,
    imports: { terminations: info(terminations), termTypes: info(termTypes), interviews: info(calendar) },
    calendarSpan,
    interviewers
  };
}
