import { prisma } from "@/lib/prisma";
import { getFirstValue } from "@/lib/imports/csv";

export type JobImportRow = Record<string, string>;

type ImportJobsOptions = {
  rows: JobImportRow[];
  sourceFilename: string;
  sourceType: string;
  importBatchType: string;
};

const titleKeys = ["job_title", "title", "job title", "position"];
// One column, two requisition schemes — the SHAPE of the value decides which
// database column it lands in. See splitRequisitionId.
const reqKeys = ["job_req_id", "req id", "requisition id", "job req id"];
// Headers that name Paycom outright. Checked first, but the value still has to be
// digits to be believed, because digits are all Paycom issues.
const paycomReqKeys = ["paycom_req_id", "paycom req id", "paycom requisition", "paycom requisition id"];
const sourceIdKeys = ["job_id", "job id", "source job id"];
const recruiterKeys = ["job_recruiter", "recruiter"];
const departmentKeys = ["job_department", "department"];
const cityKeys = ["job_city", "city"];
const stateKeys = ["job_state", "state"];
const postalKeys = ["job_postal", "postal", "zip"];
const openKeys = ["job_open", "opened", "open date"];
const filledKeys = ["job_filled", "filled", "filled date"];
const descriptionKeys = ["job_description", "description"];
const minimumKeys = ["Minimum Requirements", "minimum requirements", "requirements"];
const payKeys = ["Pay Scale", "pay scale", "salary"];

const defaultCatalogItems = [
  { key: "commercial_certificate", label: "Commercial pilot certificate", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: true },
  { key: "instrument_rating", label: "Instrument rating", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: true },
  { key: "first_class_medical", label: "First-class medical", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: true },
  { key: "fcc_permit", label: "FCC permit", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: true },
  { key: "us_passport", label: "U.S. Passport", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: true },
  { key: "us_drivers_license", label: "U.S. Driver's license", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: true },
  { key: "current_ifr", label: "Current IFR knowledge", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: true },
  { key: "work_authorization", label: "U.S. work authorization", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: true },
  { key: "tsa_sida", label: "TSA / Background Check / SIDA badge", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: true },
  { key: "training_contract", label: "Training Contract Required", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: true },
  { key: "current_qualified", label: "Current & Qualified", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: false },
  { key: "atp_certificate", label: "ATP certificate", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: false },
  { key: "part_135_preferred", label: "Part 135 exp preferred", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: false },
  { key: "part_135_required", label: "Part 135 exp required", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: false },
  { key: "international_required", label: "International / transoceanic experience required", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: false },
  { key: "garmin1000_preferred", label: "Garmin 1000 preferred", category: "Avionics / Programs", valueType: "boolean", defaultEnabled: false },
  { key: "garmin1000_required", label: "Garmin 1000 required", category: "Avionics / Programs", valueType: "boolean", defaultEnabled: false },
  { key: "garmin3000_preferred", label: "Garmin 3000 preferred", category: "Avionics / Programs", valueType: "boolean", defaultEnabled: false },
  { key: "garmin3000_required", label: "Garmin 3000 required", category: "Avionics / Programs", valueType: "boolean", defaultEnabled: false },
  { key: "argus_preferred", label: "Argus qualified preferred", category: "Avionics / Programs", valueType: "boolean", defaultEnabled: false },
  { key: "argus_required", label: "Argus qualified required", category: "Avionics / Programs", valueType: "boolean", defaultEnabled: false },
  { key: "fluid_schedule", label: "Fluid Schedule Flexibility", category: "Schedule / Availability", valueType: "boolean", defaultEnabled: false },
  { key: "set_rotation", label: "Set Rotation Schedule", category: "Schedule / Availability", valueType: "boolean", defaultEnabled: false },
  { key: "slc_relocation", label: "SLC Relocation Required", category: "Location / Commute", valueType: "boolean", defaultEnabled: false },
  { key: "home_based", label: "Home-Based Available", category: "Location / Commute", valueType: "boolean", defaultEnabled: false },
  { key: "total_time", label: "Total Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "pic_time", label: "PIC Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "sic_time", label: "SIC Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "multi_engine_time", label: "Multi-Engine Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "turbine_time", label: "Fixed-wing Turbine Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "jet_time", label: "Jet Aircraft Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "instrument_time", label: "Instrument Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "cross_country_time", label: "Cross-Country Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "night_time", label: "Night Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "time_in_type", label: "Total Time in Type", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "pic_time_in_type", label: "PIC Time in Type", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "single_pilot_time", label: "Professional Single-pilot Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "single_pilot_jet_time", label: "Professional Single-pilot Jet Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false }
];

export function stripHtml(value: string | null) {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTitle(value: string | null) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Paycom issues a plain number (3296). Same test the app's own requisition field
// enforces in app/api/recruiting-jobs/[id]/route.ts, kept identical on purpose so a
// number typed by hand and a number imported from a CSV are judged the same way.
function isPaycomReqNumber(value: string) {
  return /^\d{1,20}$/.test(value);
}

// Split ONE incoming requisition value across the TWO columns that hold requisition
// ids. Jazz issued codes (AMA.1, CJ2PIC.2, PC12PICNGX); Paycom issues plain numbers
// (3296). The schema comment on Job says it outright — they are different schemes and
// a Jazz code will never match a Paycom number — so they are kept apart, and the shape
// of the value is the only signal available to tell them apart.
//
// Before this, every requisition landed on jobReqId whatever it looked like, and
// "paycomReqId" appeared nowhere in this file. Paycom's Offer Accepted notice quotes a
// requisition NUMBER, so a number filed under the Jazz code column is a key that can
// never be matched against.
export function splitRequisitionId(rawReq: string | null, rawPaycomReq: string | null) {
  const req = (rawReq ?? "").trim();
  const paycomNamed = (rawPaycomReq ?? "").trim();

  // A column that names Paycom wins outright, and any plain req column beside it is
  // then a Jazz code by elimination.
  if (paycomNamed && isPaycomReqNumber(paycomNamed)) {
    return { jobReqId: req || null, paycomReqId: paycomNamed };
  }
  if (req && isPaycomReqNumber(req)) return { jobReqId: null, paycomReqId: req };
  return { jobReqId: req || null, paycomReqId: null };
}

// A role is "pilot" ONLY when the TITLE names a pilot seat/role (Captain, First Officer,
// PIC, SIC, Pilot, Chief Pilot). Aircraft names alone (Gulfstream, Citation, Pilatus, ...)
// do NOT make it a pilot job, so "Senior Gulfstream Technician" classifies as support.
// Department is intentionally ignored — imported department values are unreliable.
export function isPilotTitle(title: string) {
  return /\b(pilot|captain|first officer|chief pilot|pic|sic|aviator)\b/.test(title.toLowerCase());
}

export function detectSeat(title: string) {
  const text = title.toLowerCase();
  if (/\b(first officer|sic)\b/.test(text)) return "SIC";
  if (/\b(lead pic|lead captain)\b/.test(text)) return "Lead PIC";
  if (text.includes("chief pilot")) return "Chief Pilot";
  return "PIC";
}

export function extractAircraftTypes(text: string) {
  const source = text.toLowerCase();
  const aircraft = new Set<string>();
  if (/gulfstream\s*g450|\bg450\b/.test(source)) aircraft.add("Gulfstream G450");
  if (/\bgv\b|gulfstream\s*gv/.test(source)) aircraft.add("GV");
  if (/gulfstream\s*g200|\bg200\b/.test(source)) aircraft.add("Gulfstream G200");
  if (/560xl|xls\+?|citation\s*xls/.test(source)) aircraft.add("Citation 560XL");
  if (/cj2|ce-?525/.test(source)) aircraft.add("Citation CJ2");
  if (/\bm2\b/.test(source)) aircraft.add("Citation M2");
  if (/pc-?12\s*ngx/i.test(text)) aircraft.add("Pilatus PC-12 NGX");
  else if (/pc-?12\s*ng/i.test(text)) aircraft.add("Pilatus PC-12 NG");
  else if (/pc-?12/i.test(text)) aircraft.add("Pilatus PC-12");
  if (/phenom\s*300/.test(source)) aircraft.add("Phenom 300");
  if (/phenom\s*100/.test(source)) aircraft.add("Phenom 100");
  return Array.from(aircraft);
}

function extractHourValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.slice(1).find(Boolean);
    if (value) return Number(value.replace(/\D/g, ""));
  }
  return null;
}

function extractHours(text: string) {
  return {
    total_time: extractHourValue(text, [/(?:minimum\s*)?(\d[\d,]*)\s*(?:hours?|hrs?).{0,30}\btotal\b/i, /\btotal(?:\s+flight)?(?:\s+time|\s+hours)?.{0,30}?(\d[\d,]*)/i]),
    pic_time: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,18}\bPIC\b/i, /\bPIC\b.{0,30}?(\d[\d,]*)/i]),
    sic_time: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,18}\bSIC\b/i, /\bSIC\b.{0,30}?(\d[\d,]*)/i]),
    multi_engine_time: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,24}\bmulti(?:-engine)?\b/i, /\bmulti(?:-engine)?\b.{0,30}?(\d[\d,]*)/i]),
    turbine_time: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,24}\bturbine\b/i, /\bturbine\b.{0,30}?(\d[\d,]*)/i]),
    jet_time: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,24}\bjet\b/i, /\bjet\b.{0,30}?(\d[\d,]*)/i]),
    instrument_time: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,24}\binstrument\b/i, /\binstrument\b.{0,30}?(\d[\d,]*)/i]),
    cross_country_time: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,24}\bcross[-\s]?country\b/i, /\bcross[-\s]?country\b.{0,30}?(\d[\d,]*)/i]),
    night_time: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,24}\bnight\b/i, /\bnight\b.{0,30}?(\d[\d,]*)/i]),
    time_in_type: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,24}\btime in type\b/i, /\btime in type\b.{0,30}?(\d[\d,]*)/i]),
    pic_time_in_type: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,24}\bPIC\b.{0,24}\b(?:time in type|aircraft-specific)\b/i, /\b(?:aircraft-specific|time in type)\b.{0,24}\bPIC\b.{0,30}?(\d[\d,]*)/i]),
    single_pilot_time: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,24}\bsingle[-\s]?pilot\b/i, /\bsingle[-\s]?pilot\b.{0,30}?(\d[\d,]*)/i]),
    single_pilot_jet_time: extractHourValue(text, [/\b(\d[\d,]*)\s*(?:hours?|hrs?).{0,24}\bsingle[-\s]?pilot\s+jet\b/i, /\bsingle[-\s]?pilot\s+jet\b.{0,30}?(\d[\d,]*)/i])
  };
}

function boolGateEnabled(key: string, text: string) {
  const checks: Record<string, RegExp> = {
    commercial_certificate: /commercial\s+(pilot\s+)?(certificate|license)|airline transport pilot|\bATP\b/i,
    instrument_rating: /instrument rating|instrument rated|current IFR|IFR knowledge/i,
    first_class_medical: /first[-\s]?class medical|1st class medical/i,
    fcc_permit: /\bFCC\b|radiotelephone|radio permit/i,
    us_passport: /passport/i,
    us_drivers_license: /driver'?s license|drivers license/i,
    current_ifr: /current IFR|IFR current|IFR knowledge/i,
    work_authorization: /authorized to work|work authorization|without sponsorship/i,
    tsa_sida: /\bTSA\b|background check|SIDA/i,
    training_contract: /training.*(contract|repayment)|repayment contract/i,
    current_qualified: /current(?:ly)?\s+.{0,40}qualified/i,
    atp_certificate: /\bATP\b|airline transport pilot/i,
    part_135_preferred: /part\s*135.{0,40}preferred|preferred.{0,40}part\s*135/i,
    part_135_required: /part\s*135(?![^.]{0,40}preferred)|part\s*135.{0,40}required|required.{0,40}part\s*135/i,
    international_required: /international|transatlantic|transpacific/i,
    garmin1000_preferred: /garmin\s*1000.{0,40}preferred|g1000.{0,40}preferred/i,
    garmin1000_required: /garmin\s*1000(?![^.]{0,40}preferred)|g1000(?![^.]{0,40}preferred)/i,
    garmin3000_preferred: /garmin\s*3000.{0,40}preferred|g3000.{0,40}preferred/i,
    garmin3000_required: /garmin\s*3000(?![^.]{0,40}preferred)|g3000(?![^.]{0,40}preferred)/i,
    argus_preferred: /argus.{0,40}preferred/i,
    argus_required: /argus(?![^.]{0,40}preferred)/i,
    fluid_schedule: /flexible schedule|fluid schedule|overnight trips|holidays|weekends/i,
    set_rotation: /\b\d{1,2}\s*\/\s*\d{1,2}\s+rotation|rotation schedule/i,
    slc_relocation: /relocat.{0,40}(SLC|Salt Lake)|(?:SLC|Salt Lake).{0,40}relocat/i,
    home_based: /home[-\s]?based/i
  };
  return checks[key]?.test(text) ?? false;
}

export async function ensurePilotRequirementCatalog() {
  for (const [index, item] of defaultCatalogItems.entries()) {
    await prisma.requirementCatalogItem.upsert({
      where: { key: item.key },
      update: {
        label: item.label,
        category: item.category,
        valueType: item.valueType,
        defaultEnabled: item.defaultEnabled,
        sortOrder: index + 1,
        archivedAt: null
      },
      create: {
        ...item,
        sortOrder: index + 1
      }
    });
  }

  return prisma.requirementCatalogItem.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
}

export async function createPilotRequirementGates(pilotRequirementId: string, text: string) {
  const catalog = await ensurePilotRequirementCatalog();
  const hours = extractHours(text);

  await prisma.pilotRequirementGate.createMany({
    data: catalog.map((item, index) => {
      const numericValue = item.valueType === "hours" ? hours[item.key as keyof typeof hours] ?? null : null;
      const enabled = item.defaultEnabled || Boolean(numericValue) || boolGateEnabled(item.key, text);

      return {
        pilotRequirementId,
        catalogItemId: item.id,
        key: item.key,
        label: item.label,
        category: item.category,
        valueType: item.valueType,
        enabled,
        numericValue,
        evidenceText: enabled ? text.slice(0, 4000) : null,
        sortOrder: index + 1
      };
    })
  });
}

function extractionWarnings(title: string, sourceText: string) {
  const warnings: string[] = ["Draft created from imported job source. Review structured gates before matching candidates."];
  if (!extractAircraftTypes(`${title}\n${sourceText}`).length) warnings.push("Aircraft type was not confidently detected.");
  if (!extractHours(sourceText).total_time) warnings.push("Minimum total hours not found.");
  return warnings;
}

export async function importJobRows({ rows, sourceFilename, sourceType, importBatchType }: ImportJobsOptions) {
  const batch = await prisma.importBatch.create({
    data: { sourceType: importBatchType, sourceFilename, status: "RUNNING", rowCount: rows.length }
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let requirements = 0;
  // Counted separately from `requirements` (which counts NEW drafts) because this one
  // changes what the Matchboard shows for a role that already existed — a silent status
  // flip on live data should be reported, not left to be inferred.
  let requirementsReactivated = 0;
  let pilotRows = 0;
  let nonPilotRows = 0;
  let warnings = 0;

  try {
    for (const [index, row] of rows.entries()) {
      const title = getFirstValue(row, titleKeys);
      if (!title) {
        skipped += 1;
        await prisma.importRow.create({ data: { importBatchId: batch.id, rowNumber: index + 1, rawJson: JSON.stringify(row), status: "SKIPPED", warningJson: JSON.stringify(["Missing job title."]) } });
        continue;
      }

      const sourceJobId = getFirstValue(row, sourceIdKeys);
      const { jobReqId, paycomReqId } = splitRequisitionId(
        getFirstValue(row, reqKeys),
        getFirstValue(row, paycomReqKeys)
      );
      const department = getFirstValue(row, departmentKeys);
      const rawDescription = getFirstValue(row, descriptionKeys);
      const rawMinimumRequirements = getFirstValue(row, minimumKeys);
      const rawPayScale = getFirstValue(row, payKeys);
      const sourceText = [stripHtml(rawDescription), rawMinimumRequirements, rawPayScale].filter(Boolean).join("\n\n");
      const pilotRole = isPilotTitle(title);
      const aircraftTypes = extractAircraftTypes(`${title}\n${sourceText}`);
      const filledDate = parseDate(getFirstValue(row, filledKeys));

      // A Paycom number is ALSO checked against jobReqId, because rows written before
      // the split above put it there. That lets a re-import recognise such a row and
      // update it instead of creating a second copy — without writing anything to the
      // old column, which is a backfill question and not this function's to decide.
      const identityMatches = [
        sourceJobId ? { sourceJobId } : undefined,
        jobReqId ? { jobReqId } : undefined,
        paycomReqId ? { paycomReqId } : undefined,
        paycomReqId ? { jobReqId: paycomReqId } : undefined
      ].filter(Boolean) as Array<{ sourceJobId: string } | { jobReqId: string } | { paycomReqId: string }>;

      let existing = identityMatches.length
        ? await prisma.job.findFirst({ where: { OR: identityMatches } })
        : null;

      // Fall back to the job TITLE. A PDF printed from the careers site carries no
      // stable id — the generated one is derived from the filename — so identity
      // matching alone meant re-importing the same posting created a second copy
      // of a job that already existed. That is how the duplicate pile (54 merged
      // jobs, and 48 pilot requirements hidden behind them) built up in the first
      // place. Merged-away duplicates are excluded so a loser is never revived.
      if (!existing) {
        existing = await prisma.job.findFirst({
          where: { normalizedTitle: normalizeTitle(title), mergedIntoJobId: null },
          orderBy: { updatedAt: "desc" }
        });
      }

      const commonData = {
        title,
        normalizedTitle: normalizeTitle(title),
        recruiter: getFirstValue(row, recruiterKeys),
        department,
        city: getFirstValue(row, cityKeys),
        state: getFirstValue(row, stateKeys),
        postal: getFirstValue(row, postalKeys),
        openedDate: parseDate(getFirstValue(row, openKeys)),
        filledDate,
        status: filledDate ? "FILLED" : "OPEN",
        activeStatus: filledDate ? "INACTIVE" : "ACTIVE",
        source: sourceType,
        sourceFilename,
        rawJobDescriptionHtml: rawDescription,
        jobDescriptionText: stripHtml(rawDescription),
        rawMinimumRequirements,
        rawPayScale,
        originalFieldsJson: JSON.stringify(row),
        isPilotRole: pilotRole,
        isPilotLeadershipRole: /\b(chief pilot|assistant chief pilot)\b/i.test(title),
        aircraftTypesJson: aircraftTypes.length ? JSON.stringify(aircraftTypes) : null,
        pilotSeat: pilotRole ? detectSeat(title) : null,
        roleCategory: pilotRole ? "Pilot" : department,
        baseLocation: [getFirstValue(row, cityKeys), getFirstValue(row, stateKeys)].filter(Boolean).join(", ") || null,
        paySummary: rawPayScale
      };

      const job = existing
        ? await prisma.job.update({ where: { id: existing.id }, data: commonData })
        : await prisma.job.create({ data: { ...commonData, sourceJobId, jobReqId, paycomReqId, importedAt: new Date() } });

      if (pilotRole) {
        pilotRows += 1;
        const existingRequirement = await prisma.pilotRequirement.findFirst({ where: { sourceJobRecordId: job.id } });
        if (!existingRequirement) {
          const requirementWarnings = extractionWarnings(title, sourceText);
          warnings += requirementWarnings.length > 1 ? 1 : 0;
          const requirement = await prisma.pilotRequirement.create({
            data: {
              sourceJobRecordId: job.id,
              title,
              normalizedTitle: normalizeTitle(title),
              status: job.status === "FILLED" ? "HISTORICAL" : "ACTIVE",
              reviewStatus: requirementWarnings.length > 1 ? "NEEDS_REVIEW" : "DRAFT",
              operatorType: /managed/i.test(sourceText) ? "Managed" : "SkyShare",
              roleCategory: "Pilot",
              pilotSeat: detectSeat(title),
              aircraftTypesJson: aircraftTypes.length ? JSON.stringify(aircraftTypes) : null,
              baseCity: job.city,
              baseState: job.state,
              baseAirport: /\bSLC\b|Salt Lake/i.test(`${job.city} ${job.state} ${sourceText}`) ? "SLC" : null,
              payScaleRaw: rawPayScale,
              rawMinimumRequirements,
              originalJobDescriptionText: sourceText || null,
              originalJobDescriptionHtml: rawDescription,
              extractionConfidence: requirementWarnings.length > 1 ? 60 : 82,
              extractionWarningsJson: JSON.stringify(requirementWarnings),
              sourceHistoryJson: JSON.stringify([{ type: "imported-job-source", jobId: job.id, sourceFilename, importedAt: new Date().toISOString() }])
            }
          });
          await createPilotRequirementGates(requirement.id, `${title}\n${sourceText}`);
          requirements += 1;
        } else {
          // The importer used to create a requirement when none existed and otherwise do
          // NOTHING, so a role that was closed and later reposted came back as an OPEN job
          // still carrying a HISTORICAL requirement — and stayed invisible to the
          // Matchboard, which lists ACTIVE rows. Reimporting the posting now revives it.
          //
          // Operator rule, taken from the status branch in
          // app/api/recruiting-jobs/[id]/route.ts rather than invented again: a SkyShare
          // role follows its JOB, a managed role follows its TAIL. Most managed
          // owner-aircraft roles sit on a closed job row while the seat is very much live,
          // so they are left alone here and switched off when the aircraft leaves.
          //
          // REACTIVATION ONLY, which is where this deliberately stops short of that route.
          // The route deactivates because a human clicked "close this job". The importer
          // has no such signal — it derives status as (filledDate ? FILLED : OPEN), and
          // measured against the live database on Aug 30 that disagrees with the stored
          // status on 52 of the 64 live job rows, because dozens carry a Jazz-era
          // filledDate of 2025-02-25 while being correctly stored RETIRED. Worse, the live
          // "G200 First Officer" requirement hangs off a job row stored OPEN that carries
          // that same stale filledDate, so a deactivating branch would have switched a
          // role the Matchboard is currently serving OFF on the next import. Closing stays
          // an explicit human action.
          //
          // Only the STATUS moves. Gates, manualOverrideNotes and the extracted text are
          // hand-curated — two live requirements carry rules no gate can express — and a
          // re-import must not overwrite them.
          const jobIsOpen = job.status !== "FILLED";
          // A merged-away job row is a duplicate that reconciliation deliberately retired,
          // and 34 of the 57 linked requirements hang off one. identityMatches above has no
          // merged filter, so a CSV carrying an old key still reaches those rows — without
          // this guard a single re-import would resurrect them onto the Matchboard, which
          // is precisely the drift from 9 roles back to 27 that was just undone.
          const jobWasMergedAway = Boolean(job.mergedIntoJobId);
          // INACTIVE and HISTORICAL only. A status somebody chose is left alone: EVERGREEN
          // means "always scanning", and RETIRED/ARCHIVED are decisions, not derived state.
          const revivable = existingRequirement.status === "INACTIVE" || existingRequirement.status === "HISTORICAL";

          if (existingRequirement.operatorType === "SkyShare" && jobIsOpen && !jobWasMergedAway && revivable) {
            await prisma.pilotRequirement.update({
              where: { id: existingRequirement.id },
              data: { status: "ACTIVE" }
            });
            requirementsReactivated += 1;
          }
        }
      } else {
        nonPilotRows += 1;
      }

      await prisma.importRow.create({ data: { importBatchId: batch.id, rowNumber: index + 1, rawJson: JSON.stringify(row), status: existing ? "UPDATED" : "IMPORTED", jobId: job.id } });
      if (existing) updated += 1;
      else created += 1;
    }

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        status: "COMPLETED",
        importedCount: created + updated,
        skippedCount: skipped,
        warningCount: warnings,
        completedAt: new Date(),
        summaryJson: JSON.stringify({ created, updated, skipped, requirements, requirementsReactivated, pilotRows, nonPilotRows, warnings })
      }
    });

    return { batchId: batch.id, created, updated, skipped, requirements, requirementsReactivated, pilotRows, nonPilotRows, warnings };
  } catch (error) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", errorCount: 1, completedAt: new Date(), summaryJson: JSON.stringify({ message: error instanceof Error ? error.message : "Job import failed." }) }
    });
    throw error;
  }
}
