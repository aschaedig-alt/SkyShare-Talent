import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCandidateTagOptions } from "@/lib/data/candidates";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { isAdminOrRecruiter } from "@/lib/auth/roles";
import { applicationOutcome, dispositionGroup, reasonKey } from "@/lib/candidates/buckets";
import { ManageTagList } from "@/components/candidates/ManageTagList";
import { ManageStageList } from "@/components/candidates/ManageStageList";
import { getStageList, getStageUsage } from "@/lib/data/candidate-stages";
import { getDispositionOverrides } from "@/lib/data/disposition-groups";
import { ManageReasonList, type ReasonWording } from "@/components/candidates/ManageReasonList";

export const dynamic = "force-dynamic";

/**
 * The vocabulary behind the candidates list — stages, tags and reasons.
 *
 * Reached from "Manage tags & reasons" on the segments row.
 *
 * THE THREE SECTIONS DIFFER IN HOW REVERSIBLE THEY ARE, which is the thing to
 * hold on to when changing anything here:
 *
 *  - STAGES are a list of offered values. Renaming, reordering or retiring one
 *    touches no candidate: everybody keeps the value stored on them, and one no
 *    longer offered shows under "Current" in their own dropdown.
 *
 *  - TAGS are rows. Recolour and rename are reversible; MERGE and DELETE are
 *    not, because nothing records which candidates came from which side.
 *
 *  - REASONS are two operations on the same row, and only one of them is safe.
 *    Recategorising stores "this wording means that group" and can be undone by
 *    clearing it. Rewording REWRITES CandidateApplication.status on every row
 *    carrying it — real text imported from Paycom, with no undo — so it asks the
 *    server for the exact count and confirms before committing.
 *
 * Every destructive operation writes the old value and the count into the
 * activity log, which is the only route back.
 */
export default async function CandidatesManagePage() {
  const access = await requireModulePageAccess("candidates");
  const canEdit = isAdminOrRecruiter(access.role);

  const [tags, applications, stages, stageUsage, overrides] = await Promise.all([
    getCandidateTagOptions(),
    prisma.candidateApplication.findMany({
      where: { candidate: { status: { not: "MERGED" } } },
      select: { status: true, disposition: true, offerStatus: true }
    }),
    getStageList(),
    getStageUsage(),
    getDispositionOverrides()
  ]);

  // One row per distinct wording, EXACTLY as stored — the reword operation
  // matches on the stored string, so showing a tidied version would rewrite
  // something other than what is on screen.
  const counts = new Map<string, number>();
  for (const a of applications) {
    const raw = a.status ?? "";
    if (!raw.trim()) continue; // "no reason recorded" is an absence, not a wording
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }

  const wordings: ReasonWording[] = [...counts.entries()]
    .map(([raw, count]) => {
      const key = reasonKey(raw);
      const outcome = applicationOutcome(raw, null, null);
      return {
        raw,
        key,
        // With the overrides applied, so the dropdown shows where it actually
        // lands rather than where the pattern would have put it.
        group: dispositionGroup(raw, outcome, overrides),
        chosen: Boolean(overrides[key]),
        count
      };
    })
    .sort((a, b) => b.count - a.count);

  const groupsInUse = new Set(wordings.map((w) => w.group));

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      <section className="rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
          Candidate operations
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold text-white">Tags &amp; reasons</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/75">
          The vocabulary behind the list — {tags.length} tags, and {wordings.length} disposition wordings
          folding into {groupsInUse.size} reason groups.
        </p>
        <Link
          href="/candidates"
          className="mt-4 inline-flex items-center gap-1.5 rounded border border-white/35 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to candidates
        </Link>
      </section>

      <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">
            Pipeline stages
          </h2>
          <p className="max-w-3xl text-xs text-brand-grey dark:text-slate-400">
            The list the Status dropdown offers, in pipeline order. Renaming or retiring one changes
            what is <em>offered</em> and nothing else — every candidate keeps the value stored on
            them, and one no longer on the list shows in their own dropdown under
            &ldquo;Current&rdquo;. Shorter names make the Status column narrower.
          </p>
        </div>
        <ManageStageList stages={stages} usage={stageUsage} canEdit={canEdit} />
      </section>

      <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Tags</h2>
            <p className="text-xs text-brand-grey dark:text-slate-400">
              Live counts are candidates in the working list; total includes the archive. Changing a
              colour changes it for everyone carrying that tag.
            </p>
          </div>
        </div>
        <ManageTagList tags={tags} canEdit={canEdit} />
      </section>

      <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="border-b border-brand-lea/10 px-5 py-4 dark:border-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">
            Disposition reasons
          </h2>
          <p className="max-w-3xl text-xs text-brand-grey dark:text-slate-400">
            Every wording on file, most used first, with the group it falls into. Two different
            things you can do: <strong>recategorise</strong> with the dropdown, which changes only
            how a wording is classified and can be put back; or{" "}
            <strong>reword</strong>, which rewrites the text on every application carrying it —
            match another wording exactly and the two become one. Rewording cannot be undone.
          </p>
        </div>
        <ManageReasonList wordings={wordings} canEdit={canEdit} />
      </section>

      <p className="max-w-3xl text-xs text-brand-grey dark:text-slate-400">
        Merging a tag cannot be undone — nothing records which candidates came from which side — so
        it asks first, and the activity log keeps both names and the count.
      </p>
    </div>
  );
}
