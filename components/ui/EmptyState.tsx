import { clsx } from "clsx";

// Shared empty-state card — the "nothing here yet" panel. Matches the existing
// centered card pattern (white surface, panel shadow, muted text) so the ~79
// ad-hoc empty states can converge on one look, with room for an icon + action.

export type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Bare = just the muted text block, no card chrome (for inside a panel). */
  bare?: boolean;
};

export function EmptyState({ title, description, icon, action, className, bare = false }: EmptyStateProps) {
  return (
    <div
      className={clsx(
        "text-center text-sm text-brand-grey dark:text-slate-400",
        !bare && "rounded bg-white p-6 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10",
        className
      )}
    >
      {icon ? <div className="mx-auto mb-2 flex justify-center text-brand-grey/70 dark:text-slate-500">{icon}</div> : null}
      <p className="font-semibold text-brand-lea dark:text-slate-200">{title}</p>
      {description ? <p className="mt-1">{description}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
