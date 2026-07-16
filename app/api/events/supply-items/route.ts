import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";
import { isSupplyCategory } from "@/lib/events/constants";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ message: "Give the supply a name." }, { status: 400 });
    }

    const item = await prisma.supplyItem.create({
      data: {
        name,
        category: isSupplyCategory(body.category) ? body.category : "SWAG",
        unit: typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : "each",
        onHand: typeof body.onHand === "number" ? Math.max(0, Math.floor(body.onHand)) : 0,
        reorderThreshold:
          typeof body.reorderThreshold === "number" ? Math.max(0, Math.floor(body.reorderThreshold)) : 0,
        vendor: typeof body.vendor === "string" && body.vendor.trim() ? body.vendor.trim() : null,
        reorderUrl: typeof body.reorderUrl === "string" && body.reorderUrl.trim() ? body.reorderUrl.trim() : null,
        unitCost: typeof body.unitCost === "number" && Number.isFinite(body.unitCost) ? body.unitCost : null
      }
    });
    return NextResponse.json({ ok: true, id: item.id });
  } catch (error) {
    console.error("Create supply item error:", error);
    return NextResponse.json({ message: "Unable to add that supply." }, { status: 500 });
  }
}
