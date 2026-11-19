import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Mail, Phone, UserPlus } from "lucide-react";
import { phoneText } from "@/lib/formatting/phone";
import {
  hireCardVcardPath,
  hireIdForCardToken,
  loadPublicHireCard,
} from "@/lib/new-hire-contacts/hire-card-link";

// PUBLIC — one new hire's card, opened from the "Send contact card" email on a
// supervisor's phone. No login: it lives under /welcome, which middleware leaves
// open and AppShell renders bare, exactly like the commonly-used-contacts page.
//
// The button is the whole point. It is a plain link to a text/vcard response, so
// the BROWSER hands the card to the phone: iOS Safari shows "Create New Contact /
// Add to Existing Contact", Android opens it in Contacts. An emailed .vcf
// attachment could not promise that — see lib/new-hire-contacts/hire-card-link.ts.
//
// An invalid, revoked or departed-employee token renders welcome/not-found.tsx and
// fetches no contact data.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SkyShare — New team member",
  description: "Add a new SkyShare team member to your phone.",
  robots: { index: false, follow: false },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export default async function HireCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hireId = await hireIdForCardToken(token);
  if (!hireId) notFound();
  const card = await loadPublicHireCard(hireId);
  if (!card) notFound();

  const phone = card.phone ? phoneText(card.phone) ?? card.phone : null;

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-16 pt-10">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold">New to SkyShare</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-lea dark:text-slate-100">Save to your contacts</h1>
      </header>

      <div className="mt-6 rounded bg-white p-5 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-cloudDancer text-lg font-semibold text-brand-lea dark:bg-white/10 dark:text-slate-100">
          {initials(card.name)}
        </div>
        <p className="mt-3 text-lg font-semibold text-brand-lea dark:text-slate-100">{card.name}</p>
        {card.title ? <p className="text-sm text-brand-grey dark:text-slate-400">{card.title}</p> : null}

        <div className="mt-3 space-y-1 text-sm">
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="flex items-center justify-center gap-1.5 text-brand-eden hover:text-brand-lea dark:text-brand-sweet"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              {phone}
            </a>
          ) : null}
          {card.email ? (
            <a
              href={`mailto:${card.email}`}
              className="flex items-center justify-center gap-1.5 break-all text-brand-eden hover:text-brand-lea dark:text-brand-sweet"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {card.email}
            </a>
          ) : null}
        </div>

        {/* A real <a href>, not a button with an onClick: plain navigation to a
            text/vcard response is what makes the phone open its add-contact sheet. */}
        <a
          href={hireCardVcardPath(token)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded bg-brand-lea px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-eden dark:bg-brand-gold dark:text-brand-lea dark:hover:bg-brand-sweet"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Add {card.name} to contacts
        </a>
      </div>

      <p className="mt-3 text-center text-xs leading-relaxed text-brand-grey dark:text-slate-400">
        iPhone: tap <strong>Create New Contact</strong>. Android: open the downloaded card and save it to Contacts.
      </p>
    </main>
  );
}
