"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import RGL, { WidthProvider, type Layout } from "react-grid-layout";
import { useRouter } from "next/navigation";
import { Pencil, GripVertical, Plus, Settings2, Trash2, X } from "lucide-react";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { WIDGETS, WIDGETS_BY_TYPE, WIDGET_CATEGORIES, type WidgetData } from "@/components/widgets/registry";
import type { PageLayoutItem, WidgetInstance } from "@/lib/data/page-layout";

const GridLayout = WidthProvider(RGL);

export type GridItem = PageLayoutItem;
export type EditablePanel = { id: string; title: string; node: ReactNode };

type Props = {
  pageKey: string;
  panels: EditablePanel[];
  defaultLayout: GridItem[];
  savedLayout?: GridItem[] | null;
  savedWidgets?: WidgetInstance[] | null;
  canEdit?: boolean;
  cols?: number;
  rowHeight?: number;
  widgetData?: WidgetData;
};

function newWidgetId(type: string) {
  return `w-${type}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

export function EditableGrid({
  pageKey,
  panels,
  defaultLayout,
  savedLayout,
  savedWidgets,
  canEdit = false,
  cols = 12,
  rowHeight = 28,
  widgetData
}: Props) {
  const router = useRouter();

  const [widgets, setWidgets] = useState<WidgetInstance[]>(savedWidgets ?? []);

  // The layout is derived from the SET of panel/widget ids, so that set — BY VALUE —
  // is what this memo must depend on. It used to depend on the panels ARRAY IDENTITY,
  // which meant any parent re-render that rebuilt the array (even with the exact same
  // panels) churned itemIds, re-ran buildInitial, and fired the effect below that
  // replaces the layout — collapsing the arrangement the user was working in. It was
  // worst where a re-render arrives on a timer: a toast that clears itself after a
  // save reset the grid seconds later, with nothing on screen to explain why.
  // Joining the ids makes the dependency value-stable, so every caller is protected
  // whether or not it memoizes its own panels array.
  const itemIdsKey = [...panels.map((p) => p.id), ...widgets.map((w) => w.i)].join("|");
  const itemIds = useMemo(
    () => [...panels.map((p) => p.id), ...widgets.map((w) => w.i)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemIdsKey]
  );

  const buildInitial = useMemo(
    () => (): GridItem[] => {
      let bottom = 0;
      for (const l of savedLayout ?? defaultLayout) bottom = Math.max(bottom, l.y + l.h);
      return itemIds.map((id) => {
        const saved = savedLayout?.find((l) => l.i === id);
        if (saved) return saved;
        const dflt = defaultLayout.find((l) => l.i === id);
        if (dflt) return dflt;
        const def = WIDGETS_BY_TYPE[widgets.find((w) => w.i === id)?.type ?? ""];
        const item = { i: id, x: 0, y: bottom, w: def?.size.w ?? 3, h: def?.size.h ?? 4 };
        bottom += item.h;
        return item;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [savedLayout, defaultLayout, itemIds]
  );

  const [layout, setLayout] = useState<GridItem[]>(buildInitial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [configFor, setConfigFor] = useState<string | null>(null);

  useEffect(() => {
    setWidgets(savedWidgets ?? []);
  }, [savedWidgets]);

  useEffect(() => {
    setLayout(buildInitial());
  }, [buildInitial]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  function onLayoutChange(next: Layout[]) {
    if (!editing) return;
    setLayout(next.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })));
  }

  function addWidget(type: string) {
    const def = WIDGETS_BY_TYPE[type];
    if (!def) return;
    const id = newWidgetId(type);
    const bottom = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
    setWidgets((cur) => [...cur, { i: id, type, config: { ...def.defaultConfig } }]);
    setLayout((cur) => [...cur, { i: id, x: 0, y: bottom, w: def.size.w, h: def.size.h }]);
    setAddOpen(false);
  }

  function removeWidget(id: string) {
    setWidgets((cur) => cur.filter((w) => w.i !== id));
    setLayout((cur) => cur.filter((l) => l.i !== id));
    if (configFor === id) setConfigFor(null);
  }

  function updateConfig(id: string, key: string, value: string) {
    setWidgets((cur) => cur.map((w) => (w.i === id ? { ...w, config: { ...w.config, [key]: value } } : w)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/page-layout/${pageKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout, widgets })
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "Could not save layout.");
      }
    } catch {
      setError("Could not save layout.");
    } finally {
      setSaving(false);
    }
  }

  function resetToDefault() {
    setWidgets([]);
    setLayout(defaultLayout.filter((l) => panels.some((p) => p.id === l.i)));
  }

  function cancel() {
    setWidgets(savedWidgets ?? []);
    setLayout(buildInitial());
    setEditing(false);
    setError(null);
    setAddOpen(false);
    setConfigFor(null);
  }

  const renderItems: Array<{ id: string; title: string; node: ReactNode; isWidget: boolean }> = [
    ...panels.map((p) => ({ id: p.id, title: p.title, node: p.node, isWidget: false })),
    ...widgets.map((w) => {
      const def = WIDGETS_BY_TYPE[w.type];
      return { id: w.i, title: def?.name ?? w.type, node: def ? def.render(w.config, widgetData) : null, isWidget: true };
    })
  ];

  if (narrow) {
    const ordered = [...renderItems].sort((a, b) => {
      const la = layout.find((l) => l.i === a.id) ?? { x: 0, y: 0 };
      const lb = layout.find((l) => l.i === b.id) ?? { x: 0, y: 0 };
      return la.y - lb.y || la.x - lb.x;
    });
    return <div className="space-y-4">{ordered.map((it) => <div key={it.id}>{it.node}</div>)}</div>;
  }

  const displayLayout = renderItems.map((it) => {
    const l = layout.find((x) => x.i === it.id) ?? { i: it.id, x: 0, y: 999, w: 3, h: 4 };
    return { ...l, static: !editing, isDraggable: editing, isResizable: editing };
  });

  const configWidget = configFor ? widgets.find((w) => w.i === configFor) : null;
  const configDef = configWidget ? WIDGETS_BY_TYPE[configWidget.type] : null;

  return (
    <div>
      {canEdit && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {editing ? (
            <>
              <p className="mr-auto text-xs text-brand-grey dark:text-slate-400">
                Drag by the gold handle, resize from the corner, add widgets.{" "}
                <span className="font-semibold text-brand-lea dark:text-slate-100">Saving sets the layout for everyone.</span>
              </p>
              {error && <span className="text-xs font-semibold text-red-600 dark:text-red-300">{error}</span>}
              <button onClick={() => setAddOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
                <Plus className="h-3.5 w-3.5" /> Add widget
              </button>
              <button onClick={resetToDefault} className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
                Reset to default
              </button>
              <button onClick={cancel} className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="rounded bg-brand-lea px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
                {saving ? "Saving…" : "Save layout"}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
              <Pencil className="h-3.5 w-3.5" /> Edit layout
            </button>
          )}
        </div>
      )}

      {editing && addOpen && (
        <div className="mb-3 rounded border border-brand-lea/15 bg-white p-3 shadow-panel dark:border-white/10 dark:bg-brand-panel">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Add a widget</span>
            <button onClick={() => setAddOpen(false)} className="lab-nodrag rounded p-0.5 text-brand-grey hover:text-brand-lea dark:text-slate-400" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-2.5">
            {WIDGET_CATEGORIES.map((cat) => (
              <div key={cat}>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">{cat}</div>
                <div className="flex flex-wrap gap-1.5">
                  {WIDGETS.filter((w) => w.category === cat).map((w) => {
                    const Icon = w.icon;
                    return (
                      <button key={w.type} onClick={() => addWidget(w.type)} className="inline-flex items-center gap-1.5 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 px-2.5 py-1.5 text-[11px] font-semibold text-brand-lea transition hover:border-brand-gold hover:bg-brand-sweet/20 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
                        <Icon className="h-3.5 w-3.5 text-brand-eden dark:text-[#8fb3d6]" /> {w.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={editing ? "rounded bg-brand-cloudDancer/30 p-1 ring-1 ring-brand-gold/30 dark:bg-white/5" : ""}>
        <GridLayout
          className="layout"
          layout={displayLayout}
          cols={cols}
          rowHeight={rowHeight}
          margin={[12, 12]}
          draggableHandle=".eg-drag"
          draggableCancel=".lab-nodrag"
          onLayoutChange={onLayoutChange}
          compactType={null}
          preventCollision
          isDraggable={editing}
          isResizable={editing}
        >
          {renderItems.map((it) => (
            <div key={it.id} className="flex h-full flex-col">
              {editing && (
                <div className="eg-drag flex shrink-0 cursor-move items-center justify-between gap-1 rounded-t bg-brand-lea px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  <span className="flex items-center gap-1 truncate"><GripVertical className="h-3 w-3" /> {it.title}</span>
                  {it.isWidget && (
                    <span className="flex shrink-0 items-center gap-1">
                      <button onClick={() => setConfigFor(it.id)} className="lab-nodrag rounded p-0.5 opacity-90 hover:opacity-100" title="Configure" aria-label="Configure widget"><Settings2 className="h-3 w-3" /></button>
                      <button onClick={() => removeWidget(it.id)} className="lab-nodrag rounded p-0.5 opacity-90 hover:opacity-100" title="Remove" aria-label="Remove widget"><Trash2 className="h-3 w-3" /></button>
                    </span>
                  )}
                </div>
              )}
              <div
                className={
                  editing
                    ? "min-h-0 flex-1 overflow-hidden rounded-b ring-2 ring-brand-gold/40 [&>*]:pointer-events-none [&>*]:h-full"
                    : "min-h-0 flex-1 [&>*]:h-full"
                }
              >
                {it.node}
              </div>
            </div>
          ))}
        </GridLayout>
      </div>

      {configWidget && configDef && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setConfigFor(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded border border-brand-lea/20 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-brand-panel">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">Configure: {configDef.name}</span>
              <button onClick={() => setConfigFor(null)} className="rounded p-0.5 text-brand-grey hover:text-brand-lea dark:text-slate-400" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              {configDef.fields.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">{field.label}</span>
                  {field.type === "textarea" ? (
                    <textarea
                      value={String(configWidget.config[field.key] ?? "")}
                      onChange={(e) => updateConfig(configWidget.i, field.key, e.target.value)}
                      placeholder={field.placeholder}
                      rows={4}
                      className="w-full rounded border border-brand-lea/20 bg-white px-2.5 py-1.5 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                    />
                  ) : (
                    <input
                      type={field.type === "number" ? "number" : "text"}
                      value={String(configWidget.config[field.key] ?? "")}
                      onChange={(e) => updateConfig(configWidget.i, field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full rounded border border-brand-lea/20 bg-white px-2.5 py-1.5 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setConfigFor(null)} className="rounded bg-brand-lea px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden">Done</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
