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
  type ModuleRuleOverrides,
  type VisibleNavigationGroup,
  type VisibleNavigationSection
} from "@/lib/navigation/modules";

type SidebarProps = {
  role: RoleName;
  policy: ModuleAccessPolicy;
  // This account s own module overrides, when an admin has restricted it.
  // Undefined/null for everyone else, which yields the role policy unchanged.
  moduleOverrides?: ModuleRuleOverrides | null;
  logoDataUrl?: string | null;
  userEmail?: string | null;
  homeHref?: string;
};

const COLLAPSE_KEY = "skyshare-sidebar-collapsed";
const SECTIONS_KEY = "skyshare-sidebar-sections-collapsed";

function matchesPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ role, policy, moduleOverrides, logoDataUrl, userEmail, homeHref = "/command-center" }: SidebarProps) {
  const pathname = usePathname();
  const groups = getVisibleNavigationGroups(policy, role, moduleOverrides);

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
            // py-1.5 rather than py-2: 4px a tile, 24px over the six tiles, and it
            // is the single biggest saving available without shrinking the icon or
            // dropping the label. Still 43px tall, still comfortably clickable.
            "flex w-[58px] flex-col items-center gap-0.5 rounded py-1.5 transition",
            groupActive ? "bg-brand-gold text-brand-lea" : "text-white/85 hover:bg-white/10 hover:text-white"
          )}
        >
          <Icon className="h-5 w-5" />
          <span className="text-[9px] font-medium leading-none">{group.label}</span>
        </Link>

        {/*
          The flyout used to render only when the sidebar was COLLAPSED, which
          made the collapsed rail faster to navigate than the expanded one: the
          expanded panel shows just the group you are already in, so reaching
          anything in another group cost two clicks and a page load you did not
          want (only 7 of 36 destinations were one click from the landing page).
          It now renders for any group that is not the one already open, so a
          cross-group jump is one hover and one click in either mode. The active
          group is excluded because its items are already listed in the panel
          beside it.

          IF THIS FLYOUT EVER DISAPPEARS AGAIN, IT IS NOT THE Z-INDEX. It was
          reported "behind the second menu" and the cause was OVERFLOW, not
          stacking: the rail had overflow-x-hidden, this box is absolute at
          left-full (i.e. outside the rail's 70px), and an overflow ancestor clips
          any descendant whose containing block sits inside it — z-50 cannot paint
          what has been clipped away. The rail no longer sets overflow at normal
          viewport heights, which is why this works again; see the long note on the
          rail for why that gate is set where it is. The z-50 here is still needed
          against the items panel, and the z-30 on the sticky container is still
          needed against <main> — neither was the bug.
        */}
        {(collapsed || !groupActive) && (
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
          {/* flex flex-col is load-bearing: the footer below carries mt-auto, which
              does nothing without a flex column parent, so the preferences/sign-out
              block used to sit wherever the nav happened to end instead of at the
              bottom of the drawer. overflow-x-hidden is not optional either — per the
              CSS overflow spec, setting overflow-y alone makes the OTHER axis compute
              to auto, which is the same trap that put two scrollbars on the icon rail.
              A drawer is fixed chrome, so scrolling it vertically IS correct here. */}
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto overflow-x-hidden bg-brand-lea text-white shadow-2xl">
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
        {/* Icon rail. THE FIX HERE IS THAT IT FITS, not that it scrolls. Read this
            before adding overflow or padding back.

            Aimee reported a scrollbar on this rail from her laptop (1536x695) and
            said plainly that she does not want one. Per the CLAUDE.md rule the order
            is: make it fit, else let the PAGE scroll, and only then scroll the
            container. This is step 1 — the tiles, the dividers and the rail padding
            were each trimmed until the whole rail fits inside 695px:

              py-2 rail padding            8 +  8   =  16
              home tile h-11 + mb-2       44 +  8   =  52
              5 group tiles at py-1.5     5 x 43    = 215   (20 icon + 2 gap + 9 label + 12 pad)
              4 hairlines at my-1         4 x  9    =  36
              feedback button  mt-2 h-9    8 + 36   =  44
              theme toggle     py-2 h-4   16 + 16   =  32
              account link     mt-2 h-9    8 + 36   =  44
              sign out         mt-2 h-9    8 + 36   =  44
              collapse button  mt-2 h-9    8 + 36   =  44
              admin hairline   mt-1 mb-1.5 4+1+6    =  11
              admin tile                             =  43
                                                    ----
                                                     581  (was 635)

            That is 114px of headroom at her 695px viewport, so nothing scrolls.
            The four 36px utility buttons are deliberately NOT shrunk — they live in
            other components (FeedbackButton, ThemeToggle, SignOutButton) and making
            two of them smaller than their neighbours would look worse than it saves.

            HONEST CAVEAT: the previous note here claimed a measured scrollHeight of
            964 at this same viewport. That number cannot be reproduced from the tree —
            there are exactly 6 nav groups (5 here plus Admin, see lib/navigation/
            modules.ts), which is the 635px above. Either it predates a nav change or it
            measured something else. 964 would need ~7 more tiles than exist.

            no-scrollbar is GONE and must not come back: hiding a bar on real content
            hides that there is more to see (see app/globals.css and CLAUDE.md).

            The overflow is now gated to viewports SHORTER than 620px, and that gate is
            the fix for the missing hover flyout, not a nicety. overflow-x-hidden on
            this element CLIPS the flyout: the flyout is absolutely positioned at
            left-full, i.e. outside this 70px box, and an overflow ancestor clips any
            descendant whose containing block is inside it. z-index never entered into
            it. Below 620px the rail genuinely cannot fit, so containment wins and a
            clipped flyout is the lesser problem; at every normal height there is no
            overflow at all, so the flyout paints and no bar exists to hide.
            min-h-0 stays: without it a flex child will not shrink below its content,
            so the gated overflow would do nothing when it does engage. And when it
            engages, overflow-x-hidden must ride along — per the CSS overflow spec
            setting one axis makes the other compute to auto, which is what silently
            turned on horizontal scrolling and produced two bars in a 70px column. */}
        <div className="flex h-full min-h-0 w-[70px] flex-col items-center border-r border-white/10 bg-brand-eden py-2 [@media(max-height:620px)]:overflow-y-auto [@media(max-height:620px)]:overflow-x-hidden">
          <Link
            href={homeHref}
            prefetch={false}
            title="Home"
            aria-label="Home"
            className={clsx(
              "mb-2 flex h-11 w-11 items-center justify-center overflow-hidden rounded bg-brand-gold/90 p-1 text-brand-lea transition",
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
                {idx > 0 && <div className="my-1 h-px w-[54px] bg-brand-gold/45" />}
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
              <div className="mb-1.5 mt-1 h-px w-[54px] bg-brand-gold/45" />
              {railTile(adminGroup)}
            </>
          )}
        </div>

        {/* Items panel */}
        {!collapsed && activeGroup && (
          <div className="flex w-56 flex-col border-r border-white/10 bg-brand-lea">
            {/* The second menu. Aimee saw a scrollbar down this panel too, on the
                same 1536x695 laptop, and it was engaging for the sake of a few
                pixels — so this is the same fit-first fix as the rail.

                Recruiting is the tallest group (4 sections, 14 items) and sets the
                budget. At 695px it was about 764px:

                  nav p-3                        12 + 12          =  24
                  3 gaps between sections        3 x 8            =  24
                  4 section headers py-1.5       4 x 27           = 108
                  4 header-to-list gaps mt-0.5   4 x 2            =   8
                  14 item rows py-2.5            14 x 40          = 560
                  10 gaps between items space-y-1 10 x 4          =  40
                                                                  ----
                                                                   764   overflows by 69

                Now, with px-2.5 py-2 on the nav, space-y-1.5 between sections,
                py-1 headers, py-2 rows and space-y-0.5 between them:

                  nav py-2                        8 +  8          =  16
                  3 gaps at 6                                     =  18
                  4 headers at 23                                 =  92
                  4 mt-0.5                                        =   8
                  14 rows at 36                                   = 504
                  10 gaps at 2                                    =  20
                                                                  ----
                                                                   658   fits, 37px spare

                36px rows with 14px text is an ordinary nav row height, not a cramped
                one. overflow-y-auto stays as the safety net for genuinely short
                viewports and for anyone who later adds items — but it should not
                engage at 695px any more. overflow-x-hidden is new and is NOT
                redundant: overflow-y alone makes the x axis compute to auto, which
                is exactly how the icon rail ended up with two bars. Nothing in this
                panel is positioned outside it, so unlike the rail the clipping is
                harmless here. */}
            <nav className="flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden px-2.5 py-2">
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
          className="flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-[10px] font-bold uppercase tracking-[0.16em] text-brand-gold transition hover:bg-white/5"
        >
          <span>{section.label}</span>
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      ) : (
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-gold">
          {section.label}
        </div>
      )}

      {isOpen && (
        // py-1 headers / space-y-0.5 / py-2 rows: see the height budget on the
        // items-panel nav above. This is the shared block, so the mobile drawer
        // gets the same tightening — which it wants anyway, being the longest
        // list in the app (every group, every section, all at once).
        <div className="mt-0.5 space-y-0.5">
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
                  "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition",
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
