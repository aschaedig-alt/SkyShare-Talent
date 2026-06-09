import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { normalizeEmail, normalizeName, normalizePhone, splitCandidateName } from "@/lib/candidates/normalize";
import { getFirstValue, parseCsv } from "@/lib/import/csv-parser";
import { validateCsvData } from "@/lib/import/csv-validator";

const nameKeys = ["name", "candidate name", "full name", "applicant", "applicant name", "candidate", "applicant full name"];
const firstNameKeys = ["first name", "firstname", "first", "preferred first name", "preferred_first_name", "first_name"];
const lastNameKeys = ["last name", "lastname", "last", "surname", "preferred last name", "preferred_last_name", "last_name"];
const emailKeys = ["email", "email address", "primary email", "candidate email", "email_address"];
const phoneKeys = ["phone", "phone number", "mobile", "cell", "primary phone"];
const titleKeys = ["title", "current title", "job title", "role", "job_title", "previous job title applied to", "previous_job_title_applied_to"];
const stageKeys = ["stage", "status", "candidate stage", "workflow stage", "application status", "previous application status", "previous_application_status"];
const sourceKeys = ["source", "candidate source", "import source", "referral source", "referral_source"];
const tagKeys = ["tags", "tag", "skills"];
const applicationStatusKeys = ["application status", "previous application status", "previous_application_status", "workflow status"];
const applicationStageKeys = ["workflow stage", "stage", "candidate stage"];
const applicationIdKeys = ["application id", "source application id", "posting id", "posting_id", "application_id"];
const appliedAtKeys = ["apply date", "applied at", "applied date", "posting start date", "posting_start_date"];

function buildCandidateName(row: Record<string, string>) {
  const explicitName = getFirstValue(row, nameKeys);
  const firstName = getFirstValue(row, firstNameKeys);
  const lastName = getFirstValue(row, lastNameKeys);

  if (firstName || lastName) {
    const displayName = [firstName, lastName].filter(Boolean).join(" ");
    return { firstName, lastName, displayName: displayName || explicitName || "Unnamed candidate" };
  }

  return splitCandidateName(explicitName);
}

function parseTags(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(/[;,|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanAppliedJobTitle(value: string | null) {
  return value
    ?.replace(/^\s*(filled|closed|archived|inactive)\s*[-:]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim() || null;
}

async function findExistingCandidate(normalizedEmail: string | null, normalizedPhone: string | null) {
  if (!normalizedEmail && !normalizedPhone) {
    return null;
  }

  return prisma.candidate.findFirst({
    where: {
      OR: [
        normalizedEmail ? { normalizedEmail } : undefined,
        normalizedPhone ? { normalizedPhone } : undefined
      ].filter(Boolean) as Array<{ normalizedEmail: string } | { normalizedPhone: string }>
    }
  });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("imports:write");
  if (!auth.ok) return auth.response;

  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Upload a CSV file." }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ message: "Candidate import currently accepts CSV files." }, { status: 400 });
    }

    const text = await file.text();
    const parseResult = parseCsv(text);
    const rows = parseResult.rows;

    if (rows.length === 0) {
      return NextResponse.json(
        { message: "CSV did not contain importable rows." },
        { status: 400 }
      );
    }

    const validation = validateCsvData(rows, getFirstValue);
    if (!validation.isValid) {
      const errorMessages = validation.errors.map((e) => `Row ${e.rowNumber}: ${e.message}`);
      return NextResponse.json(
        {
          message: "CSV contains validation errors",
          errors: errorMessages,
          details: validation.errors
        },
        { status: 400 }
      );
    }

    const batch = await prisma.importBatch.create({
      data: {
        sourceType: "CANDIDATE_CSV",
        sourceFilename: file.name,
        status: "RUNNING",
        rowCount: rows.length
      }
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let warnings = validation.warnings.length;

  for (const [index, row] of rows.entries()) {
    const email = getFirstValue(row, emailKeys);
    const phone = getFirstValue(row, phoneKeys);
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    const name = buildCandidateName(row);
    const currentTitle = getFirstValue(row, titleKeys);
    const stage = getFirstValue(row, stageKeys) ?? "Imported";
    const source = getFirstValue(row, sourceKeys) ?? `CSV: ${file.name}`;
    const tags = parseTags(getFirstValue(row, tagKeys));
    const appliedJobTitle = cleanAppliedJobTitle(getFirstValue(row, titleKeys));
    const sourceApplicationId = getFirstValue(row, applicationIdKeys);
    const applicationStatus = getFirstValue(row, applicationStatusKeys);
    const applicationStage = getFirstValue(row, applicationStageKeys);
    const appliedAt = parseDate(getFirstValue(row, appliedAtKeys));

    if (name.displayName === "Unnamed candidate" && !normalizedEmail && !normalizedPhone) {
      skipped += 1;
      warnings += 1;
      await prisma.importRow.create({
        data: {
          importBatchId: batch.id,
          rowNumber: index + 2,
          rawJson: JSON.stringify(row),
          status: "SKIPPED",
          warningJson: JSON.stringify(["Missing name and valid email/phone."])
        }
      });
      continue;
    }

    const existing = await findExistingCandidate(normalizedEmail, normalizedPhone);
    const candidate = existing
      ? await prisma.candidate.update({
          where: { id: existing.id },
          data: {
            firstName: existing.firstName ?? name.firstName,
            lastName: existing.lastName ?? name.lastName,
            displayName: existing.displayName || name.displayName,
            normalizedName: existing.normalizedName ?? normalizeName(name.displayName),
            primaryEmail: existing.primaryEmail ?? email,
            normalizedEmail: existing.normalizedEmail ?? normalizedEmail,
            primaryPhone: existing.primaryPhone ?? phone,
            normalizedPhone: existing.normalizedPhone ?? normalizedPhone,
            currentTitle: existing.currentTitle ?? currentTitle,
            stage: existing.stage ?? stage,
            source: existing.source ?? source,
            tagsJson: existing.tagsJson ?? JSON.stringify(tags),
            sourceHistoryJson: JSON.stringify([
              ...(existing.sourceHistoryJson ? JSON.parse(existing.sourceHistoryJson) : []),
              { source, filename: file.name, importedAt: new Date().toISOString(), action: "csv-update" }
            ])
          }
        })
      : await prisma.candidate.create({
          data: {
            firstName: name.firstName,
            lastName: name.lastName,
            displayName: name.displayName,
            normalizedName: normalizeName(name.displayName),
            primaryEmail: email,
            normalizedEmail,
            primaryPhone: phone,
            normalizedPhone,
            currentTitle,
            status: "ACTIVE",
            stage,
            source,
            tagsJson: JSON.stringify(tags),
            originalFieldsJson: JSON.stringify(row),
            sourceHistoryJson: JSON.stringify([{ source, filename: file.name, importedAt: new Date().toISOString(), action: "csv-create" }])
          }
        });

    if (normalizedEmail) {
      await prisma.candidateContact.upsert({
        where: { id: `${candidate.id}-email-${normalizedEmail}` },
        update: { value: email ?? normalizedEmail, normalized: normalizedEmail, isPrimary: true, source },
        create: {
          id: `${candidate.id}-email-${normalizedEmail}`,
          candidateId: candidate.id,
          type: "email",
          value: email ?? normalizedEmail,
          normalized: normalizedEmail,
          isPrimary: true,
          source
        }
      });
    }

    if (normalizedPhone) {
      await prisma.candidateContact.upsert({
        where: { id: `${candidate.id}-phone-${normalizedPhone}` },
        update: { value: phone ?? normalizedPhone, normalized: normalizedPhone, isPrimary: true, source },
        create: {
          id: `${candidate.id}-phone-${normalizedPhone}`,
          candidateId: candidate.id,
          type: "phone",
          value: phone ?? normalizedPhone,
          normalized: normalizedPhone,
          isPrimary: true,
          source
        }
      });
    }

    let matchedJobId: string | null = null;
    if (appliedJobTitle) {
      const matchedJob = await prisma.job.findFirst({
        where: {
          OR: [
            { normalizedTitle: normalizeName(appliedJobTitle) },
            { title: { contains: appliedJobTitle } }
          ]
        },
        select: { id: true }
      });
      matchedJobId = matchedJob?.id ?? null;

      const existingApplication = await prisma.candidateApplication.findFirst({
        where: {
          candidateId: candidate.id,
          OR: [
            sourceApplicationId ? { sourceApplicationId } : undefined,
            matchedJobId ? { jobId: matchedJobId } : undefined,
            { source: `${source} | ${appliedJobTitle}` }
          ].filter(Boolean) as Array<{ sourceApplicationId: string } | { jobId: string } | { source: string }>
        }
      });

      if (existingApplication) {
        await prisma.candidateApplication.update({
          where: { id: existingApplication.id },
          data: {
            jobId: existingApplication.jobId ?? matchedJobId,
            sourceApplicationId: existingApplication.sourceApplicationId ?? sourceApplicationId,
            status: existingApplication.status ?? applicationStatus ?? stage,
            stage: existingApplication.stage ?? applicationStage ?? stage,
            source: existingApplication.source ?? `${source} | ${appliedJobTitle}`,
            appliedAt: existingApplication.appliedAt ?? appliedAt
          }
        });
      } else {
        await prisma.candidateApplication.create({
          data: {
            candidateId: candidate.id,
            jobId: matchedJobId,
            sourceApplicationId,
            status: applicationStatus ?? stage,
            stage: applicationStage ?? stage,
            source: `${source} | ${appliedJobTitle}`,
            appliedAt
          }
        });
      }
    }

    await prisma.importRow.create({
      data: {
        importBatchId: batch.id,
        rowNumber: index + 2,
        rawJson: JSON.stringify(row),
        status: existing ? "UPDATED" : "IMPORTED",
        candidateId: candidate.id
      }
    });

    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMPLETED",
      importedCount: created + updated,
      skippedCount: skipped,
      warningCount: warnings,
      completedAt: new Date(),
      summaryJson: JSON.stringify({ created, updated, skipped, warnings })
    }
  });

    const importedCount = created + updated;
    return NextResponse.json({
      ok: true,
      message: importedCount > 0
        ? `Imported ${created + updated} candidates.`
        : "No candidates were imported. Check that the CSV includes a name, email, or phone column.",
      created,
      updated,
      skipped,
      warnings
    }, { status: importedCount > 0 ? 200 : 400 });
  } catch (error) {
    console.error("CSV import error:", error);
    return NextResponse.json(
      {
        message: "An error occurred during import. Please check your CSV file and try again.",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
