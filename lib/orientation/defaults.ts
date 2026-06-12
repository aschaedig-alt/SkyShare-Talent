// Default prep checklist seeded onto every new orientation session (editable per session).
export const DEFAULT_PREP_TASKS: Array<{ label: string; owner: string; dueDaysBefore: number }> = [
  { label: "Send invitations to attendees", owner: "Recruiting", dueDaysBefore: 14 },
  { label: "Add attendees to Google Calendar", owner: "Recruiting", dueDaysBefore: 14 },
  { label: "Create exec calendar event + Meet link + address", owner: "Exec", dueDaysBefore: 10 },
  { label: "Confirm exec team availability", owner: "Exec", dueDaysBefore: 7 },
  { label: "Arrange travel for out-of-town attendees", owner: "Recruiting", dueDaysBefore: 7 },
  { label: "Notify safety — iPads ready for any pilots", owner: "Safety", dueDaysBefore: 5 },
  { label: "Company credit cards ready to hand out", owner: "Finance", dueDaysBefore: 3 },
  { label: "Swag packs ready", owner: "Brand", dueDaysBefore: 3 },
  { label: "Order lunch (use headcount)", owner: "Office", dueDaysBefore: 3 },
  { label: "Confirm everyone is attending", owner: "Recruiting", dueDaysBefore: 2 },
  { label: "Name badges + building access", owner: "Office", dueDaysBefore: 2 },
  { label: "Print day-of roster", owner: "Recruiting", dueDaysBefore: 1 }
];

export type EmailTemplateDef = { key: string; name: string; subject: string; body: string };

// Placeholders: {{name}} {{date}} {{time}} {{location}} {{address}} {{meetLink}}
export const DEFAULT_EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: "invitation",
    name: "Invitation",
    subject: "You're invited to SkyShare orientation",
    body:
      "Hi {{name}},\n\nWelcome to SkyShare! Your new-hire orientation is scheduled for {{date}} at {{time}}, in person at {{location}} ({{address}}).\n\nPlease reply to confirm you can attend. We'll follow up with logistics.\n\nSee you soon,\nThe SkyShare Team"
  },
  {
    key: "confirm_request",
    name: "Confirm attendance request",
    subject: "Please confirm your orientation date",
    body:
      "Hi {{name}},\n\nQuick reminder to confirm your attendance for orientation on {{date}} at {{time}}. Just reply \"confirmed\" and we'll finalize your spot.\n\nThanks,\nThe SkyShare Team"
  },
  {
    key: "confirmed",
    name: "You're confirmed + logistics",
    subject: "You're confirmed for SkyShare orientation",
    body:
      "Hi {{name}},\n\nYou're all set for orientation on {{date}} at {{time}}.\n\nWhere: {{location}}, {{address}}\nVirtual option: {{meetLink}}\n\nPlease arrive 15 minutes early. Lunch is provided.\n\nThe SkyShare Team"
  },
  {
    key: "directions",
    name: "Directions & parking",
    subject: "Getting to SkyShare orientation",
    body:
      "Hi {{name}},\n\nHere are directions and parking details for orientation on {{date}}:\n\nAddress: {{address}}\nParking: visitor lot, check in at the front desk.\n\nThe SkyShare Team"
  },
  {
    key: "reminder",
    name: "Day-before reminder",
    subject: "See you tomorrow at orientation",
    body:
      "Hi {{name}},\n\nJust a reminder that orientation is tomorrow, {{date}}, at {{time}} ({{location}}). Bring a photo ID. Lunch is provided.\n\nSee you there,\nThe SkyShare Team"
  }
];

const PILOT_TITLE = /\b(captain|first officer|f\/?o|pic|sic|pilot)\b/i;
export function isPilotPosition(position: string | null | undefined): boolean {
  return PILOT_TITLE.test(position ?? "");
}
