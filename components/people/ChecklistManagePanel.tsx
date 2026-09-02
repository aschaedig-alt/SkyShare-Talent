"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp, GripVertical, Mail } from "lucide-react";
import type { GridChecklistGroup, GridTaskDef } from "@/lib/data/onboarding-grid-config";
import { CUSTOM_GROUP } from "@/lib/onboarding/tasks";
import type { FrontTemplateSummary } from "@/lib/front/templates";

// Manage tasks: rename, hide, add, REORDER, and point a task at a Front template.
//
// Split out of OnboardingGridTab because it stopped being a small block inside a
// table component once it grew a layout editor and an email setup panel. The grid
// still owns the table; this owns everything under the Manage tasks button.
//
// TWO KINDS OF EDIT, and the difference is deliberate and visible in the UI:
//
//   Renames, hides, adds and email settings SAVE IMMEDIATELY — each is one small
//   independent change and there is nothing to stage.
//
//   The ORDER is staged and saved with a button. Reordering is a live write that
//   re-stamps group and order on every hire's task rows (see the comment over
//   saveChecklistArrangement), so it happens once, when she says the arrangement
//   is right — not on every arrow press while she is still moving things around.

type Props = {
  checklist: GridChecklistGroup[];
  /** Told after a change so the page can refresh the server data. */
  onChanged: () => void;
};

type Layout = { sectionOrder: string[]; bySection: Record<string, string[]> };

function layoutOf(checklist: GridChecklistGroup[]): Layout {
  return {
    sectionOrder: checklist.map((g) => g.key),
    bySection: Object.fromEntries(checklist.map((g) => [g.key, g.tasks.map((t) => t.key)]))
  };
}

function sameLayout(a: Layout, b: Layout): boolean {
  if (a.sectionOrder.join("|") !== b.sectionOrder.join("|")) return false;
  return a.sectionOrder.every((s) => (a.bySection[s] ?? []).join("|") === (b.bySection[s] ?? []).join("|"));
}

/**
 * Fold new server data into a layout that may have unsaved moves in it.
 *
 * Renaming a task refreshes the page, which hands this component a brand new
 * checklist. Taking that verbatim would throw away a reorder she had staged but
 * not yet saved — rename one step, and the six things you had just dragged snap
 * back. So the staged ORDER is kept and only the membership is reconciled:
 * anything the server no longer has is dropped, anything new is appended where
 * the server put it. Discard is the button for "actually, forget my moves".
 */
function reconcile(staged: Layout, server: Layout): Layout {
  const sectionOrder = [
    ...staged.sectionOrder.filter((s) => server.sectionOrder.includes(s)),
    ...server.sectionOrder.filter((s) => !staged.sectionOrder.includes(s))
  ];
  const serverKeys = new Set(Object.values(server.bySection).flat());
  const stagedKeys = new Set(Object.values(staged.bySection).flat());

  const bySection: Record<string, string[]> = {};
  for (const s of sectionOrder) bySection[s] = (staged.bySection[s] ?? []).filter((k) => serverKeys.has(k));
  for (const s of sectionOrder) {
    for (const k of server.bySection[s] ?? []) if (!stagedKeys.has(k)) bySection[s].push(k);
  }
  return { sectionOrder, bySection };
}

export function ChecklistManagePanel({ checklist, onChanged }: Props) {
  const router = useRouter();

  const serverLayout = useMemo(() => layoutOf(checklist), [checklist]);
  const [layout, setLayout] = useState<Layout>(serverLayout);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({});
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [emailFor, setEmailFor] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ kind: "task" | "section"; key: string } | null>(null);

  const tasksByKey = useMemo(() => {
    const m = new Map<string, GridTaskDef>();
    for (const g of checklist) for (const t of g.tasks) m.set(t.key, t);
    return m;
  }, [checklist]);

  const sectionLabels = useMemo(() => Object.fromEntries(checklist.map((g) => [g.key, g.label])), [checklist]);

  // Fold new server data in without losing an unsaved reorder — see reconcile().
  // After a successful save the two agree, so this is a no-op and the dirty
  // banner goes away on its own.
  useEffect(() => {
    setLayout((cur) => reconcile(cur, serverLayout));
    setDrafts(Object.fromEntries(checklist.flatMap((g) => g.tasks.map((t) => [t.key, t.label]))));
    setGroupDrafts(Object.fromEntries(checklist.map((g) => [g.key, g.label])));
  }, [serverLayout, checklist]);

  const orderDirty = !sameLayout(layout, serverLayout);

  const call = useCallback(
    async (url: string, method: string, body?: unknown) => {
      setBusy(true);
      setErr(null);
      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) {
          const p = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(p?.message ?? "Something went wrong.");
        }
        onChanged();
        return true;
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onChanged]
  );

  // --- naming, hiding, adding (each saves on its own) ---
  const renameTask = (t: GridTaskDef) =>
    t.custom
      ? call("/api/onboarding-milestones", "PATCH", { key: t.key, label: drafts[t.key] })
      : call("/api/onboarding-grid", "PATCH", { key: t.key, label: drafts[t.key] });
  const renameSection = (key: string) => call("/api/onboarding-grid", "PATCH", { groupKey: key, label: groupDrafts[key] });
  const hideTask = (key: string, hidden: boolean) => call("/api/onboarding-grid", "PATCH", { key, hidden });
  const removeCustom = (key: string) => call(`/api/onboarding-milestones?key=${encodeURIComponent(key)}`, "DELETE");

  async function addTask() {
    if (!newTask.trim()) {
      setErr("Enter a task name.");
      return;
    }
    if (await call("/api/onboarding-milestones", "POST", { label: newTask })) setNewTask("");
  }

  // --- reordering (staged, then saved) ---
  function moveSection(key: string, dir: -1 | 1) {
    setLayout((l) => {
      const order = [...l.sectionOrder];
      const i = order.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return l;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...l, sectionOrder: order };
    });
  }

  /**
   * Move a task one place. Up from the TOP of a section lands it at the bottom of
   * the section above, so holding the button climbs the whole checklist rather
   * than stopping at a heading — which is the actual complaint: a task added late
   * is at the bottom and has to reach the top.
   */
  function moveTask(key: string, dir: -1 | 1) {
    setLayout((l) => {
      const section = l.sectionOrder.find((s) => (l.bySection[s] ?? []).includes(key));
      if (!section) return l;
      const list = [...(l.bySection[section] ?? [])];
      const i = list.indexOf(key);
      const target = i + dir;

      if (target >= 0 && target < list.length) {
        [list[i], list[target]] = [list[target], list[i]];
        return { ...l, bySection: { ...l.bySection, [section]: list } };
      }

      const si = l.sectionOrder.indexOf(section);
      const nextSection = l.sectionOrder[si + dir];
      if (!nextSection) return l;
      list.splice(i, 1);
      const into = [...(l.bySection[nextSection] ?? [])];
      // Going up joins the section above at its END; going down joins the one
      // below at its START. Either way the task keeps moving in the direction the
      // arrow points when read as one flat list.
      if (dir === -1) into.push(key);
      else into.unshift(key);
      return { ...l, bySection: { ...l.bySection, [section]: list, [nextSection]: into } };
    });
  }

  /** Put `key` into `section` — at `beforeKey` if given, otherwise at the end. */
  function placeTask(key: string, section: string, beforeKey?: string) {
    setLayout((l) => {
      if (key === beforeKey) return l;
      const bySection: Record<string, string[]> = {};
      for (const s of l.sectionOrder) bySection[s] = (l.bySection[s] ?? []).filter((k) => k !== key);
      const into = [...(bySection[section] ?? [])];
      const at = beforeKey ? into.indexOf(beforeKey) : -1;
      if (at >= 0) into.splice(at, 0, key);
      else into.push(key);
      bySection[section] = into;
      return { ...l, bySection };
    });
  }

  function dropSectionOn(targetKey: string, movedKey: string) {
    setLayout((l) => {
      if (targetKey === movedKey) return l;
      const order = l.sectionOrder.filter((s) => s !== movedKey);
      const at = order.indexOf(targetKey);
      order.splice(at < 0 ? order.length : at, 0, movedKey);
      return { ...l, sectionOrder: order };
    });
  }

  async function saveOrder() {
    setSavingOrder(true);
    setErr(null);
    const tasks = layout.sectionOrder.flatMap((s) => (layout.bySection[s] ?? []).map((key) => ({ key, group: s })));
    try {
      const res = await fetch("/api/onboarding-grid", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupOrder: layout.sectionOrder, tasks })
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(p?.message ?? "Could not save the order.");
      }
      onChanged();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the order.");
    } finally {
      setSavingOrder(false);
    }
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Manage checklist tasks</h2>
      <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
        Rename any task or section, hide a built-in you don&apos;t use, or add your own. Drag the handle &mdash; or use the
        arrows &mdash; to put the steps in the order they are actually done, then press <b>Save order</b>. A task can also
        send an email: pick the Front template on the <b>Email</b> button and a Send button appears on that step of every
        hire&apos;s checklist.
      </p>

      {err ? <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{err}</p> : null}

      {orderDirty ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-brand-gold/50 bg-brand-gold/10 px-3 py-2">
          <p className="text-sm font-medium text-brand-lea dark:text-slate-100">
            The order has changed but isn&apos;t saved yet. Saving applies it to the grid and to every hire&apos;s
            checklist.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setLayout(serverLayout)}
              disabled={savingOrder}
              className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-200"
            >
              Discard
            </button>
            <button
              onClick={saveOrder}
              disabled={savingOrder}
              className="rounded bg-brand-lea px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60 dark:bg-brand-sweet dark:text-brand-lea"
            >
              {savingOrder ? "Saving…" : "Save order"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-4">
        {layout.sectionOrder.map((sectionKey, si) => {
          const keys = layout.bySection[sectionKey] ?? [];
          const label = sectionLabels[sectionKey] ?? sectionKey;
          return (
            <div
              key={sectionKey}
              onDragOver={(e) => {
                if (drag) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!drag) return;
                if (drag.kind === "section") dropSectionOn(sectionKey, drag.key);
                // A task dropped on the section itself (not on a row) goes to the
                // end — the natural reading of "put it in here".
                else placeTask(drag.key, sectionKey);
                setDrag(null);
              }}
              className={clsx(
                "rounded border border-transparent p-1.5 transition",
                drag?.kind === "section" && "border-dashed border-brand-lea/25"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  draggable
                  onDragStart={() => setDrag({ kind: "section", key: sectionKey })}
                  onDragEnd={() => setDrag(null)}
                  title="Drag to move this whole section"
                  className="cursor-grab text-brand-grey/60 active:cursor-grabbing dark:text-slate-500"
                >
                  <GripVertical className="h-4 w-4" />
                </span>
                <MoveButtons
                  onUp={() => moveSection(sectionKey, -1)}
                  onDown={() => moveSection(sectionKey, 1)}
                  upDisabled={si === 0}
                  downDisabled={si === layout.sectionOrder.length - 1}
                  what={`the ${label} section`}
                />
                <input
                  value={groupDrafts[sectionKey] ?? label}
                  onChange={(e) => setGroupDrafts({ ...groupDrafts, [sectionKey]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && (groupDrafts[sectionKey] ?? label) !== label && renameSection(sectionKey)}
                  aria-label={`Rename the ${label} section`}
                  className="min-w-0 flex-1 rounded border border-brand-lea/15 bg-transparent px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-gold dark:border-white/10"
                />
                {(groupDrafts[sectionKey] ?? label) !== label && (
                  <button
                    onClick={() => renameSection(sectionKey)}
                    disabled={busy}
                    className="rounded bg-brand-lea px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50 dark:bg-brand-sweet dark:text-brand-lea"
                  >
                    Save name
                  </button>
                )}
              </div>

              <div className="mt-1.5 space-y-1.5 pl-6">
                {keys.length === 0 ? (
                  <p className="px-1 py-1 text-xs italic text-brand-grey dark:text-slate-500">
                    Nothing in this section &mdash; drag a task here, or arrow one in.
                  </p>
                ) : null}
                {keys.map((key, ti) => {
                  const t = tasksByKey.get(key);
                  if (!t) return null;
                  const dirty = (drafts[key] ?? t.label) !== t.label;
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDrag({ kind: "task", key });
                      }}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={(e) => {
                        if (drag?.kind === "task") e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (drag?.kind === "task") placeTask(drag.key, sectionKey, key);
                        setDrag(null);
                      }}
                      className={clsx(
                        "rounded border border-transparent px-1 py-0.5 transition",
                        t.hidden && "opacity-60",
                        drag?.key === key && "opacity-40",
                        drag?.kind === "task" && drag.key !== key && "hover:border-dashed hover:border-brand-gold"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          title="Drag to reorder, or into another section"
                          className="cursor-grab text-brand-grey/60 active:cursor-grabbing dark:text-slate-500"
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <MoveButtons
                          onUp={() => moveTask(key, -1)}
                          onDown={() => moveTask(key, 1)}
                          upDisabled={si === 0 && ti === 0}
                          downDisabled={si === layout.sectionOrder.length - 1 && ti === keys.length - 1}
                          what={t.label}
                        />
                        <input
                          value={drafts[key] ?? t.label}
                          onChange={(e) => setDrafts({ ...drafts, [key]: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && dirty && renameTask(t)}
                          aria-label={`Rename ${t.label}`}
                          className="min-w-0 flex-1 rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                        />
                        {t.custom ? (
                          <span className="rounded bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                            custom
                          </span>
                        ) : t.hidden ? (
                          <span className="rounded bg-brand-cloudDancer px-2 py-0.5 text-[10px] font-semibold text-brand-grey dark:bg-white/10 dark:text-slate-300">
                            hidden
                          </span>
                        ) : null}
                        {t.email ? (
                          <span
                            title={`Sends the Front template "${t.email.templateName}"`}
                            className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                          >
                            <Mail className="h-3 w-3" /> emails
                          </span>
                        ) : null}
                        <button
                          onClick={() => renameTask(t)}
                          disabled={busy || !dirty}
                          className="rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-40"
                        >
                          Save
                        </button>
                        {t.emailFixed ? (
                          <span
                            title="This step's email is built in code — it does more than fill a template, so it keeps its own button."
                            className="rounded border border-brand-lea/15 px-3 py-1.5 text-xs font-semibold text-brand-grey dark:border-white/10 dark:text-slate-400"
                          >
                            Email: built in
                          </span>
                        ) : (
                          <button
                            onClick={() => setEmailFor((k) => (k === key ? null : key))}
                            className={clsx(
                              "rounded border px-3 py-1.5 text-xs font-semibold transition",
                              emailFor === key
                                ? "border-brand-lea bg-brand-lea text-white"
                                : "border-brand-lea/20 text-brand-eden hover:bg-brand-cloudDancer/40 dark:border-white/10 dark:text-slate-200"
                            )}
                          >
                            Email
                          </button>
                        )}
                        {t.custom ? (
                          <button
                            onClick={() => removeCustom(key)}
                            disabled={busy}
                            className="rounded border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                          >
                            Remove
                          </button>
                        ) : (
                          <button
                            onClick={() => hideTask(key, !t.hidden)}
                            disabled={busy}
                            className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:border-white/10 dark:text-slate-200"
                          >
                            {t.hidden ? "Show" : "Hide"}
                          </button>
                        )}
                      </div>

                      {emailFor === key ? (
                        <TaskEmailSetup
                          task={t}
                          busy={busy}
                          onSave={async (payload) => {
                            const ok = await call("/api/onboarding-grid", "POST", { key, ...payload });
                            if (ok) setEmailFor(null);
                          }}
                          onClear={async () => {
                            const ok = await call("/api/onboarding-grid", "POST", { key, templateId: "" });
                            if (ok) setEmailFor(null);
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="New task name"
          className="flex-1 rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        <button
          onClick={addTask}
          disabled={busy}
          className="rounded bg-brand-lea px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
        >
          + Add task
        </button>
      </div>
      <p className="mt-1.5 text-xs text-brand-grey dark:text-slate-400">
        A new task lands at the bottom of the <b>{sectionLabels[CUSTOM_GROUP] ?? "Custom"}</b> section and goes to
        everyone currently onboarding. Move it wherever it belongs and save the order.
      </p>
    </section>
  );
}

function MoveButtons({
  onUp,
  onDown,
  upDisabled,
  downDisabled,
  what
}: {
  onUp: () => void;
  onDown: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
  what: string;
}) {
  // The keyboard-and-click path, not a fallback for one. Dragging is faster for a
  // long move; these are the ones that work without a mouse, and they are also
  // the ones that can be relied on — client-side drag behaviour is not something
  // this repo can verify from the Browser pane (see CLAUDE.md).
  const cls =
    "rounded border border-brand-lea/15 p-1 text-brand-eden transition hover:bg-brand-cloudDancer/50 disabled:opacity-30 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5";
  return (
    <span className="flex flex-col">
      <button onClick={onUp} disabled={upDisabled} aria-label={`Move ${what} up`} title="Move up" className={cls}>
        <ChevronUp className="h-3 w-3" />
      </button>
      <button onClick={onDown} disabled={downDisabled} aria-label={`Move ${what} down`} title="Move down" className={cls}>
        <ChevronDown className="h-3 w-3" />
      </button>
    </span>
  );
}

/**
 * Point one task at a Front template.
 *
 * The template list is fetched from Front when this opens rather than shipped
 * with the page: HR adds and renames templates there, and a list baked into the
 * page would be a copy that goes stale exactly the way a copied template body
 * would.
 */
function TaskEmailSetup({
  task,
  busy,
  onSave,
  onClear
}: {
  task: GridTaskDef;
  busy: boolean;
  onSave: (payload: {
    templateId: string;
    templateName: string;
    audience: string;
    to: string;
    cc: string;
    greeting: boolean;
  }) => void;
  onClear: () => void;
}) {
  const [templates, setTemplates] = useState<FrontTemplateSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(task.email?.templateId ?? "");
  const [audience, setAudience] = useState<string>(task.email?.audience ?? "personal");
  const [to, setTo] = useState((task.email?.to ?? []).join(", "));
  const [cc, setCc] = useState((task.email?.cc ?? ["hrotasks@skyshare.com"]).join(", "));
  const [greeting, setGreeting] = useState(task.email?.greeting ?? true);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/front/templates");
        const data = (await res.json().catch(() => null)) as
          | { templates?: FrontTemplateSummary[]; message?: string }
          | null;
        if (!res.ok) throw new Error(data?.message ?? "Could not load the templates.");
        if (live) setTemplates(data?.templates ?? []);
      } catch (e) {
        if (live) setLoadError(e instanceof Error ? e.message : "Could not load the templates.");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const chosen = templates?.find((t) => t.id === templateId);

  return (
    <div className="mt-2 rounded border border-brand-lea/15 bg-brand-cloudDancer/25 p-3 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold">Send an email for this step</p>
      <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
        A <b>Send email</b> button appears on this step of every hire&apos;s checklist. The body is read live from Front
        at send time and can be edited in that window for one send &mdash; the template itself is never changed.
      </p>

      {loadError ? (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {loadError}
        </p>
      ) : null}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-grey dark:text-slate-400">
          Front template
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={!templates}
            className="mt-1 block w-full rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-sm font-normal text-brand-black dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
          >
            <option value="">{templates ? "Choose a template…" : "Loading from Front…"}</option>
            {/* The saved template is offered even if the live list no longer has
                it, so a template deleted or renamed in Front shows as what it was
                rather than silently resetting the box to "Choose a template". */}
            {task.email && !templates?.some((t) => t.id === task.email?.templateId) ? (
              <option value={task.email.templateId}>{task.email.templateName} (not found in Front)</option>
            ) : null}
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-brand-grey dark:text-slate-400">
          Send to
          <select
            value={audience}
            onChange={(e) => {
              const next = e.target.value;
              setAudience(next);
              // A template addressed to somebody OTHER than the hire is almost
              // never one that should open "Hi <the hire's first name>," — that is
              // the whole reason this option exists. Turned off on the switch
              // rather than forced, so it can still be turned back on.
              if (next === "custom") setGreeting(false);
            }}
            className="mt-1 block w-full rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-sm font-normal text-brand-black dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
          >
            <option value="personal">Their personal email (falls back to SkyShare)</option>
            <option value="company">Their SkyShare email (falls back to personal)</option>
            <option value="custom">Addresses I type in below</option>
          </select>
        </label>

        {audience === "custom" ? (
          <label className="block text-xs font-semibold text-brand-grey dark:text-slate-400 sm:col-span-2">
            To
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="its@skyshare.com, someone.else@skyshare.com"
              className="mt-1 block w-full rounded border border-brand-lea/15 px-2 py-1.5 text-sm font-normal dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
            />
            <span className="mt-1 block font-normal text-brand-grey dark:text-slate-400">
              The same addresses for every hire &mdash; for a step that emails someone else <i>about</i> the new hire
              rather than emailing the new hire. This list never falls back to their address, so a step set up this way
              can never reach them by accident.
            </span>
          </label>
        ) : null}

        <label className="block text-xs font-semibold text-brand-grey dark:text-slate-400 sm:col-span-2">
          Cc
          <input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="hrotasks@skyshare.com"
            className="mt-1 block w-full rounded border border-brand-lea/15 px-2 py-1.5 text-sm font-normal dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
          />
        </label>
      </div>

      <label className="mt-2 flex items-start gap-2 text-xs text-brand-black dark:text-slate-200">
        <input
          type="checkbox"
          checked={greeting}
          onChange={(e) => setGreeting(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5"
        />
        <span>
          Start the email with &ldquo;Hi &lt;first name&gt;,&rdquo; &mdash; turn this off if the template already greets
          them.
          {audience === "custom" ? (
            <b className="block font-semibold text-brand-gold">
              The name is the NEW HIRE&apos;s, not the recipient&apos;s &mdash; so on a step that emails somebody else,
              this greets the wrong person.
            </b>
          ) : null}
        </span>
      </label>

      {chosen?.subject ? (
        <p className="mt-2 text-xs text-brand-grey dark:text-slate-400">
          Subject: <span className="text-brand-black dark:text-slate-200">{chosen.subject}</span>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() =>
            onSave({ templateId, templateName: chosen?.name ?? task.email?.templateName ?? "", audience, to, cc, greeting })
          }
          disabled={busy || !templateId || (audience === "custom" && !to.trim())}
          className="rounded bg-brand-lea px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50 dark:bg-brand-sweet dark:text-brand-lea"
        >
          Save email settings
        </button>
        {task.email ? (
          <button
            onClick={onClear}
            disabled={busy}
            className="rounded border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            Turn off the email
          </button>
        ) : null}
      </div>
    </div>
  );
}
