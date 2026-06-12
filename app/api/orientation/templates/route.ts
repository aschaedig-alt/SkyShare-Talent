import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getEmailTemplates, addEmailTemplate, editEmailTemplate, removeEmailTemplate } from "@/lib/data/orientation-templates";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ templates: await getEmailTemplates() });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const b = (await request.json()) as { name?: string; subject?: string; body?: string };
    const templates = await addEmailTemplate(String(b?.name ?? ""), String(b?.subject ?? ""), String(b?.body ?? ""));
    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to add template." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const b = (await request.json()) as { key?: string; name?: string; subject?: string; body?: string };
    if (!b?.key) return NextResponse.json({ message: "key is required." }, { status: 400 });
    const templates = await editEmailTemplate(b.key, { name: b.name, subject: b.subject, body: b.body });
    return NextResponse.json({ ok: true, templates });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to edit template." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key") ?? "";
  if (!key) return NextResponse.json({ message: "key is required." }, { status: 400 });
  const templates = await removeEmailTemplate(key);
  return NextResponse.json({ ok: true, templates });
}
