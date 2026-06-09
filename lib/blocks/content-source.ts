import type { BlockCategory, BlockPlacement, SerializedJobBlockInstance, SerializedJobPost } from "@/lib/types";

export const placementDefinitions: Array<{ key: BlockPlacement; label: string; description: string }> = [
  { key: "REQUIRED", label: "Required", description: "Core sections every public job post should include." },
  {
    key: "DEPARTMENT_SPECIFIC",
    label: "Department Specific",
    description: "Content shared by jobs in the same department."
  },
  { key: "ROLE_SPECIFIC", label: "Role Specific", description: "Content tied to a specific role family or seat." },
  { key: "OPTIONAL", label: "Optional", description: "Helpful add-ons that can be used when appropriate." }
];

export type FieldSourceState = {
  key: "summary" | "responsibilities" | "qualifications" | "benefits" | "location";
  label: string;
  fieldLabel: string;
  categories: BlockCategory[];
  isHiddenByBlock: boolean;
  hasFieldContent: boolean;
  hiddenByTitles: string[];
  sourceLabel: string;
  detail: string;
};

const fieldSourceDefinitions: Array<{
  key: FieldSourceState["key"];
  label: string;
  fieldLabel: string;
  categories: BlockCategory[];
  getValue: (job: SerializedJobPost) => string | null;
  alwaysPublishes?: boolean;
}> = [
  {
    key: "summary",
    label: "Job Summary",
    fieldLabel: "Summary",
    categories: [],
    getValue: (job) => job.summary,
    alwaysPublishes: true
  },
  {
    key: "responsibilities",
    label: "Responsibilities",
    fieldLabel: "Responsibilities",
    categories: ["RESPONSIBILITIES"],
    getValue: (job) => job.keyResponsibilities
  },
  {
    key: "qualifications",
    label: "Qualifications",
    fieldLabel: "Qualifications",
    categories: ["QUALIFICATIONS", "SKILLS"],
    getValue: (job) => job.qualificationsText
  },
  {
    key: "benefits",
    label: "Benefits",
    fieldLabel: "Benefits",
    categories: ["BENEFITS"],
    getValue: (job) => job.benefitsText
  },
  {
    key: "location",
    label: "Location Detail",
    fieldLabel: "Location",
    categories: ["LOCATION"],
    getValue: (job) => job.secondaryLocation ?? job.location
  }
];

export function getReusablePublishingBlocks(job: SerializedJobPost) {
  return job.blockInstances.filter((instance) => !["PAYCOM"].includes(instance.contentBlock?.category ?? ""));
}

export function getBlockSourceLabel(instance: SerializedJobBlockInstance) {
  if (instance.mode === "FORKED_CUSTOM") {
    return "Custom Fork";
  }

  if (instance.mode === "PINNED_VERSION") {
    return "Pinned Version";
  }

  return "From Block";
}

export function hasPublishingBlockCategory(job: SerializedJobPost, categories: BlockCategory[]) {
  return getReusablePublishingBlocks(job).some((instance) =>
    categories.includes(instance.contentBlock?.category as BlockCategory)
  );
}

export function getFieldSourceStates(job: SerializedJobPost): FieldSourceState[] {
  const reusableBlocks = getReusablePublishingBlocks(job);

  return fieldSourceDefinitions.map((definition) => {
    const hiddenByBlocks = definition.alwaysPublishes
      ? []
      : reusableBlocks.filter((instance) =>
          definition.categories.includes(instance.contentBlock?.category as BlockCategory)
        );
    const isHiddenByBlock = hiddenByBlocks.length > 0;
    const hiddenByTitles = hiddenByBlocks.map((instance) => instance.contentBlock?.name ?? "attached block");
    const hasFieldContent = Boolean(definition.getValue(job)?.trim());

    return {
      key: definition.key,
      label: definition.label,
      fieldLabel: definition.fieldLabel,
      categories: definition.categories,
      isHiddenByBlock,
      hasFieldContent,
      hiddenByTitles,
      sourceLabel: isHiddenByBlock ? "Hidden by Block" : "From Job Field",
      detail:
        definition.key === "location" && isHiddenByBlock
          ? `Location metadata still publishes. The detailed Location section is hidden because ${hiddenByTitles.join(", ")} is attached.`
          : definition.key === "location"
            ? "Location metadata publishes, and this field also supplies the detailed Location section."
            : isHiddenByBlock
              ? `${definition.fieldLabel} field is hidden in the final body because ${hiddenByTitles.join(", ")} is attached.`
              : hasFieldContent
                ? `${definition.fieldLabel} field appears in the final body.`
                : `${definition.fieldLabel} field is available as fallback content but is empty.`
    };
  });
}
