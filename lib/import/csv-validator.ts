import { normalizeEmail, normalizePhone } from "@/lib/candidates/normalize";

export type CsvValidationWarning = {
  rowNumber: number;
  field: string;
  message: string;
  severity: "warning" | "error";
};

export type CsvValidationResult = {
  isValid: boolean;
  warnings: CsvValidationWarning[];
  errors: CsvValidationWarning[];
  duplicateEmails: Set<string>;
  duplicatePhones: Set<string>;
};

export function validateCsvData(
  rows: Record<string, string>[],
  getFirstValue: (row: Record<string, string>, keys: string[]) => string | null
): CsvValidationResult {
  const warnings: CsvValidationWarning[] = [];
  const errors: CsvValidationWarning[] = [];
  const seenEmails = new Map<string | null, number>();
  const seenPhones = new Map<string | null, number>();
  const duplicateEmails = new Set<string>();
  const duplicatePhones = new Set<string>();

  const emailKeys = ["email", "email address", "primary email", "candidate email", "email_address"];
  const phoneKeys = ["phone", "phone number", "mobile", "cell", "primary phone"];
  const nameKeys = ["name", "candidate name", "full name", "applicant", "applicant name", "candidate", "applicant full name"];
  const firstNameKeys = ["first name", "firstname", "first", "preferred first name", "preferred_first_name", "first_name"];
  const lastNameKeys = ["last name", "lastname", "last", "surname", "preferred last name", "preferred_last_name", "last_name"];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const rowNumber = rowIndex + 2;

    const email = getFirstValue(row, emailKeys);
    const phone = getFirstValue(row, phoneKeys);
    const fullName = getFirstValue(row, nameKeys);
    const firstName = getFirstValue(row, firstNameKeys);
    const lastName = getFirstValue(row, lastNameKeys);

    const normalizedEmail = email ? normalizeEmail(email) : null;
    const normalizedPhone = phone ? normalizePhone(phone) : null;
    const hasName = fullName || firstName || lastName;

    if (!hasName && !normalizedEmail && !normalizedPhone) {
      errors.push({
        rowNumber,
        field: "name/email/phone",
        message: "Row must have at least a name, email, or phone number",
        severity: "error"
      });
      continue;
    }

    if (email && !normalizedEmail) {
      warnings.push({
        rowNumber,
        field: "email",
        message: `Invalid email format: "${email}"`,
        severity: "warning"
      });
    }

    if (phone && !normalizedPhone) {
      warnings.push({
        rowNumber,
        field: "phone",
        message: `Invalid phone format: "${phone}" (expected 10 digits)`,
        severity: "warning"
      });
    }

    if (normalizedEmail) {
      const previousRow = seenEmails.get(normalizedEmail);
      if (previousRow !== undefined) {
        duplicateEmails.add(normalizedEmail);
        warnings.push({
          rowNumber,
          field: "email",
          message: `Email appears in multiple rows (row ${previousRow})`,
          severity: "warning"
        });
      } else {
        seenEmails.set(normalizedEmail, rowNumber);
      }
    }

    if (normalizedPhone) {
      const previousRow = seenPhones.get(normalizedPhone);
      if (previousRow !== undefined) {
        duplicatePhones.add(normalizedPhone);
        warnings.push({
          rowNumber,
          field: "phone",
          message: `Phone appears in multiple rows (row ${previousRow})`,
          severity: "warning"
        });
      } else {
        seenPhones.set(normalizedPhone, rowNumber);
      }
    }

    if (email && email.length > 254) {
      warnings.push({
        rowNumber,
        field: "email",
        message: `Email is too long (${email.length} characters)`,
        severity: "warning"
      });
    }

    const displayName = [firstName, lastName].filter(Boolean).join(" ") || fullName || "";
    if (displayName && displayName.length > 255) {
      errors.push({
        rowNumber,
        field: "name",
        message: `Name is too long (${displayName.length} characters, max 255)`,
        severity: "error"
      });
    }
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    warnings,
    errors,
    duplicateEmails,
    duplicatePhones
  };
}
