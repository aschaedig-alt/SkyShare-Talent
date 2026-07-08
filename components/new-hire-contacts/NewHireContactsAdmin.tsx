"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Plus, Trash2, UserPlus } from "lucide-react";
import { Button, Input, Textarea } from "@/components/ui";
import type { ContactGroup, ContactMember, NewHireContactsConfig, SharedContact } from "@/lib/new-hire-contacts/config";
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
  const [copied, setCopied] = useState(false);
  const newGroupCounter = useRef(0);

  const candidateById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

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

  const addGroup = () => {
    newGroupCounter.current += 1;
    setConfig((prev) => ({
      ...prev,
      groups: [...prev.groups, { id: `new-${newGroupCounter.current}`, label: "New department", shared: null, members: [] }]
    }));
  };

  const removeGroup = (index: number) =>
    setConfig((prev) => ({ ...prev, groups: prev.groups.filter((_, i) => i !== index) }));

  const addMember = (groupIndex: number, personId: string) => {
    if (!personId) return;
    setConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIndex && !g.members.some((m) => m.personId === personId)
          ? { ...g, members: [...g.members, { personId, title: null, phone: null, email: null }] }
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

  const setShared = (groupIndex: number, shared: SharedContact | null) => updateGroup(groupIndex, { shared });
  const updateShared = (groupIndex: number, patch: Partial<SharedContact>) =>
    setConfig((prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIndex && g.shared ? { ...g, shared: { ...g.shared, ...patch } } : g
      )
    }));

  // --- save ---------------------------------------------------------------
  const save = async () => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/workspace-settings/new-hire-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      if (!res.ok) throw new Error("save failed");
      const saved = (await res.json()) as NewHireContactsConfig;
      setConfig(saved);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — no-op */
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
          Pick which people a new hire can add to their phone, grouped by department. Only these people are shared —
          never the whole directory. Send new hires the link below.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code className="rounded bg-brand-cloudDancer px-3 py-2 text-xs text-brand-lea dark:bg-white/5 dark:text-slate-200">
            {shareUrl}
          </code>
          <Button variant="secondary" size="sm" onClick={copyLink}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <a href="/welcome" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-200">
            <ExternalLink className="h-3.5 w-3.5" />
            Preview
          </a>
        </div>
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
          return (
            <section
              key={group.id}
              className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10"
            >
              <div className="flex items-center gap-2">
                <Input
                  className="max-w-xs font-semibold"
                  value={group.label}
                  onChange={(e) => updateGroup(groupIndex, { label: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeGroup(groupIndex)}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-grey hover:text-red-600 dark:text-slate-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>

              {/* Shared department contact */}
              <div className="mt-4 rounded border border-dashed border-brand-lea/20 p-3 dark:border-white/10">
                {group.shared ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                        Shared department contact
                      </p>
                      <button
                        type="button"
                        onClick={() => setShared(groupIndex, null)}
                        className="text-xs font-semibold text-brand-grey hover:text-red-600 dark:text-slate-400"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        placeholder={`SkyShare ${group.label}`}
                        value={group.shared.name}
                        onChange={(e) => updateShared(groupIndex, { name: e.target.value })}
                      />
                      <Input
                        placeholder="Title (optional)"
                        value={fieldText(group.shared.title)}
                        onChange={(e) => updateShared(groupIndex, { title: e.target.value || null })}
                      />
                      <Input
                        placeholder="Phone"
                        value={fieldText(group.shared.phone)}
                        onChange={(e) => updateShared(groupIndex, { phone: e.target.value || null })}
                      />
                      <Input
                        placeholder="Email"
                        value={fieldText(group.shared.email)}
                        onChange={(e) => updateShared(groupIndex, { email: e.target.value || null })}
                      />
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShared(groupIndex, { name: `SkyShare ${group.label}`, title: null, phone: null, email: null })}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-200"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add a shared “SkyShare {group.label}” contact
                  </button>
                )}
              </div>

              {/* Members */}
              <ul className="mt-4 space-y-3">
                {group.members.map((member, memberIndex) => {
                  const record = candidateById.get(member.personId);
                  return (
                    <li key={member.personId} className="rounded border border-brand-lea/10 p-3 dark:border-white/10">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                            {record?.name ?? "Unknown employee"}
                          </p>
                          {record?.position ? (
                            <p className="text-xs text-brand-grey dark:text-slate-400">{record.position}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMember(groupIndex, memberIndex)}
                          className="text-xs font-semibold text-brand-grey hover:text-red-600 dark:text-slate-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
              <div className="mt-3">
                <select
                  className="w-full max-w-sm rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
                  value=""
                  onChange={(e) => {
                    addMember(groupIndex, e.target.value);
                    e.target.value = "";
                  }}
                >
                  <option value="">+ Add a person…</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.position ? ` — ${c.position}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={addGroup}>
          <Plus className="h-3.5 w-3.5" />
          Add department
        </Button>
        <div className="ml-auto flex items-center gap-3">
          {saveState === "saved" ? <span className="text-xs font-semibold text-emerald-600">Saved</span> : null}
          {saveState === "error" ? <span className="text-xs font-semibold text-red-600">Couldn’t save — try again</span> : null}
          <Button onClick={save} disabled={saveState === "saving"}>
            {saveState === "saving" ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
