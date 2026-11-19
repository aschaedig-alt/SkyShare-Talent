import { buildVcardFile } from "@/lib/new-hire-contacts/vcard";
import { hireIdForCardToken, loadPublicHireCard } from "@/lib/new-hire-contacts/hire-card-link";

// PUBLIC — one hire's .vcf, reached from the "Add to contacts" button on
// /welcome/card/<token>. Outside the auth wall like its sibling
// /api/contacts/vcard: the people tapping it are supervisors on their phones,
// many with no account here.
//
// Gated on the per-hire card token (lib/new-hire-contacts/hire-card-link.ts),
// which also stops answering once the hire is cancelled or terminated.
export const dynamic = "force-dynamic";

function safeFilename(name: string): string {
  const base = name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${base || "skyshare-contact"}.vcf`;
}

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const hireId = await hireIdForCardToken(token);
  // 404 for every failure — wrong token, revoked, departed — so the response says
  // nothing about which.
  if (!hireId) return new Response("Not found.", { status: 404 });

  const card = await loadPublicHireCard(hireId);
  if (!card) return new Response("Not found.", { status: 404 });

  const body = buildVcardFile([
    {
      fullName: card.name,
      title: card.title,
      department: card.department,
      phone: card.phone,
      workEmail: card.email,
      workLocation: card.location,
    },
  ]);

  // INLINE, matching the single-contact case in /api/contacts/vcard: on iOS an
  // inline vCard opened in the browser shows the contact with "Create New
  // Contact" and "Add to Existing Contact" — the sheet he showed working from the
  // contacts page. Android downloads it and imports on open either way.
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `inline; filename="${safeFilename(card.name)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
