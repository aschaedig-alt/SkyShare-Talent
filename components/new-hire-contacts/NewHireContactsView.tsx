"use client";

import { useMemo, useState } from "react";
import { Check, Mail, Phone, Plus, UserPlus } from "lucide-react";
import { clsx } from "clsx";
import type { ResolvedGroup } from "@/lib/data/new-hire-contacts";

type ViewContact = {
  key: string;
  fullName: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  isShared: boolean;
};

type ViewGroup = { id: string; label: string; contacts: ViewContact[] };

// Trigger the phone's native contact importer by pointing the browser at the
// vCard endpoint. The OS intercepts the text/vcard response (iOS shows an
// "Add Contact(s)" sheet; Android hands off to Contacts / downloads the .vcf).
//
// The share token from the page URL is forwarded: the vCard endpoint checks it
// independently of the page, so an "Add" that dropped it would 404.
function addContacts(keys: string[], name: string, token: string) {
  if (keys.length === 0) return;
  const params = new URLSearchParams({ keys: keys.join(","), name, t: token });
  window.location.assign(`/api/contacts/vcard?${params.toString()}`);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export function NewHireContactsView({
  intro,
  groups,
  token
}: {
  intro: string;
  groups: ResolvedGroup[];
  token: string;
}) {
  const viewGroups = groups as ViewGroup[];
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allKeys = useMemo(() => viewGroups.flatMap((g) => g.contacts.map((c) => c.key)), [viewGroups]);
  const totalContacts = allKeys.length;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (totalContacts === 0) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Contacts coming soon</h1>
        <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">
          Your SkyShare contacts haven’t been set up yet. Check back shortly.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-8 sm:px-6">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-gold">Welcome to SkyShare</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-lea dark:text-slate-100">Your key contacts</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-brand-grey dark:text-slate-400">{intro}</p>
      </header>

      <button
        type="button"
        onClick={() => addContacts(allKeys, "skyshare-all-contacts", token)}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded bg-brand-lea px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-eden"
      >
        <UserPlus className="h-4 w-4" />
        Add all {totalContacts} contacts
      </button>
      <p className="mt-2 text-center text-xs text-brand-grey/80 dark:text-slate-500">
        Add a whole department, or tap individual people below. Adding several at once? Your phone saves a
        contacts file — open it and choose “Add All Contacts.”
      </p>

      <div className="mt-8 space-y-8">
        {viewGroups.map((group) => {
          const groupKeys = group.contacts.map((c) => c.key);
          return (
            <section key={group.id}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-brand-lea dark:text-slate-200">
                  {group.label}
                </h2>
                <button
                  type="button"
                  onClick={() => addContacts(groupKeys, `skyshare-${group.id}`, token)}
                  className="rounded border border-brand-lea/20 px-2.5 py-1 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100"
                >
                  Add all {group.label}
                </button>
              </div>

              <ul className="mt-3 space-y-2">
                {group.contacts.map((contact) => {
                  const isSelected = selected.has(contact.key);
                  return (
                    <li
                      key={contact.key}
                      className={clsx(
                        "flex items-center gap-3 rounded bg-white p-3 shadow-panel ring-1 transition dark:bg-brand-panel",
                        isSelected ? "ring-brand-gold" : "ring-brand-lea/10 dark:ring-white/10"
                      )}
                    >
                      <button
                        type="button"
                        aria-label={isSelected ? `Deselect ${contact.fullName}` : `Select ${contact.fullName}`}
                        onClick={() => toggle(contact.key)}
                        className={clsx(
                          "flex h-6 w-6 flex-none items-center justify-center rounded border transition",
                          isSelected
                            ? "border-brand-gold bg-brand-gold text-brand-lea"
                            : "border-brand-lea/25 text-transparent hover:border-brand-gold dark:border-white/20"
                        )}
                      >
                        <Check className="h-4 w-4" />
                      </button>

                      <div
                        className={clsx(
                          "flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-semibold",
                          contact.isShared
                            ? "bg-brand-gold/20 text-brand-lea dark:text-slate-100"
                            : "bg-brand-cloudDancer text-brand-grey dark:bg-white/10 dark:text-slate-300"
                        )}
                      >
                        {contact.isShared ? "SS" : initials(contact.fullName)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">
                          {contact.fullName}
                        </p>
                        {contact.title ? (
                          <p className="truncate text-xs text-brand-grey dark:text-slate-400">{contact.title}</p>
                        ) : null}
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-brand-grey dark:text-slate-400">
                          {contact.phone ? (
                            <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 hover:text-brand-lea">
                              <Phone className="h-3 w-3" />
                              {contact.phone}
                            </a>
                          ) : null}
                          {contact.email ? (
                            <a
                              href={`mailto:${contact.email}`}
                              className="inline-flex items-center gap-1 truncate hover:text-brand-lea"
                            >
                              <Mail className="h-3 w-3" />
                              <span className="truncate">{contact.email}</span>
                            </a>
                          ) : null}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => addContacts([contact.key], `skyshare-${contact.fullName}`, token)}
                        className="flex flex-none items-center gap-1 rounded bg-brand-gold px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-sweet dark:text-slate-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-brand-lea/10 bg-white/95 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-brand-panel/95">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400"
            >
              Clear ({selected.size})
            </button>
            <button
              type="button"
              onClick={() => addContacts(Array.from(selected), "skyshare-selected-contacts", token)}
              className="flex items-center gap-2 rounded bg-brand-lea px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-eden"
            >
              <UserPlus className="h-4 w-4" />
              Add {selected.size} selected
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
