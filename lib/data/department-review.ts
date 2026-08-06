import { prisma } from "@/lib/prisma";
import {
  proposeDepartment,
  type CandidateDepartmentKey,
  type DepartmentBasis
} from "@/lib/candidates/departments";

export type DepartmentReviewRow = {
  id: string;
  displayName: string;
  currentTitle: string | null;
  source: string | null;
  stage: string | null;
  /** Job titles they applied to, if any — usually none for this population. */
  jobTitles: string[];
  documentTypes: string[];
  proposal: CandidateDepartmentKey | null;
  basis: DepartmentBasis;
  evidence: string | null;
};

/**
 * Everyone with no department: no hand-set override, and no application that
 * reaches a job carrying one.
 *
 * Live candidates only. The archived Jazz records are a historical import
 * nobody is triaging, and including them would bury the ~300 that matter under
 * thousands that do not.
 */
export async function getDepartmentReviewRows(): Promise<DepartmentReviewRow[]> {
  const rows = await prisma.candidate.findMany({
    where: {
      archivedAt: null,
      departmentOverride: null,
      NOT: { applications: { some: { job: { department: { not: null } } } } }
    },
    select: {
      id: true,
      displayName: true,
      currentTitle: true,
      source: true,
      stage: true,
      applications: { select: { job: { select: { title: true } } } },
      files: { select: { documentType: true } }
    },
    orderBy: [{ displayName: "asc" }]
  });

  return rows.map((candidate) => {
    const jobTitles = candidate.applications
      .map((a) => a.job?.title)
      .filter((t): t is string => Boolean(t));
    const documentTypes = [...new Set(candidate.files.map((f) => f.documentType).filter((t): t is string => Boolean(t)))];
    const { key, basis, evidence } = proposeDepartment({
      jobTitles,
      hasPilotApplication: documentTypes.includes("Pilot Application"),
      source: candidate.source,
      currentTitle: candidate.currentTitle
    });

    return {
      id: candidate.id,
      displayName: candidate.displayName,
      currentTitle: candidate.currentTitle,
      source: candidate.source,
      stage: candidate.stage,
      jobTitles,
      documentTypes,
      proposal: key,
      basis,
      evidence
    };
  });
}
