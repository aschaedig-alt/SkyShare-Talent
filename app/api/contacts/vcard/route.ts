import { getResolvedContactsByKey } from "@/lib/data/new-hire-contacts";
import { buildVcardFile } from "@/lib/new-hire-contacts/vcard";

// PUBLIC endpoint — intentionally outside the auth wall (see middleware.ts) so a
// brand-new hire without an account can tap the link and add contacts. It only
// ever serves the admin-curated set: the client passes stable keys and we
// resolve them against the curated config, so no arbitrary employee data can be
// requested here.
export const dynamic = "force-dynamic";

function safeFilename(raw: string | null): string {
  const base = (raw ?? "skyshare-contacts").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${base || "skyshare-contacts"}.vcf`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const byKey = await getResolvedContactsByKey();

  const requested = url.searchParams.get("keys");
  const contacts = requested
    ? requested
        .split(",")
        .map((k) => k.trim())
        .map((k) => byKey.get(k))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
    : Array.from(byKey.values()); // no keys → the full curated set

  if (contacts.length === 0) {
    return new Response("No contacts found.", { status: 404 });
  }

  const body = buildVcardFile(
    contacts.map((c) => ({ fullName: c.fullName, title: c.title, phone: c.phone, email: c.email }))
  );

  // iOS quirk: an INLINE vCard opens Safari's Quick Look preview, which only
  // ever adds the FIRST contact. Serving multiple contacts as an ATTACHMENT
  // makes the phone hand the file to the Contacts importer, which then offers
  // "Add All Contacts". A single contact stays inline for the smooth one-tap
  // preview. (Android downloads either way and imports all on open.)
  const disposition = contacts.length > 1 ? "attachment" : "inline";
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `${disposition}; filename="${safeFilename(url.searchParams.get("name"))}"`,
      "Cache-Control": "no-store"
    }
  });
}
