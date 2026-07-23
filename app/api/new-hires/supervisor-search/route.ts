import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

export const dynamic = "force-dynamic";

// People who can be picked as someone's supervisor: anyone on the roster who
// isn't terminated or archived. Returns the address the orientation email would
// actually use, so the picker can show it and the person choosing can see
// straight away whether that supervisor is contactable.
export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return NextResponse.json({ people: [] }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  // The hire being edited, so nobody can be made their own supervisor.
  const exclude = url.searchParams.get("exclude")?.trim() || undefined;
  if (q.length < 2) return NextResponse.json({ people: [] });

  const rows = await prisma.newHire.findMany({
    where: {
      canceled: false,
      employmentStatus: { not: "TERMINATED" },
      stage: { not: "ARCHIVED" },
      ...(exclude ? { id: { not: exclude } } : {}),
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { ssEmail: { contains: q, mode: "insensitive" } }
      ]
    },
    select: { id: true, name: true, position: true, department: true, ssEmail: true, personalEmail: true },
    orderBy: { name: "asc" },
    take: 15
  });

  return NextResponse.json({
    people: rows.map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      department: r.department,
      // Company address preferred, mirroring what the send actually does.
      email: r.ssEmail?.trim() || r.personalEmail?.trim() || null
    }))
  });
}
