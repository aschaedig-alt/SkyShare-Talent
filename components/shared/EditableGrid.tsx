"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import RGL, { WidthProvider, type Layout } from "react-grid-layout";
import { useRouter } from "next/navigation";
import { Pencil, GripVertical } from "lucide-react";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const GridLayout = WidthProvider(RGL);

export type GridItem = { i: string; x: number; y: number; w: number; h: number };
export type EditablePanel = { id: string; title: string; node: ReactNode };

type Props = {
  pageKey: string;
  panels: EditablePanel[];
  defaultLayout: GridItem[];
  savedLayout?: GridItem[] | null;
  canEdit?: boolean;
  cols?: number;
  rowHeight?: number;
};

// Renders a page's real panels in a saved grid arrangement. Admins get an in-place
// "Edit layout" mode (drag/resize); saving writes the layout to the database so the
// arrangement is the same for everyone. On narrow screens it falls back to a clean
// stacked column (in reading order), so phones are never broken by the desktop grid.
export function EditableGrid({
  pageKey,
  panels,
  defaultLayout,
  savedLayout,
  canEdit = false,
  cols = 12,
  rowHeight = 28
}: Props) {
  const router = useRouter();

  const resolve = useMemo(
    () => (src: GridItem[] | null | undefined): GridItem[] =>
      panels.map((p) => {
        const found = src?.find((l) => l.i === p.id);
        const dflt = defaultLayout.find((l) => l.i === p.id);
        return found ?? dflt ?? { i: p.id, x: 0, y: 0, w: cols, h: 6 };
      }),
    [panels, defaultLayout, cols]
  );

  const baseline = useMemo(() => resolve(savedLayout), [resolve, savedLayout]);
  const [layout, setLayout] = useState<GridItem[]>(baseline);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    setLayout(baseline);
  }, [baseline]);

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

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/page-layout/${pageKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout })
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
    setLayout(resolve(defaultLayout));
  }

  function cancel() {
    setLayout(baseline);
    setEditing(false);
    setError(null);
  }

  // Narrow screens: stack panels in saved reading order (top-to-bottom, left-to-right).
  if (narrow) {
    const ordered = [...panels].sort((a, b) => {
      const la = layout.find((l) => l.i === a.id) ?? { x: 0, y: 0 };
      const lb = layout.find((l) => l.i === b.id) ?? { x: 0, y: 0 };
      return la.y - lb.y || la.x - lb.x;
    });
    return <div className="space-y-4">{ordered.map((p) => <div key={p.id}>{p.node}</div>)}</div>;
  }

  const displayLayout = layout.map((l) => ({
    ...l,
    static: !editing,
    isDraggable: editing,
    isResizable: editing
  }));

  return (
    <div>
      {canEdit && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {editing ? (
            <>
              <p className="mr-auto text-xs text-brand-grey">
                Drag panels by the gold handle, resize from the corner.{" "}
                <span className="font-semibold text-brand-lea">Saving sets the layout for everyone.</span>
              </p>
              {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
              <button onClick={resetToDefault} className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60">
                Reset to default
              </button>
              <button onClick={cancel} className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60">
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="rounded bg-brand-lea px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
                {saving ? "Saving…" : "Save layout"}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60">
              <Pencil className="h-3.5 w-3.5" /> Edit layout
            </button>
          )}
        </div>
      )}

      <div className={editing ? "rounded-lg bg-brand-cloudDancer/30 p-1 ring-1 ring-brand-gold/30" : ""}>
        <GridLayout
          className="layout"
          layout={displayLayout}
          cols={cols}
          rowHeight={rowHeight}
          margin={[12, 12]}
          draggableHandle=".eg-drag"
          onLayoutChange={onLayoutChange}
          compactType={null}
          preventCollision
          isDraggable={editing}
          isResizable={editing}
        >
          {panels.map((p) => (
            <div key={p.id} className="flex h-full flex-col">
              {editing && (
                <div className="eg-drag flex shrink-0 cursor-move items-center gap-1 rounded-t bg-brand-lea px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                  <GripVertical className="h-3 w-3" /> {p.title}
                </div>
              )}
              <div
                className={
                  editing
                    ? "min-h-0 flex-1 overflow-hidden rounded-b ring-2 ring-brand-gold/40 [&>*]:pointer-events-none [&>*]:h-full"
                    : "min-h-0 flex-1 [&>*]:h-full"
                }
              >
                {p.node}
              </div>
            </div>
          ))}
        </GridLayout>
      </div>
    </div>
  );
}
