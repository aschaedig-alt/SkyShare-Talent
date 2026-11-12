import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { sanitizeRichText } from "@/lib/richtext/sanitize";
import { applyFieldStyle, describeStyle, fieldStyle, QUESTION_FIELDS, QUESTION_FIELD_LABEL, type QuestionField } from "@/lib/interview-questions/format";
import { parseGuidance, questionHtml, serializeGuidance } from "@/lib/interview-questions/rich";

export const dynamic = "force-dynamic";

/**
 * Apply one box's formatting to the same box on EVERY question (feedback
 * cmwcmsbwn) — and undo the last such change.
 *
 * The style is worked out HERE from the HTML sent, not trusted from the client.
 * Before writing, the previous value of every row it changes is kept in a
 * WorkspaceSetting (scope "interview-questions", key "format-undo"), so the
 * Undo button can put them back. Undo restores a row only if it still holds
 * exactly what this change wrote — a question edited since is left alone and
 * reported, rather than having somebody's later edit thrown away.
 */

const SCOPE = "interview-questions";
const UNDO_KEY = "format-undo";

const applySchema = z.object({
  action: z.literal("apply"),
  field: z.enum(QUESTION_FIELDS),
  html: z.string().max(20000)
});
const undoSchema = z.object({ action: z.literal("undo") });

type UndoRecord = {
  at: string;
  field: QuestionField;
  label: string;
  rows: Array<{ id: string; column: "text" | "guidance"; before: string | null; after: string | null }>;
};

/** The stored column a field lives in, and its value as HTML. */
function readField(row: { text: string; guidance: string | null }, field: QuestionField): string {
  if (field === "text") return questionHtml(row.text);
  return parseGuidance(row.guidance)[field];
}

function writeField(row: { text: string; guidance: string | null }, field: QuestionField, html: string): { column: "text" | "guidance"; value: string | null } {
  if (field === "text") return { column: "text", value: html };
  const g = parseGuidance(row.guidance);
  return { column: "guidance", value: serializeGuidance({ ...g, [field]: html }) };
}

export async function GET() {
  const auth = await requireApiPermission("calendar:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const setting = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: SCOPE, key: UNDO_KEY } } });
  if (!setting) return NextResponse.json({ undo: null });
  try {
    const rec = JSON.parse(setting.valueJson) as UndoRecord;
    return NextResponse.json({ undo: rec.rows.length ? { at: rec.at, label: rec.label, count: rec.rows.length } : null });
  } catch {
    return NextResponse.json({ undo: null });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const body = await request.json();

    if (body?.action === "undo") {
      undoSchema.parse(body);
      const setting = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: SCOPE, key: UNDO_KEY } } });
      if (!setting) return NextResponse.json({ message: "There is nothing to undo." }, { status: 400 });
      const rec = JSON.parse(setting.valueJson) as UndoRecord;
      const current = await prisma.interviewQuestion.findMany({ where: { id: { in: rec.rows.map((r) => r.id) } }, select: { id: true, text: true, guidance: true } });
      const byId = new Map(current.map((r) => [r.id, r]));
      let restored = 0;
      let skipped = 0;
      for (const row of rec.rows) {
        const now = byId.get(row.id);
        if (!now || (row.column === "text" ? now.text : now.guidance) !== row.after) {
          skipped++;
          continue;
        }
        await prisma.interviewQuestion.update({ where: { id: row.id }, data: row.column === "text" ? { text: row.before ?? "" } : { guidance: row.before } });
        restored++;
      }
      await prisma.workspaceSetting.delete({ where: { scope_key: { scope: SCOPE, key: UNDO_KEY } } });
      return NextResponse.json({ ok: true, restored, skipped });
    }

    const { field, html } = applySchema.parse(body);
    const style = fieldStyle(sanitizeRichText(html));
    if (!style) return NextResponse.json({ message: "That box is empty, so there is no formatting to copy." }, { status: 400 });

    const rows = await prisma.interviewQuestion.findMany({ select: { id: true, text: true, guidance: true } });
    const changes: UndoRecord["rows"] = [];
    for (const row of rows) {
      const current = readField(row, field);
      if (!current) continue;
      const next = sanitizeRichText(applyFieldStyle(current, style));
      if (next === current) continue;
      const { column, value } = writeField(row, field, next);
      const before = column === "text" ? row.text : row.guidance;
      if (value === before) continue;
      changes.push({ id: row.id, column, before, after: value });
    }

    const label = `${QUESTION_FIELD_LABEL[field]}: ${describeStyle(style)}`;
    // Undo record FIRST, so a failure part-way through can still be undone.
    const rec: UndoRecord = { at: new Date().toISOString(), field, label, rows: changes };
    await prisma.workspaceSetting.upsert({
      where: { scope_key: { scope: SCOPE, key: UNDO_KEY } },
      create: { scope: SCOPE, key: UNDO_KEY, valueJson: JSON.stringify(rec) },
      update: { valueJson: JSON.stringify(rec) }
    });
    for (const c of changes) {
      await prisma.interviewQuestion.update({ where: { id: c.id }, data: c.column === "text" ? { text: c.after ?? "" } : { guidance: c.after } });
    }
    return NextResponse.json({ ok: true, changed: changes.length, total: rows.length, label });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Apply question formatting failed:", error);
    return NextResponse.json({ message: "Unable to apply the formatting." }, { status: 500 });
  }
}
