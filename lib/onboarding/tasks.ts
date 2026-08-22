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
  // A background check is THREE steps, and only the last two can be automated.
  // Paycom emails hrotasks@ at each of the two milestones; the first step is a
  // button in Paycom that nothing tells us about, so it stays a manual tick.
  //   1. bg_check_start    — you click Run Background Check in Paycom  (MANUAL)
  //   2. bg_check_info     — Paycom: "Requested Information Completed" (AUTO)
  //   3. bg_check_complete — Paycom: "Background check is completed"   (AUTO)
  { key: "bg_check_start", label: "Run background check in Paycom", group: "SYSTEMS" },
  { key: "bg_check_info", label: "Candidate submitted background check info", group: "SYSTEMS" },
  { key: "bg_check_complete", label: "Background check complete — clear to hire", group: "SYSTEMS" },
  { key: "paycom_hire", label: "Hire in Paycom (send invitation, complete New Hire Setup)", group: "SYSTEMS" },
  { key: "groups_drive", label: "Add to groups and drive", group: "SYSTEMS" },
  { key: "business_card", label: "Order business card", group: "SYSTEMS" },
  { key: "drug_screen", label: "Email docs to ITS for pre-employment drug screen", group: "SYSTEMS" },

  { key: "attended_orientation", label: "Attended orientation", group: "ORIENTATION" },
  { key: "travel_complete", label: "Travel accommodations complete", group: "ORIENTATION" },
  // DAY OF ORIENTATION, deliberately not earlier. The contacts link hands over
  // staff names, titles, phone numbers and email addresses, and a hire who has
  // been offered and welcomed may still never start — so it is not in the welcome
  // email and must not be added to one. See lib/new-hire-contacts/share-link.ts.
  // Sent by hand from a Front template; the link is copied fresh from Settings →
  // New hire contacts each time, because rotating it kills every link already out.
  { key: "contacts_link_sent", label: "Send new hire contacts link (day of orientation)", group: "ORIENTATION" }
];

export const ONBOARDING_TASK_COUNT = ONBOARDING_TASKS.length;

export function groupLabel(key: string): string {
  return ONBOARDING_GROUPS.find((g) => g.key === key)?.label ?? key;
}

// The milestones shown on the Milestones tab — the full onboarding journey, with
// concise labels (headers may wrap). Custom milestones are appended from settings.
export const MILESTONE_KEYS: Array<{ key: string; short: string }> = [
  { key: "verbal_offer", short: "Verbal offer given" },
  { key: "draft_offer", short: "Draft offer letter" },
  { key: "supervisor_signs", short: "Supervisor signs offer" },
  { key: "president_signs", short: "President signs offer" },
  { key: "offer_letter_sent", short: "Offer letter sent" },
  { key: "pilot_app", short: "Pilot app on file" },
  { key: "ebco_form", short: "EBCO form on file" },
  { key: "pilot_doc_request", short: "Pilot docs requested" },
  { key: "candidate_signed", short: "Candidate signed offer" },
  { key: "onboarding_journey", short: "Onboarding email sent" },
  { key: "company_gmail", short: "Company Gmail created" },
  { key: "bg_check_start", short: "Background check started" },
  { key: "bg_check_info", short: "BG info submitted" },
  { key: "bg_check_complete", short: "Background check complete" },
  { key: "paycom_hire", short: "Hired in Paycom" },
  { key: "groups_drive", short: "Added to groups & drive" },
  { key: "drug_screen", short: "Drug screen sent to ITS" },
  { key: "attended_orientation", short: "Attended orientation" },
  { key: "travel_complete", short: "Travel arranged" },
  { key: "contacts_link_sent", short: "Contacts link sent" }
];

// Custom (user-added) milestones live in their own group so they do not disturb the
// fixed checklist groups; they are tracked per hire just like the standard tasks.
export const CUSTOM_GROUP = "CUSTOM";

// Maintenance check-ins for post-onboard employees. Day-based ones drive "due" reminders.
export const MAINTENANCE_GROUP = "MAINTENANCE";
export const MAINTENANCE_TASKS: Array<{ key: string; label: string; short: string; dueDays: number | null }> = [
  { key: "checkin_30", label: "30-day check-in", short: "30-day", dueDays: 30 },
  { key: "checkin_60", label: "60-day check-in", short: "60-day", dueDays: 60 },
  { key: "checkin_90", label: "90-day check-in", short: "90-day", dueDays: 90 },
  { key: "benefits_enrolled", label: "Benefits enrolled", short: "Benefits", dueDays: null },
  // Appended rather than slotted in date-order on purpose: the stored task rows
  // carry an order of 100 + index, so inserting in the middle would renumber
  // every existing row. No dueDays - there is no fixed day this is owed by.
  { key: "social_announcement", label: "Social media announcement", short: "Social", dueDays: null }
];

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
  "confirm titan form on file, if missing, send request": "ebco_form",
  "send pilot document request email via front": "pilot_doc_request",
  "send “start your onboarding journey” email via front": "onboarding_journey",
  "send start your onboarding journey email via front": "onboarding_journey",
  "create a company gmail and send password to personal email": "company_gmail",
  "start background check in paycom": "bg_check_start",
  "run background check in paycom": "bg_check_start",
  "candidate submitted background check info": "bg_check_info",
  "background check complete": "bg_check_complete",
  "background check complete — clear to hire": "bg_check_complete",
  "hire in paycom (send invitation, complete new hire setup)": "paycom_hire",
  "add to groups and drive": "groups_drive",
  "email docs to its for pre-employement drug screen": "drug_screen",
  "email docs to its for pre-employment drug screen": "drug_screen",
  "attended orientation": "attended_orientation",
  "travel accomodations complete": "travel_complete",
  "travel accommodations complete": "travel_complete",
  "send new hire contacts link (day of orientation)": "contacts_link_sent",
  "send new hire contacts link": "contacts_link_sent",
  "contacts link": "contacts_link_sent"
};
