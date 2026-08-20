import { prisma } from "@/lib/prisma";
import { candidateFieldScopeWhere, type CandidateAccessScope } from "@/lib/auth/candidate-scope";

// Workspace-wide roll-up of document expiry across all candidates. Powers the Reports
// "Document currency" panel and the data-bound currency widget.
//
// ONE function, THREE consumers (app/reports via lib/data/reports.ts, app/calendar,
// app/recruiting-jobs), and it returns candidateId + candidateName as linked names -
// so scoping it in one caller would have left the other two leaking. The viewer is
// threaded here instead, and every caller passes it.

export type DocCurrencyStatus = "expired" | "due30" | "due90" | "current";

export type DocCurrencyItem = {
  candidateId: string;
  candidateName: string;
  documentType: string | null;
  displayFilename: string;
  expiresAt: string;
  days: number;
  status: DocCurrencyStatus;
};

export type DocumentCurrency = {
  counts: { expired: number; due30: number; due90: number; current: number; total: number };
  upcoming: DocCurrencyItem[]; // expired + due within 90 days, soonest first (capped)
};

export async function getDocumentCurrency(viewer?: CandidateAccessScope | null): Promise<DocumentCurrency> {
  // Null for anyone who is not allowlist-scoped, which leaves the where-clause
  // byte-identical to what it has always been.
  const scope = candidateFieldScopeWhere(viewer);
  const files = await prisma.candidateFile.findMany({
    where: {
      expiresAt: { not: null },
      candidateId: { not: null },
      candidate: { is: { archivedAt: null } },
      // Held in AND rather than spread as a sibling key. The fragment is keyed
      // on candidateId too, so spreading it put TWO predicates on one key and
      // let object order decide which survived — safe only by luck here, since
      // an `in` over a list of ids already implies not-null. Reordering these
      // lines, or calling the helper with a different field name, would have
      // disabled the filter with no type error. Inside AND both predicates
      // stand, whatever column each one names.
      ...(scope ? { AND: [scope] } : {})
    },
    select: {
      displayFilename: true,
      documentType: true,
      expiresAt: true,
      candidate: { select: { id: true, displayName: true } }
    }
  });

  const now = Date.now();
  let expired = 0;
  let due30 = 0;
  let due90 = 0;
  let current = 0;

  const items: DocCurrencyItem[] = files
    .filter((f) => f.expiresAt && f.candidate)
    .map((f) => {
      const days = Math.floor((f.expiresAt!.getTime() - now) / 86400000);
      const status: DocCurrencyStatus = days < 0 ? "expired" : days <= 30 ? "due30" : days <= 90 ? "due90" : "current";
      if (status === "expired") expired += 1;
      else if (status === "due30") due30 += 1;
      else if (status === "due90") due90 += 1;
      else current += 1;
      return {
        candidateId: f.candidate!.id,
        candidateName: f.candidate!.displayName,
        documentType: f.documentType,
        displayFilename: f.displayFilename,
        expiresAt: f.expiresAt!.toISOString(),
        days,
        status
      };
    });

  const upcoming = items.filter((i) => i.status !== "current").sort((a, b) => a.days - b.days).slice(0, 50);

  return { counts: { expired, due30, due90, current, total: items.length }, upcoming };
}
