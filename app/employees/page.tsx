import { requireModulePageAccess } from "@/lib/data/module-access";
import { getEmployees, getEmployeeCounts } from "@/lib/data/employees";
import { getEmployeeColumns } from "@/lib/data/employee-columns";
import { EmployeesWorkspace } from "@/components/employees/EmployeesWorkspace";
import { resolveViewerScope } from "@/lib/auth/viewer-scope";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const access = await requireModulePageAccess("people");
  const viewer = await resolveViewerScope(access.role, access.userId, access.email);
  const [employees, counts, columns] = await Promise.all([
    getEmployees(viewer),
    getEmployeeCounts(viewer),
    getEmployeeColumns()
  ]);
  return <EmployeesWorkspace employees={employees} counts={counts} initialColumns={columns} />;
}
