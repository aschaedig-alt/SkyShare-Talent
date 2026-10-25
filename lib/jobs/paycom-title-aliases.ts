/**
 * Paycom title -> the EXACT job title it means, answered by a person.
 *
 * Moved here from scripts/paycom-app-job-link.ts on 2026-10-25 so the in-app Paycom
 * applicant upload (lib/paycom/applicant-import.ts) reads the SAME answers the bulk
 * link script does — two copies would drift the first time one was edited.
 *
 * The matcher deliberately refuses these: a renamed role (SkyOps Flight
 * Coordinator is the Flight Coordinator job), a posting carrying its bonus or
 * base in the title, a typo, or a name that drops a qualifier the job keeps
 * ("Home-Based"). Guessing at any of those is how somebody lands on the wrong
 * job's applicant list, so they wait for an answer instead — these are his, on
 * 2026-09-22, when he was shown the list and said link them.
 *
 * A mapping is only used when the title on the right matches EXACTLY ONE job
 * that has not been merged away. If it matches none or several, the row is
 * reported and left alone rather than linked to a guess — the whole point of
 * this map is that a person chose the target.
 */
export const PAYCOM_TITLE_ALIASES: Record<string, string> = {
  "SkyOps Flight Coordinator": "Flight Coordinator",
  "Gulfstream G450 & GV First Officer": "Gulfstream G450 & GV First Officer (Home-Based)",
  "G450 & GV First Officer (Home-Based) $15k Sign-on bonus!": "Gulfstream G450 & GV First Officer (Home-Based)",
  "Gulfstream G450 & GV Captain": "Gulfstream G450 & GV Captain (Home-Based)",
  "Fleet Aircraft Maintenance Technician (AMT) SLC - $5k sign on bonus!": "Aircraft Maintenance Technician",
  "Fleet Aircraft Maintenance Technician (AMT) SLC": "Aircraft Maintenance Technician",
  "Aircraft Detailing & Presentation Specialis": "Aircraft Detailing & Presentation Specialist",
  "Pilatus PC-12 First Officer": "PC-12 First Officer",

  // --- His answers to the full list of 55 titles, 2026-09-22. ---
  // He went through every one; these are the ones he said to link, and where he
  // said a title means a DIFFERENT job than it reads like, that is his call and
  // not something to "correct" later: a CJ / CE-525 posting can be the CJ3+
  // seat, and the Customer Service postings are the part-time role.
  "Customer Service Rep": "Customer Service Representative | Part-Time",
  "Customer Service Representative (Aviation)": "Customer Service Representative | Part-Time",
  "Customer Service Representative (Aviation) Part-Time": "Customer Service Representative | Part-Time",
  "FBO Customer Service & Front Office Manager (Aviation)": "Customer Service Supervisor",
  "CE-525 (CJ2) Captain": "CJ2 Captain",
  "Citation CE-525 Captain": "CJ2 Captain",
  "Citation CE-525 First Officer": "Citation CJ2 First Officer",
  "CE-525 First Officer": "Citation CJ2 First Officer",
  "Pilot CJ2 SIC": "Citation CJ2 First Officer",
  "Citation CJ Captain CE-525 ($140k-$160k) Utah": "CJ3+ Captain",
  "Single-Pilot Jet Captain | Part 91 | SLC, UT ($160k - $180k)": "CJ3+ Captain",
  "CE-525 Captain | Utah | $140K-$160K + up to $20K Sign-On Bonus!": "CJ3+ Captain",
  "Aircraft Maintenance Technician (AMT) $5,000 sign-on bonus!": "Aircraft Maintenance Technician",
  "Gulfstream G450 & GV Captain (Home-Based)": "Gulfstream G450 & GV Captain (Home-Based)",
  "Gulfstream G450 & GV Captain (Home Based)": "Gulfstream G450 & GV Captain (Home-Based)",
  "Gulfstream G450 & GV First Officer (Home-Based)": "Gulfstream G450 & GV First Officer (Home-Based)",
  "Pilatus PC-12 Captain": "Pilatus PC-12 Captain",
  "Gulfstream G200 First Officer": "Gulfstream G200 First Officer",
  "Gulfstream G200 Captain (Plus a $20k sign-on bonus!)": "Gulfstream G200 Captain",
  "Citation 560XL Captain": "Citation 560XL Captain",
  "Citation 560XLS+ Captain": "Citation 560XLS+ Captain",
  "Challenger 350 First Officer ($130k) - UT": "Challenger 350 First Officer",
  "Phenom 100 First Officer - SLC": "Phenom 100 First Officer",
  "Phenom 100 Captain ($150k-$160k) SLC": "Phenom 100 Captain",
  "Legacy 650 Co-Captain": "Legacy 650 Captain",
  "Legacy 650 Lead Captain": "Legacy 650 Captain",
  "G450 Lead Cabin Attendant": "Lead Corporate Cabin Attendant",
  "Aircraft Maintenance Apprentice": "Aircraft Maintenance Apprentice",
  "Senior Gulfstream Technician (AMT)": "Senior Gulfstream Technician",
  "Sr. Staff Accountant": "Sr. Staff Accountant",
  "Base Support": "Ogden Base Support",
  // He answered "create this job" for BOTH of these, and they are one seat. The
  // job is created once under the fuller title (scripts/paycom-missing-jobs.ts)
  // and the short form points at it. He confirmed "keep one job" on 2026-09-23.
  "PC-12 NG Captain": "Pilatus PC-12 NG Captain",

  // --- His answers of 2026-09-23, given with the application dates in front of him. ---
  // The Georgia posting ran Jul 20 - Sep 2; the Georgia CJ job was created in the
  // app on Aug 28, mid-posting, so it is the job these people applied for.
  "Single-Pilot Jet Captain | Part 91 | Georgia ($160k - $180k)": "CJ Captain (Part 91, Georgia)",
  // Both fall in the gap between CJ2 Captain's applicants (to Feb 8) and CJ3+
  // Captain's (from Apr 8); he put both on CJ3+.
  "Pilot CJ PIC": "CJ3+ Captain",
  "Citation CE-525 CJ Captain": "CJ3+ Captain",
  // "Make all of the Line Service Technician jobs one job" - scripts/paycom-lst-merge.ts
  // folded | DVO into | OGD and renamed it, with the bases as its location, so
  // every technician posting goes to the one job whatever base it was for.
  "Line Service Technician (Aviation)": "Line Service Technician",
  "Line Service Technician": "Line Service Technician",
  "Line Service Technician - Part Time": "Line Service Technician",
  // Added 2026-10-25 under the same instruction ("make all of the Line Service
  // Technician jobs one job"): the October export was the first to carry the
  // full-time posting, and without this line it would have created a second job.
  "Line Service Technician - Full Time": "Line Service Technician"
};
