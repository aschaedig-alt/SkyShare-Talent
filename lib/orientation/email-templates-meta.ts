// The orientation emails, as the TEAM actually sends them — the three numbered
// templates that live in Front, in send order.
//
// Client-safe on purpose: lib/front/orientation-email.ts imports Prisma and the
// Front client, so a browser component can't import from it. This holds only the
// metadata the UI needs (what to call each one, and who it goes to), and the
// server module imports the same list so the two can never disagree.
//
// This REPLACED five slots the app had invented (invitation / confirm_request /
// confirmed / directions / reminder) which matched nothing the team ever sent.

export type OrientationTemplateKey = "invite" | "supervisors" | "reminder";

export type OrientationTemplateMeta = {
  key: OrientationTemplateKey;
  /** Column header / button label in the app. */
  label: string;
  /** Front template id as last seen — a fast path; lookup falls back to the name. */
  id: string;
  /** Front template name, the durable identifier if the template is rebuilt. */
  frontName: string;
  /** Who it goes to. Drives recipient building and what the send button says. */
  audience: "attendee" | "supervisor";
  /** One-line explanation shown in the UI. */
  hint: string;
};

export const ORIENTATION_TEMPLATE_META: OrientationTemplateMeta[] = [
  {
    key: "invite",
    label: "1. Invitation",
    id: "rsp_qnije",
    frontName: "1. New Hire Orientation",
    audience: "attendee",
    hint: "To the new hire's company email, cc their supervisor and the standing list."
  },
  {
    key: "supervisors",
    label: "2. Supervisors",
    id: "rsp_qnimy",
    frontName: "2. (Supervisors) New Hire Orientation",
    audience: "supervisor",
    hint: "To the new hire's supervisor. Needs a supervisor linked (or typed) on their profile."
  },
  {
    key: "reminder",
    label: "3. Reminder",
    id: "rsp_qnioq",
    frontName: "3. REMINDER: New Hire Orientation",
    audience: "attendee",
    hint: "The closer-to-the-day reminder, to the new hire."
  }
];

export function orientationTemplateMeta(key: OrientationTemplateKey): OrientationTemplateMeta {
  const t = ORIENTATION_TEMPLATE_META.find((x) => x.key === key);
  if (!t) throw new Error(`Unknown orientation template: ${key}`);
  return t;
}
