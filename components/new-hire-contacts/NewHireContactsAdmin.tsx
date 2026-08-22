"use client";

import { useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, ChevronUp, Copy, ExternalLink, Eye, EyeOff, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { clsx } from "clsx";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import { ContactPicker } from "@/components/new-hire-contacts/ContactPicker";
import { slugify } from "@/lib/new-hire-contacts/config";
import type { ContactGroup, ContactMember, ManualContact, NewHireContactsConfig } from "@/lib/new-hire-contacts/config";
import type { ContactCandidate } from "@/lib/data/new-hire-contacts";

type SaveState = "idle" | "saving" | "saved" | "error";

// Field-value semantics shared with the resolver:
//   null  → fall back to the employee record
//   ""    → explicitly share nothing (e.g. hide a personal cell)
//   text  → override value
function fieldText(value: string | null | undefined): string {
  return value && value !== "" ? value : "";
}
function isHidden(value: string | null | undefined): boolean {
  return value === "";
}

/** Show/hide switch. Off keeps the contact curated but drops them from /welcome. */
function VisibilityToggle({ enabled, onChange }: { enabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      title={enabled ? "Shown to new hires — click to hide" : "Hidden from new hires — click to show"}
      className={clsx(
        "inline-flex flex-none items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition",
        enabled
          ? "bg-brand-gold/15 text-brand-lea hover:bg-brand-gold/25 dark:text-slate-100"
          : "bg-brand-cloudDancer text-brand-grey hover:bg-brand-cloudDancer/70 dark:bg-white/5 dark:text-slate-400"
      )}
    >
      {enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      {enabled ? "Shown" : "Hidden"}
    </button>
  );
}

export function NewHireContactsAdmin({
  initialConfig,
  candidates,
  shareUrl
}: {
  initialConfig: NewHireContactsConfig;
  candidates: ContactCandidate[];
  shareUrl: string;
}) {
  const [config, setConfig] = useState<NewHireContactsConfig>(initialConfig);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // The link carries the share token, so rotating replaces it in place rather
  // than needing a page reload to show the new one.
  const [liveShareUrl, setLiveShareUrl] = useState(shareUrl);
  // Two-step rather than a modal: rotating cuts off every link already sent, so
  // it should not be one stray click away.
  const [rotateArmed, setRotateArmed] = useState(false);
  // Sticky until the page is left. Rotating no longer breaks the app's own sends —
  // the Send-contacts button injects the current link every time — but it does
  // break links already delivered, and the copy pasted inside the Front template
  // for anyone who sends it straight from Front.
  const [justRotated, setJustRotated] = useState(false);
  const [rotating, setRotating] = useState(false);
  const newGroupCounter = useRef(0);
  const manualCounter = useRef(0);

  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const shownCount = useMemo(
    () =>
      config.groups.reduce(
        (sum, g) =>
          sum + g.members.filter((m) => m.enabled).length + g.manual.filter((m) => m.enabled).length,
        0
      ),
    [config]
  );
  const totalCount = useMemo(
    () => config.groups.reduce((sum, g) => sum + g.members.length + g.manual.length, 0),
    [config]
  );

  // --- mutation helpers ---------------------------------------------------
  const updateGroup = (index: number, patch: Partial<ContactGroup>) =>
    setConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) => (i === index ? { ...g, ...patch } : g))
    }));

  const updateMember = (groupIndex: number, memberIndex: number, patch: Partial<ContactMember>) =>
    setConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIndex
          ? { ...g, members: g.members.map((m, mi) => (mi === memberIndex ? { ...m, ...patch } : m)) }
          : g
      )
    }));

  const updateManual = (groupIndex: number, manualIndex: number, patch: Partial<ManualContact>) =>
    setConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIndex
          ? { ...g, manual: g.manual.map((m, mi) => (mi === manualIndex ? { ...m, ...patch } : m)) }
          : g
      )
    }));

  const addGroup = () => {
    newGroupCounter.current += 1;
    setConfig((prev) => ({
      ...prev,
      groups: [
        ...prev.groups,
        { id: `new-${newGroupCounter.current}`, label: "New department", manual: [], members: [] }
      ]
    }));
  };

  const removeGroup = (index: number) =>
    setConfig((prev) => ({ ...prev, groups: prev.groups.filter((_, i) => i !== index) }));

  // Reorder a department card. The config stores groups as an ordered array and
  // the public /welcome page renders in that same order, so swapping positions
  // here is all that's needed — save persists the new order.
  const moveGroup = (index: number, dir: -1 | 1) =>
    setConfig((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.groups.length) return prev;
      const groups = [...prev.groups];
      [groups[index], groups[target]] = [groups[target], groups[index]];
      return { ...prev, groups };
    });

  const addMember = (groupIndex: number, personId: string) => {
    if (!personId) return;
    setConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIndex && !g.members.some((m) => m.personId === personId)
          ? { ...g, members: [...g.members, { personId, title: null, phone: null, email: null, enabled: true }] }
          : g
      )
    }));
  };

  const removeMember = (groupIndex: number, memberIndex: number) =>
    setConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIndex ? { ...g, members: g.members.filter((_, mi) => mi !== memberIndex) } : g
      )
    }));

  // A contact with no employee record: either a department line, or a person the
  // app doesn't know yet. The id only has to be unique within the group.
  const addManual = (groupIndex: number, kind: ManualContact["kind"], name: string) => {
    manualCounter.current += 1;
    const id = `${slugify(name, "contact")}-${manualCounter.current}`;
    setConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIndex
          ? { ...g, manual: [...g.manual, { id, kind, name, title: null, phone: null, email: null, enabled: true }] }
          : g
      )
    }));
  };

  const removeManual = (groupIndex: number, manualIndex: number) =>
    setConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIndex ? { ...g, manual: g.manual.filter((_, mi) => mi !== manualIndex) } : g
      )
    }));

  // --- save ---------------------------------------------------------------
  const save = async () => {
    setSaveState("saving");
    setSyncMsg(null);
    try {
      const res = await fetch("/api/workspace-settings/new-hire-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      if (!res.ok) throw new Error("save failed");
      const data = (await res.json()) as {
        config: NewHireContactsConfig;
        synced: { personId: string; name: string; fields: string[] }[];
      };
      setConfig(data.config);
      if (data.synced.length) {
        const who = data.synced.map((s) => `${s.name} (${s.fields.join(" & ")})`).join(", ");
        setSyncMsg(`Updated ${data.synced.length} employee profile${data.synced.length === 1 ? "" : "s"}: ${who}`);
      }
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(liveShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const rotateLink = async () => {
    setRotating(true);
    try {
      const res = await fetch("/api/workspace-settings/new-hire-contacts/share-token", { method: "POST" });
      if (!res.ok) throw new Error("rotate failed");
      const data = (await res.json()) as { shareUrl: string };
      setLiveShareUrl(data.shareUrl);
      setRotateArmed(false);
      // Sending from the new-hire checklist is safe — that path fetches the
      // template from Front and replaces its link with the live one, so it cannot
      // ship a dead token. What rotating DOES break is every link already
      // delivered, plus the copy pasted in the template for anyone who composes
      // from Front by hand. Both are worth saying at the moment of rotation
      // rather than depending on somebody remembering afterwards.
      setJustRotated(true);
    } catch {
      /* leave the old link on screen — it is still the working one */
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold">People</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-brand-lea dark:text-slate-100">
          <UserPlus className="h-6 w-6" />
          New hire contacts
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
          This is your master list of department contacts. Keep anyone you like on it, then use the Shown/Hidden switch to
          choose who this round of new hires actually sees. Only shown contacts appear on the link — never the whole directory.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="max-w-full break-all rounded bg-brand-cloudDancer px-3 py-2 text-xs text-brand-lea dark:bg-white/5 dark:text-slate-200">
            {liveShareUrl}
          </code>
          <Button variant="secondary" size="sm" onClick={copyLink}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <a
            href={liveShareUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-200"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Preview
          </a>
          <Badge tone={shownCount ? "brand" : "warning"} className="ml-auto">
            {shownCount} of {totalCount} shown to new hires
          </Badge>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-brand-grey dark:text-slate-400">
          This link is unguessable and works for anyone you send it to — no login needed. Treat it like a key: anyone
          who receives or forwards it can open your contact list. Rotate it if it ends up somewhere it shouldn’t.
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {rotateArmed ? (
            <>
              <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">
                Rotating stops every link you’ve already sent from working. Future sends from a new hire’s
                checklist are fine — they pick up the new link automatically. Sure?
              </span>
              <Button variant="secondary" size="sm" onClick={rotateLink} disabled={rotating}>
                {rotating ? "Rotating…" : "Yes, rotate it"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRotateArmed(false)} disabled={rotating}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setRotateArmed(true)}>
              <RefreshCw className="h-3.5 w-3.5" />
              Rotate link
            </Button>
          )}
        </div>

        {/* Stays on screen after rotating. Sending from a hire's checklist is now
            safe on its own, so this no longer demands a chore — but the people
            already holding the old link are affected, and that is the part nobody
            thinks of at the moment they click rotate. */}
        {justRotated ? (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/15">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Rotated — anyone holding the old link has lost it
            </p>
            <p className="mt-0.5 text-xs text-amber-900/80 dark:text-amber-200/80">
              The new link is above. Sends from a new hire’s checklist pick it up automatically, so there is
              nothing to update there. Two things to know: new hires who were already sent the old link will
              need it again, and if anyone composes the “SkyShare New Hire - Contacts Link” template straight
              from Front rather than from the checklist, the copy pasted in it is now dead.
            </p>
          </div>
        ) : null}
      </section>

      <div className="mt-6">
        <label className="text-sm font-semibold text-brand-lea dark:text-slate-100">Welcome message</label>
        <Textarea
          className="mt-2"
          rows={2}
          value={config.intro}
          onChange={(e) => setConfig((prev) => ({ ...prev, intro: e.target.value }))}
        />
      </div>

      <div className="mt-6 space-y-5">
        {config.groups.map((group, groupIndex) => {
          const available = candidates.filter((c) => !group.members.some((m) => m.personId === c.id));
          const groupShown =
            group.members.filter((m) => m.enabled).length + group.manual.filter((m) => m.enabled).length;
          return (
            <section
              key={group.id}
              className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10"
            >
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => moveGroup(groupIndex, -1)}
                    disabled={groupIndex === 0}
                    aria-label={`Move ${group.label} up`}
                    title="Move up"
                    className="rounded p-0.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-white/10"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveGroup(groupIndex, 1)}
                    disabled={groupIndex === config.groups.length - 1}
                    aria-label={`Move ${group.label} down`}
                    title="Move down"
                    className="rounded p-0.5 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-white/10"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <Input
                  className="max-w-xs font-semibold"
                  value={group.label}
                  onChange={(e) => updateGroup(groupIndex, { label: e.target.value })}
                />
                <span className="text-xs text-brand-grey dark:text-slate-400">
                  {groupShown} shown
                </span>
                <button
                  type="button"
                  onClick={() => removeGroup(groupIndex)}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-grey hover:text-red-600 dark:hover:text-red-300 dark:text-slate-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>

              {/* Contacts with no employee record — department lines and ad-hoc people */}
              {group.manual.length ? (
                <ul className="mt-4 space-y-3">
                  {group.manual.map((entry, manualIndex) => (
                    <li
                      key={entry.id}
                      className={clsx(
                        "rounded border border-dashed p-3 transition",
                        entry.enabled
                          ? "border-brand-lea/20 dark:border-white/10"
                          : "border-brand-lea/10 bg-brand-cloudDancer/20 dark:border-white/5 dark:bg-white/[0.02]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                          {entry.kind === "department" ? (
                            <Building2 className="h-3.5 w-3.5" />
                          ) : (
                            <UserPlus className="h-3.5 w-3.5" />
                          )}
                          {entry.kind === "department" ? "Shared department contact" : "Added manually"}
                        </p>
                        <div className="flex items-center gap-2">
                          <VisibilityToggle
                            enabled={entry.enabled}
                            onChange={(next) => updateManual(groupIndex, manualIndex, { enabled: next })}
                          />
                          <button
                            type="button"
                            onClick={() => removeManual(groupIndex, manualIndex)}
                            aria-label={`Remove ${entry.name}`}
                            className="text-xs font-semibold text-brand-grey hover:text-red-600 dark:hover:text-red-300 dark:text-slate-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <Input
                          placeholder={entry.kind === "department" ? `SkyShare ${group.label}` : "Full name"}
                          value={entry.name}
                          onChange={(e) => updateManual(groupIndex, manualIndex, { name: e.target.value })}
                        />
                        <Input
                          placeholder="Title (optional)"
                          value={fieldText(entry.title)}
                          onChange={(e) => updateManual(groupIndex, manualIndex, { title: e.target.value || null })}
                        />
                        <Input
                          placeholder="Phone"
                          value={fieldText(entry.phone)}
                          onChange={(e) => updateManual(groupIndex, manualIndex, { phone: e.target.value || null })}
                        />
                        <Input
                          placeholder="Email"
                          value={fieldText(entry.email)}
                          onChange={(e) => updateManual(groupIndex, manualIndex, { email: e.target.value || null })}
                        />
                      </div>
                      {!entry.name.trim() ? (
                        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                          Give this contact a name — unnamed contacts are dropped when you save.
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Members drawn from the employee roster */}
              <ul className="mt-4 space-y-3">
                {group.members.map((member, memberIndex) => {
                  const record = candidateById.get(member.personId);
                  return (
                    <li
                      key={member.personId}
                      className={clsx(
                        "rounded border p-3 transition",
                        member.enabled
                          ? "border-brand-lea/10 dark:border-white/10"
                          : "border-brand-lea/5 bg-brand-cloudDancer/20 dark:border-white/5 dark:bg-white/[0.02]"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
                            <span className="truncate">{record?.name ?? "Employee no longer on file"}</span>
                            {record && !record.isCurrent ? <Badge tone="neutral">Former employee</Badge> : null}
                            {!record ? <Badge tone="danger">Record deleted</Badge> : null}
                          </p>
                          {record?.position ? (
                            <p className="truncate text-xs text-brand-grey dark:text-slate-400">{record.position}</p>
                          ) : null}
                          {!record ? (
                            <p className="text-xs text-brand-grey dark:text-slate-400">
                              This person’s employee record is gone, so they no longer appear to new hires. Remove them here.
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-none items-center gap-2">
                          <VisibilityToggle
                            enabled={member.enabled}
                            onChange={(next) => updateMember(groupIndex, memberIndex, { enabled: next })}
                          />
                          <button
                            type="button"
                            onClick={() => removeMember(groupIndex, memberIndex)}
                            aria-label={`Remove ${record?.name ?? "contact"}`}
                            className="text-xs font-semibold text-brand-grey hover:text-red-600 dark:hover:text-red-300 dark:text-slate-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <div>
                          <label className="text-xs text-brand-grey dark:text-slate-400">Title</label>
                          <Input
                            className="mt-1"
                            placeholder={record?.position ?? "Title"}
                            value={fieldText(member.title)}
                            onChange={(e) => updateMember(groupIndex, memberIndex, { title: e.target.value || null })}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-brand-grey dark:text-slate-400">Phone</label>
                          <Input
                            className="mt-1"
                            disabled={isHidden(member.phone)}
                            placeholder={record?.phone ?? "No number on file"}
                            value={fieldText(member.phone)}
                            onChange={(e) => updateMember(groupIndex, memberIndex, { phone: e.target.value || null })}
                          />
                          <label className="mt-1 flex items-center gap-1.5 text-xs text-brand-grey dark:text-slate-400">
                            <input
                              type="checkbox"
                              checked={isHidden(member.phone)}
                              onChange={(e) => updateMember(groupIndex, memberIndex, { phone: e.target.checked ? "" : null })}
                            />
                            Don’t share a number
                          </label>
                        </div>
                        <div>
                          <label className="text-xs text-brand-grey dark:text-slate-400">Email</label>
                          <Input
                            className="mt-1"
                            disabled={isHidden(member.email)}
                            placeholder={record?.ssEmail ?? "No email on file"}
                            value={fieldText(member.email)}
                            onChange={(e) => updateMember(groupIndex, memberIndex, { email: e.target.value || null })}
                          />
                          <label className="mt-1 flex items-center gap-1.5 text-xs text-brand-grey dark:text-slate-400">
                            <input
                              type="checkbox"
                              checked={isHidden(member.email)}
                              onChange={(e) => updateMember(groupIndex, memberIndex, { email: e.target.checked ? "" : null })}
                            />
                            Don’t share an email
                          </label>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Add person */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <ContactPicker
                  candidates={available}
                  onPick={(personId) => addMember(groupIndex, personId)}
                  onAddManual={(name) => addManual(groupIndex, "person", name)}
                />
                <button
                  type="button"
                  onClick={() => addManual(groupIndex, "department", `SkyShare ${group.label}`)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add a shared “SkyShare {group.label}” contact
                </button>
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-brand-grey dark:text-slate-400">
        Tip: a phone or email you type on a roster person is also saved to their employee profile when you hit Save. Leaving a
        field blank keeps their profile value; “Don’t share” only hides it here and never changes their profile. Manually added
        contacts are stored on this page only and never touch an employee record.
      </p>

      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={addGroup}>
          <Plus className="h-3.5 w-3.5" />
          Add department
        </Button>
        <div className="ml-auto flex items-center gap-3">
          {saveState === "saved" ? <span className="text-xs font-semibold text-emerald-600">Saved</span> : null}
          {saveState === "error" ? <span className="text-xs font-semibold text-red-600 dark:text-red-400">Couldn’t save — try again</span> : null}
          <Button onClick={save} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
      {syncMsg ? (
        <p className="mt-2 text-right text-xs font-medium text-brand-eden dark:text-brand-gold">{syncMsg}</p>
      ) : null}
    </div>
  );
}
