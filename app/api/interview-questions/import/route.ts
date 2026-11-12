import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { sanitizeRichText } from "@/lib/richtext/sanitize";
import { plainTextToHtml } from "@/lib/richtext/normalize";
import { applyFieldStyle, fieldStyle, type FieldStyle } from "@/lib/interview-questions/format";
import { docxToText, extractQuestions, type ImportSource } from "@/lib/interview-questions/import.server";
import { joinCoreValues, parseGuidance, questionHtml, questionPlain, serializeGuidance } from "@/lib/interview-questions/rich";
import { CORE_VALUE_KEYS, QUESTION_CATEGORIES, QUESTION_DEPARTMENTS } from "@/lib/validation/interview-question";

export const dynamic = "force-dynamic";
// Reading a long question document takes a while.
export const maxDuration = 300;

/**
 * Import questions from a document — feedback cmwcmsbwn.
 *
 *   multipart  action=preview, file (.docx/.pdf/.txt/.md) or text, templateId?
 *              -> the questions read from it, as HTML, formatted like the
 *                 template question when one is picked. WRITES NOTHING.
 *   json       {action:"create", questions:[...]} -> adds the reviewed ones to
 *              the END of the bank, tagged createdBy "qbank-import-<time>", and
 *              keeps their ids for Undo.
 *   json       {action:"undo"} -> deletes the last import's questions, except
 *              any edited since (reported as kept).
 */

const SCOPE = "interview-questions";
const UNDO_KEY = "import-undo";
const MAX_BYTES = 4 * 1024 * 1024;

const createSchema = z.object({
  action: z.literal("create"),
  questions: z
    .array(
      z.object({
        text: z.string().min(1).max(20000),
        category: z.enum(QUESTION_CATEGORIES),
        coreValues: z.array(z.enum(CORE_VALUE_KEYS)),
        departments: z.array(z.enum(QUESTION_DEPARTMENTS)),
        strongAnswer: z.string().max(20000),
        listenFor: z.string().max(20000)
      })
    )
    .min(1)
    .max(200)
});

type ImportUndo = { at: string; tag: string; ids: string[] };

function toHtml(text: string, style: FieldStyle | null): string {
  if (!text.trim()) return "";
  const html = plainTextToHtml(text);
  return sanitizeRichText(style ? applyFieldStyle(html, style) : html);
}

async function preview(form: FormData) {
  const file = form.get("file");
  const pasted = String(form.get("text") ?? "");
  let source: ImportSource;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return NextResponse.json({ message: "That file is over 4 MB. Split it, or paste the text instead." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = file.name.toLowerCase();
    if (name.endsWith(".docx")) source = { kind: "text", text: docxToText(bytes) };
    else if (name.endsWith(".pdf")) source = { kind: "pdf", base64: Buffer.from(bytes).toString("base64") };
    else if (name.endsWith(".txt") || name.endsWith(".md")) source = { kind: "text", text: new TextDecoder().decode(bytes) };
    else return NextResponse.json({ message: "Use a Word (.docx), PDF or text file. For a Google Doc, download it as .docx or PDF, or paste its text." }, { status: 400 });
  } else if (pasted.trim()) {
    source = { kind: "text", text: pasted };
  } else {
    return NextResponse.json({ message: "Choose a file or paste the questions first." }, { status: 400 });
  }
  if (source.kind === "text" && !source.text.trim()) return NextResponse.json({ message: "No text could be read from that file." }, { status: 400 });

  // The template's formatting, box by box.
  const templateId = String(form.get("templateId") ?? "");
  let styles: { text: FieldStyle | null; strongAnswer: FieldStyle | null; listenFor: FieldStyle | null } = { text: null, strongAnswer: null, listenFor: null };
  if (templateId) {
    const t = await prisma.interviewQuestion.findUnique({ where: { id: templateId }, select: { text: true, guidance: true } });
    if (t) {
      const g = parseGuidance(t.guidance);
      styles = { text: fieldStyle(questionHtml(t.text)), strongAnswer: fieldStyle(g.strongAnswer), listenFor: fieldStyle(g.listenFor) };
    }
  }

  const found = await extractQuestions(source);
  const existing = new Set((await prisma.interviewQuestion.findMany({ select: { text: true } })).map((q) => questionPlain(q.text).toLowerCase().replace(/\s+/g, " ").trim()));
  const questions = found.map((q) => ({
    text: toHtml(q.text, styles.text),
    category: q.category,
    coreValues: q.coreValues,
    departments: q.departments,
    strongAnswer: toHtml(q.strongAnswer, styles.strongAnswer),
    listenFor: toHtml(q.listenFor, styles.listenFor),
    // Already in the bank word for word — unticked in the preview by default.
    duplicate: existing.has(q.text.toLowerCase().replace(/\s+/g, " ").trim())
  }));
  return NextResponse.json({ ok: true, questions });
}

export async function GET() {
  const auth = await requireApiPermission("calendar:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const setting = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: SCOPE, key: UNDO_KEY } } });
  if (!setting) return NextResponse.json({ undo: null });
  try {
    const rec = JSON.parse(setting.valueJson) as ImportUndo;
    return NextResponse.json({ undo: rec.ids.length ? { at: rec.at, count: rec.ids.length } : null });
  } catch {
    return NextResponse.json({ undo: null });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      return await preview(await request.formData());
    }
    const body = await request.json();

    if (body?.action === "undo") {
      const setting = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: SCOPE, key: UNDO_KEY } } });
      if (!setting) return NextResponse.json({ message: "There is no import to undo." }, { status: 400 });
      const rec = JSON.parse(setting.valueJson) as ImportUndo;
      const rows = await prisma.interviewQuestion.findMany({ where: { id: { in: rec.ids }, createdBy: rec.tag }, select: { id: true, createdAt: true, updatedAt: true } });
      // Edited since the import (updatedAt moved on) = somebody's work; keep it.
      const untouched = rows.filter((r) => r.updatedAt.getTime() - r.createdAt.getTime() < 2000).map((r) => r.id);
      await prisma.interviewQuestion.deleteMany({ where: { id: { in: untouched } } });
      await prisma.workspaceSetting.delete({ where: { scope_key: { scope: SCOPE, key: UNDO_KEY } } });
      return NextResponse.json({ ok: true, removed: untouched.length, kept: rows.length - untouched.length });
    }

    const { questions } = createSchema.parse(body);
    const last = await prisma.interviewQuestion.aggregate({ _max: { sortOrder: true } });
    let sortOrder = (last._max.sortOrder ?? 0) + 1;
    const at = new Date().toISOString();
    const tag = `qbank-import-${at}`;
    const ids: string[] = [];
    for (const q of questions) {
      const text = sanitizeRichText(q.text);
      if (questionPlain(text).length < 5) continue;
      const created = await prisma.interviewQuestion.create({
        data: {
          text,
          category: q.category,
          coreValue: joinCoreValues(q.coreValues),
          departmentsJson: JSON.stringify(q.departments),
          guidance: serializeGuidance({ strongAnswer: sanitizeRichText(q.strongAnswer), listenFor: sanitizeRichText(q.listenFor) }),
          isActive: true,
          sortOrder: sortOrder++,
          createdBy: tag
        },
        select: { id: true }
      });
      ids.push(created.id);
    }
    const rec: ImportUndo = { at, tag, ids };
    await prisma.workspaceSetting.upsert({
      where: { scope_key: { scope: SCOPE, key: UNDO_KEY } },
      create: { scope: SCOPE, key: UNDO_KEY, valueJson: JSON.stringify(rec) },
      update: { valueJson: JSON.stringify(rec) }
    });
    return NextResponse.json({ ok: true, created: ids.length });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Question import failed:", error);
    const message = error instanceof Error && error.message ? error.message : "Unable to import questions.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
