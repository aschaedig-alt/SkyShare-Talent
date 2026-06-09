import type {
  BlockBodyFormat,
  BlockCategory,
  BlockTextColor,
  BlockTextWeight,
  SerializedJobBlockInstance,
  SerializedJobPost
} from "@/lib/types";

export type JobSectionDefinition = {
  key: string;
  label: string;
  categories: BlockCategory[];
  required: boolean;
};

export const jobSectionDefinitions: JobSectionDefinition[] = [
  { key: "about", label: "About Us", categories: ["ABOUT"], required: true },
  { key: "role", label: "About the Role", categories: ["ROLE", "MISSION"], required: false },
  { key: "values", label: "Core Values", categories: ["VALUES"], required: false },
  { key: "responsibilities", label: "Responsibilities", categories: ["RESPONSIBILITIES"], required: true },
  { key: "qualifications", label: "Qualifications", categories: ["QUALIFICATIONS", "SKILLS"], required: true },
  { key: "benefits", label: "Benefits", categories: ["BENEFITS"], required: true },
  { key: "location", label: "Location", categories: ["LOCATION"], required: true },
  { key: "cta", label: "Closing CTA", categories: ["CTA"], required: true },
  { key: "paycom", label: "Paycom Notes", categories: ["PAYCOM"], required: false }
];

export function isInstanceOutdated(instance: SerializedJobBlockInstance) {
  return Boolean(
    instance.contentBlock?.currentVersionId &&
      instance.blockVersionId &&
      instance.contentBlock.currentVersionId !== instance.blockVersionId
  );
}

export function getInstanceTitle(instance: SerializedJobBlockInstance) {
  if (instance.mode === "FORKED_CUSTOM") {
    return instance.customTitle ?? instance.blockVersion?.title ?? instance.contentBlock?.name ?? "Custom Block";
  }

  return instance.blockVersion?.title ?? instance.contentBlock?.name ?? "Content Block";
}

export function getInstanceBody(instance: SerializedJobBlockInstance) {
  if (instance.mode === "FORKED_CUSTOM") {
    return instance.customBody ?? "";
  }

  return instance.blockVersion?.body ?? "";
}

export function getInstanceFormatting(instance: SerializedJobBlockInstance): {
  bodyFormat: BlockBodyFormat;
  textWeight: BlockTextWeight;
  textColor: BlockTextColor;
} {
  return {
    bodyFormat: instance.blockVersion?.bodyFormat ?? "BULLET_LIST",
    textWeight: instance.blockVersion?.textWeight ?? "NORMAL",
    textColor: instance.blockVersion?.textColor ?? "BLACK"
  };
}

export function getSectionStatuses(job: SerializedJobPost) {
  return jobSectionDefinitions.map((section) => {
    const instances = job.blockInstances.filter((instance) =>
      section.categories.includes(instance.contentBlock?.category as BlockCategory)
    );
    const hasOutdated = instances.some(isInstanceOutdated);
    const hasCustom = instances.some((instance) => instance.mode === "FORKED_CUSTOM");
    const hasPinned = instances.some((instance) => instance.mode === "PINNED_VERSION");

    return {
      ...section,
      instances,
      state: instances.length ? "present" : "missing",
      hasOutdated,
      hasCustom,
      hasPinned
    };
  });
}

export function getReadinessChecklist(job: SerializedJobPost) {
  const statuses = getSectionStatuses(job);
  const requiredSectionsPresent = statuses
    .filter((section) => section.required)
    .map((section) => ({
      id: `section-${section.key}`,
      label: `${section.label} section attached`,
      complete: section.instances.length > 0,
      tone: "required" as const
    }));

  return [
    {
      id: "salary-range",
      label: "Salary range present",
      complete: Boolean(job.salaryRange?.trim()),
      tone: "recommended" as const
    },
    {
      id: "location",
      label: "Location present",
      complete: Boolean(job.location?.trim()),
      tone: "required" as const
    },
    {
      id: "position-type",
      label: "Position type present",
      complete: Boolean(job.positionType?.trim()),
      tone: "required" as const
    },
    {
      id: "paycom",
      label: "Paycom templates present",
      complete: Boolean(
        job.paycom &&
          Object.entries(job.paycom)
            .filter(([key]) => key !== "id")
            .some(([, value]) => Boolean(value))
      ),
      tone: "recommended" as const
    },
    ...requiredSectionsPresent,
    {
      id: "outdated-blocks",
      label: "Outdated blocks reviewed",
      complete: !job.blockInstances.some(isInstanceOutdated),
      tone: "version" as const
    },
    {
      id: "custom-blocks",
      label: "Custom/forked content reviewed",
      complete: !job.blockInstances.some((instance) => instance.mode === "FORKED_CUSTOM"),
      tone: "custom" as const
    }
  ];
}
