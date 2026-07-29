"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { clsx } from "clsx";
import { Plane, Menu, X, ChevronsLeft, ChevronsRight, ChevronDown, ChevronRight, CircleUser } from "lucide-react";
import type { RoleName } from "@/lib/auth/roles";
import { FeedbackButton } from "@/components/feedback/FeedbackButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { LinkPendingIndicator } from "@/components/navigation/LinkPendingIndicator";
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
  userEmail?: string | null;
  homeHref?: string;
};

const COLLAPSE_KEY = "skyshare-sidebar-collapsed";
const SECTIONS_KEY = "skyshare-sidebar-sections-collapsed";

function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ role, policy, logoDataUrl, userEmail, homeHref = "/command-center" }: SidebarProps) {
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

  // The active item is the one whose href is the LONGEST prefix of the current path.
  // This keeps sibling routes like /settings and /settings/users from both lighting up.
  let activeHref: string | null = null;
  for (const group of groups) {
    for (const section of group.sections) {
      for (const item of section.items) {
        if (matchesPath(pathname, item.href) && item.href.length > (activeHref?.length ?? -1)) {
          activeHref = item.href;
        }
      }
    }
  }

  const activeGroup =
    groups.find((g) => g.sections.some((s) => s.items.some((i) => i.href === activeHref))) ?? null;
  const onHome = matchesPath(pathname, homeHref);

  function firstHref(group: VisibleNavigationGroup) {
    return group.sections[0]?.items[0]?.href ?? homeHref;
  }

  // One rail tile (icon + label) plus its collapsed-mode flyout.
  function railTile(group: VisibleNavigationGroup) {
    const Icon = group.icon;
    const groupActive = group.id === activeGroup?.id;
    return (
      <div className="group relative">
        <Link
          href={firstHref(group)}
          // prefetch={false} on every nav Link in this file — see the longer
          // note on SectionBlock's item Link below for why.
          prefetch={false}
          title={group.label}
          className={clsx(
            "flex w-[58px] flex-col items-center gap-0.5 rounded py-2 transition",
            groupActive ? "bg-brand-gold text-brand-lea" : "text-white/85 hover:bg-white/10 hover:text-white"
          )}
        >
          <Icon className="h-5 w-5" />
          <span className="text-[9px] font-medium leading-none">{group.label}</span>
        </Link>

        {collapsed && (
          <div className="invisible absolute left-full top-0 z-50 ml-1 w-56 opacity-0 transition group-hover:visible group-hover:opacity-100">
            <div className="rounded border border-white/10 bg-brand-lea p-2 shadow-2xl">
              {group.sections.map((section) => (
                <div key={section.id} className="mb-1 last:mb-0">
                  <div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-gold">
                    {section.label}
                  </div>
                  {section.items.map((item) => {
                    const Ic = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        className={clsx(
                          "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm font-medium transition",
                          item.href === activeHref ? "bg-white text-brand-lea" : "text-white/90 hover:bg-white/10 hover:text-white"
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
  }

  const topGroups = groups.filter((g) => g.id !== "admin");
  const adminGroup = groups.find((g) => g.id === "admin") ?? null;

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded bg-brand-lea text-white shadow-lg lg:hidden print:hidden"
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
              <Link href={homeHref} prefetch={false} className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded bg-brand-gold/90 p-1 text-brand-lea">
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
                    activeHref={activeHref}
                    collapsed={collapsedSections.has(section.id)}
                    onToggle={() => toggleSection(section.id)}
                  />
                ))
              )}
            </nav>
            <div className="mt-auto space-y-2 border-t border-white/10 px-3 py-3">
              <ThemeToggle />
              {userEmail ? (
                <Link
                  href="/account"
                  prefetch={false}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10 hover:text-white"
                >
                  <CircleUser className="h-4 w-4 shrink-0" /> My preferences
                </Link>
              ) : null}
              {userEmail ? <SignOutButton email={userEmail} /> : null}
            </div>
          </aside>
        </div>
      )}

      {/* Desktop: icon rail + panel. Locked to full screen height; only the panel/content scroll.
          z-30 is load-bearing: position:sticky ALWAYS creates a stacking context, so the collapsed
          rail's hover flyout (z-50 below) is trapped inside this element's context. Without a
          z-index here that context sits at the default level and, being before <main> in DOM order,
          the page content paints over the flyout. Kept under the mobile drawer + modals (z-50). */}
      <div className="sticky top-0 z-30 hidden h-screen shrink-0 lg:flex print:hidden">
        {/* Icon rail */}
        <div className="flex w-[70px] flex-col items-center border-r border-white/10 bg-brand-eden py-3">
          <Link
            href={homeHref}
            prefetch={false}
            title="Home"
            aria-label="Home"
            className={clsx(
              "mb-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded bg-brand-gold/90 p-1 text-brand-lea transition",
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

          {/* Top domains, separated by thin gold hairlines */}
          <div className="flex w-full flex-1 flex-col items-center">
            {topGroups.map((group, idx) => (
              <Fragment key={group.id}>
                {idx > 0 && <div className="my-1.5 h-px w-[54px] bg-brand-gold/45" />}
                {railTile(group)}
              </Fragment>
            ))}
          </div>

          <FeedbackButton />

          <ThemeToggle collapsed />

          {userEmail ? (
            <Link
              href="/account"
              prefetch={false}
              title="My preferences"
              aria-label="My preferences"
              className="mt-2 flex h-9 w-9 items-center justify-center rounded text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <CircleUser className="h-5 w-5" />
            </Link>
          ) : null}

          {userEmail ? <SignOutButton email={userEmail} collapsed /> : null}

          <button
            onClick={toggleCollapsed}
            className="mt-2 flex h-9 w-9 items-center justify-center rounded text-white/70 transition hover:bg-white/10 hover:text-white"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
          </button>

          {/* Admin pinned to the bottom */}
          {adminGroup && (
            <>
              <div className="mb-2 mt-1 h-px w-[54px] bg-brand-gold/45" />
              {railTile(adminGroup)}
            </>
          )}
        </div>

        {/* Items panel */}
        {!collapsed && activeGroup && (
          <div className="flex w-56 flex-col border-r border-white/10 bg-brand-lea">
            <nav className="flex-1 space-y-2 overflow-y-auto p-3">
              {activeGroup.sections.map((section) => (
                <SectionBlock
                  key={section.id}
                  section={section}
                  activeHref={activeHref}
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
  activeHref: string | null;
  collapsed: boolean;
  onToggle: () => void;
  collapsible?: boolean;
};

function SectionBlock({ section, activeHref, collapsed, onToggle, collapsible = true }: SectionBlockProps) {
  const isOpen = !collapsible || !collapsed;

  return (
    <div>
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-gold transition hover:bg-white/5"
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
            const active = item.href === activeHref;
            return (
              <Link
                key={item.href}
                href={item.href}
                // prefetch={false} on every nav Link in this file. Per
                // Next.js's own docs, prefetch fires the moment a Link ENTERS
                // THE VIEWPORT — not on hover, on click, or on intent. This
                // sidebar renders on every single page, so with the default
                // left on, every page load was firing a real fetch (a real
                // serverless invocation, a real auth check against the
                // database) for every one of the ~15-20 nav items at once,
                // whether or not anyone was ever going to click them. That
                // reads in the logs as a burst of unrelated routes
                // (/offers, /events, /matching, /employees, ...) all completing
                // in the same instant, repeating on every reload — real load on
                // the one shared database, competing with whatever page the
                // person actually asked for. None of these are static content
                // that benefits from warming; every destination here is fully
                // dynamic and auth-gated, so prefetching bought nothing but the
                // extra load. LinkPendingIndicator below is what actually
                // answers "did my click register" now, which was the point of
                // prefetching a slow page in the first place.
                prefetch={false}
                className={clsx(
                  "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium transition",
                  active ? "bg-white text-brand-lea shadow-sm" : "text-white/90 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {/* Instant feedback that the click registered — see the
                    component doc for why this exists. */}
                <LinkPendingIndicator className={active ? "text-brand-lea" : "text-white"} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
