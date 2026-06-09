import { prisma } from "@/lib/prisma";
import type {
  SerializedContentBlock,
  SerializedContentBlockVersion,
  SerializedJobBlockInstance,
  SerializedJobPost,
  SerializedPaycomConfig,
  TemplateTokenGroup
} from "@/lib/types";

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function serializeBlockVersion(version: {
  id: string;
  contentBlockId: string;
  versionNumber: number;
  title: string;
  body: string;
  plainText: string | null;
  bodyFormat: string;
  textWeight: string;
  textColor: string;
  changeNote: string | null;
  createdAt: Date;
}): SerializedContentBlockVersion {
  return {
    ...version,
    bodyFormat: version.bodyFormat as SerializedContentBlockVersion["bodyFormat"],
    textWeight: version.textWeight as SerializedContentBlockVersion["textWeight"],
    textColor: version.textColor as SerializedContentBlockVersion["textColor"],
    createdAt: version.createdAt.toISOString()
  };
}

export function serializeContentBlock(block: {
  id: string;
  name: string;
  description: string | null;
  category: string;
  scope: string;
  placement: string;
  currentVersionId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentVersion?: Parameters<typeof serializeBlockVersion>[0] | null;
  versions?: Array<Parameters<typeof serializeBlockVersion>[0]>;
  _count?: { usages: number };
  usages?: Array<{
    jobPost: { id: string; title: string; status: string };
  }>;
}): SerializedContentBlock {
  const currentVersion = block.currentVersion
    ? block.currentVersion
    : block.versions?.find((version) => version.id === block.currentVersionId) ?? null;
  const usedByJobs = block.usages?.map((usage) => usage.jobPost) ?? [];
  const uniqueUsedByJobs = Array.from(new Map(usedByJobs.map((job) => [job.id, job])).values());

  return {
    id: block.id,
    name: block.name,
    description: block.description,
    category: block.category as SerializedContentBlock["category"],
    scope: block.scope as SerializedContentBlock["scope"],
    placement: block.placement as SerializedContentBlock["placement"],
    currentVersionId: block.currentVersionId,
    archivedAt: block.archivedAt?.toISOString() ?? null,
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
    currentVersion: currentVersion ? serializeBlockVersion(currentVersion) : null,
    versions: block.versions?.map(serializeBlockVersion),
    usageCount: block._count?.usages,
    usedByJobs: uniqueUsedByJobs.map((job) => ({
      ...job,
      status: job.status as SerializedJobPost["status"]
    }))
  };
}

export function serializeJob(job: {
  id: string;
  title: string;
  internalName: string | null;
  department: string | null;
  category: string | null;
  location: string | null;
  secondaryLocation: string | null;
  positionType: string | null;
  salaryRange: string | null;
  reportsTo: string | null;
  positionCode: string | null;
  seatCode: string | null;
  travelPercentage: string | null;
  educationLevel: string | null;
  workSchedule: string | null;
  summary: string | null;
  keyResponsibilities: string | null;
  qualificationsText: string | null;
  benefitsText: string | null;
  postedDate: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  paycom: SerializedPaycomConfig | null;
  blockInstances: Array<{
    id: string;
    jobPostId: string;
    contentBlockId: string | null;
    blockVersionId: string | null;
    sortOrder: number;
    sectionKey: string;
    mode: string;
    customTitle: string | null;
    customBody: string | null;
    contentBlock: Parameters<typeof serializeContentBlock>[0] | null;
    blockVersion: Parameters<typeof serializeBlockVersion>[0] | null;
  }>;
}): SerializedJobPost {
  return {
    id: job.id,
    title: job.title,
    internalName: job.internalName,
    department: job.department,
    category: job.category,
    location: job.location,
    secondaryLocation: job.secondaryLocation,
    positionType: job.positionType,
    salaryRange: job.salaryRange,
    reportsTo: job.reportsTo,
    positionCode: job.positionCode,
    seatCode: job.seatCode,
    travelPercentage: job.travelPercentage,
    educationLevel: job.educationLevel,
    workSchedule: job.workSchedule,
    summary: job.summary,
    keyResponsibilities: job.keyResponsibilities,
    qualificationsText: job.qualificationsText,
    benefitsText: job.benefitsText,
    postedDate: serializeDate(job.postedDate),
    status: job.status as SerializedJobPost["status"],
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    paycom: job.paycom,
    blockInstances: job.blockInstances
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((instance) => ({
        id: instance.id,
        jobPostId: instance.jobPostId,
        contentBlockId: instance.contentBlockId,
        blockVersionId: instance.blockVersionId,
        sortOrder: instance.sortOrder,
        sectionKey: instance.sectionKey,
        mode: instance.mode as SerializedJobBlockInstance["mode"],
        customTitle: instance.customTitle,
        customBody: instance.customBody,
        contentBlock: instance.contentBlock ? serializeContentBlock(instance.contentBlock) : null,
        blockVersion: instance.blockVersion ? serializeBlockVersion(instance.blockVersion) : null
      }))
  };
}

export async function getJobPosts() {
  const jobs = await prisma.jobPost.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      paycom: true,
      blockInstances: {
        orderBy: { sortOrder: "asc" },
        include: {
          contentBlock: {
            include: {
              versions: true
            }
          },
          blockVersion: true
        }
      }
    }
  });

  return jobs.map(serializeJob);
}

export async function getJobPostById(id: string) {
  const job = await prisma.jobPost.findUniqueOrThrow({
    where: { id },
    include: {
      paycom: true,
      blockInstances: {
        orderBy: { sortOrder: "asc" },
        include: {
          contentBlock: {
            include: {
              versions: true
            }
          },
          blockVersion: true
        }
      }
    }
  });

  return serializeJob(job);
}

export async function getContentBlocks() {
  const blocks = await prisma.contentBlock.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      versions: {
        orderBy: { versionNumber: "desc" }
      },
      _count: {
        select: { usages: true }
      },
      usages: {
        select: {
          jobPost: {
            select: {
              id: true,
              title: true,
              status: true
            }
          }
        }
      }
    }
  });

  return blocks.map(serializeContentBlock);
}

export async function getContentBlockById(id: string) {
  const block = await prisma.contentBlock.findUniqueOrThrow({
    where: { id },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" }
      },
      _count: {
        select: { usages: true }
      },
      usages: {
        select: {
          jobPost: {
            select: {
              id: true,
              title: true,
              status: true
            }
          }
        }
      }
    }
  });

  return serializeContentBlock(block);
}

export async function getTemplates(): Promise<TemplateTokenGroup[]> {
  const templates = await prisma.template.findMany({
    orderBy: { name: "asc" },
    include: {
      tokens: {
        orderBy: { key: "asc" }
      }
    }
  });

  return templates.map((template) => ({
    id: template.id,
    name: template.name,
    isLocked: template.isLocked,
    version: template.version,
    tokens: template.tokens.map((token) => ({
      id: token.id,
      key: token.key,
      value: token.value,
      locked: token.locked
    }))
  }));
}
