import { requireModulePageAccess } from "@/lib/data/module-access";
import { getEmployees, getEmployeeCounts } from "@/lib/data/employees";
import { EmployeesWorkspace } from "@/components/employees/EmployeesWorkspace";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  await requireModulePageAccess("people");
  const [employees, counts] = await Promise.all([getEmployees(), getEmployeeCounts()]);
  return <EmployeesWorkspace employees={employees} counts={counts} />;
}
