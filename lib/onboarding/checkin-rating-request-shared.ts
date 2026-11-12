// The no-login 90-day rating link - the client-safe half (no Prisma, no Node).
//
// Aimee's feedback cmwcq16o7 (Nov 11 2026), on Post-onboard's 90-day rating: "i
// need to be able to send this to a hiring manager so they can complete it
// easily. if they dont have a login to my app yet ... them not exactly need to
// log in to see it just to rate it. they dont need to be able to view ratings
// from this section ... i want to be able to see the status of their review from
// this post onboard tab and have the option to resend if needed. if the employee
// leaves before the review is sent or completed we need to be able to account
// for that as well."
//
// So HR sends the manager a tokenized link (/rate/<token>) that opens ONE form for
// ONE employee, accepts ONE submission, expires, and can be revoked. The server
// half (storage, token checks, the send) is lib/onboarding/checkin-rating-request.ts.

/** How long a link works after it was last sent. A resend restarts the clock. */
export const RATING_LINK_DAYS = 30;

/** Where the public form lives. AppShell renders this prefix bare (no sidebar). */
export const RATING_LINK_PATH = "/rate";

export type RatingRequestState =
  /** Sent, not answered, still inside its window. */
  | "PENDING"
  /** The manager submitted the form. */
  | "COMPLETED"
  /** Sent, never answered, past its window. Resend revives it. */
  | "EXPIRED"
  /** Revoked - by HR, or automatically because the employee left. */
  | "CANCELLED"
  /** Never answered by link, but a rating was entered in the app meanwhile. */
  | "RATED_IN_APP";

export type RatingCancelReason = "LEFT" | "MANUAL";

export type RatingRequestSend = {
  at: string;
  to: string;
  toName: string | null;
  by: string | null;
  /** The send guard's mode, so a redirected test send is never mistaken for a real one. */
  mode: string;
  /** True when this send issued a fresh token (the old link stopped working). */
  newLink: boolean;
  edited: boolean;
  conversationId?: string;
};

/** What the Post-onboard tab sees. Never carries the token. */
export type RatingRequestView = {
  hireId: string;
  hireName: string;
  state: RatingRequestState;
  to: string;
  toName: string | null;
  firstSentAt: string;
  lastSentAt: string;
  expiresAt: string;
  sends: RatingRequestSend[];
  completedAt: string | null;
  /** The name the manager typed on the form. */
  completedByName: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: RatingCancelReason | null;
  /** Plain words for why, e.g. "Marked terminated" - shown on the tab. */
  cancelDetail: string | null;
  /** HR dismissed the "employee left" notice. */
  acknowledgedAt: string | null;
};

/** One supervisor the dialog can offer as the recipient. */
export type RatingRecipientOption = { name: string | null; email: string; source: "supervisor" | "supervisor2" };

export const RATING_STATE_LABEL: Record<RatingRequestState, string> = {
  PENDING: "Sent",
  COMPLETED: "Completed",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  RATED_IN_APP: "Rated in the app"
};

/** The words the tab shows under a request, e.g. "Sent Nov 11 to Ryan Morgan". */
export function cancelReasonText(v: Pick<RatingRequestView, "cancelReason" | "cancelDetail" | "cancelledBy">): string {
  if (v.cancelReason === "LEFT") return `Employee left${v.cancelDetail ? ` (${v.cancelDetail.toLowerCase()})` : ""} - the link no longer works`;
  return `Cancelled${v.cancelledBy ? ` by ${v.cancelledBy}` : ""} - the link no longer works`;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
export function escHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ESC[c]);
}

// The same Verdana/9pt wrapper every hand-built send in lib/front uses, so this
// email looks like the others in the manager's inbox.
function para(inner: string): string {
  return `<div style="line-height: 1.5;" dir="ltr"><span style="font-family: Verdana, sans-serif;"><span style="background-color: transparent; font-size: 9pt;">${inner}</span></span></div>`;
}
const GAP = "<div><br /></div>";

export function ratingGreetingHtml(recipientName: string | null): string {
  const first = (recipientName ?? "").trim().split(/\s+/)[0] || "there";
  return para(`Hi ${escHtml(first)},`) + GAP;
}

export function defaultRatingSubject(employeeName: string): string {
  return `90-day check-in: ${employeeName}`;
}

/** The editable part. The app writes it (there is no Front template for this email). */
export function defaultRatingBodyHtml(employeeName: string): string {
  const name = escHtml(employeeName);
  return (
    para(
      `${name} has reached their first 90 days with SkyShare. Could you take a couple of minutes to rate how they are doing on our four core values, and tell us whether you would hire them again?`
    ) +
    GAP +
    para("You don't need a login - just open the link below. Your answers go to HR.") +
    GAP +
    para("Thank you,<br />SkyShare HR")
  );
}

/**
 * The link block, appended UNDER the body and never part of the edit box: a
 * rewritten body can never drop or stale the link, and a resend with a new token
 * always carries the new one.
 */
export function ratingLinkBlockHtml(url: string, employeeName: string, expiresAt: string): string {
  const until = new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Denver" });
  return (
    GAP +
    para(`<a href="${escHtml(url)}"><b>Rate ${escHtml(employeeName)}'s first 90 days</b></a>`) +
    para(`<span style="color: #6b7280;">This link is just for this one rating and works until ${escHtml(until)}.</span>`)
  );
}

/** A plain, permissive address check - the guard and Front do the real work. */
export function looksLikeEmail(v: string): boolean {
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(v.trim());
}
