"use client";

import { useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui";
import { TemplateEmailDialog, type TemplateEmailLoadResult } from "@/components/shared/TemplateEmailDialog";
import {
  getReimbursementEmailStatus,
  previewReimbursementEmail,
  saveReimbursementTemplate,
  sendReimbursementEmail
} from "@/app/travel/actions";
import type { FrontTemplateSummary } from "@/lib/front/templates";
import type { ReimbursementSendRecord } from "@/lib/front/travel-reimbursement-email";
import { formatMomentDateShort } from "@/lib/dates/display";

// "Are you still owed any reimbursements?" — the button half of the feature she
// asked for on /travel, 2026-09-10: "id like to have a click to send email (front
// template) to send to people just asking if they are still owed any
// reimbursements. as always it needs to be editable. i havent make the template
// yet but i will so lets build this part."
//
// Two things in that sentence decide the whole shape of this file.
//
// "as always it needs to be editable" — the body is editable for THIS SEND ONLY.
// That is not implemented here; it is TemplateEmailDialog's job, and the greeting
// is rendered outside the editable region there so an edited body can never carry
// somebody else's name. This file just must not defeat it, which it does by never
// holding the body itself.
//
// "i havent make the template yet but i will" — so the template is PICKED IN THIS
// WINDOW, not compiled in. The picker below writes a WorkspaceSetting through
// saveReimbursementTemplate, which means the day she writes the template in Front
// it appears in the list and this works with no deploy. Hard-coding an rsp_ id
// would have shipped her a button that could not run until somebody edited a
// source file.
//
// IT DOES NOT MOVE THE REIMBURSEMENT STAGE. NOT_STARTED / SUBMITTED /
// TRAVELER_TOLD / PAYMENT_CONFIRMED / TRAVELER_CONFIRMED — asking whether anything
// is still outstanding is none of those. The send is recorded and shown as
// "Asked <date>"; the stage stays hers.

/** The mailbox every automated send in this app goes out from, and where a test
 *  lands. Spelled out rather than imported: lib/front/config.ts pulls in Prisma,
 *  so it cannot cross into a client component — the same literal is written out
 *  in components/people/SendTaskEmailButton.tsx for the same reason. */
const HRO_MAILBOX = "hrotasks@skyshare.com";

/**
 * Which Front template this email sends.
 *
 * The three graceful-degradation behaviors here are copied from
 * components/people/ChecklistManagePanel.tsx deliberately, because each one is a
 * failure somebody actually hit: the select is disabled and says "Loading from
 * Front…" until the list arrives; a failed load shows Front's own message and
 * LEAVES THE PICKER ON SCREEN (the commonest reason the preview failed is that no
 * template is picked, and this is the control that fixes it); and a saved template
 * the live list no longer has is still offered, marked "(not found in Front)", so
 * a rename in Front does not silently reset the box to "Choose a template".
 */
function ReimbursementTemplatePicker({
  saved,
  onChanged
}: {
  saved: { templateId: string; templateName: string } | null;
  onChanged: () => void;
}) {
  const [templates, setTemplates] = useState<FrontTemplateSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  async function choose(templateId: string) {
    if (!templateId || templateId === saved?.templateId) return;
    const name = templates?.find((t) => t.id === templateId)?.name ?? templateId;
    setSaving(true);
    const res = await saveReimbursementTemplate(templateId, name);
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error ?? "Could not save the template choice.");
      return;
    }
    setSaveError(null);
    // Rebuild the preview against the template just chosen. The dialog throws any
    // edited wording away on reload, which is right: an edit belongs to the
    // template it was written against.
    onChanged();
  }

  const missingFromFront = saved && templates && !templates.some((t) => t.id === saved.templateId);

  return (
    <div className="rounded border border-brand-lea/15 bg-brand-cloudDancer/25 p-3 dark:border-white/10 dark:bg-white/5">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold">Which Front template</p>
      <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
        Pick it once and it is remembered for every trip. The wording is read live from Front each time this window
        opens, so editing the template in Front is all it takes to change what goes out. If the one you want is not in
        this list, write it in Front and reopen this window &mdash; nothing here needs to be redeployed.
      </p>

      {loadError ? (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {loadError}
        </p>
      ) : null}

      {saveError ? (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {saveError}
        </p>
      ) : null}

      <label className="mt-2 block text-xs font-semibold text-brand-grey dark:text-slate-400">
        Front template
        <select
          value={saved?.templateId ?? ""}
          onChange={(e) => void choose(e.target.value)}
          disabled={!templates || saving}
          className="mt-1 block w-full rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-sm font-normal text-brand-black disabled:opacity-60 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
        >
          <option value="">{templates ? "Choose a template…" : "Loading from Front…"}</option>
          {missingFromFront ? (
            <option value={saved.templateId}>{saved.templateName} (not found in Front)</option>
          ) : null}
          {templates?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      {saving ? <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">Saving the choice&hellip;</p> : null}
    </div>
  );
}

export function SendReimbursementEmailButton({
  tripId,
  variant = "secondary",
  size = "sm",
  className
}: {
  tripId: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [sent, setSent] = useState<ReimbursementSendRecord | null>(null);
  const [savedTemplate, setSavedTemplate] = useState<{ templateId: string; templateName: string } | null>(null);
  // Bumped after a real send so the "Asked …" line refreshes without a reload.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    getReimbursementEmailStatus(tripId)
      .then((res) => {
        if (!live || !res.ok) return;
        setSent(res.sent ?? null);
      })
      .catch(() => {
        // A status read that fails costs the "Asked …" line and nothing else. The
        // dialog does its own load and reports its own errors, so shouting here
        // would be a second error about the same outage.
      });
    return () => {
      live = false;
    };
  }, [tripId, reloadKey]);

  async function load(): Promise<TemplateEmailLoadResult> {
    const res = await previewReimbursementEmail(tripId);
    // Set even on failure — "no template picked yet" IS a failure, and the picker
    // needs to know what is currently saved in order to preselect it.
    setSavedTemplate(res.template ?? null);

    if (!res.ok || !res.preview) {
      return { ok: false, error: res.error ?? "Could not build this email." };
    }

    const p = res.preview;
    const already = res.alreadySent ?? null;
    const warnings: string[] = [];

    if (p.fellBack) {
      warnings.push(
        `There is no SkyShare address on file for ${res.travelerName ?? "this traveler"}, so this is going to their personal email.`
      );
    }
    // A send made outside production was rewritten to the test inbox by the send
    // guard, but the record still names the address it was ADDRESSED to. Without
    // this line "Already sent to …" would read as delivered.
    if (already?.mode && already.mode !== "production") {
      warnings.push(
        `The earlier send ran outside production (mode "${already.mode}"), so it may have been redirected to the test inbox rather than delivered to ${already.to}.`
      );
    }

    return {
      ok: true,
      preview: {
        to: p.to,
        toNote: p.toSource === "company" ? "their SkyShare email" : "their personal email",
        cc: p.cc,
        fromLabel: `${HRO_MAILBOX} — SkyShare HR Onboarding`,
        subject: p.subject,
        templateName: p.templateName,
        greetingHtml: p.greetingHtml,
        bodyHtml: p.bodyHtml,
        firstName: p.firstName,
        notes: res.owedNote ? [res.owedNote] : undefined,
        warnings: warnings.length ? warnings : undefined
      },
      alreadySent: already
        ? { to: already.to, sentAt: already.sentAt, sentBy: already.sentBy, edited: already.edited }
        : null
    };
  }

  return (
    <span className={className}>
      <TemplateEmailDialog
        title="Ask about reimbursements"
        subtitle="Asks the traveler whether anything from this trip is still owed to them. It does not quote an amount, and it does not move the reimbursement stage."
        trigger={(open) => (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <Button variant={variant} size={size} onClick={open}>
              <Mail className="h-4 w-4" />
              Ask about reimbursements
            </Button>
            {sent ? (
              <span
                className="text-[11px] text-brand-grey dark:text-slate-400"
                title={`Sent to ${sent.to}${sent.sentBy ? ` by ${sent.sentBy}` : ""}${sent.edited ? ", with the wording edited" : ""}`}
              >
                Asked {formatMomentDateShort(sent.sentAt)}
              </span>
            ) : null}
          </span>
        )}
        aside={(reload) => <ReimbursementTemplatePicker saved={savedTemplate} onChanged={reload} />}
        load={load}
        send={(bodyOverride, opts) => sendReimbursementEmail(tripId, bodyOverride, opts)}
        testAddress={HRO_MAILBOX}
        bodyNote="This wording is used for this one send. The template in Front is not changed, and the greeting above stays as it is."
        sendDisabled={!savedTemplate}
        sendDisabledReason="Pick a Front template above before sending."
        successNote="The reimbursement stage was left where it was — set it yourself once you hear back."
        onSent={() => setReloadKey((k) => k + 1)}
      />
    </span>
  );
}
