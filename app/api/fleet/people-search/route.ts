import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

// People the org-chart link picker can point a chart name at: all matching
// candidates PLUS current employees who aren't linked to a candidate yet — the
// ones the candidate search alone can't surface (hired before the app, direct
// hires, returning employees like a rehire). Employees that already have a
// candidate come through the candidate half, so they're excluded here to avoid
// duplicates.
export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) {
    return NextResponse.json({ people: [] }, { status: 401 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ people: [] });
  }
  const normalized = q.toLowerCase();

  const [candidates, employees] = await Promise.all([
    prisma.candidate.findMany({
      where: {
        status: { not: "MERGED" },
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { normalizedName: { contains: normalized } },
          { primaryEmail: { contains: q, mode: "insensitive" } }
        ]
      },
      select: { id: true, displayName: true, currentTitle: true, archivedAt: true },
      take: 12
    }),
    prisma.newHire.findMany({
      where: {
        employmentStatus: "ACTIVE",
        canceled: false,
        candidateId: null,
        name: { contains: q, mode: "insensitive" }
      },
      select: { id: true, name: true, position: true },
      take: 12
    })
  ]);

  const people = [
    ...candidates.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      currentTitle: c.currentTitle,
      kind: "candidate" as const,
      candidateId: c.id,
      archived: Boolean(c.archivedAt)
    })),
    ...employees.map((h) => ({
      id: h.id,
      displayName: h.name,
      currentTitle: h.position,
      kind: "employee" as const,
      candidateId: null,
      archived: false
    }))
  ];

  return NextResponse.json({ people });
}
