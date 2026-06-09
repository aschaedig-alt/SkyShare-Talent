import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/auth";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { getSettingsData } from "@/lib/data/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const authRequired = isAuthRequired();
  const session = authRequired ? await getServerSession(authOptions) : null;
  const role: RoleName | null = authRequired ? (isRoleName(session?.user?.role) ? session.user.role : null) : "ADMIN";

  if (authRequired && role !== "ADMIN") {
    notFound();
  }

  const data = await getSettingsData();

  return <SettingsWorkspace data={data} currentRole={role ?? "ADMIN"} />;
}
