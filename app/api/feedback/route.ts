import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, requireApiPermission } from "@/lib/auth/route-auth";

const VALID_TYPES = ["IDEA", "BUG", "QUESTION"];

// Submit feedback — any authenticated user
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }

  try {
    const body = (await request.json()) as {
      type?: string;
      message?: string;
      page?: string;
      context?: Record<string, unknown> | null;
    };
    const message = (body.message ?? "").trim();
    const type = VALID_TYPES.includes(body.type ?? "") ? body.type! : "IDEA";

    // Browser-supplied context (full URL, viewport, browser, theme, recent errors).
    // Stored as-is but size-capped; never trusted for anything but display.
    let contextJson: string | null = null;
    if (body.context && typeof body.context === "object") {
      const serialized = JSON.stringify(body.context);
      contextJson = serialized.length <= 4000 ? serialized : serialized.slice(0, 4000);
    }

    if (message.length < 2) {
      return NextResponse.json({ message: "Please enter a bit more detail." }, { status: 400 });
    }
    if (message.length > 5000) {
      return NextResponse.json({ message: "Feedback is too long." }, { status: 400 });
    }

    const feedback = await prisma.feedback.create({
      data: {
        type,
        message,
        page: body.page?.slice(0, 300) ?? null,
        contextJson,
        userId: auth.user.id,
        userEmail: auth.user.email,
        userName: auth.user.name ?? null
      },
      select: { id: true }
    });

    return NextResponse.json({ ok: true, id: feedback.id, message: "Thanks for the feedback!" });
  } catch (error) {
    console.error("Error saving feedback:", error);
    return NextResponse.json({ message: "Unable to save feedback." }, { status: 500 });
  }
}

// List feedback — admins only
export async function GET() {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }

  const items = await prisma.feedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 500
  });

  return NextResponse.json({ items });
}
