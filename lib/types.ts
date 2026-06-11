export type JobStatus = "DRAFT" | "ACTIVE" | "RETIRED" | "NEEDS_REVIEW";
export type BlockCategory =
  | "ABOUT"
  | "ROLE"
  | "MISSION"
  | "VALUES"
  | "RESPONSIBILITIES"
  | "QUALIFICATIONS"
  | "SKILLS"
  | "BENEFITS"
  | "LOCATION"
  | "PAYCOM"
  | "CTA"
  | "CUSTOM";
export type BlockScope = "GLOBAL" | "DEPARTMENT" | "ROLE" | "JOB_SPECIFIC";
export type BlockPlacement = "REQUIRED" | "DEPARTMENT_SPECIFIC" | "ROLE_SPECIFIC" | "OPTIONAL";
export type BlockInstanceMode = "LINKED" | "PINNED_VERSION" | "FORKED_CUSTOM";
export type BlockBodyFormat = "BULLET_LIST" | "PARAGRAPH" | "MIXED";
export type BlockTextWeight = "NORMAL" | "SEMIBOLD" | "BOLD";
export type BlockTextColor =
  | "BLACK"
  | "LEA"
  | "EDEN"
  | "GREY"
  | "GOLD"
  | "RED"
  | "SWEET"
  | "CLOUD_DANCER";

export type SerializedPaycomConfig = {
  id: string;
  workflow: string | null;
  externalApplication: string | null;
  externalKnockout: string | null;
  externalGlobal: string | null;
  externalJobLevel: string | null;
  externalFollowUps: string | null;
  internalApplication: string | null;
  internalKnockout: string | null;
  internalGlobal: string | null;
  internalJobLevel: string | null;
};

export type SerializedContentBlockVersion = {
  id: string;
  contentBlockId: string;
  versionNumber: number;
  title: string;
  body: string;
  plainText: string | null;
  bodyFormat: BlockBodyFormat;
  textWeight: BlockTextWeight;
  textColor: BlockTextColor;
  changeNote: string | null;
  createdAt: string;
};

export type SerializedContentBlock = {
  id: string;
  name: string;
  description: string | null;
  category: BlockCategory;
  scope: BlockScope;
  placement: BlockPlacement;
  currentVersionId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion: SerializedContentBlockVersion | null;
  versions?: SerializedContentBlockVersion[];
  usageCount?: number;
  usedByJobs?: Array<{ id: string; title: string; status: JobStatus }>;
};

export type SerializedJobBlockInstance = {
  id: string;
  jobPostId: string;
  contentBlockId: string | null;
  blockVersionId: string | null;
  sortOrder: number;
  sectionKey: string;
  mode: BlockInstanceMode;
  customTitle: string | null;
  customBody: string | null;
  contentBlock: SerializedContentBlock | null;
  blockVersion: SerializedContentBlockVersion | null;
};

export type SerializedJobPost = {
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
  postedDate: string | null;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  paycom: SerializedPaycomConfig | null;
  blockInstances: SerializedJobBlockInstance[];
};

export type TemplateTokenGroup = {
  id: string;
  name: string;
  isLocked: boolean;
  version: number;
  tokens: Array<{
    id: string;
    key: string;
    value: string;
    locked: boolean;
  }>;
};
