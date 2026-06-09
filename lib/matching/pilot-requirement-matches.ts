import { prisma } from "@/lib/prisma";

type MatchGate = {
  key: string;
  label: string;
  category: string;
  valueType: string;
  numericValue: number | null;
};

type MatchRequirement = {
  id: string;
  title: string;
  pilotSeat: string | null;
  aircraftTypesJson: string | null;
  baseCity: string | null;
  baseState: string | null;
  baseAirport: string | null;
  gates: MatchGate[];
};

type CandidateForMatch = {
  id: string;
  displayName: string;
  currentTitle: string | null;
  stage: string | null;
  primaryEmail: string | null;
  tagsJson: string | null;
  foldersJson: string | null;
  notes: Array<{ body: string }>;
  files: Array<{ displayFilename: string; originalFilename: string }>;
  applications: Array<{
    job: { title: string; department: string | null } | null;
  }>;
};

export type PilotRequirementCandidateMatch = {
  candidateId: string;
  candidateName: string;
  currentTitle: string | null;
  stage: string | null;
  score: number;
  readiness: "Strong lead" | "Possible fit" | "Needs review";
  matchedSignals: string[];
  reviewGaps: string[];
};

function parseStringArray(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateText(candidate: CandidateForMatch) {
  return normalize(
    [
      candidate.displayName,
      candidate.currentTitle,
      candidate.stage,
      candidate.primaryEmail,
      ...parseStringArray(candidate.tagsJson),
      ...parseStringArray(candidate.foldersJson),
      ...candidate.notes.map((note) => note.body),
      ...candidate.files.flatMap((file) => [file.displayFilename, file.originalFilename])
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function applicationText(candidate: CandidateForMatch) {
  return normalize(
    candidate.applications
      .flatMap((application) => [application.job?.title, application.job?.department])
      .filter(Boolean)
      .join(" ")
  );
}

function aircraftAliases(aircraft: string) {
  const normalized = normalize(aircraft);
  const aliases = new Set([normalized]);

  if (normalized.includes("gulfstream g450")) {
    aliases.add("g450");
    aliases.add("gv");
    aliases.add("gulfstream");
  }
  if (normalized.includes("citation 560xl")) {
    aliases.add("560xl");
    aliases.add("xls");
    aliases.add("citation");
  }
  if (normalized.includes("pilatus pc 12") || normalized.includes("pc 12")) {
    aliases.add("pc 12");
    aliases.add("pc12");
    aliases.add("pilatus");
  }

  return Array.from(aliases).filter(Boolean);
}

function includesToken(text: string, token: string) {
  return text.includes(normalize(token));
}

function detectHours(text: string, gateKey: string) {
  const gateTerms: Record<string, string[]> = {
    total_time: ["total", "total time"],
    pic_time: ["pic"],
    sic_time: ["sic"],
    multi_engine_time: ["multi", "multi engine", "multi-engine"],
    turbine_time: ["turbine"],
    jet_time: ["jet"],
    instrument_time: ["instrument"],
    night_time: ["night"],
    cross_country_time: ["cross country", "cross-country"],
    time_in_type: ["time in type", "type"]
  };
  const terms = gateTerms[gateKey] ?? [];

  for (const term of terms) {
    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const before = new RegExp(`(\\d{2,5})\\s*(?:hours|hrs|hr)?\\s+.{0,18}${safeTerm}`, "i");
    const after = new RegExp(`${safeTerm}.{0,18}(\\d{2,5})\\s*(?:hours|hrs|hr)?`, "i");
    const match = text.match(after) ?? text.match(before);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }

  return null;
}

function scoreCandidate(requirement: MatchRequirement, candidate: CandidateForMatch): PilotRequirementCandidateMatch {
  const text = candidateText(candidate);
  const appliedText = applicationText(candidate);
  const aircraft = parseStringArray(requirement.aircraftTypesJson);
  const matchedSignals: string[] = [];
  const reviewGaps: string[] = [];
  let score = 0;

  for (const aircraftType of aircraft) {
    const aliases = aircraftAliases(aircraftType);
    const matchedAlias = aliases.find((alias) => includesToken(text, alias));
    if (matchedAlias) {
      score += 30;
      matchedSignals.push(`Aircraft evidence: ${aircraftType}`);
      break;
    }
  }

  if (score === 0 && aircraft.some((aircraftType) => aircraftAliases(aircraftType).some((alias) => includesToken(appliedText, alias)))) {
    score += 10;
    matchedSignals.push("Application history references this aircraft family");
  }

  const seat = normalize(requirement.pilotSeat);
  if (seat) {
    const seatAliases = seat === "pic" ? ["pic", "captain"] : seat === "sic" ? ["sic", "first officer", "fo"] : [seat];
    if (seatAliases.some((alias) => includesToken(text, alias))) {
      score += 25;
      matchedSignals.push(`Seat evidence: ${requirement.pilotSeat}`);
    } else if (seatAliases.some((alias) => includesToken(appliedText, alias))) {
      score += 8;
      matchedSignals.push(`Application history references ${requirement.pilotSeat}`);
    } else {
      reviewGaps.push(`No clear ${requirement.pilotSeat} evidence`);
    }
  }

  const baseTerms = [requirement.baseAirport, requirement.baseCity, requirement.baseState].filter(Boolean) as string[];
  if (baseTerms.length && baseTerms.some((term) => includesToken(text, term))) {
    score += 10;
    matchedSignals.push(`Location evidence: ${baseTerms.join(" / ")}`);
  }

  const enabledGates = requirement.gates.filter((gate) => gate.key && gate.label);
  for (const gate of enabledGates) {
    if (gate.valueType === "hours" && typeof gate.numericValue === "number") {
      const candidateHours = detectHours(text, gate.key);
      if (candidateHours === null) {
        reviewGaps.push(`${gate.label}: hours not found`);
      } else if (candidateHours >= gate.numericValue) {
        score += 8;
        matchedSignals.push(`${gate.label}: ${candidateHours.toLocaleString()} found`);
      } else {
        reviewGaps.push(`${gate.label}: ${candidateHours.toLocaleString()} found, ${gate.numericValue.toLocaleString()} required`);
      }
      continue;
    }

    const labelTerms = gate.label.split(/[\/,&-]/).map((part) => part.trim()).filter((part) => part.length > 3);
    if (labelTerms.some((term) => includesToken(text, term))) {
      score += 3;
      matchedSignals.push(`${gate.label} mentioned`);
    }
  }

  const cappedScore = Math.min(score, 100);
  return {
    candidateId: candidate.id,
    candidateName: candidate.displayName,
    currentTitle: candidate.currentTitle,
    stage: candidate.stage,
    score: cappedScore,
    readiness: cappedScore >= 60 ? "Strong lead" : cappedScore >= 30 ? "Possible fit" : "Needs review",
    matchedSignals: matchedSignals.slice(0, 6),
    reviewGaps: reviewGaps.slice(0, 6)
  };
}

export async function getPilotRequirementCandidateMatches(
  requirement: MatchRequirement | null
): Promise<PilotRequirementCandidateMatch[]> {
  if (!requirement) {
    return [];
  }

  const candidates = await prisma.candidate.findMany({
    take: 250,
    where: { status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      displayName: true,
      currentTitle: true,
      stage: true,
      primaryEmail: true,
      tagsJson: true,
      foldersJson: true,
      notes: { select: { body: true }, take: 10 },
      files: { select: { displayFilename: true, originalFilename: true }, take: 10 },
      applications: {
        take: 10,
        select: {
          job: { select: { title: true, department: true } }
        }
      }
    }
  });

  return candidates
    .map((candidate) => scoreCandidate(requirement, candidate))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.candidateName.localeCompare(right.candidateName))
    .slice(0, 12);
}
