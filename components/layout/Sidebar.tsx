"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Plane, Menu, X, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { RoleName } from "@/lib/auth/roles";
import { getVisibleNavigationGroups, type ModuleAccessPolicy, type NavigationGroup } from "@/lib/navigation/modules";

type SidebarProps = {
  role: RoleName;
  policy: ModuleAccessPolicy;
};

const COLLAPSE_KEY = "skyshare-sidebar-collapsed";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ role, policy }: SidebarProps) {
  const pathname = usePathname();
  const groups = getVisibleNavigationGroups(policy, role);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const activeGroup =
    groups.find((g) => g.items.some((i) => isActive(pathname, i.href))) ?? groups[0];

  function firstHref(group: NavigationGroup) {
    return group.items[0]?.href ?? "/command-center";
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-lea text-white shadow-lg lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 overflow-y-auto bg-brand-lea text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-brand-gold/90 text-brand-lea">
                  <Plane className="h-4 w-4" />
                </div>
                <span className="font-semibold">SkyShare</span>
              </div>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5 text-white/70" />
              </button>
            </div>
            <nav className="space-y-4 px-3 py-4">
              {groups.map((group) => (
                <div key={group.id}>
                  <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={clsx(
                            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                            active ? "bg-white text-brand-lea" : "text-white/80 hover:bg-white/10"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Desktop: icon rail + panel */}
      <div className="hidden shrink-0 lg:flex">
        {/* Icon rail */}
        <div className="flex w-16 flex-col items-center border-r border-white/10 bg-brand-eden py-3">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gold/90 text-brand-lea">
            <Plane className="h-5 w-5" />
          </div>
          <div className="flex flex-1 flex-col items-center gap-1">
            {groups.map((group) => {
              const Icon = group.icon;
              const groupActive = group.id === activeGroup?.id;
              return (
                <div key={group.id} className="group relative">
                  <Link
                    href={firstHref(group)}
                    title={group.label}
                    className={clsx(
                      "flex w-12 flex-col items-center gap-0.5 rounded-lg py-2 transition",
                      groupActive ? "bg-brand-gold text-brand-lea" : "text-white/70 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[9px] font-medium leading-none">{group.label}</span>
                  </Link>

                  {/* Flyout (collapsed mode) */}
                  {collapsed && group.items.length > 1 && (
                    <div className="invisible absolute left-full top-0 z-50 ml-1 w-52 opacity-0 transition group-hover:visible group-hover:opacity-100">
                      <div className="rounded-lg border border-white/10 bg-brand-lea p-2 shadow-2xl">
                        <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                          {group.label}
                        </div>
                        {group.items.map((item) => {
                          const Ic = item.icon;
                          const active = isActive(pathname, item.href);
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              className={clsx(
                                "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm font-medium transition",
                                active ? "bg-white text-brand-lea" : "text-white/80 hover:bg-white/10"
                              )}
                            >
                              <Ic className="h-4 w-4 shrink-0" />
                              {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            onClick={toggleCollapsed}
            className="mt-2 flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
          </button>
        </div>

        {/* Items panel */}
        {!collapsed && activeGroup && (
          <div className="flex w-52 flex-col border-r border-white/10 bg-brand-lea">
            <div className="border-b border-white/10 px-4 py-[18px]">
              <div className="text-sm font-semibold text-white">{activeGroup.label}</div>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {activeGroup.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                      active ? "bg-white text-brand-lea shadow-sm" : "text-white/78 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </>
  );
}
