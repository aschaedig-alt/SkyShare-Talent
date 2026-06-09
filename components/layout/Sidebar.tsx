"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import type { RoleName } from "@/lib/auth/roles";
import { Files } from "lucide-react";
import { getVisibleNavigationGroups, type ModuleAccessPolicy } from "@/lib/navigation/modules";

type SidebarProps = {
  role: RoleName;
  policy: ModuleAccessPolicy;
};

export function Sidebar({ role, policy }: SidebarProps) {
  const pathname = usePathname();
  const navGroups = getVisibleNavigationGroups(policy, role);

  return (
    <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-brand-lea text-white lg:block">
      <div className="flex h-full flex-col">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-white/10">
              <Files className="h-5 w-5 text-brand-gold" />
            </div>
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-sweet">
                SkyShare
              </div>
              <div className="text-lg font-semibold leading-tight">Talent</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/42">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/jobs" && pathname.startsWith(item.href));
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={clsx(
                        "flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition",
                        isActive
                          ? "bg-white text-brand-lea shadow-sm"
                          : "text-white/78 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs leading-5 text-white/60">
          SkyShare Talent
          <br />
          Recruiting + publishing
        </div>
      </div>
    </aside>
  );
}
