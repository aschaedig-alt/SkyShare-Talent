import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { saveEmployeeColumns } from "@/lib/data/employee-columns";

// Save the shared Employees-list column layout. Admin-gated since it's a
// workspace-wide setting everyone sees.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  try {
    const body = (await request.json().catch(() => ({}))) as { columns?: unknown };
    const columns = await saveEmployeeColumns(body.columns);
    return NextResponse.json({ columns });
  } catch {
    return NextResponse.json({ message: "Unable to save the column layout." }, { status: 500 });
  }
}
