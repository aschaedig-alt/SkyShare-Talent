import Link from "next/link";
import { CandidateViewTabs } from "@/components/candidates/CandidateViewTabs";
import { DepartmentReviewWorkspace } from "@/components/candidates/DepartmentReviewWorkspace";
import { getDepartmentReviewRows } from "@/lib/data/department-review";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { isAdminOrRecruiter } from "@/lib/auth/roles";
import { notFound } from "next/navigation";

export default async function DepartmentReviewPage() {
  const access = await requireModulePageAccess("candidates");
  // Writing a department for hundreds of people is a recruiter/admin action.
  if (!isAdminOrRecruiter(access.role)) notFound();

  const rows = await getDepartmentReviewRows();

  return (
    <div className="space-y-5 px-5 py-5 lg:px-8">
      <section className="overflow-hidden rounded bg-gradient-to-br from-brand-lea to-brand-eden p-6 shadow-panel">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Candidate operations</p>
        <h1 className="mt-0.5 text-3xl font-semibold text-white">Place the unassigned</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/75">
          Candidates whose department cannot be read from a job application. Each row proposes one from a field on
          their record and shows which field, so you can accept it or overrule it.
        </p>
      </section>

      <CandidateViewTabs active="list" />

      <Link
        href="/candidates?depts=unassigned"
        className="inline-block text-xs font-semibold text-brand-grey underline transition hover:text-brand-lea dark:text-slate-400"
      >
        See them in the records list instead
      </Link>

      <DepartmentReviewWorkspace rows={rows} />
    </div>
  );
}
