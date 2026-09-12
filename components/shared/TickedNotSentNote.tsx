// "This step is ticked, but this app has never emailed it."
//
// Shown in a send dialog when the checklist says done and the send log has no
// record. One component so all four dialogs word it the same way, and so the
// wording stays careful: a ticked step with no send is NORMAL and often correct —
// she does the PRD request to ITS by hand, and that should tick the step. The note
// exists to stop the app taking credit for it, not to flag a mistake.
//
// Deliberately NOT amber. Amber in these dialogs means "careful, this could go
// wrong" — a duplicate send, a redirected test, a fallback address. This is
// neutral information about what already happened, and dressing it as a warning
// would train people to ignore the real ones.
export function TickedNotSentNote({ what = "this step" }: { what?: string }) {
  return (
    <p className="mt-3 rounded border border-brand-lea/20 bg-brand-cloudDancer/50 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
      {what.charAt(0).toUpperCase() + what.slice(1)} is already ticked, but no email has ever been sent from here.
      Someone marked it done by hand, or it went out another way. Sending now will be the first message this app has
      sent for it.
    </p>
  );
}
