import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { buildVcardFile } from "@/lib/new-hire-contacts/vcard";

// One employee's .vcf, so a recruiter on a phone can tap "Make contact" and have
// the person land in their Contacts app.
//
// Deliberately NOT the sibling at app/api/contacts/vcard/route.ts. That one is
// public, share-token-gated, and resolves only the admin-curated welcome
// contacts — any hire who is not on that curated list 404s there. This one
// serves the hire's own record and is gated on the signed-in user instead.
//
// /api/new-hires is not in middleware.ts's protectedApiPrefixes, so every route
// under it gates itself. requireApiUser() and nothing more: handing back a name,
// title, phone and email that the caller is already looking at on the profile is
// a READ, so it must not be behind a write permission — a view-only recruiter
// needs this exact button.
export const dynamic = "force-dynamic";

function safeFilename(name: string): string {
  const base = name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${base || "skyshare-contact"}.vcf`;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return authFailureResponse(auth);
  }

  const { id } = await context.params;

  const hire = await prisma.newHire.findUnique({
    where: { id },
    select: {
      name: true,
      position: true,
      department: true,
      location: true,
      phone: true,
      ssEmail: true,
      personalEmail: true
    }
  });

  if (!hire) {
    return NextResponse.json({ message: "That person could not be found." }, { status: 404 });
  }

  const body = buildVcardFile([
    {
      fullName: hire.name,
      title: hire.position,
      department: hire.department,
      phone: hire.phone,
      workEmail: hire.ssEmail,
      homeEmail: hire.personalEmail,
      workLocation: hire.location
    }
  ]);

  // INLINE, on purpose, and it is the whole point of the feature.
  //
  // The request was "press a button to make contact ... then i could share
  // contact with hiring manager" — two steps, in that order. On iOS an inline
  // vCard opens Quick Look, which offers "Add to Contacts": one tap and the
  // person is in her address book, where the Contacts app's own Share Contact
  // then does step two properly (as a contact card, not a loose file).
  //
  // An ATTACHMENT would skip straight to the Files/share sheet. That forwards
  // the .vcf immediately but never adds the person to her phone, so the thing
  // she said she would do next — share the CONTACT — would have nothing to
  // share from, and the record would not be on her phone the following week.
  // Attachment is the right disposition for a multi-contact file (see the
  // curated-contacts route); for one person, adding is what was asked for.
  // Android downloads either way and imports on open.
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `inline; filename="${safeFilename(hire.name)}"`,
      // Personal contact details, and they change — never let a proxy or the
      // browser hand back a stale card.
      "Cache-Control": "no-store"
    }
  });
}
