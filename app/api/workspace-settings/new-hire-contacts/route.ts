import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { richNoteTooLong } from "@/lib/richtext/stored";
import { getNewHireContactsConfig, saveNewHireContactsConfig, syncContactOverridesToRecords } from "@/lib/new-hire-contacts/config.server";

// Admin config for the New Hire Contacts curation. Lives under /api/workspace-settings
// so the existing middleware auth wall covers it; POST additionally requires the
// settings:admin permission. (The PUBLIC read of these contacts is a different
// endpoint: /api/contacts/vcard.)
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await getNewHireContactsConfig();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    // The welcome message is rich text under the shared limit (feedback cmwcjtm5k).
    const introTooLong = richNoteTooLong(typeof payload?.intro === "string" ? payload.intro : null);
    if (introTooLong) return NextResponse.json({ message: `Welcome message: ${introTooLong}` }, { status: 400 });
    // Push any phone/email edits back onto the employee records first, which also
    // clears those now-redundant overrides; then persist the cleaned config.
    const { config, updated } = await syncContactOverridesToRecords(payload);
    const saved = await saveNewHireContactsConfig(config);
    return NextResponse.json({ config: saved, synced: updated });
  } catch {
    return NextResponse.json({ message: "Unable to save new hire contacts." }, { status: 500 });
  }
}
