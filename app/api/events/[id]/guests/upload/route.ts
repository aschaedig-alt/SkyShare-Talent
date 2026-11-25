import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { previewResponses, readUpload } from "@/lib/events/guest-list";

// Read an uploaded RSVP file (CSV, Excel or PDF) into responses and say what they
// would change. WRITES NOTHING: the page shows the preview and posts the rows back
// to ../guests with action "applyRows" when HR confirms. Aimee's feedback cmwwjwama.

export const maxDuration = 300;
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return NextResponse.json({ message: "Choose a file." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ message: "That file is over 15 MB." }, { status: 400 });
  try {
    const rows = await readUpload(file.name, Buffer.from(await file.arrayBuffer()));
    const preview = await previewResponses(id, rows, "upload");
    return NextResponse.json({ ok: true, fileName: file.name, rows, preview });
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "Could not read that file." }, { status: 400 });
  }
}
