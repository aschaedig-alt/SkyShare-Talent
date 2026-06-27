import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

// Bulk summaries were chosen to run on Haiku for cost (~cents each); override per
// deployment with ARCHIVE_SUMMARY_MODEL if you want a stronger model.
const SUMMARY_MODEL = process.env.ARCHIVE_SUMMARY_MODEL || "claude-haiku-4-5";

export class AiSummaryNotConfiguredError extends Error {
  constructor() {
    super("AI summaries are not configured. Set ANTHROPIC_API_KEY to enable generation.");
    this.name = "AiSummaryNotConfiguredError";
  }
}

const SYSTEM_PROMPT =
  "You write concise recruiting summaries of a candidate's history for an aviation talent team. " +
  "Write 2-4 sentences in a neutral, professional tone. Lead with the most useful fact (experience, fit, " +
  "or outcome). Mention prior interviews/outcomes and any notable strengths or reasons a past offer was " +
  "declined when present. Do not invent facts that aren't in the provided history. No preamble, no headings.";

type SummaryContext = {
  text: string;
  hash: string;
};

async function buildContext(candidateId: string): Promise<SummaryContext | null> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      applications: {
        orderBy: { appliedAt: "asc" },
        include: { job: { select: { title: true, city: true, state: true } } }
      },
      interviews: { orderBy: { startDateTime: "asc" } },
      notes: { orderBy: { createdAt: "asc" } },
      metrics: { where: { status: { not: "DISMISSED" } } }
    }
  });
  if (!candidate) return null;

  const lines: string[] = [];
  lines.push(`Candidate: ${candidate.displayName}${candidate.currentTitle ? ` — ${candidate.currentTitle}` : ""}`);

  if (candidate.applications.length) {
    lines.push("\nApplications:");
    for (const a of candidate.applications) {
      const when = a.appliedAt ? a.appliedAt.getFullYear() : "unknown year";
      const role = a.job?.title ?? a.historicalJobTitle ?? "Unspecified role";
      const loc = [a.job?.city, a.job?.state].filter(Boolean).join(", ");
      lines.push(`- ${when}: ${role}${loc ? ` (${loc})` : ""} — ${a.status ?? a.disposition ?? "no status"}`);
    }
  }
  if (candidate.interviews.length) {
    lines.push("\nInterviews:");
    for (const i of candidate.interviews) {
      lines.push(`- ${i.startDateTime.getFullYear()}: ${i.title}${i.interviewer ? ` with ${i.interviewer}` : ""}${i.notes ? ` — ${i.notes.slice(0, 200)}` : ""}`);
    }
  }
  if (candidate.metrics.length) {
    const hours = candidate.metrics
      .filter((m) => m.valueNumber != null)
      .map((m) => `${m.label}: ${m.valueNumber}${m.unit ? ` ${m.unit}` : ""}`);
    if (hours.length) lines.push(`\nFlight experience: ${hours.join(", ")}`);
  }
  if (candidate.notes.length) {
    lines.push("\nRecruiter notes:");
    for (const n of candidate.notes.slice(0, 10)) lines.push(`- ${n.body.slice(0, 300)}`);
  }

  const text = lines.join("\n");
  const hash = createHash("sha256").update(`${SUMMARY_MODEL}\n${text}`).digest("hex");
  return { text, hash };
}

export type GeneratedSummary = {
  summary: string;
  generatedAt: string;
  regenerated: boolean;
};

// Generates (or returns a still-valid cached) AI summary for a candidate.
// Pass force=true to regenerate even when the source data is unchanged.
export async function generateCandidateSummary(candidateId: string, force = false): Promise<GeneratedSummary> {
  const ctx = await buildContext(candidateId);
  if (!ctx) throw new Error("Candidate not found.");

  const existing = await prisma.candidateAiSummary.findUnique({ where: { candidateId } });
  if (!force && existing && existing.inputHash === ctx.hash) {
    return { summary: existing.summary, generatedAt: existing.generatedAt.toISOString(), regenerated: false };
  }

  if (!process.env.ANTHROPIC_API_KEY) throw new AiSummaryNotConfiguredError();

  const client = new Anthropic();
  const message = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Summarize this candidate's recruiting history:\n\n${ctx.text}` }]
  });
  const summary = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const saved = await prisma.candidateAiSummary.upsert({
    where: { candidateId },
    create: { candidateId, summary, model: SUMMARY_MODEL, inputHash: ctx.hash },
    update: { summary, model: SUMMARY_MODEL, inputHash: ctx.hash, generatedAt: new Date(), staleAt: null }
  });

  return { summary: saved.summary, generatedAt: saved.generatedAt.toISOString(), regenerated: true };
}
