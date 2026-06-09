import { z } from "zod";

export const blockCategorySchema = z.enum([
  "ABOUT",
  "ROLE",
  "MISSION",
  "VALUES",
  "RESPONSIBILITIES",
  "QUALIFICATIONS",
  "SKILLS",
  "BENEFITS",
  "LOCATION",
  "PAYCOM",
  "CTA",
  "CUSTOM"
]);

export const blockScopeSchema = z.enum(["GLOBAL", "DEPARTMENT", "ROLE", "JOB_SPECIFIC"]);
export const blockPlacementSchema = z.enum(["REQUIRED", "DEPARTMENT_SPECIFIC", "ROLE_SPECIFIC", "OPTIONAL"]);

export const blockAdoptionSchema = z.enum([
  "NEW_VERSION_ONLY",
  "ALL_LINKED_JOBS",
  "SELECTED_JOBS",
  "ONLY_CURRENT_JOB"
]);

export const blockBodyFormatSchema = z.enum(["BULLET_LIST", "PARAGRAPH"]);
export const blockTextWeightSchema = z.enum(["NORMAL", "SEMIBOLD", "BOLD"]);
export const blockTextColorSchema = z.enum([
  "BLACK",
  "LEA",
  "EDEN",
  "GREY",
  "GOLD",
  "RED",
  "SWEET",
  "CLOUD_DANCER"
]);

export const blockCreateSchema = z.object({
  name: z.string().trim().min(1, "Block name is required"),
  description: z.string().trim().optional().nullable(),
  category: blockCategorySchema,
  scope: blockScopeSchema,
  placement: blockPlacementSchema.default("OPTIONAL"),
  title: z.string().trim().min(1, "Version title is required"),
  body: z.string().trim().min(1, "Block body is required"),
  bodyFormat: blockBodyFormatSchema.default("BULLET_LIST"),
  textWeight: blockTextWeightSchema.default("NORMAL"),
  textColor: blockTextColorSchema.default("BLACK"),
  changeNote: z.string().trim().optional().nullable()
});

export const blockVersionCreateSchema = z.object({
  name: z.string().trim().min(1, "Block name is required").optional(),
  description: z.string().trim().optional().nullable(),
  category: blockCategorySchema.optional(),
  scope: blockScopeSchema.optional(),
  placement: blockPlacementSchema.optional(),
  title: z.string().trim().min(1, "Version title is required"),
  body: z.string().trim().min(1, "Block body is required"),
  bodyFormat: blockBodyFormatSchema.default("BULLET_LIST"),
  textWeight: blockTextWeightSchema.default("NORMAL"),
  textColor: blockTextColorSchema.default("BLACK"),
  changeNote: z.string().trim().optional().nullable(),
  adoption: blockAdoptionSchema.default("NEW_VERSION_ONLY"),
  selectedJobIds: z.array(z.string()).default([]),
  currentJobId: z.string().optional().nullable()
});

export const jobBlockAttachSchema = z.object({
  contentBlockId: z.string().min(1),
  sectionKey: z.string().trim().optional().nullable(),
  insertBeforeInstanceId: z.string().trim().optional().nullable(),
  mode: z.enum(["LINKED", "PINNED_VERSION"]).default("LINKED")
});

export const jobBlockReorderSchema = z.object({
  instanceIds: z.array(z.string()).min(1)
});

export const jobBlockInstanceUpdateSchema = z.object({
  mode: z.enum(["LINKED", "PINNED_VERSION", "FORKED_CUSTOM"]).optional(),
  blockVersionId: z.string().optional().nullable(),
  customTitle: z.string().trim().optional().nullable(),
  customBody: z.string().trim().optional().nullable()
});

export const blockRetireSchema = z.object({
  replacementBlockId: z.string().trim().optional().nullable(),
  migrateJobs: z.boolean().default(false)
});

export const blockPlacementUpdateSchema = z.object({
  placement: blockPlacementSchema
});

export const blockApplyToJobsSchema = z.object({
  applyToAll: z.boolean().default(false),
  jobIds: z.array(z.string()).default([])
});

export type BlockCreateValues = z.infer<typeof blockCreateSchema>;
export type BlockVersionCreateValues = z.infer<typeof blockVersionCreateSchema>;
export type BlockRetireValues = z.infer<typeof blockRetireSchema>;
