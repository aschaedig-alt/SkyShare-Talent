"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Plane, Menu, X, ChevronsLeft, ChevronsRight, ChevronDown, ChevronRight } from "lucide-react";
import type { RoleName } from "@/lib/auth/roles";
import {
  getVisibleNavigationGroups,
  type ModuleAccessPolicy,
  type VisibleNavigationGroup,
  type VisibleNavigationSection
} from "@/lib/navigation/modules";

type SidebarProps = {
  role: RoleName;
  policy: ModuleAccessPolicy;
  logoDataUrl?: string | null;
};

const COLLAPSE_KEY = "skyshare-sidebar-collapsed";
const SECTIONS_KEY = "skyshare-sidebar-sections-collapsed";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ role, policy, logoDataUrl }: SidebarProps) {
  const pathname = usePathname();
  const groups = getVisibleNavigationGroups(policy, role);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    try {
      const raw = window.localStorage.getItem(SECTIONS_KEY);
      if (raw) {
        setCollapsedSections(new Set(JSON.parse(raw) as string[]));
      }
    } catch {
      // ignore malformed storage
    }
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

  function toggleSection(id: string) {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      window.localStorage.setItem(SECTIONS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  // No fallback: on the dashboard (and any path outside a rail group) there is no active
  // group, so the items panel is hidden and the logo/Home tile is highlighted instead.
  const activeGroup =
    groups.find((g) => g.sections.some((s) => s.items.some((i) => isActive(pathname, i.href)))) ?? null;
  const onHome = isActive(pathname, "/command-center");

  function firstHref(group: VisibleNavigationGroup) {
    return group.sections[0]?.items[0]?.href ?? "/command-center";
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-[4px] bg-brand-lea text-white shadow-lg lg:hidden"
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
              <Link href="/command-center" className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[4px] bg-brand-gold/90 p-1 text-brand-lea">
                  {logoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoDataUrl} alt="Home" className="h-full w-full object-contain" />
                  ) : (
                    <Plane className="h-4 w-4" />
                  )}
                </div>
                {logoDataUrl ? null : <span className="font-semibold">SkyShare</span>}
              </Link>
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5 text-white/70" />
              </button>
            </div>
            <nav className="space-y-3 px-3 py-4">
              {groups.flatMap((group) =>
                group.sections.map((section) => (
                  <SectionBlock
                    key={`${group.id}-${section.id}`}
                    section={section}
                    pathname={pathname}
                    collapsed={collapsedSections.has(section.id)}
                    onToggle={() => toggleSection(section.id)}
                  />
                ))
              )}
            </nav>
          </aside>
        </div>
      )}

      {/* Desktop: icon rail + panel */}
      <div className="hidden shrink-0 lg:flex">
        {/* Icon rail */}
        <div className="flex w-16 flex-col items-center border-r border-white/10 bg-brand-eden py-3">
          <Link
            href="/command-center"
            title="Home"
            aria-label="Home"
            className={clsx(
              "mb-3 flex h-10 w-10 items-center justify-center overflow-hidden rounded-[4px] bg-brand-gold/90 p-1 text-brand-lea transition",
              onHome ? "ring-2 ring-white/90" : "hover:ring-2 hover:ring-white/40"
            )}
          >
            {logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoDataUrl} alt="Home" className="h-full w-full object-contain" />
            ) : (
              <Plane className="h-5 w-5" />
            )}
          </Link>
          <div className="flex flex-1 flex-col items-center gap-1.5">
            {groups.map((group) => {
              const Icon = group.icon;
              const groupActive = group.id === activeGroup?.id;
              return (
                <div key={group.id} className="group relative">
                  <Link
                    href={firstHref(group)}
                    title={group.label}
                    className={clsx(
                      "flex w-12 flex-col items-center gap-0.5 rounded-[4px] py-2 transition",
                      groupActive
                        ? "bg-brand-gold text-brand-lea"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[9px] font-medium leading-none">{group.label}</span>
                  </Link>

                  {/* Flyout (collapsed mode) */}
                  {collapsed && (
                    <div className="invisible absolute left-full top-0 z-50 ml-1 w-56 opacity-0 transition group-hover:visible group-hover:opacity-100">
                      <div className="rounded-[4px] border border-white/10 bg-brand-lea p-2 shadow-2xl">
                        {group.sections.map((section) => (
                          <div key={section.id} className="mb-1 last:mb-0">
                            <div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-gold">
                              {section.label}
                            </div>
                            {section.items.map((item) => {
                              const Ic = item.icon;
                              const active = isActive(pathname, item.href);
                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  className={clsx(
                                    "flex items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-sm font-medium transition",
                                    active ? "bg-white text-brand-lea" : "text-white/90 hover:bg-white/10 hover:text-white"
                                  )}
                                >
                                  <Ic className="h-4 w-4 shrink-0" />
                                  {item.label}
                                </Link>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            onClick={toggleCollapsed}
            className="mt-2 flex h-9 w-9 items-center justify-center rounded-[4px] text-white/70 transition hover:bg-white/10 hover:text-white"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
          </button>
        </div>

        {/* Items panel */}
        {!collapsed && activeGroup && (
          <div className="flex w-56 flex-col border-r border-white/10 bg-brand-lea">
            <nav className="flex-1 space-y-2 overflow-y-auto p-3">
              {activeGroup.sections.map((section) => (
                <SectionBlock
                  key={section.id}
                  section={section}
                  pathname={pathname}
                  collapsible={activeGroup.sections.length > 1}
                  collapsed={collapsedSections.has(section.id)}
                  onToggle={() => toggleSection(section.id)}
                />
              ))}
            </nav>
          </div>
        )}
      </div>
    </>
  );
}

type SectionBlockProps = {
  section: VisibleNavigationSection;
  pathname: string;
  collapsed: boolean;
  onToggle: () => void;
  collapsible?: boolean;
};

function SectionBlock({ section, pathname, collapsed, onToggle, collapsible = true }: SectionBlockProps) {
  const isOpen = !collapsible || !collapsed;

  return (
    <div>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between rounded-[3px] px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-gold transition hover:bg-white/5"
        >
          <span>{section.label}</span>
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-gold">
          {section.label}
        </div>
      )}

      {isOpen && (
        <div className="mt-0.5 space-y-1">
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 rounded-[3px] px-3 py-2.5 text-sm font-medium transition",
                  active ? "bg-white text-brand-lea shadow-sm" : "text-white/90 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
