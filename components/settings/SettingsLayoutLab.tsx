"use client";

import { useEffect, useMemo, useState } from "react";
import RGL, { WidthProvider, type Layout } from "react-grid-layout";
import { Lock, Unlock, Eye, EyeOff, Grid3x3, ArrowRightLeft, LayoutGrid, RotateCcw } from "lucide-react";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  LAB_PAGES,
  LAB_BOXES,
  DOMAIN_ORDER,
  DOMAIN_DOT,
  defaultBoxHeight,
  domainColor,
  domainDot,
  pageById,
  type LabBox,
  type LabDomain
} from "@/lib/layout-lab/catalog";

const GridLayout = WidthProvider(RGL);

const LAYOUT_KEY = "skyshare-settings-lab-layout-v1";
const LOCK_KEY = "skyshare-settings-lab-locks-v1";
const HIDE_KEY = "skyshare-settings-lab-hidden-v1";
const ASSIGN_KEY = "skyshare-settings-lab-assign-v1";
const DENSITY_KEY = "skyshare-settings-lab-density-v1";
const COLS_KEY = "skyshare-settings-lab-cols-v1";

const COL_OPTIONS = [
  { n: 12, label: "Coarse" },
  { n: 24, label: "Medium" },
  { n: 36, label: "Fine" }
];

const DENSITY_MAP = {
  compact: { rh: 22, m: 6 },
  cozy: { rh: 28, m: 10 },
  roomy: { rh: 36, m: 14 }
} as const;
type Density = keyof typeof DENSITY_MAP;

// Lay a page's boxes into N visual columns, shortest-column-first (masonry).
function flowPage(ids: string[], totalCols: number, visualCols = 3, startY = 0): Layout[] {
  const colW = Math.max(1, Math.round(totalCols / visualCols));
  const colY = new Array(visualCols).fill(startY);
  return ids.map((id) => {
    let c = 0;
    for (let i = 1; i < visualCols; i++) if (colY[i] < colY[c]) c = i;
    const h = defaultBoxHeight(id);
    const y = colY[c];
    colY[c] += h;
    const x = Math.min(c * colW, totalCols - colW);
    return { i: id, x, y, w: colW, h };
  });
}

// Build the seed layout for ALL boxes (each page laid out independently at y=0; pages are
// never shown together so overlapping coordinates across pages are fine).
function buildDefaultLayout(totalCols: number): Layout[] {
  const out: Layout[] = [];
  for (const page of LAB_PAGES) {
    const ids = LAB_BOXES.filter((b) => b.page === page.id).map((b) => b.id);
    out.push(...flowPage(ids, totalCols));
  }
  return out;
}

function scaleLayout(src: Layout[], from: number, to: number): Layout[] {
  if (from === to) return src.map((l) => ({ ...l }));
  const f = to / from;
  return src.map((l) => {
    const w = Math.max(1, Math.round(l.w * f));
    let x = Math.round(l.x * f);
    if (x + w > to) x = Math.max(0, to - w);
    return { ...l, x, w };
  });
}

export function SettingsLayoutLab() {
  const [active, setActive] = useState<string>(LAB_PAGES[0].id);
  const [layout, setLayout] = useState<Layout[]>(() => buildDefaultLayout(12));
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [density, setDensity] = useState<Density>("cozy");
  const [cols, setCols] = useState(12);
  const [showGrid, setShowGrid] = useState(false);
  const [moveMenu, setMoveMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const rawCols = window.localStorage.getItem(COLS_KEY);
      const startCols = rawCols && COL_OPTIONS.some((o) => o.n === parseInt(rawCols, 10)) ? parseInt(rawCols, 10) : 12;
      setCols(startCols);

      const raw = window.localStorage.getItem(LAYOUT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Layout[];
        // Make sure any newly-added boxes still get a position.
        const have = new Set(saved.map((l) => l.i));
        const missing = LAB_BOXES.filter((b) => !have.has(b.id));
        if (missing.length) {
          const seed = buildDefaultLayout(startCols).filter((l) => !have.has(l.i));
          setLayout([...saved, ...seed]);
        } else {
          setLayout(saved);
        }
      } else {
        setLayout(buildDefaultLayout(startCols));
      }

      const rawLocks = window.localStorage.getItem(LOCK_KEY);
      if (rawLocks) setLocked(new Set(JSON.parse(rawLocks) as string[]));
      const rawHidden = window.localStorage.getItem(HIDE_KEY);
      if (rawHidden) setHidden(new Set(JSON.parse(rawHidden) as string[]));
      const rawAssign = window.localStorage.getItem(ASSIGN_KEY);
      if (rawAssign) setAssign(JSON.parse(rawAssign) as Record<string, string>);
      const rawDensity = window.localStorage.getItem(DENSITY_KEY);
      if (rawDensity === "compact" || rawDensity === "cozy" || rawDensity === "roomy") setDensity(rawDensity);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);

  function persistLayout(next: Layout[]) {
    if (loaded) window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
  }

  function onLayoutChange(next: Layout[]) {
    const positions = next.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h }));
    setLayout((cur) => {
      const byId = new Map(cur.map((l) => [l.i, l]));
      for (const p of positions) byId.set(p.i, p);
      const merged = [...byId.values()];
      persistLayout(merged);
      return merged;
    });
  }

  function toggleLock(id: string) {
    setLocked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem(LOCK_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  function toggleHide(id: string) {
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      window.localStorage.setItem(HIDE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  const pageOf = (b: LabBox) => assign[b.id] ?? b.page;

  function reassign(id: string, targetPage: string) {
    const box = LAB_BOXES.find((b) => b.id === id);
    if (!box) return;
    // Drop the moved box at the bottom of the target page so it doesn't overlap.
    const onTarget = LAB_BOXES.filter((b) => (assign[b.id] ?? b.page) === targetPage && b.id !== id).map((b) => b.id);
    const targetLayouts = layout.filter((l) => onTarget.includes(l.i));
    const maxY = Math.max(0, ...targetLayouts.map((l) => l.y + l.h));

    setAssign((cur) => {
      const next = { ...cur };
      if (targetPage === box.page) delete next[id];
      else next[id] = targetPage;
      window.localStorage.setItem(ASSIGN_KEY, JSON.stringify(next));
      return next;
    });
    setLayout((cur) => {
      const next = cur.map((l) => (l.i === id ? { ...l, x: 0, y: maxY } : l));
      persistLayout(next);
      return next;
    });
    setActive(targetPage);
    setMoveMenu(null);
  }

  function changeDensity(d: Density) {
    setDensity(d);
    window.localStorage.setItem(DENSITY_KEY, d);
  }

  function changeCols(next: number) {
    setLayout((cur) => {
      const scaled = scaleLayout(cur, cols, next);
      persistLayout(scaled);
      return scaled;
    });
    setCols(next);
    window.localStorage.setItem(COLS_KEY, String(next));
  }

  function autoArrange() {
    // Re-flow just the active page's visible boxes; leave other pages untouched.
    const ids = LAB_BOXES.filter((b) => pageOf(b) === active && !hidden.has(b.id)).map((b) => b.id);
    const fresh = flowPage(ids, cols);
    setLayout((cur) => {
      const byId = new Map(cur.map((l) => [l.i, l]));
      for (const f of fresh) byId.set(f.i, f);
      const merged = [...byId.values()];
      persistLayout(merged);
      return merged;
    });
  }

  function resetAll() {
    const fresh = buildDefaultLayout(cols);
    setLayout(fresh);
    setLocked(new Set());
    setHidden(new Set());
    setAssign({});
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(fresh));
    window.localStorage.setItem(LOCK_KEY, JSON.stringify([]));
    window.localStorage.setItem(HIDE_KEY, JSON.stringify([]));
    window.localStorage.setItem(ASSIGN_KEY, JSON.stringify({}));
  }

  function copyPage() {
    const boxes = LAB_BOXES.filter((b) => pageOf(b) === active && !hidden.has(b.id)).map((b) => {
      const l = layout.find((x) => x.i === b.id);
      return { i: b.id, title: b.title, home: b.page, x: l?.x ?? 0, y: l?.y ?? 0, w: l?.w ?? 4, h: l?.h ?? 5, locked: locked.has(b.id) };
    });
    const payload = { page: active, cols, density, boxes };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const visibleBoxes = LAB_BOXES.filter((b) => pageOf(b) === active && !hidden.has(b.id));
  const visibleIds = new Set(visibleBoxes.map((b) => b.id));
  const hiddenOnPage = LAB_BOXES.filter((b) => pageOf(b) === active && hidden.has(b.id));

  const displayLayout = useMemo(
    () =>
      layout
        .filter((l) => visibleIds.has(l.i))
        .map((l) => ({ ...l, static: locked.has(l.i), isDraggable: !locked.has(l.i), isResizable: !locked.has(l.i) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, locked, hidden, assign, active]
  );

  // Per-page box counts for the rail (respect hidden? show total assigned).
  const pageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of LAB_BOXES) {
      const p = assign[b.id] ?? b.page;
      counts[p] = (counts[p] ?? 0) + 1;
    }
    return counts;
     
  }, [assign]);

  const dim = DENSITY_MAP[density];
  const activePage = pageById(active);

  const railGroups = DOMAIN_ORDER.map((domain) => ({
    domain,
    pages: LAB_PAGES.filter((p) => p.domain === domain)
  })).filter((g) => g.pages.length > 0);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Left rail: page list grouped by domain */}
      <aside className="shrink-0 lg:w-60">
        <div className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Pages</p>
          <div className="max-h-[70vh] space-y-3 overflow-auto">
            {railGroups.map((g) => (
              <div key={g.domain}>
                <div className="flex items-center gap-1.5 px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOMAIN_DOT[g.domain as LabDomain]}`} /> {g.domain}
                </div>
                <div className="space-y-0.5">
                  {g.pages.map((p) => {
                    const isActive = active === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setActive(p.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition ${isActive ? "bg-brand-lea text-white" : "text-brand-black/80 dark:text-slate-300 hover:bg-brand-cloudDancer/50 dark:bg-white/5"}`}
                      >
                        <span className="truncate">{p.label}</span>
                        <span className={`shrink-0 rounded px-1.5 text-[10px] ${isActive ? "bg-white/25" : "bg-brand-lea/10 text-brand-grey dark:text-slate-400"}`}>{pageCounts[p.id] ?? 0}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Right: controls + board */}
      <div className="min-w-0 flex-1">
        <section className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Experimental</p>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-brand-lea dark:text-slate-100">
              <LayoutGrid className="h-5 w-5" /> {activePage?.label ?? "Layout Lab"}
            </h2>
            <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
              {activePage?.route} · drag, resize, <Lock className="inline h-3 w-3" /> lock,{" "}
              <EyeOff className="inline h-3 w-3" /> hide, or <ArrowRightLeft className="inline h-3 w-3" /> move a box to
              another page. Boxes are colored by their home domain.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowGrid((v) => !v)} className={`inline-flex items-center gap-1.5 rounded border px-3 py-2 text-sm font-semibold transition ${showGrid ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-lea hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5"}`}>
              <Grid3x3 className="h-4 w-4" /> Grid
            </button>
            <button onClick={autoArrange} className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
              <RotateCcw className="h-4 w-4" /> Auto-arrange page
            </button>
            <button onClick={copyPage} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden">{copied ? "Copied!" : "Copy this page"}</button>
            <button onClick={resetAll} className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">Reset all</button>
          </div>
        </section>

        {/* Density + grid controls */}
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded border border-brand-lea/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-brand-panel">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Density:</span>
            <div className="inline-flex overflow-hidden rounded border border-brand-lea/20 dark:border-white/10">
              {(["compact", "cozy", "roomy"] as Density[]).map((d) => (
                <button key={d} onClick={() => changeDensity(d)} className={`px-3 py-1 text-[11px] font-semibold capitalize transition ${density === d ? "bg-brand-lea text-white" : "text-brand-lea hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:bg-white/5"}`}>{d}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Grid:</span>
            <div className="inline-flex overflow-hidden rounded border border-brand-lea/20 dark:border-white/10">
              {COL_OPTIONS.map((o) => (
                <button key={o.n} onClick={() => changeCols(o.n)} title={`${o.n} columns`} className={`px-3 py-1 text-[11px] font-semibold transition ${cols === o.n ? "bg-brand-lea text-white" : "text-brand-lea hover:bg-brand-cloudDancer/60 dark:text-slate-100 dark:bg-white/5"}`}>{o.label}</button>
              ))}
            </div>
            <span className="text-[10px] text-brand-grey dark:text-slate-400">finer = smaller snap steps</span>
          </div>
        </div>

        {hiddenOnPage.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-brand-lea/10 bg-white px-3 py-2 dark:border-white/10 dark:bg-brand-panel">
            <span className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Hidden ({hiddenOnPage.length}):</span>
            {hiddenOnPage.map((b) => (
              <button key={b.id} type="button" onClick={() => toggleHide(b.id)} className="inline-flex items-center gap-1 rounded border border-brand-lea/15 bg-brand-cloudDancer/50 px-2.5 py-1 text-[11px] font-semibold text-brand-lea transition hover:bg-brand-cloudDancer dark:border-white/10 dark:bg-white/5 dark:text-slate-100" title="Show again">
                <Eye className="h-3 w-3" /> {b.title}
              </button>
            ))}
          </div>
        )}

        {visibleBoxes.length === 0 && (
          <div className="rounded border border-dashed border-brand-lea/20 bg-white px-4 py-10 text-center text-sm text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400">
            No boxes on <span className="font-semibold text-brand-lea dark:text-slate-100">{activePage?.label}</span>. Move boxes here from
            another page, or restore hidden ones.
          </div>
        )}

        <div
          className="rounded bg-brand-cloudDancer/30 p-1 dark:bg-white/5"
          style={
            showGrid
              ? {
                  backgroundImage:
                    "linear-gradient(to right, rgba(21,50,62,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(21,50,62,0.10) 1px, transparent 1px)",
                  backgroundSize: `${100 / cols}% ${dim.rh + dim.m}px`,
                  backgroundPosition: `${dim.m + 1}px ${dim.m + 1}px`
                }
              : undefined
          }
        >
          <GridLayout
            className="layout"
            layout={displayLayout}
            cols={cols}
            rowHeight={dim.rh}
            margin={[dim.m, dim.m]}
            draggableHandle=".lab-drag"
            draggableCancel=".lab-nodrag"
            onLayoutChange={onLayoutChange}
            compactType={null}
            preventCollision
          >
            {visibleBoxes.map((b) => {
              const isLocked = locked.has(b.id);
              const current = pageOf(b);
              const moved = current !== b.page;
              const home = pageById(b.page);
              return (
                <div key={b.id} className={`flex flex-col overflow-hidden rounded border bg-white shadow-panel dark:bg-brand-panel ${isLocked ? "border-brand-gold ring-2 ring-brand-gold/40" : "border-brand-lea/15 dark:border-white/10"}`}>
                  <div className={`lab-drag flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 ${isLocked ? "cursor-default" : "cursor-move"} ${domainColor(current)}`}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[11px] font-bold uppercase tracking-wide">{b.title}</span>
                      {moved && <span className="shrink-0 rounded bg-white/25 px-1 text-[8px] font-bold uppercase" title={`From ${home?.label}`}>{home?.label}</span>}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button type="button" onClick={(e) => setMoveMenu(moveMenu?.id === b.id ? null : { id: b.id, x: e.clientX, y: e.clientY })} className="lab-nodrag rounded p-0.5 opacity-80 hover:opacity-100" title="Move to another page" aria-label="Move to another page">
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => toggleHide(b.id)} className="lab-nodrag rounded p-0.5 opacity-80 hover:opacity-100" title="Hide box" aria-label="Hide box">
                        <EyeOff className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => toggleLock(b.id)} className="lab-nodrag rounded p-0.5 opacity-80 hover:opacity-100" title={isLocked ? "Unlock" : "Lock in place"} aria-label={isLocked ? "Unlock" : "Lock in place"}>
                        {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-3">
                    <p className="text-xs leading-5 text-brand-black/80 dark:text-slate-300">{b.summary}</p>
                  </div>
                </div>
              );
            })}
          </GridLayout>
        </div>
      </div>

      {/* Move-to-page popover (fixed so the card's overflow doesn't clip it) */}
      {moveMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMoveMenu(null)} />
          <div
            className="fixed z-50 max-h-[60vh] w-60 overflow-auto rounded border border-brand-lea/20 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-brand-panel"
            style={{ left: Math.min(moveMenu.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 260), top: moveMenu.y + 6 }}
          >
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Move this box to →</div>
            {railGroups.map((g) => (
              <div key={g.domain}>
                <div className="flex items-center gap-1.5 px-2 pt-1.5 text-[9px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOMAIN_DOT[g.domain as LabDomain]}`} /> {g.domain}
                </div>
                {g.pages.map((p) => {
                  const box = LAB_BOXES.find((b) => b.id === moveMenu.id);
                  const cur = (assign[moveMenu.id] ?? box?.page) === p.id;
                  const isHome = box?.page === p.id;
                  return (
                    <button key={p.id} onClick={() => reassign(moveMenu.id, p.id)} className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs transition ${cur ? "bg-brand-cloudDancer/60 font-semibold text-brand-lea dark:bg-white/5 dark:text-slate-100" : "text-brand-black/80 hover:bg-brand-cloudDancer/40 dark:bg-white/5 dark:text-slate-300"}`}>
                      <span className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${domainDot(p.id)}`} />
                        {p.label}
                        {isHome && <span className="text-[9px] uppercase text-brand-grey dark:text-slate-400">(home)</span>}
                      </span>
                      {cur && <span className="text-brand-eden dark:text-[#8fb3d6]">✓</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
