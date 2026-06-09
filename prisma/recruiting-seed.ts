import { PrismaClient } from "./generated/client/client";

type RecruitingSeedPrisma = Pick<
  PrismaClient,
  | "candidate"
  | "candidateContact"
  | "candidateNote"
  | "candidateFile"
  | "job"
  | "candidateApplication"
  | "pilotRequirement"
  | "requirementCatalogItem"
  | "pilotRequirementGate"
  | "interview"
  | "importBatch"
  | "auditEvent"
>;

const catalogItems = [
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
  { key: "atp_certificate", label: "ATP certificate", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: false },
  { key: "part_135_required", label: "Part 135 exp required", category: "Certificates / Compliance", valueType: "boolean", defaultEnabled: false },
  { key: "total_time", label: "Total Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "pic_time", label: "PIC Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "sic_time", label: "SIC Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "multi_engine_time", label: "Multi-Engine Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "jet_time", label: "Jet Aircraft Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false },
  { key: "turbine_time", label: "Fixed-wing Turbine Time", category: "Structured Numeric Pilot Gates", valueType: "hours", defaultEnabled: false }
];

const candidateSeeds = [
  {
    firstName: "Avery",
    lastName: "Morgan",
    title: "Gulfstream G450 PIC",
    email: "avery.morgan@example.test",
    phone: "555-120-4100",
    stage: "Ready for interview",
    source: "Sandbox import",
    tags: ["G450", "PIC", "SLC"],
    note: "Strong G450 history with client-facing Part 135 background.",
    file: "avery-morgan-g450-resume.pdf"
  },
  {
    firstName: "Jordan",
    lastName: "Hayes",
    title: "Citation 560XL SIC",
    email: "jordan.hayes@example.test",
    phone: "(555) 120-4110",
    stage: "Needs document review",
    source: "Sandbox import",
    tags: ["Citation", "SIC", "Jet"],
    note: "Resume has Citation time but instrument totals need confirmation.",
    file: "jordan-hayes-citation-resume.pdf"
  },
  {
    firstName: "Taylor",
    lastName: "Chen",
    title: "PC-12 NG PIC",
    email: "taylor.chen@example.test",
    phone: "+1 555 120 4120",
    stage: "Screening",
    source: "Sandbox import",
    tags: ["PC-12", "PIC", "Home-based"],
    note: "PC-12 profile looks strong; verify current and qualified status.",
    file: "taylor-chen-pc12-resume.pdf"
  },
  {
    firstName: "Riley",
    lastName: "Patel",
    title: "Maintenance Controller",
    email: "riley.patel@example.test",
    phone: "555.120.4130",
    stage: "New",
    source: "Sandbox import",
    tags: ["Maintenance", "Support"],
    note: "Support role candidate included to prove non-pilot records stay separate.",
    file: "riley-patel-maintenance-resume.pdf"
  }
];

const jobSeeds = [
  {
    title: "Gulfstream G450 & GV PIC",
    department: "Pilot",
    seat: "PIC",
    aircraft: ["Gulfstream G450", "GV"],
    city: "Salt Lake City",
    state: "UT",
    status: "OPEN",
    requirementStatus: "ACTIVE",
    total: 5000,
    pic: 3000,
    jet: 1500,
    multi: 2000
  },
  {
    title: "Citation 560XL SIC",
    department: "Pilot",
    seat: "SIC",
    aircraft: ["Citation 560XL"],
    city: "Ogden",
    state: "UT",
    status: "OPEN",
    requirementStatus: "ACTIVE",
    total: 200,
    sic: 560,
    turbine: 100,
    jet: 500
  },
  {
    title: "Pilatus PC-12 NG PIC",
    department: "Pilot",
    seat: "PIC",
    aircraft: ["Pilatus PC-12 NG"],
    city: "Dallas",
    state: "TX",
    status: "OPEN",
    requirementStatus: "ACTIVE",
    total: 2500,
    pic: 1000,
    turbine: 500,
    multi: null
  }
];

function normalizeName(firstName: string, lastName: string) {
  return `${firstName} ${lastName}`.toLowerCase();
}

function normalizePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function aircraftJson(aircraft: string[]) {
  return JSON.stringify(aircraft);
}

function makeSourceText(seed: (typeof jobSeeds)[number]) {
  const lines = [
    `${seed.title}`,
    `${seed.city}, ${seed.state}`,
    "Minimum Requirements",
    seed.total ? `${seed.total} hours total time` : null,
    seed.pic ? `${seed.pic} hours PIC` : null,
    seed.sic ? `${seed.sic} hours SIC` : null,
    seed.multi ? `${seed.multi} hours multi-engine` : null,
    seed.turbine ? `${seed.turbine} hours turbine` : null,
    seed.jet ? `${seed.jet} hours jet` : null,
    "Commercial pilot certificate, instrument rating, first-class medical, FCC permit, passport, current IFR, and TSA/SIDA background checks."
  ];

  return lines.filter(Boolean).join("\n");
}

async function seedRequirementCatalog(prisma: RecruitingSeedPrisma) {
  for (const [index, item] of catalogItems.entries()) {
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
}

async function seedJobsAndRequirements(prisma: RecruitingSeedPrisma) {
  const catalog = await prisma.requirementCatalogItem.findMany();

  for (const seed of jobSeeds) {
    const job = await prisma.job.create({
      data: {
        title: seed.title,
        normalizedTitle: seed.title.toLowerCase(),
        department: seed.department,
        city: seed.city,
        state: seed.state,
        status: seed.status,
        activeStatus: seed.requirementStatus,
        source: "sandbox-recruiting-seed",
        sourceFilename: "seeded-recruiting-data",
        importedAt: new Date(),
        rawMinimumRequirements: makeSourceText(seed),
        jobDescriptionText: makeSourceText(seed),
        rawPayScale: "$120,000 - $220,000 depending on aircraft and seat",
        isPilotRole: true,
        aircraftTypesJson: aircraftJson(seed.aircraft),
        pilotSeat: seed.seat,
        roleCategory: "Pilot",
        baseLocation: `${seed.city}, ${seed.state}`,
        paySummary: "$120k - $220k"
      }
    });

    const requirement = await prisma.pilotRequirement.create({
      data: {
        sourceJobRecordId: job.id,
        title: seed.title,
        normalizedTitle: seed.title.toLowerCase(),
        status: seed.requirementStatus,
        reviewStatus: "DRAFT",
        operatorType: "Managed",
        roleCategory: "Pilot",
        pilotSeat: seed.seat,
        aircraftTypesJson: aircraftJson(seed.aircraft),
        baseCity: seed.city,
        baseState: seed.state,
        baseAirport: seed.state === "UT" ? "SLC" : null,
        payScaleRaw: "$120,000 - $220,000 depending on aircraft and seat",
        rawMinimumRequirements: makeSourceText(seed),
        originalJobDescriptionText: makeSourceText(seed),
        extractionConfidence: 82,
        extractionWarningsJson: JSON.stringify(["Seeded example; verify exact hours before using for production matching."])
      }
    });

    const numericGates = [
      ["total_time", seed.total],
      ["pic_time", seed.pic],
      ["sic_time", seed.sic],
      ["multi_engine_time", seed.multi],
      ["turbine_time", seed.turbine],
      ["jet_time", seed.jet]
    ] as const;

    const enabledKeys = new Set([
      "commercial_certificate",
      "instrument_rating",
      "first_class_medical",
      "fcc_permit",
      "us_passport",
      "us_drivers_license",
      "current_ifr",
      "work_authorization",
      "tsa_sida",
      "training_contract",
      ...numericGates.filter(([, value]) => typeof value === "number").map(([key]) => key)
    ]);

    for (const [index, item] of catalog.entries()) {
      const numericValue = numericGates.find(([key]) => key === item.key)?.[1] ?? null;
      await prisma.pilotRequirementGate.create({
        data: {
          pilotRequirementId: requirement.id,
          catalogItemId: item.id,
          key: item.key,
          label: item.label,
          category: item.category,
          valueType: item.valueType,
          enabled: enabledKeys.has(item.key),
          numericValue: typeof numericValue === "number" ? numericValue : null,
          evidenceText: enabledKeys.has(item.key) ? makeSourceText(seed) : null,
          sortOrder: index + 1
        }
      });
    }
  }
}

async function seedCandidates(prisma: RecruitingSeedPrisma) {
  const jobs = await prisma.job.findMany({ orderBy: { title: "asc" } });

  for (const [index, seed] of candidateSeeds.entries()) {
    const candidate = await prisma.candidate.create({
      data: {
        firstName: seed.firstName,
        lastName: seed.lastName,
        displayName: `${seed.firstName} ${seed.lastName}`,
        normalizedName: normalizeName(seed.firstName, seed.lastName),
        primaryEmail: seed.email,
        normalizedEmail: seed.email.toLowerCase(),
        primaryPhone: seed.phone,
        normalizedPhone: normalizePhone(seed.phone),
        currentTitle: seed.title,
        status: "ACTIVE",
        stage: seed.stage,
        owner: "Sandbox Recruiter",
        source: seed.source,
        tagsJson: JSON.stringify(seed.tags),
        sourceHistoryJson: JSON.stringify([{ source: seed.source, importedAt: new Date().toISOString() }])
      }
    });

    await prisma.candidateContact.createMany({
      data: [
        {
          candidateId: candidate.id,
          type: "email",
          value: seed.email,
          normalized: seed.email.toLowerCase(),
          isPrimary: true,
          source: seed.source
        },
        {
          candidateId: candidate.id,
          type: "phone",
          value: seed.phone,
          normalized: normalizePhone(seed.phone),
          isPrimary: true,
          source: seed.source
        }
      ]
    });

    await prisma.candidateNote.create({
      data: {
        candidateId: candidate.id,
        body: seed.note,
        source: "sandbox-recruiting-seed"
      }
    });

    await prisma.candidateFile.create({
      data: {
        candidateId: candidate.id,
        originalFilename: seed.file,
        displayFilename: seed.file,
        mimeType: "application/pdf",
        source: "sandbox-recruiting-seed",
        metadataJson: JSON.stringify({ seeded: true })
      }
    });

    const job = jobs[index % jobs.length];
    if (job) {
      await prisma.candidateApplication.create({
        data: {
          candidateId: candidate.id,
          jobId: job.id,
          status: "Active",
          stage: seed.stage,
          source: "sandbox-recruiting-seed",
          appliedAt: new Date()
        }
      });
    }
  }
}

async function seedOperationalRecords(prisma: RecruitingSeedPrisma) {
  const candidate = await prisma.candidate.findFirst({ orderBy: { displayName: "asc" } });
  const job = await prisma.job.findFirst({ orderBy: { title: "asc" } });

  if (candidate) {
    await prisma.interview.create({
      data: {
        candidateId: candidate.id,
        jobId: job?.id,
        title: `${candidate.displayName} recruiter screen`,
        startDateTime: new Date(Date.now() + 1000 * 60 * 60 * 24),
        endDateTime: new Date(Date.now() + 1000 * 60 * 60 * 25),
        timezone: "America/Denver",
        interviewer: "Sandbox Recruiter",
        status: "SCHEDULED",
        source: "sandbox-recruiting-seed"
      }
    });
  }

  await prisma.importBatch.create({
    data: {
      sourceType: "SANDBOX_RECRUITING_SEED",
      sourceFilename: "seeded-recruiting-data",
      status: "COMPLETED",
      rowCount: candidateSeeds.length + jobSeeds.length,
      importedCount: candidateSeeds.length + jobSeeds.length,
      completedAt: new Date(),
      summaryJson: JSON.stringify({
        candidates: candidateSeeds.length,
        jobs: jobSeeds.length,
        pilotRequirements: jobSeeds.length
      })
    }
  });

  await prisma.auditEvent.create({
    data: {
      eventType: "RECRUITING_SEED_CREATED",
      entityType: "workspace",
      summary: "Created initial sandbox recruiting records for the unified app foundation.",
      payloadJson: JSON.stringify({ candidates: candidateSeeds.length, jobs: jobSeeds.length })
    }
  });
}

export async function ensureRecruitingSeedData(prisma: RecruitingSeedPrisma) {
  await seedRequirementCatalog(prisma);

  const candidateCount = await prisma.candidate.count();
  const jobCount = await prisma.job.count();

  if (candidateCount > 0 || jobCount > 0) {
    console.log(`Recruiting data ready with ${candidateCount} candidates and ${jobCount} recruiting jobs.`);
    return;
  }

  await seedJobsAndRequirements(prisma);
  await seedCandidates(prisma);
  await seedOperationalRecords(prisma);

  console.log(`Seeded ${candidateSeeds.length} candidates, ${jobSeeds.length} recruiting jobs, and ${jobSeeds.length} pilot requirements.`);
}
