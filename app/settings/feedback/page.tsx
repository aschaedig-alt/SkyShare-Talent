import { FeedbackWorkspace } from "@/components/settings/FeedbackWorkspace";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  try {
    await requireModulePageAccess("settings");

    const feedback = await prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 500
    });

    const serialized = feedback.map((f) => ({
      id: f.id,
      type: f.type,
      message: f.message,
      page: f.page,
      status: f.status,
      userEmail: f.userEmail,
      userName: f.userName,
      createdAt: f.createdAt.toISOString()
    }));

    return (
      <div className="space-y-4 px-5 py-5 lg:px-8">
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-[#10243a] dark:ring-white/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin foundation</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Feedback</h1>
        </section>

        <FeedbackWorkspace items={serialized} />
      </div>
    );
  } catch (error) {
    console.error("Error loading feedback page:", error);
    return (
      <div className="space-y-4 px-5 py-5 lg:px-8">
        <section className="rounded border border-red-300 bg-red-50 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-600">Error</p>
          <h1 className="text-2xl font-semibold text-red-700">Failed to load feedback</h1>
          <p className="mt-2 text-sm text-red-600">{error instanceof Error ? error.message : "Unknown error"}</p>
        </section>
      </div>
    );
  }
}
