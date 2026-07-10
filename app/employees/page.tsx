import { requireModulePageAccess } from "@/lib/data/module-access";
import { getEmployees, getEmployeeCounts } from "@/lib/data/employees";
import { getEmployeeColumns } from "@/lib/data/employee-columns";
import { EmployeesWorkspace } from "@/components/employees/EmployeesWorkspace";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  await requireModulePageAccess("people");
  const [employees, counts, columns] = await Promise.all([getEmployees(), getEmployeeCounts(), getEmployeeColumns()]);
  return <EmployeesWorkspace employees={employees} counts={counts} initialColumns={columns} />;
}
