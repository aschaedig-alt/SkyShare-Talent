import type { SerializedJobPost } from "@/lib/types";
import { getSectionStatuses, isInstanceOutdated } from "@/lib/blocks/sections";

export type ValidationWarning = {
  id: string;
  label: string;
  severity: "required" | "recommended" | "version" | "custom";
};

function hasAnyPaycom(job: SerializedJobPost) {
  if (!job.paycom) {
    return false;
  }

  return Object.entries(job.paycom)
    .filter(([key]) => key !== "id")
    .some(([, value]) => Boolean(value));
}

export function getJobWarnings(job: SerializedJobPost): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const sectionStatuses = getSectionStatuses(job);

  if (!job.location?.trim()) {
    warnings.push({
      id: "missing-location",
      label: "Location is required before publishing.",
      severity: "required"
    });
  }

  if (!job.salaryRange?.trim()) {
    warnings.push({
      id: "missing-salary",
      label: "Salary range is recommended for cleaner postings.",
      severity: "recommended"
    });
  }

  if (!hasAnyPaycom(job)) {
    warnings.push({
      id: "missing-paycom",
      label: "Paycom configuration is recommended.",
      severity: "recommended"
    });
  }

  for (const section of sectionStatuses.filter((item) => item.required && !item.instances.length)) {
    warnings.push({
      id: `missing-section-${section.key}`,
      label: `No reusable ${section.label.toLowerCase()} block is attached.`,
      severity: "required"
    });
  }

  for (const instance of job.blockInstances) {
    if (isInstanceOutdated(instance)) {
      warnings.push({
        id: `outdated-${instance.id}`,
        label: `${instance.contentBlock?.name ?? "A reusable block"} is pinned to an older block version.`,
        severity: "version"
      });
    }

    if (instance.mode === "FORKED_CUSTOM") {
      warnings.push({
        id: `custom-${instance.id}`,
        label: `${instance.customTitle ?? "Custom content"} differs from the reusable block.`,
        severity: "custom"
      });
    }

    if (instance.contentBlock?.archivedAt) {
      warnings.push({
        id: `archived-${instance.id}`,
        label: `${instance.contentBlock.name} is archived and should be replaced before publishing.`,
        severity: "version"
      });
    }
  }

  return warnings;
}
