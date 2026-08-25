import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth/route-auth";
import { canWriteModule } from "@/lib/auth/module-write-access";
import { CUSTOM_GROUP } from "@/lib/onboarding/tasks";

type RouteContext = { params: Promise<{ id: string }> };

// Add ONE checklist item to ONE person.
//
// The other half of this already existed: lib/data/onboarding-milestones.ts
// addMilestone() puts an item in the workspace catalog and writes the task onto
// every hire. That is the right call for "everyone gets a laptop"; it is the
// wrong call for "chase Devon's medical", which is what this route is for. A
// task added here is deliberately NOT in the catalog, so it never appears on
// anybody else and never comes back on the next person onboarded.
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return (auth as { ok: false; response: NextResponse }).response;
  }
  if (!(await canWriteModule(auth.user, "people", "edit"))) {
    return NextResponse.json({ message: "You do not have permission to edit employees." }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const body = (await request.json()) as { label?: unknown };
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 120) : "";
    if (!label) {
      return NextResponse.json({ message: "Give the item a name." }, { status: 400 });
    }

    const hire = await prisma.newHire.findUnique({ where: { id }, select: { id: true } });
    if (!hire) {
      return NextResponse.json({ message: "No such person." }, { status: 404 });
    }

    // A key that cannot collide with a catalog milestone (custom_*) or a built-in.
    // The random tail is what lets the same label be added twice on purpose.
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
    const key = `one_${slug || "item"}_${Math.random().toString(36).slice(2, 10)}`;

    // Appended, not slotted in: stored rows carry an order and renumbering the
    // middle would rewrite every existing row on this person's checklist.
    const last = await prisma.onboardingTask.findFirst({
      where: { newHireId: id, group: CUSTOM_GROUP },
      orderBy: { order: "desc" },
      select: { order: true }
    });

    const task = await prisma.onboardingTask.create({
      data: {
        newHireId: id,
        key,
        label,
        group: CUSTOM_GROUP,
        order: (last?.order ?? 89) + 1,
        status: "TODO"
      },
      // Matches TaskView in lib/data/onboarding so the client can drop it
      // straight into its task list.
      select: { id: true, key: true, label: true, group: true, order: true, status: true }
    });

    return NextResponse.json({ ok: true, task });
  } catch {
    return NextResponse.json({ message: "Could not add that item." }, { status: 500 });
  }
}
