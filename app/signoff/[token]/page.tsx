import type { Metadata } from "next";
import { lookupSignoffLink } from "@/lib/quality-of-hire/signoff-requests";
import { SignoffForm } from "@/components/signoff/SignoffForm";

// PUBLIC page: a hiring manager's no-login sign-off on the Quality of Hire
// definitions (moved into Journey from a Google Form, Nov 21 2026). Outside the
// auth wall by design, like /rate (middleware.ts does not list /signoff; AppShell
// renders it bare). The token opens ONE form and shows nobody else's answers.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SkyShare - Quality of Hire sign-off",
  robots: { index: false, follow: false }
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold">SkyShare Quality of Hire</p>
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

export default async function SignoffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await lookupSignoffLink(token);
  if (!link.found) return <Closed title="This link isn't valid" text="The address may have been cut short when it was copied. Ask HR to send you a fresh one." />;
  const found = link as Extract<typeof link, { found: true }>;
  if (found.state === "COMPLETED") return <Closed title="Thank you!" text="Your sign-off has been received. There is nothing more to do." />;
  if (found.state === "EXPIRED") return <Closed title="This link has expired" text="Ask HR to send it again and the same form will open." />;
  if (found.state === "CANCELLED") return <Closed title="This link is no longer active" text="HR has closed this request. If you think that is a mistake, reply to the email it came in." />;

  return (
    <Shell>
      <header className="mt-2 text-center">
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Good hire and bad hire: your sign-off</h1>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">{found.departments.join(" · ")}</p>
      </header>
      <SignoffForm token={token} toName={found.toName} departments={found.departments} />
    </Shell>
  );
}
