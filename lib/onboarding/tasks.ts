// The single universal pre-onboarding checklist. Every new hire gets all of these;
// pilot-only items simply stay N/A for non-pilots. Order + grouping drive the UI.

export const ONBOARDING_GROUPS = [
  { key: "OFFER", label: "Offer" },
  { key: "PILOT_DOCS", label: "Pilot documents" },
  { key: "SYSTEMS", label: "Onboarding & systems" },
  { key: "ORIENTATION", label: "Orientation" }
] as const;

export type OnboardingGroupKey = (typeof ONBOARDING_GROUPS)[number]["key"];

export type OnboardingTaskDef = {
  key: string;
  label: string;
  group: OnboardingGroupKey;
};

export const ONBOARDING_TASKS: OnboardingTaskDef[] = [
  { key: "verbal_offer", label: "Verbal offer extended to candidate", group: "OFFER" },
  { key: "draft_offer", label: "Draft offer letter", group: "OFFER" },
  { key: "supervisor_signs", label: "Supervisor signs offer letter", group: "OFFER" },
  { key: "president_signs", label: "President signs offer letter", group: "OFFER" },
  { key: "offer_letter_sent", label: "Offer letter sent to candidate", group: "OFFER" },
  { key: "candidate_signed", label: "Candidate signed offer letter", group: "OFFER" },

  { key: "pilot_app", label: "Confirm Pilot App on file (request if missing)", group: "PILOT_DOCS" },
  { key: "ebco_form", label: "Confirm EBCO form on file (request if missing)", group: "PILOT_DOCS" },
  { key: "pilot_doc_request", label: "Send Pilot Document Request email via Front", group: "PILOT_DOCS" },

  { key: "onboarding_journey", label: "Send “Start Your Onboarding Journey” email via Front", group: "SYSTEMS" },
  { key: "company_gmail", label: "Create a Company Gmail and send password to personal email", group: "SYSTEMS" },
  { key: "bg_check_start", label: "Start background check in Paycom", group: "SYSTEMS" },
  { key: "bg_check_complete", label: "Background check complete", group: "SYSTEMS" },
  { key: "paycom_hire", label: "Hire in Paycom (send invitation, complete New Hire Setup)", group: "SYSTEMS" },
  { key: "groups_drive", label: "Add to groups and drive", group: "SYSTEMS" },
  { key: "drug_screen", label: "Email docs to ITS for pre-employment drug screen", group: "SYSTEMS" },

  { key: "attended_orientation", label: "Attended orientation", group: "ORIENTATION" },
  { key: "travel_complete", label: "Travel accommodations complete", group: "ORIENTATION" }
];

export const ONBOARDING_TASK_COUNT = ONBOARDING_TASKS.length;

export function groupLabel(key: string): string {
  return ONBOARDING_GROUPS.find((g) => g.key === key)?.label ?? key;
}

// Maps the verbose row labels from the current Google Sheet to our task keys (used by the importer).
export const SHEET_LABEL_TO_KEY: Record<string, string> = {
  "verbal offer extended to candidate": "verbal_offer",
  "draft offer letter": "draft_offer",
  "supervisor signs offer letter": "supervisor_signs",
  "president signs offer letter": "president_signs",
  "offer letter sent to candidate": "offer_letter_sent",
  "candidate signed offer letter": "candidate_signed",
  "confirm pilot app on file, if missing, send request": "pilot_app",
  "confirm ebco form on file, if missing, send request": "ebco_form",
  "send pilot document request email via front": "pilot_doc_request",
  "send “start your onboarding journey” email via front": "onboarding_journey",
  "send start your onboarding journey email via front": "onboarding_journey",
  "create a company gmail and send password to personal email": "company_gmail",
  "start background check in paycom": "bg_check_start",
  "background check complete": "bg_check_complete",
  "hire in paycom (send invitation, complete new hire setup)": "paycom_hire",
  "add to groups and drive": "groups_drive",
  "email docs to its for pre-employement drug screen": "drug_screen",
  "email docs to its for pre-employment drug screen": "drug_screen",
  "attended orientation": "attended_orientation",
  "travel accomodations complete": "travel_complete",
  "travel accommodations complete": "travel_complete"
};
