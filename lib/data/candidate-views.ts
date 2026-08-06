import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Saved candidate views — a named, ordered set of candidates you picked by hand.
 *
 * Stored in WorkspaceSetting rather than a table of their own, deliberately:
 * this ships against the SHARED LIVE database, and a key/value row needs no
 * migration. If saved views grow relations (comments, per-view stages, an owner
 * who can revoke) they should graduate to a real model — at that point the
 * shape below is what to migrate.
 *
 * A view stores candidate IDS ONLY. It is a bookmark, never a copy: open it
 * tomorrow and you see today's stages, notes and files, not a snapshot of what
 * they were when it was saved. That is what makes it safe to send to a hiring
 * manager and still be looking at the same thing they are.
 */
export const CANDIDATE_VIEW_SCOPE = "candidate-view";

/** Guard rail. A "view" of everyone is a list, not a shortlist, and the compare
 *  table renders one row per person with no windowing. */
export const MAX_CANDIDATES_PER_VIEW = 200;

export type CandidateView = {
  id: string;
  name: string;
  note: string | null;
  candidateIds: string[];
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

type StoredView = Omit<CandidateView, "id">;

function parseView(key: string, valueJson: string): CandidateView | null {
  try {
    const raw = JSON.parse(valueJson) as { version?: number } & Partial<StoredView>;
    if (!raw || typeof raw.name !== "string" || !Array.isArray(raw.candidateIds)) return null;
    return {
      id: key,
      name: raw.name,
      note: typeof raw.note === "string" && raw.note.trim() ? raw.note : null,
      candidateIds: raw.candidateIds.filter((id): id is string => typeof id === "string"),
      createdByEmail: typeof raw.createdByEmail === "string" ? raw.createdByEmail : null,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date(0).toISOString(),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString()
    };
  } catch {
    return null;
  }
}

export async function listCandidateViews(): Promise<CandidateView[]> {
  const rows = await prisma.workspaceSetting.findMany({
    where: { scope: CANDIDATE_VIEW_SCOPE },
    select: { key: true, valueJson: true }
  });
  return rows
    .map((row) => parseView(row.key, row.valueJson))
    .filter((view): view is CandidateView => view !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCandidateView(id: string): Promise<CandidateView | null> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { scope: CANDIDATE_VIEW_SCOPE, key: id },
    select: { key: true, valueJson: true }
  });
  return row ? parseView(row.key, row.valueJson) : null;
}

export async function createCandidateView(input: {
  name: string;
  note?: string | null;
  candidateIds: string[];
  createdByEmail: string | null;
}): Promise<CandidateView> {
  const now = new Date().toISOString();
  // Dedupe but keep the order they were picked in.
  const candidateIds = [...new Set(input.candidateIds)].slice(0, MAX_CANDIDATES_PER_VIEW);
  const view: StoredView = {
    name: input.name.trim().slice(0, 120) || "Untitled view",
    note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
    candidateIds,
    createdByEmail: input.createdByEmail,
    createdAt: now,
    updatedAt: now
  };
  const id = randomUUID();
  await prisma.workspaceSetting.create({
    data: {
      scope: CANDIDATE_VIEW_SCOPE,
      key: id,
      valueJson: JSON.stringify({ version: 1, ...view })
    }
  });
  return { id, ...view };
}

export async function updateCandidateView(
  id: string,
  patch: { name?: string; note?: string | null; candidateIds?: string[] }
): Promise<CandidateView | null> {
  const existing = await getCandidateView(id);
  if (!existing) return null;
  const next: StoredView = {
    name: patch.name?.trim().slice(0, 120) || existing.name,
    note:
      patch.note === undefined
        ? existing.note
        : patch.note?.trim()
          ? patch.note.trim().slice(0, 500)
          : null,
    candidateIds: patch.candidateIds
      ? [...new Set(patch.candidateIds)].slice(0, MAX_CANDIDATES_PER_VIEW)
      : existing.candidateIds,
    createdByEmail: existing.createdByEmail,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  };
  await prisma.workspaceSetting.update({
    where: { scope_key: { scope: CANDIDATE_VIEW_SCOPE, key: id } },
    data: { valueJson: JSON.stringify({ version: 1, ...next }) }
  });
  return { id, ...next };
}

export async function deleteCandidateView(id: string): Promise<boolean> {
  const existing = await getCandidateView(id);
  if (!existing) return false;
  await prisma.workspaceSetting.delete({
    where: { scope_key: { scope: CANDIDATE_VIEW_SCOPE, key: id } }
  });
  return true;
}
