import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getNewHireContactsConfig, saveNewHireContactsConfig } from "@/lib/new-hire-contacts/config.server";

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
    const saved = await saveNewHireContactsConfig(payload);
    return NextResponse.json(saved);
  } catch {
    return NextResponse.json({ message: "Unable to save new hire contacts." }, { status: 500 });
  }
}
