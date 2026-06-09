import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getFirstValue, parseCsv } from "@/lib/imports/csv";

const keyKeys = ["key", "requirement key", "id"];
const labelKeys = ["label", "requirement", "name", "title"];
const categoryKeys = ["category", "section", "group"];
const valueTypeKeys = ["valueType", "value type", "type"];
const descriptionKeys = ["description", "notes", "detail"];
const defaultKeys = ["defaultEnabled", "default enabled", "default", "enabled"];
const sortKeys = ["sortOrder", "sort order", "order"];
const jobCsvKeys = ["job_title", "job title", "Minimum Requirements", "minimum requirements", "Pay Scale", "pay scale"];

type RequirementImportRow = {
  key: string;
  label: string;
  category: string;
  valueType: string;
  description: string | null;
  defaultEnabled: boolean;
  sortOrder: number;
};

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

function parseBoolean(value: string | null) {
  return ["true", "yes", "y", "1", "default", "enabled"].includes((value ?? "").trim().toLowerCase());
}

function normalizeValueType(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized.includes("hour")) return "hours";
  if (normalized.includes("number")) return "number";
  if (normalized.includes("text")) return "text";
  return "boolean";
}

function hasAnyHeader(row: Record<string, string>, keys: string[]) {
  const headers = Object.keys(row).map((key) => key.trim().toLowerCase());
  return keys.some((key) => headers.includes(key.toLowerCase()));
}

function looksLikeJobText(lines: string[]) {
  const sample = lines.join("\n");
  return /Job Location:|Secondary Location:|Position Code:|Salary Range:|Job Responsibilities:|Qualifications:|About the Role:/i.test(sample);
}

function categoryFromHeading(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("all pilot jobs")) return "Required for All Pilot Jobs";
  if (lower.includes("certificate") || lower.includes("compliance")) return "Certificates / Compliance";
  if (lower.includes("numeric") || lower.includes("hours") || lower.includes("structured")) return "Structured Numeric Pilot Gates";
  if (lower.includes("schedule")) return "Schedule / Availability";
  if (lower.includes("location")) return "Location / Commute";
  return value.replace(/:+$/g, "").trim() || "General";
}

function valueTypeFromLabel(label: string, category: string) {
  return /time|hours?|multi-engine|turbine|jet|instrument|cross-country|night|type/i.test(label) || /numeric|hour/i.test(category)
    ? "hours"
    : "boolean";
}

function rowFromStandardCsv(row: Record<string, string>, index: number): RequirementImportRow | null {
  const label = getFirstValue(row, labelKeys);
  const key = getFirstValue(row, keyKeys) ?? (label ? slugify(label) : null);
  if (!label || !key) return null;

  const category = getFirstValue(row, categoryKeys) ?? "General";
  return {
    key,
    label,
    category,
    valueType: normalizeValueType(getFirstValue(row, valueTypeKeys)),
    description: getFirstValue(row, descriptionKeys),
    defaultEnabled: parseBoolean(getFirstValue(row, defaultKeys)),
    sortOrder: Number.parseInt(getFirstValue(row, sortKeys) ?? "", 10) || index + 1
  };
}

function rowsFromSimpleRequirementList(rows: Record<string, string>[]) {
  const firstRow = rows[0];
  if (!firstRow) return null;

  const headers = Object.keys(firstRow);
  if (headers.length !== 1) return null;

  const column = headers[0];
  const rawLines = [column, ...rows.map((row) => row[column]).filter(Boolean)]
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = rawLines.map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean);

  if (looksLikeJobText(lines)) {
    return { error: "This looks like a job-post text export, not a requirement catalog. Use Job PDF Import for PDFs or Jobs CSV Import for job rows." };
  }

  const importedRows: RequirementImportRow[] = [];
  let category = categoryFromHeading(column);

  for (const rawLine of rawLines.slice(1)) {
    const isBullet = /^[-*]\s*/.test(rawLine);
    const line = rawLine.replace(/^[-*]\s*/, "").replace(/\s+/g, " ").trim();

    if (!isBullet && /require|gate|structured|certificate|compliance|schedule|location/i.test(line) && line.length > 20) {
      category = categoryFromHeading(line);
      continue;
    }

    if (line.length < 3 || /^(all|some)\s+pilot jobs/i.test(line)) continue;
    const key = slugify(line);
    if (!key) continue;

    importedRows.push({
      key,
      label: line,
      category,
      valueType: valueTypeFromLabel(line, category),
      description: null,
      defaultEnabled: category === "Required for All Pilot Jobs",
      sortOrder: importedRows.length + 1
    });
  }

  return importedRows.length ? { rows: importedRows } : null;
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("requirements:write");
  if (!auth.ok) {
  return NextResponse.json(
    { message: "Unauthorized" },
    { status: 401 }
  );
}

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Upload a requirement catalog CSV file." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ message: "Requirement catalog import currently accepts CSV files." }, { status: 400 });
  }

  const rows = parseCsv(await file.text());
  if (!rows.length) return NextResponse.json({ message: "CSV did not contain requirement rows." }, { status: 400 });

  if (hasAnyHeader(rows[0], jobCsvKeys)) {
    return NextResponse.json(
      { message: "This looks like a jobs CSV, not a requirement catalog. Use the Jobs CSV import card for this file." },
      { status: 400 }
    );
  }

  const simpleList = rowsFromSimpleRequirementList(rows);
  if (simpleList && "error" in simpleList) {
    return NextResponse.json({ message: simpleList.error }, { status: 400 });
  }

  const importRows = simpleList && "rows" in simpleList
    ? simpleList.rows
    : rows.map((row, index) => rowFromStandardCsv(row, index)).filter((row): row is RequirementImportRow => Boolean(row));

  if (!importRows.length) {
    const headers = Object.keys(rows[0]).join(", ");
    return NextResponse.json(
      {
        message: `No requirement catalog rows were found. Expected columns like label, requirement, category, type, defaultEnabled, and sortOrder. Detected headers: ${headers || "none"}.`
      },
      { status: 400 }
    );
  }

  const batch = await prisma.importBatch.create({
    data: { sourceType: "REQUIREMENT_CATALOG_CSV", sourceFilename: file.name, status: "RUNNING", rowCount: importRows.length }
  });

  let created = 0;
  let updated = 0;

  for (const [index, row] of importRows.entries()) {
    const existing = await prisma.requirementCatalogItem.findUnique({ where: { key: row.key } });
    await prisma.requirementCatalogItem.upsert({
      where: { key: row.key },
      update: {
        label: row.label,
        category: row.category || existing?.category || "General",
        valueType: row.valueType,
        description: row.description,
        defaultEnabled: row.defaultEnabled,
        sortOrder: row.sortOrder || existing?.sortOrder || index + 1,
        archivedAt: null
      },
      create: {
        key: row.key,
        label: row.label,
        category: row.category || "General",
        valueType: row.valueType,
        description: row.description,
        defaultEnabled: row.defaultEnabled,
        sortOrder: row.sortOrder || index + 1
      }
    });

    await prisma.importRow.create({
      data: { importBatchId: batch.id, rowNumber: index + 2, rawJson: JSON.stringify(row), status: existing ? "UPDATED" : "IMPORTED" }
    });
    if (existing) updated += 1;
    else created += 1;
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMPLETED",
      importedCount: created + updated,
      skippedCount: 0,
      completedAt: new Date(),
      summaryJson: JSON.stringify({ created, updated, skipped: 0 })
    }
  });

  return NextResponse.json({ ok: true, message: `Imported ${created + updated} requirement catalog rows.`, created, updated, skipped: 0 });
}
