export type ParsedJobPdfRow = Record<string, string>;

export type ParsedJobPdfText = {
  parser: string;
  records: ParsedJobPdfRow[];
};

export function parseJobPdfText(text: string, filename: string): ParsedJobPdfText {
  // Current careers site first — this is the layout you get today by opening a
  // posting on skyshare.com/careers and printing to PDF.
  if (looksLikeCareersSitePdf(text)) {
    const parsed = parseCareersSitePdfText(text, filename);
    if (parsed.records.length) return parsed;
  }
  // Older careers-site layout, kept so previously-saved PDFs still import.
  if (/About\s+the\s+Role:|Qualifications:|SkyShare\s+Pilot\s+Jobs|Job Location:/i.test(text)) {
    const parsed = parseWebsiteJobPostingPdfText(text, filename);
    if (parsed.records.length) return parsed;
  }
  if (/job_\d+_[A-Z0-9]+/i.test(text)) return parseMinimalJobPdfText(text, filename);
  return parseMessyHoursPdfText(text, filename);
}

/* ------------------------------------------------------------------------- *
 * Current skyshare.com/careers layout (print-to-PDF)
 *
 * The site was redesigned and this importer was not, so every posting printed
 * from it silently produced zero rows: the old parser hunts for "Job Location:",
 * "About the Role:" and "Qualifications:" (with a colon), and the current page
 * uses "Location:", "Job Summary" and "Qualifications" (no colon). The file was
 * always perfectly readable text — it just did not match anything.
 *
 * Anchors used here are the ones the page actually renders:
 *   "S K Y S H A R E   C A R E E R S"  letter-spaced banner
 *   title line, then "$pay | rotation", "Location: SLC OGD", "Full Time Posted: ..."
 *   sections: Job Summary / Qualifications / Responsibilities / Salary / Benefits /
 *             Location / Work Authorization
 * ------------------------------------------------------------------------- */

/** The letter-spaced banner survives text extraction as single characters. */
const CAREERS_BANNER = /S\s*K\s*Y\s*S\s*H\s*A\s*R\s*E\s+C\s*A\s*R\s*E\s*E\s*R\s*S/i;

export function looksLikeCareersSitePdf(text: string): boolean {
  if (CAREERS_BANNER.test(text)) return true;
  // Belt and braces if the banner is ever dropped: the section set is distinctive.
  return /^\s*Job Summary\s*$/im.test(text) && /^\s*Qualifications:?\s*$/im.test(text);
}

/** Browser print headers/footers: "7/21/26, 4:11 PM Title", "about:blank 1/2". */
function isPrintChrome(line: string): boolean {
  const l = line.trim();
  if (/^about:blank\b/i.test(l)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*(AM|PM)\b/i.test(l)) return true;
  if (CAREERS_BANNER.test(l)) return true;
  return false;
}

const CAREERS_SECTIONS = [
  "Job Summary",
  "About Us:",
  "Right Person, Right Seat:",
  "Qualifications",
  "Responsibilities & Physical Requirements:",
  "Salary, Schedule & Availability:",
  "Benefits:",
  "Location",
  "Work Authorization",
  "Ready to Apply?"
];

function isCareersSectionHeading(line: string): boolean {
  const l = line.trim().replace(/:$/, "").toLowerCase();
  return CAREERS_SECTIONS.some((s) => s.replace(/:$/, "").toLowerCase() === l);
}

/** Everything under `heading` up to the next known heading. */
function careersSection(lines: string[], heading: string): string {
  const target = heading.replace(/:$/, "").toLowerCase();
  const start = lines.findIndex((l) => l.trim().replace(/:$/, "").toLowerCase() === target);
  if (start < 0) return "";
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (isCareersSectionHeading(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join("\n").trim();
}

function parseCareersSitePdfText(text: string, filename: string): ParsedJobPdfText {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !isPrintChrome(l));

  if (!lines.length) return { parser: "careers-site-pdf", records: [] };

  // The title is the first real line once the print chrome is gone. The browser
  // header repeats it, which is why chrome has to be stripped before this.
  const title = cleanWebsiteJobTitle(lines[0]);
  if (!title || !looksLikeWebsiteJobTitle(title)) return { parser: "careers-site-pdf", records: [] };

  // Header block above the first section: pay/rotation, bases, employment type.
  const firstSection = lines.findIndex((l) => isCareersSectionHeading(l));
  const header = lines.slice(1, firstSection < 0 ? Math.min(lines.length, 6) : firstSection);
  const headerText = header.join("\n");

  const payLine = header.find((l) => /\$\s*[\d,]{4,}/.test(l)) ?? "";
  const locationLine = header.find((l) => /^Location\s*:/i.test(l)) ?? "";
  // "Location: SLC OGD" — bases, not a city. Keep the first as the primary.
  const bases = locationLine
    .replace(/^Location\s*:/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const summary = careersSection(lines, "Job Summary");
  const qualifications = careersSection(lines, "Qualifications");
  const responsibilities = careersSection(lines, "Responsibilities & Physical Requirements:");
  const salary = careersSection(lines, "Salary, Schedule & Availability:");
  const locationSection = careersSection(lines, "Location");
  const rightPerson = careersSection(lines, "Right Person, Right Seat:");

  const minimumRequirements = [qualifications, responsibilities, rightPerson, locationSection]
    .filter(Boolean)
    .join("\n\n");

  // Only the parts that describe the ROLE — "About Us" and "Benefits" are the same
  // boilerplate on every posting and would just add noise to matching.
  const description = [title, headerText, summary, qualifications, responsibilities, salary, locationSection]
    .filter(Boolean)
    .join("\n\n");

  const department = inferWebsiteJobDepartment(title, `${title} ${summary}`);

  return {
    parser: "careers-site-pdf",
    records: [
      {
        job_id: `pdf_${slugify(filename)}_${slugify(title)}_1`,
        job_title: title,
        job_department: department,
        job_city: bases[0] ?? "",
        job_state: "",
        job_postal: "",
        job_open: "",
        job_filled: "",
        job_req_id: "",
        job_description: description,
        "Minimum Requirements": minimumRequirements || (department === "Pilot" ? description : ""),
        "Pay Scale": [payLine, salary].filter(Boolean).join(" ").trim(),
        source_pdf: filename
      }
    ]
  };
}

function parseWebsiteJobPostingPdfText(text: string, filename: string): ParsedJobPdfText {
  const lines = normalizeWebsiteJobPdfLines(text);
  const locationIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter((item) => /^Job Location:/i.test(item.line) || / Job Location:/i.test(item.line));
  const titlePairs: Array<{ title: string; titleIndex: number }> = [];

  for (const item of locationIndexes) {
    const titleCandidate = findWebsiteJobTitle(lines, item.index);
    if (!titleCandidate) continue;
    const { title, titleIndex } = titleCandidate;
    if (!title || isBoilerplateJobPdfLine(title)) continue;
    titlePairs.push({ title, titleIndex });
  }

  const uniquePairs: typeof titlePairs = [];
  const seen = new Set<string>();
  for (const pair of titlePairs) {
    const key = `${pair.titleIndex}:${normalizeRequirementTitle(pair.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniquePairs.push(pair);
  }

  const records: ParsedJobPdfRow[] = [];
  for (let index = 0; index < uniquePairs.length; index += 1) {
    const pair = uniquePairs[index];
    const nextStart = uniquePairs[index + 1]?.titleIndex ?? lines.length;
    const sourceBlockLines = lines.slice(pair.titleIndex, nextStart).filter((line) => !isBoilerplateJobPdfLine(line));
    const extractionBlockLines = sourceBlockLines.filter((line) => !isIgnoredWebsiteJobPdfLine(line));
    const sourceBlock = sourceBlockLines.join("\n").trim();
    if (!sourceBlock || sourceBlock.length < 120) continue;

    const metadata = sourceBlockLines.find((line) => /Job Location:/i.test(line)) || "";
    const qualifications = extractWebsiteJobSection(sourceBlockLines, "Qualifications:", ["Personal/Character Requirements:", "Skills:", "Salary, Schedule, and Perks:", "Location:", "To learn more"]);
    const responsibilities = extractWebsiteJobSection(extractionBlockLines, "Job Responsibilities:", ["Qualifications:", "Personal/Character Requirements:", "Skills:", "Salary, Schedule, and Perks:", "Location:"]);
    const personal = extractWebsiteJobSection(extractionBlockLines, "Personal/Character Requirements:", ["Skills:", "Salary, Schedule, and Perks:", "Location:"]);
    const skills = extractWebsiteJobSection(extractionBlockLines, "Skills:", ["Salary, Schedule, and Perks:", "Location:"]);
    const location = extractWebsiteJobSection(sourceBlockLines, "Location:", ["To learn more"]);
    const salarySection = extractWebsiteJobSection(sourceBlockLines, "Salary, Schedule, and Perks:", ["Location:", "To learn more"]);
    const minimumRequirements = [qualifications, responsibilities, personal, skills, location].filter(Boolean).join("\n\n");
    const department = inferWebsiteJobDepartment(pair.title, metadata);

    records.push({
      job_id: `pdf_${slugify(filename)}_${slugify(pair.title)}_${index + 1}`,
      job_title: pair.title,
      job_department: department,
      job_city: metadataValue(metadata, "Job Location"),
      job_state: "",
      job_postal: "",
      job_open: "",
      job_filled: "",
      job_req_id: metadataValue(metadata, "Position Code"),
      job_description: sourceBlock,
      "Minimum Requirements": minimumRequirements || (department === "Pilot" ? sourceBlock : ""),
      "Pay Scale": extractWebsitePayScale(metadata, salarySection),
      source_pdf: filename
    });
  }

  return { parser: "website-job-postings-pdf", records };
}

function parseMinimalJobPdfText(text: string, filename: string): ParsedJobPdfText {
  const compact = text.replace(/\s+/g, " ");
  const matches = [...compact.matchAll(/job_\d+_[A-Z0-9]+/gi)];
  const records: ParsedJobPdfRow[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index ?? 0;
    const end = matches[index + 1]?.index ?? compact.length;
    const segment = compact.slice(start, end).trim();
    const jobId = matches[index][0];
    const afterId = segment.slice(jobId.length).trim();
    const pilotIndex = afterId.search(/\bPilot\b/i);
    const title = cleanMinimalJobTitle(pilotIndex >= 0 ? afterId.slice(0, pilotIndex).trim() : afterId.slice(0, 80).trim());
    const afterDepartment = pilotIndex >= 0 ? afterId.slice(pilotIndex + "Pilot".length).trim() : afterId;
    const payMatch = afterDepartment.match(/(?:\$|up to \$)\s*\d/i);
    const payIndex = payMatch?.index ?? -1;
    const minimumRequirements = payIndex >= 0 ? afterDepartment.slice(0, payIndex).trim() : afterDepartment.trim();
    const payScale = payIndex >= 0 ? afterDepartment.slice(payIndex).trim() : "";

    if (title) {
      records.push({
        job_id: jobId,
        job_title: title,
        job_department: "Pilot",
        "Minimum Requirements": minimumRequirements,
        "Pay Scale": payScale,
        job_description: `${title}\n${minimumRequirements}\n${payScale}`,
        source_pdf: filename
      });
    }
  }

  return { parser: "minimal-job-id-pdf", records };
}

function parseMessyHoursPdfText(text: string, filename: string): ParsedJobPdfText {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const startPattern = /^(G450\/GV|G200|560XL|Phenom\s+300|Phenom\s+100|CJ2|CJ|M2|PC-12)/i;
  const starts = lines.map((line, index) => ({ line, index })).filter((item) => startPattern.test(item.line));
  const records: ParsedJobPdfRow[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index;
    const end = starts[index + 1]?.index ?? lines.length;
    const block = lines.slice(start, end).join("\n");
    const aircraft = aircraftTitleFromMessyBlock(starts[index].line);
    const seats = /FIRST OFFICER|\bSIC\b/i.test(block) ? ["Captain", "First Officer"] : ["Captain"];

    for (const seat of seats) {
      records.push({
        job_id: `pdf_${slugify(filename)}_${slugify(aircraft)}_${slugify(seat)}`,
        job_title: `${aircraft} ${seat}`,
        job_department: "Pilot",
        "Minimum Requirements": block,
        "Pay Scale": extractPdfPayLine(block, seat),
        job_description: block,
        source_pdf: filename
      });
    }
  }

  return { parser: "messy-aircraft-hours-pdf", records };
}

function cleanMinimalJobTitle(value: string) {
  const titleStart = value.search(/\b(Citation|Pilatus|PC-12|Gulfstream|Assistant Chief|Chief Pilot|Phenom|CJ2|M2|560XL)\b/i);
  const cleaned = (titleStart >= 0 ? value.slice(titleStart) : value)
    .replace(/(Captain|First Officer|Lead Captain)Pilot\b/gi, "$1")
    .replace(/Chief PilotPilot\b/gi, "Chief Pilot");
  const titleOnly = cleaned.match(/^(.{3,120}?\b(?:Assistant Chief Pilot|Chief Pilot|Lead Captain|Captain|First Officer))\b/i)?.[1] ?? cleaned;
  return titleOnly.replace(/\s+/g, " ").trim();
}

function normalizeWebsiteJobPdfLines(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function findWebsiteJobTitle(lines: string[], locationIndex: number) {
  const continuation: string[] = [];
  for (let index = locationIndex - 1; index >= Math.max(0, locationIndex - 8); index -= 1) {
    const line = lines[index];
    if (!line || isBoilerplateJobPdfLine(line) || /Workflow|Template|Question|ALL JOBS/i.test(line)) continue;
    if (isWebsiteTitleContinuation(line)) {
      continuation.unshift(line);
      continue;
    }
    if (isInvalidWebsiteJobTitleLine(line)) continue;
    if (line.length > 140) continue;
    const title = cleanWebsiteJobTitle([line, ...continuation].join(" "));
    if (!looksLikeWebsiteJobTitle(title)) continue;
    return { title, titleIndex: index };
  }
  return null;
}

function cleanWebsiteJobTitle(line: string) {
  return line
    .replace(/^Job Post Title:\s*/i, "")
    .replace(/\s+\$?\d+k?\s+Sign[- ]on(?: bonus!?)?/gi, "")
    .replace(/^\*+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isWebsiteTitleContinuation(line: string) {
  return /^\(?Home[- ]Based\)?/i.test(line) || /Sign[- ]on bonus/i.test(line);
}

function isInvalidWebsiteJobTitleLine(line: string) {
  return /^[A-Z]{3}$/.test(line)
    || /^Job Category:/i.test(line)
    || /^Position Type:/i.test(line)
    || /^Salary Range:/i.test(line)
    || /^Secondary Location:/i.test(line)
    || /^Position Code:/i.test(line)
    || /^Job Location:/i.test(line)
    || /:$/.test(line);
}

function looksLikeWebsiteJobTitle(title: string) {
  return /\b(Captain|First Officer|Pilot|Technician|Manager|Coordinator|Attendant|Specialist|Representative|Advisor|Director|Controller|Generalist|Analyst|Setter|Service|Maintenance|Facilities|Sales|FBO|VP|HR)\b/i.test(title);
}

function isBoilerplateJobPdfLine(line: string) {
  return /^(Website-Job-Postings|ALL JOBS|SkyShare Pilot Jobs|Active Managed Aircraft Jobs|SkyShare Ops Jobs|SkyShare Maintenance Jobs|SkyShare FBO Jobs|SkyShare Accounting Jobs|SkyShare Sales Jobs|SkyShare Human Resources Jobs|Retired Managed Aircraft Jobs)$/i.test(line.trim());
}

function isIgnoredWebsiteJobPdfLine(line: string) {
  return /Paycom Question Templates|Workflow:|Knockout:|Global:|Job Level:|Application Template|Question Template/i.test(line)
    || /^To learn more about SkyShare/i.test(line)
    || /^About Us:/i.test(line)
    || /^You must possess SkyShare's core values/i.test(line);
}

function extractWebsiteJobSection(lines: string[], startLabel: string, endLabels: string[]) {
  const startIndex = lines.findIndex((line) => line.toLowerCase().startsWith(startLabel.toLowerCase()));
  if (startIndex < 0) return "";
  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (endLabels.some((label) => lines[index].toLowerCase().startsWith(label.toLowerCase()))) {
      endIndex = index;
      break;
    }
  }
  return lines.slice(startIndex, endIndex).join("\n").replace(new RegExp(`^${escapeRegExp(startLabel)}\\s*`, "i"), "").trim();
}

function metadataValue(line: string, label: string) {
  const pattern = new RegExp(`${escapeRegExp(label)}:\\s*(.*?)(?=\\s+(?:Secondary Location|Position Type|Salary Range|Job Category|Position Code|Paycom Question Templates):|$)`, "i");
  return line.match(pattern)?.[1]?.trim() || "";
}

function extractWebsitePayScale(metadata: string, salarySection: string) {
  const range = metadataValue(metadata, "Salary Range");
  const salaryLine = salarySection.split(/\n+/).find((line) => /\$/.test(line)) || "";
  return [range, salaryLine].filter(Boolean).join("\n");
}

function inferWebsiteJobDepartment(title: string, metadata: string) {
  const category = metadataValue(metadata, "Job Category");
  if (/\b(pilot|captain|first officer|chief pilot|\bpic\b|\bsic\b|pc-12|citation|gulfstream|phenom|legacy 650|ce-?525|560xls?|g450|g200)\b/i.test(title)) return "Pilot";
  if (category) return category;
  return "";
}

function aircraftTitleFromMessyBlock(line: string) {
  if (/G450\/GV/i.test(line)) return "Gulfstream G450/GV";
  if (/G200/i.test(line)) return "Gulfstream G200";
  if (/560XL/i.test(line)) return "Citation 560XL";
  if (/Phenom\s+300/i.test(line)) return "Phenom 300";
  if (/Phenom\s+100/i.test(line)) return "Phenom 100";
  if (/CJ2/i.test(line)) return "Citation CJ2";
  if (/^CJ\b/i.test(line)) return "Citation CJ";
  if (/M2\b/i.test(line)) return "Citation M2";
  if (/PC-12/i.test(line)) return "Pilatus PC-12";
  return line.split(/\s+/).slice(0, 3).join(" ");
}

function extractPdfPayLine(block: string, seat: string) {
  const payLines = block.split(/\n+/).filter((line) => /\$|\bPIC\b|\bSIC\b/i.test(line));
  const matcher = /first officer|sic/i.test(seat) ? /\bSIC\b/i : /\bPIC\b/i;
  return payLines.find((line) => matcher.test(line) && /\$|\d{2,3}\s*[-–]\s*\d{2,3}/.test(line)) || payLines.find((line) => /\$/.test(line)) || "";
}

function normalizeRequirementTitle(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Say, in plain English, why a PDF produced no job rows.
 *
 * The import used to report a bare "imported 0, skipped 1", which is true and
 * useless — it doesn't distinguish "this file has no readable text in it" from
 * "this file is fine but isn't the layout I know how to read", and those need
 * completely different things from the person holding the file.
 *
 * Returns null when rows WERE found, so callers can use it as the skip reason.
 */
export function diagnoseJobPdf(text: string, recordCount: number): string | null {
  if (recordCount > 0) return null;

  const trimmed = text.trim();
  const chars = trimmed.length;

  if (chars === 0) {
    return "No text could be read from this PDF at all, so it is almost certainly a scan or an image export. Re-save it as a text PDF — printing the job posting web page to PDF works — or add the role with New requirement on the Pilot Requirements page.";
  }
  // Check the SHAPE before the length. Seeing these markers proves the text layer
  // read fine, so a short file here is an incomplete posting, not a scan — telling
  // someone to re-save a perfectly readable PDF would send them down a dead end.
  if (/About\s+the\s+Role:|Qualifications:|Job Location:/i.test(trimmed)) {
    return `Read ${chars} characters and this does look like a job posting, but no complete posting could be pulled out of it — the importer needs a job title, a "Job Location:" line under it, and at least a short paragraph of description. If the posting is split awkwardly across pages, the CSV import is more reliable.`;
  }

  if (chars < 200) {
    return `Only ${chars} characters of text came out of this PDF, which usually means the pages are images rather than text. Re-save it as a text PDF, or add the role with New requirement on the Pilot Requirements page.`;
  }

  const firstLine = trimmed.split("\n").find((l) => l.trim().length > 3)?.trim().slice(0, 60) ?? "";
  return `Read ${chars} characters, but this is not a layout the job importer recognises${firstLine ? ` (it starts "${firstLine}…")` : ""}. It expects a single job posting from skyshare.com/careers, opened and printed to PDF. To add a pilot role directly, use New requirement on the Pilot Requirements page.`;
}
