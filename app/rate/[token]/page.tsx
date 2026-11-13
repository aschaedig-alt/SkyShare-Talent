import type { Metadata } from "next";
import { lookupRatingLink } from "@/lib/onboarding/checkin-rating-request";
import { ManagerRatingForm } from "@/components/rate/ManagerRatingForm";
import { formatCalendarDayShort } from "@/lib/dates/display";
import { RATED_CHECKINS, ratedCheckin } from "@/lib/onboarding/checkin-rating";

// PUBLIC page: the hiring manager's no-login check-in rating - 90-day, 6-month or
// 12-month, the same questionnaire each time (feedback cmwcq16o7).
// Outside the auth wall by design (middleware.ts does not list /rate; AppShell
// renders it bare). The token in the path opens ONE form for ONE employee; it
// shows nothing of any saved rating, theirs or anyone's - "they dont need to be
// able to view ratings from this section. they can log in for that."

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SkyShare - check-in rating",
  // A forwarded link should never end up indexed.
  robots: { index: false, follow: false }
};

function Shell({ children, eyebrow = "SkyShare check-in" }: { children: React.ReactNode; eyebrow?: string }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-8 sm:px-6">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold">{eyebrow}</p>
      {children}
    </main>
  );
}

function Closed({ title, text }: { title: string; text: string }) {
  return (
    <Shell>
      <div className="mt-6 rounded bg-white p-6 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <h1 className="text-xl font-semibold text-brand-lea dark:text-slate-100">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-brand-grey dark:text-slate-400">{text}</p>
      </div>
    </Shell>
  );
}

export default async function RatingLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await lookupRatingLink(token);
  if (!link.found) {
    return <Closed title="This link isn't valid" text="The address may have been cut short when it was copied. Ask HR to send you a fresh one." />;
  }
  const found = link as Extract<typeof link, { found: true }>;
  const checkin = ratedCheckin(found.dayMark) ?? RATED_CHECKINS[0];
  if (found.state === "COMPLETED") return <Closed title="Thank you!" text={`Your rating for ${found.employeeName} has been received. There is nothing more to do.`} />;
  if (found.state === "RATED_IN_APP") return <Closed title="Already recorded" text={`HR has already recorded ${found.employeeName}'s ${checkin.short} rating, so there is nothing more to do. Thank you!`} />;
  if (found.state === "EXPIRED") return <Closed title="This link has expired" text="Ask HR to send it again and the same form will open." />;
  if (found.state === "CANCELLED") return <Closed title="This link is no longer active" text="HR has closed this request. If you think that is a mistake, reply to the email it came in." />;

  const started = formatCalendarDayShort(found.startDate);
  return (
    <Shell eyebrow={`SkyShare ${checkin.title}`}>
      <header className="mt-2 text-center">
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">{found.employeeName}</h1>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          {[found.position, started ? `started ${started}` : null].filter(Boolean).join(" · ")}
        </p>
      </header>
      <ManagerRatingForm token={token} dayMark={found.dayMark} employeeName={found.employeeName} managerName={found.managerName} />
    </Shell>
  );
}
