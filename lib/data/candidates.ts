import { prisma } from "@/lib/prisma";

export type CandidateListItem = {
  id: string;
  displayName: string;
  currentTitle: string | null;
  stage: string | null;
  owner: string | null;
  source: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  tags: string[];
  updatedAt: string;
  noteCount: number;
  fileCount: number;
  applicationCount: number;
};

export type CandidateListData = {
  candidates: CandidateListItem[];
  stats: {
    total: number;
    active: number;
    withFiles: number;
    withApplications: number;
    scheduledInterviews: number;
  };
};

export type CandidateProfileData = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  currentTitle: string | null;
  status: string;
  stage: string | null;
  owner: string | null;
  source: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  tags: string[];
  folders: string[];
  createdAt: string;
  updatedAt: string;
  contacts: Array<{
    id: string;
    type: string;
    label: string | null;
    value: string;
    isPrimary: boolean;
    source: string | null;
  }>;
  files: Array<{
    id: string;
    originalFilename: string;
    displayFilename: string;
    storageKey: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    source: string | null;
    uploadedAt: string;
  }>;
  notes: Array<{
    id: string;
    body: string;
    source: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  applications: Array<{
    id: string;
    status: string | null;
    stage: string | null;
    source: string | null;
    appliedAt: string | null;
    job: {
      id: string;
      title: string;
      department: string | null;
      status: string;
      location: string | null;
    } | null;
    pilotRequirement: {
      id: string;
      title: string;
      status: string;
      reviewStatus: string;
    } | null;
  }>;
  interviews: Array<{
    id: string;
    title: string;
    startDateTime: string;
    endDateTime: string | null;
    timezone: string | null;
    interviewer: string | null;
    location: string | null;
    meetingUrl: string | null;
    status: string;
    notes: string | null;
  }>;
};

function parseStringArray(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function matchesSearch(candidate: CandidateListItem, query: string) {
  if (!query) {
    return true;
  }

  const searchable = [
    candidate.displayName,
    candidate.currentTitle,
    candidate.stage,
    candidate.owner,
    candidate.source,
    candidate.primaryEmail,
    candidate.primaryPhone,
    ...candidate.tags
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(query.toLowerCase());
}

export async function getCandidateListData(query = ""): Promise<CandidateListData> {
  const normalizedQuery = query.trim().toLowerCase();
  const candidateWhere = normalizedQuery
    ? {
        OR: [
          { normalizedName: { contains: normalizedQuery } },
          { normalizedEmail: { contains: normalizedQuery } },
          { normalizedPhone: { contains: normalizedQuery.replace(/\D/g, "") || normalizedQuery } },
          { displayName: { contains: query } },
          { currentTitle: { contains: query } },
          { stage: { contains: query } },
          { owner: { contains: query } },
          { source: { contains: query } },
          { primaryEmail: { contains: normalizedQuery } },
          { primaryPhone: { contains: query } },
          { tagsJson: { contains: query } }
        ]
      }
    : {};

  const [candidateRows, total, active, withFiles, withApplications, scheduledInterviews] = await Promise.all([
    prisma.candidate.findMany({
      where: candidateWhere,
      take: 100,
      orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
      include: {
        _count: {
          select: {
            notes: true,
            files: true,
            applications: true
          }
        }
      }
    }),
    prisma.candidate.count(),
    prisma.candidate.count({ where: { status: "ACTIVE" } }),
    prisma.candidate.count({ where: { files: { some: {} } } }),
    prisma.candidate.count({ where: { applications: { some: {} } } }),
    prisma.interview.count({ where: { status: "SCHEDULED" } })
  ]);

  const candidates = candidateRows.map((candidate) => ({
    id: candidate.id,
    displayName: candidate.displayName,
    currentTitle: candidate.currentTitle,
    stage: candidate.stage,
    owner: candidate.owner,
    source: candidate.source,
    primaryEmail: candidate.primaryEmail,
    primaryPhone: candidate.primaryPhone,
    tags: parseStringArray(candidate.tagsJson),
    updatedAt: candidate.updatedAt.toISOString(),
    noteCount: candidate._count.notes,
    fileCount: candidate._count.files,
    applicationCount: candidate._count.applications
  }));

  const filteredCandidates = normalizedQuery ? candidates.filter((candidate) => matchesSearch(candidate, query)) : candidates;

  return {
    candidates: filteredCandidates,
    stats: {
      total,
      active,
      withFiles,
      withApplications,
      scheduledInterviews
    }
  };
}

function formatLocation(city: string | null, state: string | null) {
  return [city, state].filter(Boolean).join(", ") || null;
}

export async function getCandidateProfileData(id: string): Promise<CandidateProfileData | null> {
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { type: "asc" }]
      },
      files: {
        orderBy: { uploadedAt: "asc" }
      },
      notes: {
        orderBy: { createdAt: "desc" }
      },
      applications: {
        orderBy: { updatedAt: "desc" },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              department: true,
              status: true,
              city: true,
              state: true
            }
          },
          pilotRequirement: {
            select: {
              id: true,
              title: true,
              status: true,
              reviewStatus: true
            }
          }
        }
      },
      interviews: {
        orderBy: { startDateTime: "asc" }
      }
    }
  });

  if (!candidate) {
    return null;
  }

  return {
    id: candidate.id,
    displayName: candidate.displayName,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    currentTitle: candidate.currentTitle,
    status: candidate.status,
    stage: candidate.stage,
    owner: candidate.owner,
    source: candidate.source,
    primaryEmail: candidate.primaryEmail,
    primaryPhone: candidate.primaryPhone,
    tags: parseStringArray(candidate.tagsJson),
    folders: parseStringArray(candidate.foldersJson),
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    contacts: candidate.contacts.map((contact) => ({
      id: contact.id,
      type: contact.type,
      label: contact.label,
      value: contact.value,
      isPrimary: contact.isPrimary,
      source: contact.source
    })),
    files: candidate.files.map((file) => ({
      id: file.id,
      originalFilename: file.originalFilename,
      displayFilename: file.displayFilename,
      storageKey: file.storageKey,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      source: file.source,
      uploadedAt: file.uploadedAt.toISOString()
    })),
    notes: candidate.notes.map((note) => ({
      id: note.id,
      body: note.body,
      source: note.source,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString()
    })),
    applications: candidate.applications.map((application) => ({
      id: application.id,
      status: application.status,
      stage: application.stage,
      source: application.source,
      appliedAt: application.appliedAt?.toISOString() ?? null,
      job: application.job
        ? {
            id: application.job.id,
            title: application.job.title,
            department: application.job.department,
            status: application.job.status,
            location: formatLocation(application.job.city, application.job.state)
          }
        : null,
      pilotRequirement: application.pilotRequirement
        ? {
            id: application.pilotRequirement.id,
            title: application.pilotRequirement.title,
            status: application.pilotRequirement.status,
            reviewStatus: application.pilotRequirement.reviewStatus
          }
        : null
    })),
    interviews: candidate.interviews.map((interview) => ({
      id: interview.id,
      title: interview.title,
      startDateTime: interview.startDateTime.toISOString(),
      endDateTime: interview.endDateTime?.toISOString() ?? null,
      timezone: interview.timezone,
      interviewer: interview.interviewer,
      location: interview.location,
      meetingUrl: interview.meetingUrl,
      status: interview.status,
      notes: interview.notes
    }))
  };
}
