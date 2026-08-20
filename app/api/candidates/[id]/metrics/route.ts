import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";

type RouteContext = { params: Promise<{ id: string }> };

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "field"
  );
}

// Add a manual flight-profile field the scanner didn't pick up.
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Already covered: candidates:write is not a HIRING_MANAGER or VIEWER
  // permission, so the only roles the allowlist can narrow are 403'd above.
  // Added anyway so the file is correct on its own terms, and checked ahead of
  // the existence lookup below so both answer with the identical 404.
  if (!isCandidateVisible(auth.user.viewer, id)) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { label?: string; value?: string; key?: string; unit?: string };
    const label = (body.label ?? "").trim();
    const value = (body.value ?? "").trim();
    if (label.length < 1) return NextResponse.json({ message: "A field name is required." }, { status: 400 });
    if (value.length < 1) return NextResponse.json({ message: "A value is required." }, { status: 400 });

    const candidate = await prisma.candidate.findUnique({ where: { id }, select: { id: true } });
    if (!candidate) return NextResponse.json({ message: "Candidate not found." }, { status: 404 });

    // Numeric value → store as hours; otherwise store as text.
    const numeric = /^[\d,]+(\.\d+)?$/.test(value);
    const valueNumber = numeric ? Math.round(Number(value.replace(/,/g, ""))) : null;
    const valueText = numeric ? null : value;
    const unit = body.unit ?? (numeric ? "hrs" : null);

    // Explicit stable key (e.g. recency_12mo for currency scoring) → upsert by key.
    if (body.key && /^[a-z0-9_]+$/.test(body.key)) {
      const metric = await prisma.candidateMetric.upsert({
        where: { candidateId_key: { candidateId: id, key: body.key } },
        update: { label, valueNumber, valueText, unit, status: "CONFIRMED", sourceSnippet: "Added manually" },
        create: { candidateId: id, key: body.key, label, valueNumber, valueText, unit, status: "CONFIRMED", sourceSnippet: "Added manually" }
      });
      return NextResponse.json({ ok: true, metric });
    }

    // Unique key per candidate.
    let key = `custom_${slugify(label)}`;
    let n = 1;
     
    while (await prisma.candidateMetric.findUnique({ where: { candidateId_key: { candidateId: id, key } } })) {
      n += 1;
      key = `custom_${slugify(label)}_${n}`;
    }

    const metric = await prisma.candidateMetric.create({
      data: {
        candidateId: id,
        key,
        label,
        valueNumber,
        valueText,
        unit: numeric ? "hrs" : null,
        status: "CONFIRMED",
        sourceSnippet: "Added manually"
      }
    });

    return NextResponse.json({ ok: true, metric });
  } catch (error) {
    console.error("Add metric error:", error);
    return NextResponse.json({ message: "Unable to add field." }, { status: 500 });
  }
}
