import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

export const dynamic = "force-dynamic";

// People who can be picked as someone's supervisor: anyone still employed.
//
// Searches NewHire — the EMPLOYEE record — not Candidate. A supervisor is a
// colleague, and most colleagues never had a candidate record (they were hired
// before the app, or direct). Linking to their employee record is also what
// keeps the address live.
//
// DO NOT filter on `stage` here. stage ARCHIVED means "finished onboarding",
// i.e. a normal long-standing employee — NOT someone who left. An earlier
// version excluded it and so offered 27 of 189 people, hiding almost every
// tenured employee, which is precisely who a supervisor usually is. Employment
// status is the only thing that says whether someone is still here.
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
