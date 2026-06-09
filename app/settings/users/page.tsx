import { UsersManagementWorkspace } from "@/components/settings/UsersManagementWorkspace";
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

  return <UsersManagementWorkspace users={users} />;
}
