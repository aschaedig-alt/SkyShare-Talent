import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";
import { masterJobCatalog, type MasterJobCatalogEntry } from "../lib/seed/master-job-catalog";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const JobStatus = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  RETIRED: "RETIRED",
  NEEDS_REVIEW: "NEEDS_REVIEW"
} as const;

const BlockCategory = {
  ABOUT: "ABOUT",
  ROLE: "ROLE",
  MISSION: "MISSION",
  VALUES: "VALUES",
  RESPONSIBILITIES: "RESPONSIBILITIES",
  QUALIFICATIONS: "QUALIFICATIONS",
  SKILLS: "SKILLS",
  BENEFITS: "BENEFITS",
  LOCATION: "LOCATION",
  PAYCOM: "PAYCOM",
  CTA: "CTA",
  CUSTOM: "CUSTOM"
} as const;

const BlockScope = {
  GLOBAL: "GLOBAL",
  DEPARTMENT: "DEPARTMENT",
  ROLE: "ROLE",
  JOB_SPECIFIC: "JOB_SPECIFIC"
} as const;

const BlockPlacement = {
  REQUIRED: "REQUIRED",
  DEPARTMENT_SPECIFIC: "DEPARTMENT_SPECIFIC",
  ROLE_SPECIFIC: "ROLE_SPECIFIC",
  OPTIONAL: "OPTIONAL"
} as const;

const BlockInstanceMode = {
  LINKED: "LINKED",
  PINNED_VERSION: "PINNED_VERSION",
  FORKED_CUSTOM: "FORKED_CUSTOM"
} as const;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
  }),
});

type BlockSeed = {
  name: string;
  description: string;
  category: (typeof BlockCategory)[keyof typeof BlockCategory];
  scope: (typeof BlockScope)[keyof typeof BlockScope];
  placement: (typeof BlockPlacement)[keyof typeof BlockPlacement];
  versions: Array<{
    title: string;
    body: string;
    bodyFormat?: "BULLET_LIST" | "PARAGRAPH";
    textWeight?: "NORMAL" | "SEMIBOLD" | "BOLD";
    textColor?: "BLACK" | "LEA" | "EDEN" | "GREY" | "GOLD" | "RED" | "SWEET" | "CLOUD_DANCER";
    changeNote?: string;
  }>;
};

type PaycomSeed = {
  workflow?: string;
  externalApplication?: string;
  externalKnockout?: string;
  externalGlobal?: string;
  externalJobLevel?: string;
  externalFollowUps?: string;
  internalApplication?: string;
  internalKnockout?: string;
  internalGlobal?: string;
  internalJobLevel?: string;
};

type JobSeed = {
  title: string;
  internalName?: string | null;
  department?: string | null;
  category?: string | null;
  location?: string | null;
  secondaryLocation?: string | null;
  positionType?: string | null;
  salaryRange?: string | null;
  reportsTo?: string | null;
  positionCode?: string | null;
  seatCode?: string | null;
  travelPercentage?: string | null;
  educationLevel?: string | null;
  workSchedule?: string | null;
  status: (typeof JobStatus)[keyof typeof JobStatus];
  summary?: string | null;
  keyResponsibilities?: string | null;
  qualificationsText?: string | null;
  benefitsText?: string | null;
  postedDate?: Date | null;
  paycom?: PaycomSeed | null;
  blocks: string[];
  pinAboutToOldVersion?: boolean;
  forkBenefits?: boolean;
};

const blocks: BlockSeed[] = [
  {
    name: "About SkyShare",
    description: "Reusable company introduction for public job posts.",
    category: BlockCategory.ABOUT,
    scope: BlockScope.GLOBAL,
    placement: BlockPlacement.REQUIRED,
    versions: [
      {
        title: "About SkyShare",
        body:
          "SkyShare is an aviation company built around safety, service, and a better private travel experience. Our teams support aircraft owners, charter clients, guests, and one another with professionalism and care.",
        bodyFormat: "PARAGRAPH",
        changeNote: "Original concise company summary."
      },
      {
        title: "About SkyShare",
        body:
          "SkyShare is an aviation company built around safety, thoughtful service, and a better private travel experience. Our teams support aircraft owners, charter clients, guests, and one another with professionalism, ownership, and care.",
        bodyFormat: "PARAGRAPH",
        changeNote: "Added stronger ownership language."
      }
    ]
  },
  {
    name: "Core Values",
    description: "Standard company values block.",
    category: BlockCategory.VALUES,
    scope: BlockScope.GLOBAL,
    placement: BlockPlacement.REQUIRED,
    versions: [
      {
        title: "Core Values",
        body:
          "Safety First\nTeam Alignment\nDeliver the Wow\nSolutions Focused\nOwn the Outcome"
      }
    ]
  },
  {
    name: "Pilot Responsibilities",
    description: "Common responsibilities for pilot roles.",
    category: BlockCategory.RESPONSIBILITIES,
    scope: BlockScope.ROLE,
    placement: BlockPlacement.ROLE_SPECIFIC,
    versions: [
      {
        title: "Job Responsibilities",
        body:
          "Operate assigned aircraft in strict compliance with FAA regulations, company policies, and best practices.\nCoordinate with flight operations, maintenance, and guest services to support safe and efficient trips.\nMaintain professional communication with clients, crew members, and internal teams.\nPrepare for variable schedules, overnight trips, and changing weather or operational conditions."
      }
    ]
  },
  {
    name: "Pilot Qualifications",
    description: "Common qualifications for pilot roles.",
    category: BlockCategory.QUALIFICATIONS,
    scope: BlockScope.ROLE,
    placement: BlockPlacement.ROLE_SPECIFIC,
    versions: [
      {
        title: "Qualifications",
        body:
          "Valid FAA certificates and ratings appropriate for the aircraft and seat.\nCurrent medical certificate and required documents.\nStrong IFR knowledge, sound judgment, and professional cockpit discipline.\nMust be legally authorized to work in the United States without sponsorship."
      }
    ]
  },
  {
    name: "Maintenance Qualifications",
    description: "Common qualifications for aviation maintenance roles.",
    category: BlockCategory.QUALIFICATIONS,
    scope: BlockScope.DEPARTMENT,
    placement: BlockPlacement.DEPARTMENT_SPECIFIC,
    versions: [
      {
        title: "Qualifications",
        body:
          "Airframe and Powerplant certificate preferred or required based on role.\nExperience inspecting, troubleshooting, repairing, and documenting aircraft maintenance work.\nStrong attention to detail and a safety-first mindset.\nAbility to work collaboratively with maintenance leadership and flight operations."
      }
    ]
  },
  {
    name: "Benefits",
    description: "Standard benefits and perks language.",
    category: BlockCategory.BENEFITS,
    scope: BlockScope.GLOBAL,
    placement: BlockPlacement.OPTIONAL,
    versions: [
      {
        title: "Salary, Schedule, and Perks",
        body:
          "Medical, dental, and vision plans available.\nEmployer-paid life insurance with optional additional coverage.\n401(k) plan with employer match options.\nCompetitive paid time off policy.\nTravel perks on eligible unoccupied trips."
      }
    ]
  },
  {
    name: "Closing CTA",
    description: "Standard closing call to action.",
    category: BlockCategory.CTA,
    scope: BlockScope.GLOBAL,
    placement: BlockPlacement.REQUIRED,
    versions: [
      {
        title: "Ready to Apply?",
        body:
          "To learn more about SkyShare and explore open positions, visit SkyShare.com and review our current opportunities.",
        bodyFormat: "PARAGRAPH",
        textWeight: "SEMIBOLD",
        textColor: "LEA"
      }
    ]
  },
  {
    name: "Paycom Default Pilot Templates",
    description: "Default external and internal Paycom template notes for pilot jobs.",
    category: BlockCategory.PAYCOM,
    scope: BlockScope.ROLE,
    placement: BlockPlacement.ROLE_SPECIFIC,
    versions: [
      {
        title: "Paycom Notes",
        body:
          "External workflow: Global Workflow\nExternal knockout: Pilot role knockout\nExternal global: Pilot - Global Questions New\nInternal workflow: Global Workflow\nInternal global: Pilot - Internal - Global New"
      }
    ]
  },
  {
    name: "Paycom Maintenance Templates",
    description: "Default Paycom template notes for maintenance jobs.",
    category: BlockCategory.PAYCOM,
    scope: BlockScope.DEPARTMENT,
    placement: BlockPlacement.DEPARTMENT_SPECIFIC,
    versions: [
      {
        title: "Paycom Notes",
        body:
          "Workflow: Global Workflow\nExternal application: General Application\nExternal global: Default - Global New\nInternal application: Internal Default"
      }
    ]
  },
  {
    name: "Location Requirement - SLC",
    description: "Salt Lake City location requirement.",
    category: BlockCategory.LOCATION,
    scope: BlockScope.DEPARTMENT,
    placement: BlockPlacement.DEPARTMENT_SPECIFIC,
    versions: [
      {
        title: "Location",
        body:
          "This position is based in Salt Lake City, UT. Local availability or reliable commuting access may be required based on the role."
      }
    ]
  },
  {
    name: "Location Requirement - OGD",
    description: "Ogden location requirement.",
    category: BlockCategory.LOCATION,
    scope: BlockScope.DEPARTMENT,
    placement: BlockPlacement.DEPARTMENT_SPECIFIC,
    versions: [
      {
        title: "Location",
        body:
          "This position is based in Ogden, UT. Local availability or reliable commuting access may be required based on the role."
      }
    ]
  },
  {
    name: "Work Authorization",
    description: "Standard work authorization language.",
    category: BlockCategory.QUALIFICATIONS,
    scope: BlockScope.GLOBAL,
    placement: BlockPlacement.REQUIRED,
    versions: [
      {
        title: "Work Authorization",
        body:
          "Candidates must be legally authorized to work in the United States without sponsorship and must be able to complete required background checks."
      }
    ]
  }
];

const jobSeeds: JobSeed[] = [
  {
    title: "Fleet Aircraft Maintenance Technician (AMT)",
    internalName: "Fleet AMT - SLC",
    department: "Maintenance",
    category: "Maintenance",
    location: "SLC - Salt Lake City, UT",
    secondaryLocation: null,
    positionType: "Full Time",
    salaryRange: "$40-$47 per hour, DOE",
    reportsTo: "Maintenance Manager",
    positionCode: "M12",
    seatCode: null,
    travelPercentage: "10%",
    educationLevel: "A&P certificate preferred",
    workSchedule: "Day shift with operational flexibility",
    status: JobStatus.ACTIVE,
    summary:
      "SkyShare is seeking a detail-oriented Aircraft Maintenance Technician to support safe, reliable aircraft operations across the fleet.",
    keyResponsibilities:
      "Inspect, troubleshoot, and repair aircraft systems\nDocument work accurately and follow all maintenance procedures\nCoordinate with maintenance leadership and flight operations",
    qualificationsText:
      "A&P certificate preferred\nAviation maintenance experience\nStrong safety mindset and documentation discipline",
    benefitsText:
      "Health, dental, and vision plans\n401(k) options\nPaid time off\nAviation-focused team environment",
    postedDate: new Date("2026-05-26"),
    paycom: {
      workflow: "Global Workflow",
      externalApplication: "General Application",
      externalKnockout: "Maintenance - AMT - KO",
      externalGlobal: "Default - Global New",
      externalJobLevel: "Maintenance - Job Level",
      internalApplication: "Internal Default",
      internalKnockout: "Maintenance - Internal Default - KO",
      internalGlobal: "Internal - Global New",
      internalJobLevel: "Maintenance - Job Level"
    },
    blocks: [
      "About SkyShare",
      "Core Values",
      "Maintenance Qualifications",
      "Benefits",
      "Paycom Maintenance Templates",
      "Location Requirement - SLC",
      "Closing CTA"
    ]
  },
  {
    title: "Gulfstream G450 & GV Captain",
    internalName: "G450 GV Captain - Home Based",
    department: "Flight Operations",
    category: "FlightOps",
    location: "SLC - Salt Lake City, UT",
    secondaryLocation: "Home Based",
    positionType: "Full Time",
    salaryRange: "$230,000 annually",
    reportsTo: "Chief Pilot",
    positionCode: "P59",
    seatCode: "PIC",
    travelPercentage: "75%",
    educationLevel: "ATP certificate",
    workSchedule: "15/13 rotation",
    status: JobStatus.ACTIVE,
    summary:
      "SkyShare is seeking a passionate and skilled GV typed Captain to fly both the G450 and GV while supporting an exceptional private aviation experience.",
    keyResponsibilities:
      "Operate aircraft safely in domestic and international environments\nCoordinate trip readiness with flight operations and maintenance\nRepresent SkyShare with professionalism and guest-focused service",
    qualificationsText:
      "GV type rating\nATP certificate\nPrior Part 135 experience preferred\nInternational flight experience preferred",
    benefitsText:
      "Competitive salary\nHealth benefits\n401(k) options\nTravel perks on eligible trips",
    postedDate: new Date("2026-05-26"),
    paycom: {
      workflow: "Global Workflow",
      externalApplication: "Pilot Application",
      externalKnockout: "Pilot - G450 PIC - KO",
      externalGlobal: "Pilot - Global Questions New",
      externalJobLevel: "Pilot - GV PIC - Job Level New",
      externalFollowUps: "Pilot - Video Submission, Pilot - Documents, Pilot - Work Auth Follow-Up",
      internalApplication: "Pilot - Internal Application",
      internalKnockout: "Pilot - Internal Default - KO",
      internalGlobal: "Pilot - Internal - Global New",
      internalJobLevel: "Pilot - GV PIC - Job Level New"
    },
    blocks: [
      "About SkyShare",
      "Core Values",
      "Pilot Responsibilities",
      "Pilot Qualifications",
      "Benefits",
      "Paycom Default Pilot Templates",
      "Location Requirement - SLC",
      "Work Authorization",
      "Closing CTA"
    ],
    pinAboutToOldVersion: true
  },
  {
    title: "Citation 560XL First Officer",
    internalName: "560XL SIC",
    department: "Flight Operations",
    category: "FlightOps",
    location: "SLC - Salt Lake City, UT",
    secondaryLocation: null,
    positionType: "Full Time",
    salaryRange: "$95,000-$115,000 annually",
    reportsTo: "Chief Pilot",
    positionCode: "P73",
    seatCode: "SIC",
    travelPercentage: "70%",
    educationLevel: "Commercial certificate",
    workSchedule: "Rotational schedule",
    status: JobStatus.NEEDS_REVIEW,
    summary:
      "Support safe, polished Citation 560XL operations as a First Officer on a high-performing flight operations team.",
    keyResponsibilities:
      "Support preflight planning and aircraft readiness\nAssist the Captain through all phases of flight\nMaintain professional crew communication and service standards",
    qualificationsText:
      "Commercial certificate with instrument rating\nMulti-engine experience\nStrong crew resource management skills",
    benefitsText: "Health benefits\n401(k) options\nPaid time off\nTravel perks",
    postedDate: new Date("2026-05-18"),
    paycom: {
      workflow: "Global Workflow",
      externalApplication: "Pilot Application",
      externalKnockout: "Pilot - 560XL SIC - KO",
      externalGlobal: "Pilot - Global Questions New",
      externalJobLevel: "Pilot - 560XL SIC - Job Level"
    },
    blocks: [
      "About SkyShare",
      "Core Values",
      "Pilot Responsibilities",
      "Pilot Qualifications",
      "Benefits",
      "Paycom Default Pilot Templates",
      "Location Requirement - SLC",
      "Closing CTA"
    ]
  },
  {
    title: "Pilatus PC-12 Captain",
    internalName: "PC-12 Captain",
    department: "Flight Operations",
    category: "FlightOps",
    location: "SLC - Salt Lake City, UT",
    secondaryLocation: "Home Based",
    positionType: "Full Time",
    salaryRange: "$150,000-$175,000 annually",
    reportsTo: "Chief Pilot",
    positionCode: "P42",
    seatCode: "PIC",
    travelPercentage: "70%",
    educationLevel: "ATP certificate preferred",
    workSchedule: "Flexible rotation",
    status: JobStatus.ACTIVE,
    summary:
      "Lead safe and service-minded PC-12 operations while supporting owners, guests, and internal teams.",
    keyResponsibilities:
      "Operate PC-12 aircraft safely and professionally\nManage changing operational requirements\nPartner with dispatch, maintenance, and guest services",
    qualificationsText:
      "PC-12 experience preferred\nStrong IFR background\nProfessional communication and judgment",
    benefitsText: "Medical, dental, and vision\n401(k) options\nPaid time off\nTravel perks",
    postedDate: new Date("2026-05-21"),
    paycom: {
      workflow: "Global Workflow",
      externalApplication: "Pilot Application",
      externalKnockout: "Pilot - PC-12 PIC - KO",
      externalGlobal: "Pilot - Global Questions New",
      externalJobLevel: "Pilot - PC12 PIC - Job Level"
    },
    blocks: [
      "About SkyShare",
      "Core Values",
      "Pilot Responsibilities",
      "Pilot Qualifications",
      "Benefits",
      "Paycom Default Pilot Templates",
      "Location Requirement - SLC",
      "Work Authorization",
      "Closing CTA"
    ]
  },
  {
    title: "Customer Service Representative (Aviation)",
    internalName: "FBO CSR - SLC",
    department: "FBO",
    category: "Customer Service",
    location: "SLC - Salt Lake City, UT",
    positionType: "Full Time",
    salaryRange: "$20-$24 per hour",
    reportsTo: "Customer Service Supervisor",
    positionCode: "F11",
    travelPercentage: "0%",
    educationLevel: "High school diploma or equivalent",
    workSchedule: "Shifts may include weekends and holidays",
    status: JobStatus.ACTIVE,
    summary:
      "Create a polished first impression for guests, pilots, and aircraft owners through thoughtful front-line service.",
    keyResponsibilities:
      "Welcome guests and coordinate front desk service\nSupport flight coordination and facility readiness\nCommunicate clearly with line service and operations teams",
    qualificationsText:
      "Customer service experience\nProfessional communication\nAbility to prioritize in a fast-paced aviation environment",
    benefitsText: "Health benefits\nPaid time off\nTeam-focused aviation environment",
    postedDate: new Date("2026-05-12"),
    paycom: {
      workflow: "Global Workflow",
      externalApplication: "General Application",
      externalGlobal: "Default - Global New"
    },
    blocks: ["About SkyShare", "Core Values", "Benefits", "Location Requirement - SLC", "Closing CTA"]
  },
  {
    title: "Line Service Technician",
    internalName: "Line Service Tech - OGD",
    department: "FBO",
    category: "Line Service",
    location: "OGD - Ogden, UT",
    positionType: "Full Time",
    salaryRange: "$19-$23 per hour",
    reportsTo: "Line Service Manager",
    positionCode: "F22",
    travelPercentage: "0%",
    educationLevel: "High school diploma or equivalent",
    workSchedule: "Shifts may include evenings, weekends, and holidays",
    status: JobStatus.DRAFT,
    summary:
      "Support safe, efficient ramp operations and help deliver a clean, professional FBO experience.",
    keyResponsibilities:
      "Fuel and marshal aircraft safely\nSupport hangar, ramp, and facility presentation\nCoordinate with customer service and operations teams",
    qualificationsText:
      "Ramp or aviation experience preferred\nAbility to work outdoors in changing conditions\nStrong safety mindset",
    benefitsText: "Health benefits\nPaid time off\nAviation training opportunities",
    postedDate: new Date("2026-05-08"),
    paycom: {
      workflow: "Global Workflow",
      externalApplication: "General Application",
      externalGlobal: "Default - Global New"
    },
    blocks: ["About SkyShare", "Core Values", "Benefits", "Location Requirement - OGD", "Closing CTA"]
  },
  {
    title: "Social Media Manager",
    internalName: "Social Media Manager",
    department: "Marketing",
    category: "Marketing",
    location: "SLC - Salt Lake City, UT",
    positionType: "Full Time",
    salaryRange: null,
    reportsTo: "VP of Marketing",
    positionCode: "S18",
    travelPercentage: "10%",
    educationLevel: "Bachelor's degree preferred",
    workSchedule: "Business hours with event flexibility",
    status: JobStatus.NEEDS_REVIEW,
    summary:
      "Build and manage SkyShare's social presence with brand-aware content, thoughtful storytelling, and strong execution.",
    keyResponsibilities:
      "Plan and publish social content\nCoordinate photo, video, and event coverage\nMeasure engagement and recommend improvements",
    qualificationsText:
      "Social media management experience\nStrong copywriting and content planning skills\nAviation or premium service brand experience preferred",
    benefitsText: "Health benefits\n401(k) options\nPaid time off",
    postedDate: new Date("2026-04-29"),
    paycom: null,
    blocks: ["About SkyShare", "Core Values", "Benefits", "Closing CTA"],
    forkBenefits: true
  },
  {
    title: "VP of Aircraft Sales",
    internalName: "VP Aircraft Sales",
    department: "Sales",
    category: "Sales",
    location: "Remote / SLC",
    positionType: "Full Time",
    salaryRange: "Base salary plus commission",
    reportsTo: "Executive Leadership",
    positionCode: "S45",
    travelPercentage: "40%",
    educationLevel: "Bachelor's degree preferred",
    workSchedule: "Business hours with travel flexibility",
    status: JobStatus.ACTIVE,
    summary:
      "Lead aircraft sales strategy, client relationships, and brokerage growth for a premium aviation brand.",
    keyResponsibilities:
      "Develop aircraft sales opportunities\nAdvise clients through acquisition and brokerage decisions\nPartner with marketing and leadership on growth strategy",
    qualificationsText:
      "Aircraft sales or aviation brokerage experience\nStrong client advisory skills\nTrack record of business development success",
    benefitsText: "Executive benefits package\nCommission opportunity\nTravel flexibility",
    postedDate: new Date("2026-05-01"),
    paycom: {
      workflow: "Global Workflow",
      externalApplication: "General Application",
      externalGlobal: "Default - Global New"
    },
    blocks: ["About SkyShare", "Core Values", "Benefits", "Closing CTA"]
  }
];

function buildImportedJobSeed(entry: MasterJobCatalogEntry): JobSeed {
  const isPilotLike =
    entry.category === "FlightOps" ||
    /captain|first officer|pilot|cabin attendant/i.test(entry.title);
  const isMaintenance = entry.category === "Maintenance" || entry.department === "Maintenance";
  const isSLC = /SLC|Salt Lake/i.test(entry.location ?? "");
  const isOGD = /OGD|Ogden/i.test(entry.location ?? "");

  const blocksForJob = ["About SkyShare", "Core Values"];
  if (isPilotLike) {
    blocksForJob.push("Pilot Responsibilities", "Pilot Qualifications", "Paycom Default Pilot Templates");
  }
  if (isMaintenance) {
    blocksForJob.push("Maintenance Qualifications", "Paycom Maintenance Templates");
  }
  blocksForJob.push("Benefits");
  if (isSLC) {
    blocksForJob.push("Location Requirement - SLC");
  }
  if (isOGD) {
    blocksForJob.push("Location Requirement - OGD");
  }
  if (isPilotLike || isMaintenance) {
    blocksForJob.push("Work Authorization");
  }
  blocksForJob.push("Closing CTA");

  return {
    title: entry.title,
    internalName: entry.internalName ?? `${entry.title} - PDF Master`,
    department: entry.department,
    category: entry.category,
    location: entry.location ?? null,
    secondaryLocation: entry.secondaryLocation ?? null,
    positionType: entry.positionType ?? "Full Time",
    salaryRange: entry.salaryRange ?? null,
    reportsTo: entry.reportsTo ?? null,
    positionCode: null,
    seatCode: null,
    travelPercentage: null,
    educationLevel: null,
    workSchedule: null,
    status: entry.status ?? JobStatus.NEEDS_REVIEW,
    summary:
      "Imported from the master PDF catalog. Review this job-specific summary against the source posting before publishing.",
    keyResponsibilities: isPilotLike
      ? "Review pilot responsibilities from the source posting\nConfirm aircraft-specific requirements\nVerify schedule and travel expectations"
      : "Review responsibilities from the source posting\nConfirm department-specific duties\nVerify role expectations before publishing",
    qualificationsText: isMaintenance
      ? "Review A&P and maintenance requirements from the source posting\nConfirm location and schedule requirements\nVerify work authorization language"
      : "Review qualifications from the source posting\nConfirm required experience and credentials\nVerify work authorization language",
    benefitsText:
      "Review salary, schedule, perks, and benefits from the source posting before publishing.",
    postedDate: new Date("2026-05-26"),
    paycom: null,
    blocks: Array.from(new Set(blocksForJob))
  };
}

function buildSeedJobsFromMasterCatalog() {
  const existingTitles = new Set(jobSeeds.map((job) => job.title.trim().toLowerCase()));

  return masterJobCatalog
    .filter((entry) => !existingTitles.has(entry.title.trim().toLowerCase()))
    .map(buildImportedJobSeed);
}

async function createBlock(seed: BlockSeed) {
  const block = await prisma.contentBlock.create({
    data: {
      name: seed.name,
      description: seed.description,
      category: seed.category,
      scope: seed.scope,
      placement: seed.placement
    }
  });

  let currentVersionId: string | null = null;

  for (const [index, version] of seed.versions.entries()) {
    const createdVersion = await prisma.contentBlockVersion.create({
      data: {
        contentBlockId: block.id,
        versionNumber: index + 1,
        title: version.title,
        body: version.body,
        plainText: version.body,
        bodyFormat: version.bodyFormat ?? "BULLET_LIST",
        textWeight: version.textWeight ?? "NORMAL",
        textColor: version.textColor ?? "BLACK",
        changeNote: version.changeNote
      }
    });

    currentVersionId = createdVersion.id;
  }

  return prisma.contentBlock.update({
    where: { id: block.id },
    data: { currentVersionId },
    include: { versions: true }
  });
}

export async function countSeededJobs() {
  return prisma.jobPost.count();
}

export async function disconnectSeedPrisma() {
  await prisma.$disconnect();
}

export async function resetAndSeed() {
  await prisma.jobBlockInstance.deleteMany();
  await prisma.paycomConfig.deleteMany();
  await prisma.jobPost.deleteMany();
  await prisma.contentBlockVersion.deleteMany();
  await prisma.contentBlock.deleteMany();
  await prisma.templateToken.deleteMany();
  await prisma.template.deleteMany();

  const template = await prisma.template.create({
    data: {
      name: "SkyShare Job Post Template",
      isLocked: true,
      version: 1,
      tokens: {
        createMany: {
          data: [
            { key: "color.lea", value: "#0d2c43" },
            { key: "color.eden", value: "#466481" },
            { key: "color.sweet", value: "#a6c9e7" },
            { key: "color.gold", value: "#eaaa00" },
            { key: "color.cloudDancer", value: "#f0eee9" },
            { key: "color.grey", value: "#76787b" },
            { key: "color.black", value: "#302f31" },
            { key: "color.red", value: "#ba0c2f" },
            { key: "type.h1", value: "34px / 1.08 / 700" },
            { key: "type.h2", value: "18px / 1.25 / 700" },
            { key: "layout.sectionOrder", value: "Summary, Blocks, Responsibilities, Qualifications, Benefits, CTA" },
            { key: "layout.bulletStyle", value: "Locked round bullet" }
          ]
        }
      }
    }
  });

  const blockMap = new Map<string, Awaited<ReturnType<typeof createBlock>>>();
  for (const blockSeed of blocks) {
    const block = await createBlock(blockSeed);
    blockMap.set(blockSeed.name, block);
  }

  const allJobSeeds = [...jobSeeds, ...buildSeedJobsFromMasterCatalog()];

  for (const seed of allJobSeeds) {
    const job = await prisma.jobPost.create({
      data: {
        title: seed.title,
        internalName: seed.internalName,
        department: seed.department,
        category: seed.category,
        location: seed.location,
        secondaryLocation: seed.secondaryLocation,
        positionType: seed.positionType,
        salaryRange: seed.salaryRange,
        reportsTo: seed.reportsTo,
        positionCode: seed.positionCode,
        seatCode: seed.seatCode,
        travelPercentage: seed.travelPercentage,
        educationLevel: seed.educationLevel,
        workSchedule: seed.workSchedule,
        summary: seed.summary,
        keyResponsibilities: seed.keyResponsibilities,
        qualificationsText: seed.qualificationsText,
        benefitsText: seed.benefitsText,
        postedDate: seed.postedDate,
        status: seed.status,
        paycom: seed.paycom
          ? {
              create: seed.paycom
            }
          : undefined
      }
    });

    for (const [index, blockName] of seed.blocks.entries()) {
      const block = blockMap.get(blockName);
      if (!block) {
        continue;
      }

      const oldAboutVersion =
        blockName === "About SkyShare"
          ? block.versions.find((version) => version.versionNumber === 1)
          : null;

      const currentVersion = block.versions.find((version) => version.id === block.currentVersionId);
      const version = seed.pinAboutToOldVersion && oldAboutVersion ? oldAboutVersion : currentVersion;
      const forkBenefits = seed.forkBenefits && blockName === "Benefits";

      await prisma.jobBlockInstance.create({
        data: {
          jobPostId: job.id,
          contentBlockId: block.id,
          blockVersionId: version?.id,
          sectionKey: block.category.toLowerCase(),
          sortOrder: index + 1,
          mode: forkBenefits
            ? BlockInstanceMode.FORKED_CUSTOM
            : seed.pinAboutToOldVersion && blockName === "About SkyShare"
              ? BlockInstanceMode.PINNED_VERSION
              : BlockInstanceMode.LINKED,
          customTitle: forkBenefits ? "Creative Team Perks" : null,
          customBody: forkBenefits
            ? "Hybrid-friendly collaboration\nContent tools and brand resources\nEvent and aircraft photo opportunities"
            : null
        }
      });
    }
  }

  console.log(`Seeded ${allJobSeeds.length} jobs, ${blocks.length} reusable blocks, and template ${template.name}.`);
}

const directRunPath = process.argv[1]?.replace(/\\/g, "/") ?? "";

if (directRunPath.endsWith("/prisma/seed.ts")) {
  resetAndSeed()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await disconnectSeedPrisma();
    });
}
