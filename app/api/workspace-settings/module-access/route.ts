import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { saveWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import { normalizeModuleAccessPolicy } from "@/lib/navigation/modules";

export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const payload = (await request.json()) as { policy?: unknown };
    const policy = normalizeModuleAccessPolicy(payload?.policy ?? {});
    const saved = await saveWorkspaceModuleAccessPolicy(policy);

    return NextResponse.json({ policy: saved });
  } catch {
    return NextResponse.json({ message: "Unable to save module access policy." }, { status: 500 });
  }
}
