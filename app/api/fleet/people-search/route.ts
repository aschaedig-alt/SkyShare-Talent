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

  // WORD BY WORD, NOT ONE STRING. This used to match the whole query as a single
  // substring, so "Nick Lembo" found nobody unless a record literally contained
  // "Nick Lembo" — a profile reading "Nicholas Lembo" or "Lembo, Nick" missed,
  // and deleting the first name was the only way through. That is the "search
  // the exact name or nothing" complaint.
  //
  // Any word may match, so a surname alone still finds people; how WELL each
  // word matches is what decides the order, below.
  const tokens = [...new Set(normalized.split(/\s+/).filter((t) => t.length >= 2))];
  const nameOr = tokens.flatMap((t) => [
    { displayName: { contains: t, mode: "insensitive" as const } },
    { normalizedName: { contains: t } }
  ]);

  const [candidates, employees] = await Promise.all([
    prisma.candidate.findMany({
      where: {
        status: { not: "MERGED" },
        OR: [...nameOr, { primaryEmail: { contains: q, mode: "insensitive" } }]
      },
      select: { id: true, displayName: true, currentTitle: true, archivedAt: true },
      // Wider than the 12 returned: ranking a single-word search sensibly means
      // seeing more than the first dozen the database happens to hand back.
      take: 60
    }),
    prisma.newHire.findMany({
      where: {
        employmentStatus: "ACTIVE",
        canceled: false,
        candidateId: null,
        OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" as const } }))
      },
      select: { id: true, name: true, position: true },
      take: 60
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

  /**
   * Best match first, and people you can actually staff above people you cannot.
   *
   * The chart is filled with current employees and live candidates, so an
   * archived record matching one word should never sit above a current employee
   * matching the whole name.
   */
  function score(p: (typeof people)[number]): number {
    const name = p.displayName.toLowerCase();
    const words = name.split(/\s+/);
    let s = 0;

    if (name === normalized) s += 1000; // exact full name
    else if (name.includes(normalized)) s += 500; // the old behaviour, still best after exact

    const hit = tokens.filter((t) => words.some((w) => w.startsWith(t)));
    // A word-start match ("lem" -> "Lembo") beats a mid-word one ("emb").
    s += hit.length * 100;
    if (hit.length === tokens.length && tokens.length > 1) s += 200; // every word accounted for
    s += tokens.filter((t) => name.includes(t)).length * 20;

    // Staffable now: a current employee, or a candidate still in play.
    if (p.kind === "employee") s += 60;
    if (!p.archived) s += 40;

    return s;
  }

  people.sort((a, b) => score(b) - score(a) || a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ people: people.slice(0, 12) });
}
