export type ParsedJobPdfRow = Record<string, string>;

export type ParsedJobPdfText = {
  parser: string;
  records: ParsedJobPdfRow[];
};

export function parseJobPdfText(text: string, filename: string): ParsedJobPdfText {
  if (/About\s+the\s+Role:|Qualifications:|SkyShare\s+Pilot\s+Jobs|Job Location:/i.test(text)) {
    const parsed = parseWebsiteJobPostingPdfText(text, filename);
    if (parsed.records.length) return parsed;
  }
  if (/job_\d+_[A-Z0-9]+/i.test(text)) return parseMinimalJobPdfText(text, filename);
  return parseMessyHoursPdfText(text, filename);
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
