import { NextResponse } from "next/server";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { isQohSource, prepareUpload, saveUpload, undoUpload } from "@/lib/quality-of-hire/imports";

// Reports > Quality of Hire: the files the report needs from outside Journey (see
// lib/quality-of-hire/imports.ts). Admin only - Paycom's term reasons say why each
// person left.
//
//   POST form { source, mode: "preview" | "save", file }   preview writes nothing; save stores the file as one batch
//   POST json { undo: batchId }                             marks that batch UNDONE; the one before it is current again

const MAX_BYTES = 4 * 1024 * 1024; // Vercel takes ~4.5 MB per request; Paycom's report is ~30 KB

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  if (auth.user.role !== "ADMIN") return NextResponse.json({ message: "Only an admin can change the Quality of Hire data." }, { status: 403 });

  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { undo?: unknown };
    if (typeof body.undo !== "string" || !body.undo) return NextResponse.json({ message: "Which upload?" }, { status: 400 });
    const ok = await undoUpload(body.undo);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ message: "That upload is not a current one." }, { status: 404 });
  }

  const form = await request.formData();
  const source = form.get("source");
  const mode = form.get("mode");
  const file = form.get("file");
  if (!isQohSource(source)) return NextResponse.json({ message: "Which file is this?" }, { status: 400 });
  if (!(file instanceof File) || file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ message: "Choose a file under 4 MB." }, { status: 400 });
  const wantXlsx = source === "terminations";
  if (wantXlsx ? !/\.xlsx$/i.test(file.name) : !/\.csv$/i.test(file.name)) {
    return NextResponse.json({ message: wantXlsx ? "Paycom's report is the .xlsx file." : "This one is a .csv file." }, { status: 400 });
  }

  try {
    const prepared = await prepareUpload(source, file.name, new Uint8Array(await file.arrayBuffer()));
    if (!prepared.preview.rows) return NextResponse.json({ message: "No rows in that file." }, { status: 400 });
    if (mode !== "save") return NextResponse.json({ ok: true, preview: prepared.preview });
    const batchId = await saveUpload(prepared, auth.user.email ?? auth.user.name ?? null);
    return NextResponse.json({ ok: true, batchId, preview: prepared.preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ message: `Could not read ${file.name}: ${message}` }, { status: 400 });
  }
}
