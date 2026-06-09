import { UsersManagementWorkspace } from "@/components/settings/UsersManagementWorkspace";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { prisma } from "@/lib/prisma";

export default async function UsersPage() {
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
        <h1 className="text-2xl font-semibold text-brand-lea">Settings</h1>
      </section>

      <SettingsTabs currentTab="users" />

      <UsersManagementWorkspace users={users} />
    </div>
  );
}
