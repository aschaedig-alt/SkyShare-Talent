"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plane, Megaphone, Tags, X, Plus } from "lucide-react";
import { setRequirementFleetPosition } from "@/app/pilot-requirements/scoring-actions";
import { FLEET_POSITIONS } from "@/lib/fleet/positions";

export function FleetPositionEditor({
  requirementId,
  currentSlug,
  currentAdvertised,
  currentAircraftTypes,
  rawTitle
}: {
  requirementId: string;
  currentSlug: string | null;
  currentAdvertised: string | null;
  currentAircraftTypes: string[];
  rawTitle: string | null;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(currentSlug ?? "");
  const [advertised, setAdvertised] = useState(currentAdvertised ?? "");
  const [tags, setTags] = useState<string[]>(currentAircraftTypes);
  const [newTag, setNewTag] = useState("");
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  function addTag() {
    const value = newTag.trim();
    if (value && !tags.includes(value)) setTags((current) => [...current, value]);
    setNewTag("");
  }

  function removeTag(tag: string) {
    setTags((current) => current.filter((t) => t !== tag));
  }

  function save() {
    setNotice(null);
    start(async () => {
      const res = await setRequirementFleetPosition({
        requirementId,
        fleetPositionSlug: slug || null,
        advertisedTitle: advertised || null,
        aircraftTypes: tags
      });
      setNotice(res.ok ? "Saved." : res.error ?? "Could not save.");
      if (res.ok) router.refresh();
    });
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Identity</p>
      <h3 className="text-base font-semibold text-brand-lea">Fleet position &amp; advertised name</h3>
      <p className="mt-1 text-xs text-brand-grey">
        The fleet position is the internal name shown across the app. The advertised name is what goes on the public
        job post (e.g. internal “M2 Captain”, advertised “CE-525 Captain”).
      </p>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-grey">
          <Plane className="h-3.5 w-3.5" /> Fleet position
        </span>
        <select
          value={slug}
          disabled={pending}
          onChange={(event) => setSlug(event.target.value)}
          className="w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold disabled:opacity-60"
        >
          <option value="">— Auto (match from title) —</option>
          {FLEET_POSITIONS.map((position) => (
            <option key={position.slug} value={position.slug}>
              {position.title}
              {position.status === "Archived" ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-grey">
          <Megaphone className="h-3.5 w-3.5" /> Advertised name
        </span>
        <input
          value={advertised}
          disabled={pending}
          onChange={(event) => setAdvertised(event.target.value)}
          placeholder={rawTitle ? `e.g. ${rawTitle}` : "e.g. CE-525 Captain"}
          className="w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold disabled:opacity-60"
        />
      </label>

      <div className="mt-3">
        <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-grey">
          <Tags className="h-3.5 w-3.5" /> Aircraft tags
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.length === 0 ? <span className="text-xs text-brand-grey">No tags</span> : null}
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded bg-brand-sweet/20 px-2 py-0.5 text-[11px] font-semibold text-brand-lea"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                disabled={pending}
                aria-label={`Remove ${tag}`}
                className="rounded text-brand-grey transition hover:text-value-customerFocus-dark disabled:opacity-60"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newTag}
            disabled={pending}
            onChange={(event) => setNewTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag();
              }
            }}
            placeholder="Add an aircraft tag (e.g. Citation CJ2)"
            className="min-w-0 flex-1 rounded border border-brand-lea/20 bg-white px-3 py-1.5 text-sm text-brand-black outline-none transition focus:border-brand-gold disabled:opacity-60"
          />
          <button
            type="button"
            onClick={addTag}
            disabled={pending || !newTag.trim()}
            className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-2.5 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded bg-brand-lea px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {notice ? <span className="text-xs text-brand-grey">{notice}</span> : null}
      </div>
    </section>
  );
}
