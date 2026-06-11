import { UsersManagementWorkspace } from "@/components/settings/UsersManagementWorkspace";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  try {
    await requireModulePageAccess("settings");

    const users = await prisma.user.findMany({
      include: {
        accounts: true,
        permissions: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return (
      <div className="space-y-4 px-5 py-5 lg:px-8">
        <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin foundation</p>
          <h1 className="text-2xl font-semibold text-brand-lea">Team Members</h1>
        </section>

        <UsersManagementWorkspace users={users} />
      </div>
    );
  } catch (error) {
    console.error("Error loading users page:", error);
    return (
      <div className="space-y-4 px-5 py-5 lg:px-8">
        <section className="rounded border border-red-300 bg-red-50 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-600">Error</p>
          <h1 className="text-2xl font-semibold text-red-700">Failed to load team members</h1>
          <p className="mt-2 text-sm text-red-600">{error instanceof Error ? error.message : "Unknown error"}</p>
        </section>
      </div>
    );
  }
}
