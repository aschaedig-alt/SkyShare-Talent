// Quality of Hire — baseline pull. READ ONLY: one READ ONLY transaction, SELECTs only.
// Run from the project folder:   node scripts/qoh/qoh-baseline.cjs
// Writes to scripts/_qoh_output/ (git-ignored): qoh-baseline.md, qoh-hires.csv, qoh-offers.csv
//
// Every hire = one employment period (a rehire counts again). Each hire is joined to its
// candidate record (NewHire.candidateId) to pick up the application, interviews, offer and
// source that led to it. Outcomes come from the period itself: did they leave, and how soon.
// What the app does NOT hold — voluntary vs involuntary, termination reason, rehire
// eligibility, performance — gets blank columns in qoh-hires.csv to fill from Paycom.
//
// WHO IS ON STAFF follows the Reports > Headcount & Tenure rules (lib/data/headcount-history.ts)
// so the two cannot disagree: periods are EmploymentStints, else the span of the person's
// roles, else start -> termination date; canceled and TEST-tagged records never count; dates
// compare as calendar days; a contractor on a date is a ContractPeriod covering it, or CONTRACT
// status with no contract history at all on an open period. Checked 2026-10-27: hires per year
// match the report exactly 2015-2025.
//
// WHAT THE DATA CAN AND CANNOT SAY (measured 2026-10-27, see the handoff for the queries):
//   - 2018-2022 departures mostly come from yearly rosters and are dated Dec 31 of the year the
//     person was last listed; the real last day is some time in the following year. Those exits
//     only ever answer "stayed longer than N days" — never "left within N days".
//   - Applications start 2023-06 (Jazz) and 2025-02 (Paycom). Hires before that have none.
//   - Jazz "interviews" are one imported evaluation form per candidate, not an interview count.
//     Real interview logging in the app starts 2025-08.
//   - Offer tracking in the app starts 2026-07-20; that day's sent = signed rows are a backfill.
//   - recruiterName and hiringManager are empty on every application.

const path = require("path");
const fs = require("fs");

const DAY = 86400000;
const TODAY = new Date();
const RECENT_FROM_YEAR = Number(process.env.QOH_FROM_YEAR || 2021); // segment tables use hires from this year on
const ROSTER_EXIT_LAST_YEAR = 2022; // a Dec 31 last day up to this year is a yearly-roster date, not a real one
const OFFER_BACKFILL_DAY = Date.UTC(2026, 6, 20); // offers recorded sent = signed on this day were backfilled
const TEST_TAG = "TEST"; // lib/testdata/markers.ts

// ---------- helpers ----------
const d = (x) => (x ? new Date(x) : null);
const day = (x) => {
  const t = new Date(x);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
};
const iso = (x) => (x ? new Date(x).toISOString().slice(0, 10) : "");
const days = (a, b) => (a && b ? Math.round((day(b) - day(a)) / DAY) : null);
const pct = (n, dnm) => (dnm ? `${Math.round((100 * n) / dnm)}%` : "–");
const median = (arr) => {
  const v = arr.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};
const mean1 = (arr) => {
  const v = arr.filter((x) => x != null && Number.isFinite(x));
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "–";
};
// calendar-day cover, as headcount-history.ts covers()
const covers = (p, when) => {
  const t = day(when);
  return day(p.startDate) <= t && (!p.endDate || day(p.endDate) >= t);
};
const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols) => [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n");
const mdTable = (head, rows) =>
  [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

// Same key as lib/sources/normalize.ts sourceKey()
function sourceKey(raw) {
  if (!raw) return null;
  let s = String(raw).toLowerCase().trim();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  s = s.replace(/^(?:l|m|lm)\.(?=[a-z])/, "");
  s = s.replace(/\.com$/, "");
  s = s.replace(/[^a-z0-9]/g, "");
  return s || null;
}

// Pilot role, as headcount-history.ts isPilotRole() over employee-journey.ts seatOf()
const GROUND = /\b(maintenance|mechanic|technician|amt|avionics|detailer|detailing|line service|inspector|parts|dispatch|coordinator)\b/i;
function isPilotRole(r) {
  const title = r.title || "";
  if (!GROUND.test(title)) {
    if (/^(PIC|SIC)$/i.test(r.seat || "")) return true;
    if (/(captain|first-officer)$/.test(r.fleetPositionSlug || "")) return true;
    if (/\b(sic|first officer|f\/?o|second in command|pic|captain|pilot in command)\b/i.test(title)) return true;
  }
  return /\bpilot\b/i.test(title) && !/\b(maintenance|mechanic|technician|dispatch|coordinator|scheduler|scheduling|recruit\w*|trainer)\b/i.test(title);
}

// Employment periods, as headcount-history.ts periodsOf()
function periodsOf(h, stints, roles) {
  if (stints.length) return stints.map((s) => ({ startDate: s.startDate, endDate: s.endDate }));
  if (roles.length) {
    const start = new Date(Math.min(...roles.map((r) => new Date(r.startDate).getTime())));
    const open = roles.some((r) => !r.endDate);
    const end = open ? null : new Date(Math.max(...roles.map((r) => new Date(r.endDate).getTime())));
    return [{ startDate: start, endDate: end }];
  }
  return h.startDate ? [{ startDate: h.startDate, endDate: h.terminationDate }] : [];
}

// The role covering a date: the latest-starting one (headcount-history.ts roleOn())
function roleOn(roles, when) {
  let best = null;
  for (const r of roles) if (covers(r, when) && (!best || new Date(r.startDate) > new Date(best.startDate))) best = r;
  return best;
}

// a person with no role recorded is read from their department when it is plainly not flying
const NON_FLIGHT_DEPT = /fbo|accounting|finance|maintenance|\bmx\b|sales|marketing|human resources|safety|skyops|detailing|svr/i;

const isCancelled =(s) => /cancel|no.?show|declin|resched/i.test(s || "");
const wording = (a) => `${a.status || ""} | ${a.stage || ""} | ${a.disposition || ""}`;
const hiredLike = (a) => a.status === "Hired" || a.stage === "Hired" || a.disposition === "HIRED";
const offerSigned = (a) => a.offerStatus === "SIGNED" || a.offerStatus === "STARTED" || !!a.offerSignedAt;
// Paycom keeps "Declined Offer" in status, and when the stage is Withdrew the disposition holds the reason
const offerDeclined = (a) => !hiredLike(a) && (a.offerStatus === "DECLINED" || !!a.offerDeclinedAt || a.status === "Declined Offer" || a.disposition === "Declined Offer");
const offerRescinded = (a) => a.offerStatus === "NOT_SENT" || a.status === "Rescind Offer";
const declineReason = (a) =>
  (a.offerDeclineReason || "").trim() || (a.disposition && !/^(declined offer|offer)$/i.test(a.disposition) ? a.disposition : "") || "No reason recorded";
// the backfill wrote sent and signed as one identical timestamp, on the afternoon of that day
const offerIsBackfill = (a) => !!a.offerSentAt && day(a.offerSentAt) === OFFER_BACKFILL_DAY && !!a.offerSignedAt && new Date(a.offerSignedAt).getTime() === new Date(a.offerSentAt).getTime();

const bucketInterviews = (n) => (n == null ? "No application" : n === 0 ? "0 recorded" : n >= 3 ? "3+" : String(n));
const bucketDays = (n) => (n == null ? "Unknown" : n <= 14 ? "0–14 days" : n <= 30 ? "15–30 days" : n <= 60 ? "31–60 days" : "61+ days");

// ---------- main ----------
async function run(client, outDir) {
  const q = async (sql) => (await client.query(sql)).rows;

  const [hiresAll, stints, roles, contracts, types, apps, interviews, scorecards, aliases, jobs] = [
    await q(`select id, name, "legalName", position, department, "employmentStatus", canceled, tags, "startDate", "terminationDate", "noticeDate", "candidateId", "managedPilot", "offerSentDate", "offerSignedDate" from "NewHire"`),
    await q(`select "newHireId", "startDate", "endDate" from "EmploymentStint"`),
    await q(`select "newHireId", title, seat, aircraft, "fleetPositionSlug", department, "startDate", "endDate", "transitionType" from "RoleAssignment"`),
    await q(`select "newHireId", "startDate", "endDate" from "ContractPeriod"`),
    await q(`select "newHireId", type, "startDate", "endDate" from "EmploymentTypePeriod"`),
    await q(`select id, "candidateId", "jobId", "appliedAt", status, stage, disposition, "rejectionReason", "decidedAt", "trafficSource", "referralSource", "recruiterName", "hiringManager", "historicalJobTitle", origin, "offerStatus", "offerSentAt", "offerSignedAt", "offerDeclinedAt", "offerDeclineReason", "offerNotSentAt", "offerNotSentReason", "offerStartDate" from "CandidateApplication"`),
    await q(`select id, "candidateId", "interviewType", status, "startDateTime", outcome, rating, source from "Interview" where source is distinct from 'seed-demo'`),
    await q(`select "interviewId", recommendation from "InterviewScorecard"`),
    await q(`select key, canonical from "SourceAlias"`),
    await q(`select id, title from "Job"`)
  ];
  const isTest = (h) => (h.tags || []).some((t) => String(t).trim().toUpperCase() === TEST_TAG);
  const hires = hiresAll.filter((h) => !isTest(h));

  const group = (rows, k) => rows.reduce((m, r) => (m.get(r[k]) ? m.get(r[k]).push(r) : m.set(r[k], [r]), m), new Map());
  const stintsBy = group(stints, "newHireId");
  const rolesBy = group(roles, "newHireId");
  const contractBy = group(contracts, "newHireId");
  const typesBy = group(types, "newHireId");
  const appsBy = group(apps, "candidateId");
  const ivBy = group(interviews, "candidateId");
  const scBy = group(scorecards, "interviewId");
  const alias = new Map(aliases.map((a) => [a.key, a.canonical]));
  const jobTitle = new Map(jobs.map((j) => [j.id, j.title]));
  const sourceName = (raw) => {
    const k = sourceKey(raw);
    return k ? alias.get(k) || String(raw).trim() : null;
  };

  // ---------- build one row per hire (period) ----------
  const rows = [];
  const cancelledHires = hires.filter((h) => h.canceled);
  const badPeriods = [];
  for (const h of hires) {
    if (h.canceled) continue;
    const myRoles = (rolesBy.get(h.id) || []).slice().sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const periods = periodsOf(h, stintsBy.get(h.id) || [], myRoles).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const myContracts = contractBy.get(h.id) || [];
    const contractorOn = (when) =>
      myContracts.some((p) => covers(p, when)) || (myContracts.length === 0 && h.employmentStatus === "CONTRACT" && periods.some((p) => !p.endDate && covers(p, when)));
    const myApps = appsBy.get(h.candidateId) || [];
    const myIvs = ivBy.get(h.candidateId) || [];

    periods.forEach((s, idx) => {
      const start = d(s.startDate);
      if (!start || day(start) > day(TODAY)) return; // future starts are not hires yet
      const end = s.endDate ? d(s.endDate) : null;
      if (end && day(end) < day(start)) return badPeriods.push(`${h.name} (${iso(start)} to ${iso(end)})`); // ends before it starts: a data error
      const left =!!end && day(end) <= day(TODAY);
      const tenure = days(start, left ? end : TODAY);
      // a yearly roster's Dec 31: the real last day falls some time in the next year
      const rosterExit = left && end.getUTCMonth() === 11 && end.getUTCDate() === 31 && end.getUTCFullYear() <= ROSTER_EXIT_LAST_YEAR;

      // role at hire: the role covering the start day, else the first one starting within 60 days of it
      const roleAtHire =
        roleOn(myRoles, start) || myRoles.find((r) => Math.abs(day(r.startDate) - day(start)) <= 60 * DAY && (!end || day(r.startDate) <= day(end))) || null;
      const dept = (roleAtHire && roleAtHire.department) || h.department || "";
      const pilot = roleAtHire ? (isPilotRole(roleAtHire) ? "Pilot" : "Non-pilot") : NON_FLIGHT_DEPT.test(dept) ? "Non-pilot" : "Role not recorded";
      const later = myRoles.filter((r) => day(r.startDate) > day(start) && day(r.startDate) <= day(start) + 548 * DAY && (!end || day(r.startDate) <= day(end)));
      const upgraded = later.some((r) => /UPGRADE|PROMOTION/.test(r.transitionType || ""));
      const contractor = contractorOn(start);
      const contractorAtEnd = left && contractorOn(end);
      const empType = ((typesBy.get(h.id) || []).find((p) => covers(p, start)) || {}).type || "";

      // the application that led to this hire
      let app = null, match = "";
      if (h.candidateId && myApps.length) {
        const appliedIn = (a, lo, hi) => a.appliedAt && day(a.appliedAt) >= day(start) - lo * DAY && day(a.appliedAt) <= day(start) + hi * DAY;
        const latest = (arr) => arr.slice().sort((a, b) => new Date(b.appliedAt || 0) - new Date(a.appliedAt || 0))[0];
        const recentHired = myApps.filter((a) => appliedIn(a, 365, 7) && (hiredLike(a) || offerSigned(a)));
        const recent = myApps.filter((a) => appliedIn(a, 365, 7));
        const oldOffer = myApps.filter((a) => offerSigned(a) && appliedIn(a, 1500, 7) && (!a.offerSignedAt || Math.abs(day(a.offerSignedAt) - day(start)) <= 240 * DAY));
        const oldHired = myApps.filter((a) => hiredLike(a) && appliedIn(a, 720, 7));
        if (recentHired.length) (app = latest(recentHired)), (match = "hired/signed, applied within 1 yr");
        else if (recent.length) (app = latest(recent)), (match = "latest application within 1 yr");
        else if (oldOffer.length) (app = latest(oldOffer)), (match = "signed offer on an older application");
        else if (oldHired.length) (app = latest(oldHired)), (match = "older application marked hired");
      }
      const applied = app ? d(app.appliedAt) : null;
      const timingOk = match === "hired/signed, applied within 1 yr" || match === "latest application within 1 yr";

      // offer date: the application's tracked offer, else the new-hire record's own offer date
      let offerSent = null, offerSignedDate = null, offerFrom = "";
      const beforeStart = (x) => x && day(x) <= day(start) + 7 * DAY;
      // only an offer that was signed: a declined one on the same candidate is not the offer they started on
      if (app && app.offerSentAt && offerSigned(app) && !offerIsBackfill(app) && beforeStart(app.offerSentAt)) (offerSent = d(app.offerSentAt)), (offerSignedDate = d(app.offerSignedAt)), (offerFrom = "application");
      else if (beforeStart(h.offerSentDate) && day(start) - day(h.offerSentDate) <= 240 * DAY) (offerSent = d(h.offerSentDate)), (offerSignedDate = d(h.offerSignedDate)), (offerFrom = "new-hire record");

      // completed interviews between applying (or a year before start) and the start date
      const lo = applied ? day(applied) - DAY : day(start) - 365 * DAY;
      const ivs = app
        ? myIvs.filter((i) => {
            const t = d(i.startDateTime);
            return t && day(t) >= lo && day(t) <= day(start) && i.status === "COMPLETED" && i.interviewType !== "OFFER" && !isCancelled(i.outcome);
          })
        : null;
      const jazzForms = ivs ? ivs.filter((i) => i.source === "JAZZ") : null;
      const logged = ivs ? ivs.filter((i) => i.source !== "JAZZ") : null;
      const recs = ivs ? ivs.flatMap((i) => (scBy.get(i.id) || []).map((x) => x.recommendation).filter(Boolean)) : [];
      const ratings = ivs ? ivs.map((i) => i.rating).filter((x) => x != null) : [];

      // left within N days: null when too recent to measure, or when a roster date leaves it open
      const evaluable = (n) => day(start) <= day(TODAY) - n * DAY;
      const leftWithin = (n) => {
        if (!evaluable(n)) return null;
        if (!left || tenure > n) return 0;
        return rosterExit ? null : 1;
      };

      rows.push({
        person: h.name,
        legalName: h.legalName || "",
        newHireId: h.id,
        hireNumber: idx + 1,
        rehire: idx > 0 ? "Yes" : "No",
        startDate: iso(start),
        hireYear: start.getUTCFullYear(),
        endDate: left ? iso(end) : "",
        exitDateFrom: left ? (rosterExit ? "yearly roster (real day is later)" : "recorded") : "",
        noticeDate: left ? iso(h.noticeDate) : "",
        stillEmployed: left ? "No" : "Yes",
        tenureDays: tenure,
        tenureYears: (tenure / 365.25).toFixed(1),
        left90: leftWithin(90),
        left180: leftWithin(180),
        left365: leftWithin(365),
        roleAtHire: (roleAtHire && roleAtHire.title) || "",
        positionNow: h.position || "",
        department: dept,
        pilot,
        aircraftAtHire: (roleAtHire && roleAtHire.aircraft) || "",
        seatAtHire: (roleAtHire && roleAtHire.seat) || "",
        upgradedOrPromotedWithin18mo: upgraded ? "Yes" : "No",
        contractorAtHire: contractor ? "Yes" : "No",
        contractorAtExit: contractorAtEnd ? "Yes" : "No",
        employmentType: empType,
        candidateLinked: h.candidateId ? "Yes" : "No",
        applicationMatch: match,
        applicationOrigin: app ? app.origin : "",
        appliedDate: iso(applied),
        jobApplied: app ? jobTitle.get(app.jobId) || app.historicalJobTitle || "" : "",
        applicationWording: app ? wording(app) : "",
        source: app ? sourceName(app.referralSource) || sourceName(app.trafficSource) || "" : "",
        trafficSource: app ? sourceName(app.trafficSource) || "" : "",
        offerSentDate: iso(offerSent),
        offerSignedDate: iso(offerSignedDate),
        offerDateFrom: offerFrom,
        daysApplyToOffer: timingOk && offerSent ? days(applied, offerSent) : null,
        daysOfferToSigned: offerSent && offerSignedDate ? days(offerSent, offerSignedDate) : null,
        daysOfferToStart: offerSent ? days(offerSent, start) : null,
        daysApplyToStart: timingOk ? days(applied, start) : null,
        interviews: ivs ? ivs.length : null,
        jazzEvaluationForms: jazzForms ? jazzForms.length : null,
        interviewsLoggedInApp: logged ? logged.length : null,
        interviewTypes: ivs ? [...new Set(ivs.map((i) => i.interviewType))].join(" / ") : "",
        scorecardRecs: recs.join(" / "),
        avgInterviewRating: ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "",
        // to fill from Paycom / managers:
        termType_VolInvol: "",
        termReason: "",
        rehireEligible: "",
        regrettableLoss: "",
        managerRating_1to5: "",
        goodOrBadHire: ""
      });
    });
  }
  rows.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  // employees only (contractors at hire are kept in the CSV, left out of the rates)
  const emp = rows.filter((r) => r.contractorAtHire === "No");
  const years = [...new Set(emp.map((r) => r.hireYear))].sort();

  const rate = (set, k) => {
    const ev = set.filter((r) => r[k] != null);
    const n = ev.filter((r) => r[k] === 1).length;
    return { n, of: ev.length, txt: ev.length ? `${pct(n, ev.length)} (${n}/${ev.length})` : "–" };
  };

  const md = [];
  md.push(`# Quality of Hire — baseline`);
  md.push(`Pulled ${TODAY.toISOString().slice(0, 16).replace("T", " ")} UTC from the live Journey database (read only).`);
  md.push(
    `Hire = one employment period (rehires count again), placed by the same rules as Reports > Headcount & Tenure. Rates exclude people who were contractors at hire. "Left ≤90d / ≤1y" only counts hires old enough to have been measured, and leaves out exits dated by a yearly roster (Dec 31 up to ${ROSTER_EXIT_LAST_YEAR}) that cannot say whether the person left inside the window.`
  );

  // 1. coverage
  md.push(`\n## 1. What data each hire has (coverage)`);
  md.push(`Applications exist from 2023-06 (Jazz) and 2025-02 (Paycom). Jazz "interviews" are one imported evaluation form per candidate; interviews logged in the app start 2025-08. Offer dates start 2026 (tracked on applications from 2026-07-20). Recruiter and hiring manager are empty on every application.`);
  md.push(
    mdTable(
      ["Hire year", "Hires", "Exit dates from rosters", "Linked to candidate", "Application found (≤1 yr)", "Offer date", "Jazz eval form", "Interview logged in app", "Source known", "Role at hire known", "Pilots"],
      years.map((y) => {
        const s = emp.filter((r) => r.hireYear === y);
        const c = (f) => pct(s.filter(f).length, s.length);
        return [
          y, s.length, s.filter((r) => r.exitDateFrom.startsWith("yearly")).length, c((r) => r.candidateLinked === "Yes"),
          c((r) => r.daysApplyToStart != null), c((r) => r.offerSentDate), c((r) => r.jazzEvaluationForms > 0), c((r) => r.interviewsLoggedInApp > 0),
          c((r) => r.source), c((r) => r.pilot !== "Role not recorded"), s.filter((r) => r.pilot === "Pilot").length
        ];
      })
    )
  );

  // 2. retention by year
  md.push(`\n## 2. Early turnover by hire year`);
  md.push(`Read 2018–2022 with care: most of those exits come from yearly rosters, so the ≤90-day and ≤1-year columns only count the people whose answer is certain.`);
  md.push(
    mdTable(
      ["Hire year", "Hires", "Left ≤90 days", "Left ≤1 year", "Pilots left ≤1 yr", "Non-pilots left ≤1 yr", "Still employed today"],
      years.map((y) => {
        const s = emp.filter((r) => r.hireYear === y);
        // when roster dates hide most of a year's exits, the certain few are only the stayers — not a rate
        const hidden = s.filter((r) => r.exitDateFrom.startsWith("yearly")).length;
        if (hidden > s.length / 4) return [y, s.length, `not measurable (${hidden} roster exit dates)`, "not measurable", "–", "–", pct(s.filter((r) => r.stillEmployed === "Yes").length, s.length)];
        return [y, s.length, rate(s, "left90").txt, rate(s, "left365").txt, rate(s.filter((r) => r.pilot === "Pilot"), "left365").txt, rate(s.filter((r) => r.pilot === "Non-pilot"), "left365").txt, pct(s.filter((r) => r.stillEmployed === "Yes").length, s.length)];
      })
    )
  );

  // 3. annual turnover — leavers who left as employees, over the average of Jan 1 and Dec 31 headcount
  md.push(`\n## 3. Annual turnover (employees)`);
  md.push(
    `On-staff counts follow the Headcount & Tenure report (contractors on the day are left out). Opening headcount is the previous Dec 31. A roster exit dated Dec 31 means the person was on that year's list and gone by the next, so it is counted as leaving in the FOLLOWING year — otherwise 2021 reads as 3 leavers and 2020 as 22. Read 2018–2022 as approximate.`
  );
  const people = hires.filter((h) => !h.canceled).map((h) => {
    const myRoles = rolesBy.get(h.id) || [];
    const periods = periodsOf(h, stintsBy.get(h.id) || [], myRoles);
    const cps = contractBy.get(h.id) || [];
    const contractorOn = (when) => cps.some((p) => covers(p, when)) || (cps.length === 0 && h.employmentStatus === "CONTRACT" && periods.some((p) => !p.endDate && covers(p, when)));
    return { periods, contractorOn, status: h.employmentStatus };
  });
  const onStaff = (t, isToday) =>
    people.filter((p) => p.periods.some((x) => covers(x, t)) && !(isToday ? p.status === "CONTRACT" : p.contractorOn(t))).length;
  const tYears = [];
  for (let y = 2015; y <= TODAY.getUTCFullYear(); y++) tYears.push(y);
  md.push(
    mdTable(
      ["Year", "On staff Jan 1", "On staff Dec 31 / today", "Hired", "Left", "Turnover rate", "Left within 1 yr of hire"],
      tYears.map((y) => {
        const isNow = y === TODAY.getUTCFullYear(), b = isNow ? TODAY : new Date(Date.UTC(y, 11, 31));
        const hc0 = onStaff(new Date(Date.UTC(y - 1, 11, 31)), false), hc1 = onStaff(b, isNow);
        const hired = emp.filter((r) => r.hireYear === y).length;
        const exitYear = (r) => Number(r.endDate.slice(0, 4)) + (r.exitDateFrom.startsWith("yearly") ? 1 : 0);
        const leavers = rows.filter((r) => r.endDate && exitYear(r) === y && day(r.endDate) <= day(TODAY) && r.contractorAtExit === "No");
        const early = leavers.filter((r) => !r.exitDateFrom.startsWith("yearly") && r.tenureDays <= 365).length;
        return [y + (isNow ? " (YTD)" : ""), hc0, hc1, hired, leavers.length, pct(leavers.length, (hc0 + hc1) / 2), `${early} of ${leavers.length}`];
      })
    )
  );

  // 4. what separates early exits — segments, recent hires only
  const recent = emp.filter((r) => r.hireYear >= RECENT_FROM_YEAR);
  md.push(`\n## 4. What separates hires who left within a year (hires ${RECENT_FROM_YEAR}+, measurable ones only)`);
  md.push(`Small groups (under ~10 measurable) are noise — read them as leads to check, not findings. The "Left ≤1 year" denominator is the measurable count.`);
  const seg = (title, keyFn, minN = 1, order, set = recent) => {
    const m = new Map();
    for (const r of set) {
      const k = keyFn(r) || "Unknown";
      (m.get(k) || m.set(k, []).get(k)).push(r);
    }
    const entries = [...m.entries()].map(([k, s]) => ({ k, s, r1: rate(s, "left365"), r90: rate(s, "left90") })).filter((e) => e.s.length >= minN);
    entries.sort(order ? (a, b) => order.indexOf(a.k) - order.indexOf(b.k) : (a, b) => b.s.length - a.s.length);
    md.push(`\n### ${title}`);
    md.push(mdTable(["Group", "Hires", "Left ≤90 days", "Left ≤1 year", "Still employed"], entries.map((e) => [e.k, e.s.length, e.r90.txt, e.r1.txt, pct(e.s.filter((r) => r.stillEmployed === "Yes").length, e.s.length)])));
  };
  seg("Pilot vs non-pilot", (r) => r.pilot);
  seg("Department at hire (3+ hires)", (r) => r.department, 3);
  seg("Role at hire (3+ hires)", (r) => r.roleAtHire || "Role not recorded", 3);
  seg("Rehire", (r) => r.rehire);
  seg("Employment type at hire (recorded to Aug 2024 only)", (r) => r.employmentType || "Not recorded");
  seg("Upgraded or promoted within 18 months", (r) => r.upgradedOrPromotedWithin18mo);
  const withApp = recent.filter((r) => r.daysApplyToStart != null);
  md.push(`\nThe tables below only use the ${withApp.length} hires since ${RECENT_FROM_YEAR} whose application was found (applied within a year of starting).`);
  seg("Source (2+ hires)", (r) => r.source || "Not recorded", 2, null, withApp);
  seg("Application system", (r) => r.applicationOrigin, 1, null, withApp);
  seg("Interviews before hire (Jazz form + logged in app)", (r) => bucketInterviews(r.interviews), 1, ["0 recorded", "1", "2", "3+"], withApp);
  seg("Days from application to start", (r) => bucketDays(r.daysApplyToStart), 1, ["0–14 days", "15–30 days", "31–60 days", "61+ days", "Unknown"], withApp);
  seg("Jazz evaluation recommendation", (r) => r.scorecardRecs || "No form", 1, null, withApp);

  // 5. process speed by year
  md.push(`\n## 5. Hiring process by hire year (medians)`);
  md.push(`Only hires whose application was found within a year of starting. Apply → offer needs an offer date, which exists from 2026 only.`);
  md.push(
    mdTable(
      ["Hire year", "Hires with application", "Days apply → start", "Hires with offer date", "Days apply → offer", "Days offer → signed", "Days offer → start", "Interviews per hire (avg, all with app)"],
      years.filter((y) => y >= 2023).map((y) => {
        const s = emp.filter((r) => r.hireYear === y);
        const a = s.filter((r) => r.daysApplyToStart != null);
        const m = (set, k) => median(set.map((r) => r[k])) ?? "–";
        return [y, a.length, m(a, "daysApplyToStart"), s.filter((r) => r.offerSentDate).length, m(s, "daysApplyToOffer"), m(s, "daysOfferToSigned"), m(s, "daysOfferToStart"), mean1(a.map((r) => r.interviews))];
      })
    )
  );

  // 6. offers — the outcome of every application that reached an offer, by year applied
  md.push(`\n## 6. Offers`);
  md.push(`An application reached an offer if it was hired, signed, declined or rescinded — from the app's own offer tracking (2026-07-20 on) and from the Jazz/Paycom status wordings (2023-06 on). Hired counts as accepted, and so does a candidate who started within a year of applying (one 2026 "declined" offer belongs to a person who started on a later offer). One row per candidate per year: a hire with two "Hired" applications counts once.`);
  // a candidate who went on to start within a year of applying accepted, whatever the application says
  const startsBy = new Map();
  rows.forEach((r) => {
    const h = hires.find((x) => x.id === r.newHireId);
    if (h && h.candidateId) (startsBy.get(h.candidateId) || startsBy.set(h.candidateId, []).get(h.candidateId)).push(day(r.startDate));
  });
  const started = (a) => a.appliedAt && (startsBy.get(a.candidateId) || []).some((s) => s >= day(a.appliedAt) && s <= day(a.appliedAt) + 365 * DAY);
  const outcome = (a) => (hiredLike(a) || offerSigned(a) || started(a) ? "accepted" : offerDeclined(a) ? "declined" : offerRescinded(a) ? "rescinded" : a.offerStatus === "SENT" || a.status === "Offered" ? "open" : null);
  const offerApps = apps.filter((a) => outcome(a));
  const oYear = (a) => (d(a.appliedAt) || d(a.offerSentAt) || new Date(0)).getUTCFullYear();
  const oYears = [...new Set(offerApps.map(oYear))].filter((y) => y > 2000).sort();
  const rank = { accepted: 3, declined: 2, rescinded: 1, open: 0 };
  md.push(
    mdTable(
      ["Year applied", "Applications", "Candidates reaching an offer", "Accepted (hired/signed)", "Declined", "Rescinded / not sent", "Still open", "Acceptance (accepted ÷ accepted+declined)", "Applications per accepted offer"],
      oYears.map((y) => {
        const byCand = new Map();
        offerApps.filter((a) => oYear(a) === y).forEach((a) => {
          const o = outcome(a), prev = byCand.get(a.candidateId);
          if (!prev || rank[o] > rank[prev]) byCand.set(a.candidateId, o);
        });
        const n = (o) => [...byCand.values()].filter((x) => x === o).length;
        const total = apps.filter((a) => a.appliedAt && d(a.appliedAt).getUTCFullYear() === y).length;
        return [y, total, byCand.size, n("accepted"), n("declined"), n("rescinded"), n("open"), pct(n("accepted"), n("accepted") + n("declined")), n("accepted") ? Math.round(total / n("accepted")) : "–"];
      })
    )
  );
  const reasons = new Map();
  offerApps.filter((a) => outcome(a) === "declined").forEach((a) => {
    const k = declineReason(a);
    reasons.set(k, (reasons.get(k) || 0) + 1);
  });
  md.push(`\nOffer decline reasons (all years):`);
  md.push(mdTable(["Reason", "Count"], [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)));
  md.push(`\nAccepted but never started (new-hire records marked canceled): **${cancelledHires.length}** — ${cancelledHires.map((h) => `${h.name} (${iso(h.startDate) || "no start date"})`).join(", ")}`);
  // an offer hung on a years-old Jazz application would read as a 2-year wait, so a year at most
  const tracked = apps.filter((a) => a.offerSentAt && !offerIsBackfill(a) && a.appliedAt && days(a.appliedAt, a.offerSentAt) <= 365);
  md.push(`\nOffers tracked in the app with a real sent date (not the 2026-07-20 backfill, applied within a year): ${tracked.length}; median days apply → offer ${median(tracked.map((a) => days(a.appliedAt, a.offerSentAt))) ?? "–"}, offer → signed ${median(tracked.filter((a) => a.offerSignedAt).map((a) => days(a.offerSentAt, a.offerSignedAt))) ?? "–"}.`);

  // 7. interviews overall
  md.push(`\n## 7. Interviews in the app`);
  const cnt = (arr, k) => [...arr.reduce((m, x) => m.set(x[k] || "(blank)", (m.get(x[k] || "(blank)") || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1]);
  const ivYears = cnt(interviews.map((i) => ({ y: d(i.startDateTime) ? d(i.startDateTime).getUTCFullYear() : "(none)" })), "y").sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  md.push(`Interviews by year: ${ivYears.map(([y, n]) => `${y}: ${n}`).join(" · ")}`);
  md.push(`\nBy where they came from:\n` + mdTable(["Source", "Count"], cnt(interviews, "source")));
  md.push(`\nBy type:\n` + mdTable(["Type", "Count"], cnt(interviews, "interviewType")));
  md.push(`\nBy status:\n` + mdTable(["Status", "Count"], cnt(interviews, "status")));
  md.push(`\nScorecards on file: ${scorecards.length} (${cnt(scorecards, "recommendation").map(([k, n]) => `${k} ${n}`).join(", ")})`);

  // 8. what is missing
  const leftCount = emp.filter((r) => r.stillEmployed === "No").length;
  md.push(`\n## 8. Gaps to fill from Paycom`);
  md.push(`- Employment periods that end before they start (left out of everything above): ${badPeriods.join(", ") || "none"}.`);
  md.push(`- ${leftCount} employee hires have left. The app does not record voluntary vs involuntary, termination reason, or rehire eligibility. Columns for these are blank in qoh-hires.csv.`);
  md.push(`- No performance data is stored. Add a 1–5 manager rating (managerRating_1to5, goodOrBadHire), or pull Paycom performance reviews if used.`);
  md.push(`- Recruiter and hiring manager are empty on every application; the new-hire supervisor field is filled on only a handful of people who have left, so it cannot stand in for hiring manager.`);
  md.push(`- Interviews per candidate before 2025-08 cannot be counted from the app (Jazz gave one evaluation form per candidate).`);

  // ---------- write ----------
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "qoh-baseline.md"), md.join("\n") + "\n");
  fs.writeFileSync(path.join(outDir, "qoh-hires.csv"), "﻿" + toCsv(rows, Object.keys(rows[0] || { person: "" })));
  const offerRows = offerApps.map((a) => ({
    candidateId: a.candidateId, origin: a.origin, job: jobTitle.get(a.jobId) || a.historicalJobTitle || "", appliedDate: iso(a.appliedAt), outcome: outcome(a),
    wording: wording(a), offerStatus: a.offerStatus, offerSent: iso(a.offerSentAt), offerSigned: iso(a.offerSignedAt), offerDeclined: iso(a.offerDeclinedAt),
    backfilled: offerIsBackfill(a) ? "Yes" : "", declineReason: outcome(a) === "declined" ? declineReason(a) : "", notSentReason: a.offerNotSentReason || "",
    daysApplyToOffer: offerIsBackfill(a) ? null : days(a.appliedAt, a.offerSentAt), source: sourceName(a.referralSource) || sourceName(a.trafficSource) || ""
  }));
  fs.writeFileSync(path.join(outDir, "qoh-offers.csv"), "﻿" + toCsv(offerRows, Object.keys(offerRows[0] || { candidateId: "" })));
  return { hires: rows.length, employeeHires: emp.length, offers: offerApps.length };
}

module.exports = { run };

if (require.main === module) {
  const root = path.resolve(__dirname, "..", "..");
  require(path.join(root, "node_modules", "dotenv")).config({ path: path.join(root, ".env"), quiet: true });
  const { Client, types } = require(path.join(root, "node_modules", "pg"));
  // Prisma stores DateTime as timestamp WITHOUT time zone, in UTC. pg reads that as local time,
  // which moves an evening timestamp onto the next day; read it as UTC instead.
  types.setTypeParser(1114, (v) => new Date(v.replace(" ", "T") + "Z"));
  (async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set in .env");
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    console.log("Connecting (read only)...");
    await client.connect();
    await client.query("BEGIN TRANSACTION READ ONLY");
    try {
      console.log("Reading hires, applications, interviews and offers...");
      const out = path.join(root, "scripts", "_qoh_output");
      const r = await run(client, out);
      console.log(`Done. ${r.hires} hires (${r.employeeHires} as employees), ${r.offers} applications that reached an offer.`);
      console.log(`Files: ${out}`);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  })().catch((e) => {
    console.error("FAILED:", e.message);
    process.exit(1);
  });
}
