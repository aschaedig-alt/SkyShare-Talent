import { prisma } from "@/lib/prisma";
import { METRIC_DEFS, type MetricKind } from "@/lib/extraction/pilot-metrics";
import { parseStringArray } from "@/lib/json";
import { normalizeEmail, normalizeName } from "@/lib/candidates/normalize";

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
  docMatch: { filename: string; snippet: string } | null;
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
  pros: string[];
  cons: string[];
  createdAt: string;
  updatedAt: string;
  // Cross-link to a separate historical (Jazz) profile that appears to be the
  // same person. Populated only on non-Jazz profiles; drives the merge panel.
  linkedHistorical: {
    reviewItemId: string;
    candidateId: string;
    displayName: string;
    jazzCandidateNumber: string | null;
    confidence: string;
    reason: string;
    applicationCount: number;
    interviewCount: number;
    fileCount: number;
  } | null;
  // Drives the "move to pre-onboarding" action. hireId is set once this candidate
  // has been moved (NewHire.candidateId), so the panel links instead of re-creating.
  preOnboarding: {
    hireId: string | null;
    hireStage: string | null;
    isHired: boolean;
    suggestedPosition: string | null;
    suggestedDepartment: string | null;
    // An existing hand-typed hire with the same name that isn't linked to anyone.
    // Offer to LINK to it rather than creating a duplicate record.
    matchingHire: {
      id: string;
      name: string;
      stage: string;
      position: string | null;
      department: string | null;
      startDate: string | null;
    } | null;
  };
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
    documentType: string | null;
    expiresAt: string | null;
    uploadedAt: string;
    extractedText: string | null;
  }>;
  metrics: Array<{
    id: string;
    key: string;
    label: string;
    valueNumber: number | null;
    valueText: string | null;
    unit: string | null;
    status: string;
    sourceFileId: string | null;
    sourceSnippet: string | null;
  }>;
  notes: Array<{
    id: string;
    body: string;
    source: string | null;
    author: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  activity: Array<{
    id: string;
    activityType: string;
    description: string;
    actor: string | null;
    createdAt: string;
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
    questionnaire: Array<{ questionnaireName: string | null; question: string | null; answer: string | null }>;
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
  // Historical Candidate Archive surfaces. `origin` is internal (PAYCOM | JAZZ |
  // MANUAL); `isHistorical` is true when the profile carries legacy (Jazz) data,
  // whether it was created from it or merged into an existing candidate.
  origin: string;
  jazzCandidateNumber: string | null;
  isHistorical: boolean;
  historicalMatch: {
    applicationCount: number;
    interviewers: string[];
    hasNotes: boolean;
    declinedOffer: boolean;
    resumeArchived: boolean;
    hired: boolean;
  } | null;
  timeline: Array<{
    id: string;
    type: string;
    title: string;
    detail: string | null;
    occurredAt: string;
    origin: string;
  }>;
  aiSummary: { summary: string; generatedAt: string } | null;
  communications: Array<{
    id: string;
    subject: string | null;
    senderEmail: string | null;
    recipientEmail: string | null;
    sentAt: string | null;
    body: string | null;
    fromCandidate: boolean;
  }>;
  communicationCount: number;
};


/** Merge legacy tagsJson tags with normalized CandidateTag labels (case-insensitive dedupe). */
function mergeTags(jsonTags: string[], normalizedTags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...jsonTags, ...normalizedTags]) {
    const trimmed = t.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

/** Build a short excerpt around the first match of query in text. */
function buildSnippet(text: string, query: string): string {
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(query.toLowerCase());
  if (idx === -1) {
    return text.slice(0, 140).trim();
  }
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + query.length + 90);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export async function getCandidateListData(query = ""): Promise<CandidateListData> {
  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  // When searching, span ALL candidates including archived/historical (Jazz)
  // ones so legacy records are findable. With no query, the default list stays
  // active-only (archivedAt: null) so the historical archive doesn't flood it.
  const candidateWhere = hasQuery
    ? {
        OR: [
          { normalizedName: { contains: normalizedQuery } },
          { normalizedEmail: { contains: normalizedQuery } },
          { normalizedPhone: { contains: normalizedQuery.replace(/\D/g, "") || normalizedQuery } },
          { displayName: { contains: query, mode: "insensitive" as const } },
          { currentTitle: { contains: query, mode: "insensitive" as const } },
          { stage: { contains: query, mode: "insensitive" as const } },
          { owner: { contains: query, mode: "insensitive" as const } },
          { source: { contains: query, mode: "insensitive" as const } },
          { primaryEmail: { contains: normalizedQuery, mode: "insensitive" as const } },
          { primaryPhone: { contains: query } },
          { tagsJson: { contains: query, mode: "insensitive" as const } },
          // Search inside document text (resumes, pilot apps, etc.)
          { files: { some: { extractedText: { contains: query, mode: "insensitive" as const } } } }
        ]
      }
    : { archivedAt: null };

  // Only pull document text for matching files when there's a query (keeps the list light).
  const filesInclude = hasQuery
    ? ({
        where: { extractedText: { contains: query, mode: "insensitive" as const } },
        select: { displayFilename: true, extractedText: true },
        take: 1
      } as const)
    : false;

  const [candidateRows, total, active, withFiles, withApplications, scheduledInterviews] = await Promise.all([
    prisma.candidate.findMany({
      where: candidateWhere,
      take: 100,
      orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
      include: {
        files: filesInclude,
        candidateTags: { include: { tag: { select: { label: true } } } },
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

  const candidates: CandidateListItem[] = candidateRows.map((candidate) => {
    const matchedFile = hasQuery
      ? (candidate as typeof candidate & { files?: Array<{ displayFilename: string; extractedText: string | null }> }).files?.[0]
      : undefined;
    const docMatch =
      matchedFile?.extractedText
        ? { filename: matchedFile.displayFilename, snippet: buildSnippet(matchedFile.extractedText, query) }
        : null;

    return {
      id: candidate.id,
      displayName: candidate.displayName,
      currentTitle: candidate.currentTitle,
      stage: candidate.stage,
      owner: candidate.owner,
      source: candidate.source,
      primaryEmail: candidate.primaryEmail,
      primaryPhone: candidate.primaryPhone,
      tags: mergeTags(
        parseStringArray(candidate.tagsJson),
        (candidate as typeof candidate & { candidateTags?: Array<{ tag: { label: string } }> }).candidateTags?.map((ct) => ct.tag.label) ?? []
      ),
      updatedAt: candidate.updatedAt.toISOString(),
      noteCount: candidate._count.notes,
      fileCount: candidate._count.files,
      applicationCount: candidate._count.applications,
      docMatch
    };
  });

  return {
    candidates,
    stats: {
      total,
      active,
      withFiles,
      withApplications,
      scheduledInterviews
    }
  };
}

// ---------------------------------------------------------------------------
// Comparison table — compare flight metrics, type ratings & certs across everyone
// ---------------------------------------------------------------------------

export type ComparisonColumn = {
  key: string;
  label: string;
  kind: MetricKind;
  unit?: string;
};

export type ComparisonMetric = {
  number: number | null;
  text: string | null;
  unit: string | null;
  confirmed: boolean; // false = still a SUGGESTED (unconfirmed) extraction
};

export type CandidateComparisonRow = {
  id: string;
  displayName: string;
  currentTitle: string | null;
  stage: string | null;
  updatedAt: string;
  metrics: Record<string, ComparisonMetric>; // keyed by metric key (hours/text columns)
  typeRatings: string[];
  certificates: string[];
};

export type CandidateComparisonData = {
  rows: CandidateComparisonRow[];
  columns: ComparisonColumn[]; // every numeric/text metric column (excludes the list columns)
  typeRatingOptions: string[];
  certificateOptions: string[];
};

/** Split a stored list value ("GV, G450 / CE-525") into clean tokens. */
function splitListValue(value: string | null): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[,;/|]+|\band\b/gi)
        .map((part) => part.trim())
        .filter(Boolean)
    )
  ];
}

export async function getCandidateComparisonData(): Promise<CandidateComparisonData> {
  const candidateRows = await prisma.candidate.findMany({
    where: { archivedAt: null },
    take: 1000,
    orderBy: [{ displayName: "asc" }],
    select: {
      id: true,
      displayName: true,
      currentTitle: true,
      stage: true,
      updatedAt: true,
      metrics: {
        where: { status: { not: "DISMISSED" } },
        select: { key: true, valueNumber: true, valueText: true, unit: true, status: true }
      }
    }
  });

  // Scalar (hours/text) columns only; the two list columns get dedicated chip cells.
  const columns: ComparisonColumn[] = METRIC_DEFS.filter((def) => def.kind !== "list").map((def) => ({
    key: def.key,
    label: def.label,
    kind: def.kind,
    unit: def.unit
  }));

  const typeRatingSet = new Set<string>();
  const certificateSet = new Set<string>();

  const rows: CandidateComparisonRow[] = candidateRows.map((candidate) => {
    const metrics: Record<string, ComparisonMetric> = {};
    let typeRatings: string[] = [];
    let certificates: string[] = [];

    for (const metric of candidate.metrics) {
      if (metric.key === "type_ratings") {
        typeRatings = splitListValue(metric.valueText);
        typeRatings.forEach((rating) => typeRatingSet.add(rating));
        continue;
      }
      if (metric.key === "certificates") {
        certificates = splitListValue(metric.valueText);
        certificates.forEach((cert) => certificateSet.add(cert));
        continue;
      }
      metrics[metric.key] = {
        number: metric.valueNumber,
        text: metric.valueText,
        unit: metric.unit,
        confirmed: metric.status === "CONFIRMED"
      };
    }

    return {
      id: candidate.id,
      displayName: candidate.displayName,
      currentTitle: candidate.currentTitle,
      stage: candidate.stage,
      updatedAt: candidate.updatedAt.toISOString(),
      metrics,
      typeRatings,
      certificates
    };
  });

  return {
    rows,
    columns,
    typeRatingOptions: [...typeRatingSet].sort((a, b) => a.localeCompare(b)),
    certificateOptions: [...certificateSet].sort((a, b) => a.localeCompare(b))
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
      metrics: {
        where: { status: { not: "DISMISSED" } },
        orderBy: { createdAt: "asc" }
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true, email: true } } }
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
          },
          questionnaireAnswers: {
            select: { questionnaireName: true, question: true, answer: true }
          }
        }
      },
      interviews: {
        orderBy: { startDateTime: "asc" }
      },
      aiSummary: true,
      candidateTags: { include: { tag: { select: { label: true } } } },
      communications: {
        orderBy: { sentAt: "desc" },
        take: 100
      },
      _count: { select: { communications: true } }
    }
  });

  if (!candidate) {
    return null;
  }

  // Derive the "historical match" facts that drive the banner. A profile counts
  // as historical when it originated from Jazz, or had Jazz data merged into it.
  const isHistorical = candidate.origin === "JAZZ" || Boolean(candidate.historicalSourceId);
  const interviewers = [
    ...new Set(candidate.interviews.map((i) => i.interviewer).filter((v): v is string => Boolean(v)))
  ];
  const declinedOffer = candidate.applications.some((a) => (a.status ?? "").toLowerCase().includes("declined"));
  const hired = candidate.applications.some((a) => (a.status ?? "").toLowerCase().includes("hired") && !(a.status ?? "").toLowerCase().includes("elsewhere"));
  const resumeArchived = candidate.files.some((f) => (f.documentType ?? "").toLowerCase() === "resume");
  const historicalMatch = isHistorical
    ? {
        applicationCount: candidate.applications.length,
        interviewers,
        hasNotes: candidate.notes.length > 0,
        declinedOffer,
        resumeArchived,
        hired
      }
    : null;

  // Unified timeline built from the real relations so everything links together
  // chronologically — every application (with its job), interview, and note —
  // even when the candidate applied to more than one job.
  const timeline = [
    ...candidate.applications
      .filter((a) => a.appliedAt)
      .map((a) => ({
        id: `app-${a.id}`,
        type: a.disposition ?? "APPLIED",
        title: a.job?.title ?? a.historicalJobTitle ?? "Application",
        detail: a.status ?? null,
        occurredAt: a.appliedAt!.toISOString(),
        origin: a.origin
      })),
    ...candidate.interviews.map((i) => ({
      id: `iv-${i.id}`,
      type: "INTERVIEWED",
      title: i.title,
      detail: [i.interviewer, i.notes?.trim()].filter(Boolean).join(" · ") || null,
      occurredAt: i.startDateTime.toISOString(),
      origin: i.source === "JAZZ" ? "JAZZ" : "PAYCOM"
    })),
    ...candidate.notes.map((n) => ({
      id: `note-${n.id}`,
      type: n.source === "JAZZ_FEEDBACK" ? "INTERVIEW_NOTE" : "NOTE",
      title: n.body.replace(/\s+/g, " ").slice(0, 240),
      detail: null as string | null,
      occurredAt: n.createdAt.toISOString(),
      origin: n.source === "JAZZ_FEEDBACK" || n.source === "JAZZ" ? "JAZZ" : "PAYCOM"
    }))
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  // Per-candidate activity history (edits, note add/remove, dedupe, etc.).
  const activityRows = await prisma.activityLog.findMany({
    where: { entityType: "Candidate", entityId: candidate.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } } }
  });

  // New candidate ↔ historical (Jazz) cross-link, surfaced on the new profile so
  // the recruiter can view the archived record or merge it in. Only shown on
  // non-Jazz profiles; backed by the existing duplicate-review + merge machinery.
  const historicalLinkSelect = {
    id: true,
    displayName: true,
    origin: true,
    status: true,
    jazzCandidateNumber: true,
    _count: { select: { applications: true, interviews: true, files: true } }
  } as const;
  let linkedHistorical: CandidateProfileData["linkedHistorical"] = null;
  if (candidate.origin !== "JAZZ" && candidate.status !== "MERGED") {
    const reviewItems = await prisma.duplicateReviewItem.findMany({
      where: {
        reviewType: "CANDIDATE",
        status: "OPEN",
        OR: [{ primaryCandidateId: candidate.id }, { secondaryCandidateId: candidate.id }]
      },
      include: {
        primaryCandidate: { select: historicalLinkSelect },
        secondaryCandidate: { select: historicalLinkSelect }
      }
    });
    // Prefer HIGH-confidence pairs; only surface a Jazz-origin counterpart.
    const ranked = reviewItems.sort(
      (a, b) => (a.confidence === "HIGH" ? -1 : 1) - (b.confidence === "HIGH" ? -1 : 1)
    );
    for (const item of ranked) {
      const other = item.primaryCandidateId === candidate.id ? item.secondaryCandidate : item.primaryCandidate;
      if (other && other.origin === "JAZZ" && other.status !== "MERGED") {
        linkedHistorical = {
          reviewItemId: item.id,
          candidateId: other.id,
          displayName: other.displayName,
          jazzCandidateNumber: other.jazzCandidateNumber,
          confidence: item.confidence,
          reason: item.reason,
          applicationCount: other._count.applications,
          interviewCount: other._count.interviews,
          fileCount: other._count.files
        };
        break;
      }
    }
  }

  // Pre-onboarding link: has this candidate already been moved to a NewHire, and
  // what should we prefill if not? Position/department come from the job they were
  // hired into, falling back to their current title.
  const hiredApp = candidate.applications.find(
    (a) => (a.status ?? "").toLowerCase().includes("hired") && !(a.status ?? "").toLowerCase().includes("elsewhere")
  );
  const existingHire = await prisma.newHire.findFirst({
    where: { candidateId: candidate.id },
    select: { id: true, stage: true }
  });
  // Not linked yet? Look for an existing hand-typed hire with the same name.
  // None of the legacy hires carry a candidateId, so without this we'd happily
  // create a duplicate for anyone already typed into pre-onboarding.
  let matchingHire: CandidateProfileData["preOnboarding"]["matchingHire"] = null;
  if (!existingHire && candidate.status !== "ARCHIVED" && candidate.status !== "MERGED") {
    const target = normalizeName(candidate.displayName);
    if (target) {
      const unlinked = await prisma.newHire.findMany({
        where: { candidateId: null },
        select: { id: true, name: true, stage: true, position: true, department: true, startDate: true }
      });
      const hit = unlinked.find((h) => normalizeName(h.name) === target);
      if (hit) {
        matchingHire = {
          id: hit.id,
          name: hit.name,
          stage: hit.stage,
          position: hit.position,
          department: hit.department,
          startDate: hit.startDate ? hit.startDate.toISOString() : null
        };
      }
    }
  }

  const preOnboarding = {
    hireId: existingHire?.id ?? null,
    hireStage: existingHire?.stage ?? null,
    isHired: hired,
    suggestedPosition: hiredApp?.job?.title ?? candidate.currentTitle ?? null,
    suggestedDepartment: hiredApp?.job?.department ?? null,
    matchingHire
  };

  return {
    id: candidate.id,
    linkedHistorical,
    preOnboarding,
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
    tags: mergeTags(parseStringArray(candidate.tagsJson), candidate.candidateTags.map((ct) => ct.tag.label)),
    folders: parseStringArray(candidate.foldersJson),
    pros: parseStringArray(candidate.prosJson),
    cons: parseStringArray(candidate.consJson),
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
      documentType: file.documentType,
      expiresAt: file.expiresAt ? file.expiresAt.toISOString() : null,
      uploadedAt: file.uploadedAt.toISOString(),
      extractedText: file.extractedText
    })),
    metrics: candidate.metrics.map((m) => ({
      id: m.id,
      key: m.key,
      label: m.label,
      valueNumber: m.valueNumber,
      valueText: m.valueText,
      unit: m.unit,
      status: m.status,
      sourceFileId: m.sourceFileId,
      sourceSnippet: m.sourceSnippet
    })),
    notes: candidate.notes.map((note) => ({
      id: note.id,
      body: note.body,
      source: note.source,
      author: note.author?.name ?? note.author?.email ?? null,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString()
    })),
    activity: activityRows.map((row) => ({
      id: row.id,
      activityType: row.activityType,
      description: row.description,
      actor: row.user?.name ?? row.user?.email ?? row.userEmail ?? null,
      createdAt: row.createdAt.toISOString()
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
        : null,
      questionnaire: application.questionnaireAnswers.map((q) => ({
        questionnaireName: q.questionnaireName,
        question: q.question,
        answer: q.answer
      }))
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
    })),
    origin: candidate.origin,
    jazzCandidateNumber: candidate.jazzCandidateNumber,
    isHistorical,
    historicalMatch,
    timeline,
    aiSummary: candidate.aiSummary
      ? { summary: candidate.aiSummary.summary, generatedAt: candidate.aiSummary.generatedAt.toISOString() }
      : null,
    communications: candidate.communications.map((c) => ({
      id: c.id,
      subject: c.subject,
      senderEmail: c.senderEmail,
      recipientEmail: c.recipientEmail,
      sentAt: c.sentAt ? c.sentAt.toISOString() : null,
      body: c.body,
      fromCandidate: Boolean(candidate.normalizedEmail) && normalizeEmail(c.senderEmail) === candidate.normalizedEmail
    })),
    communicationCount: candidate._count.communications
  };
}
