import { prisma } from "@/lib/prisma";
import type { RoleName } from "@/lib/auth/roles";
import type { DeptKey } from "@/lib/calendar/departments";

// The signed-in user's department/tag scoping, resolved once per page and
// threaded through to whichever data-fetch functions need it (employees,
// candidates, interview/note masking). ADMIN/RECRUITER never carry real
// values here — they're never narrowed by this feature regardless.
export type ViewerScope = {
  role: RoleName;
  userId: string | null;
  email: string | null;
  department: DeptKey | null;
  isExecutive: boolean;
  restrictCandidatesToDepartment: boolean;
};

export async function resolveViewerScope(role: RoleName, userId: string | null, email: string | null): Promise<ViewerScope> {
  if (role === "ADMIN" || role === "RECRUITER" || !userId) {
    return { role, userId, email, department: null, isExecutive: false, restrictCandidatesToDepartment: false };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { department: true, isExecutive: true, restrictCandidatesToDepartment: true }
  });
  return {
    role,
    userId,
    email,
    department: (user?.department as DeptKey | null) ?? null,
    isExecutive: user?.isExecutive ?? false,
    restrictCandidatesToDepartment: user?.restrictCandidatesToDepartment ?? false
  };
}
