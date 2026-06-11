import type { SettingsData } from "@/lib/data/settings";
import type { RoleName } from "@/lib/auth/roles";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { ModuleVisibilityAccessPanel } from "@/components/settings/ModuleVisibilityAccessPanel";
import { BrandingPanel } from "@/components/settings/BrandingPanel";

type SettingsWorkspaceProps = {
  data: SettingsData;
  currentRole: RoleName;
};

const countLabels: Array<[keyof SettingsData["counts"], string]> = [
  ["candidates", "Candidates"],
  ["jobs", "Recruiting jobs"],
  ["pilotRequirements", "Pilot requirements"],
  ["candidateFiles", "Candidate files"],
  ["interviews", "Interviews"],
  ["importBatches", "Import batches"]
];

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function StatusCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/50 p-3">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey">{label}</div>
      <div className="mt-1 text-sm font-semibold text-brand-lea">{value}</div>
      <p className="mt-2 text-xs leading-5 text-brand-grey">{detail}</p>
    </div>
  );
}

export function SettingsWorkspace({ data, currentRole }: SettingsWorkspaceProps) {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Admin foundation</p>
        <h1 className="text-2xl font-semibold text-brand-lea">Settings</h1>
        <p className="mt-1 max-w-3xl text-sm text-brand-grey">
          Operational controls for SkyShare Talent. This page now tracks environment,
          deployment readiness, storage, and Google Calendar configuration.
        </p>
      </section>

      <SettingsTabs currentTab="general" />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {countLabels.map(([key, label]) => (
          <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">{label}</div>
            <div className="mt-1 text-xl font-semibold text-brand-lea">{data.counts[key]}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Environment</p>
          <h2 className="text-base font-semibold text-brand-lea">Current runtime</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <StatusCard
              label="App environment"
              value={data.environment.appEnvironment}
              detail="Displayed in the app shell so local, staging, and production are obvious."
            />
            <StatusCard
              label="Node environment"
              value={data.environment.nodeEnvironment}
              detail="Build/runtime mode reported by Next.js."
            />
            <StatusCard
              label="Database"
              value="Local dev database"
              detail={data.environment.databaseProvider}
            />
            <StatusCard
              label="Files"
              value="Local dev storage"
              detail={data.environment.fileStorage}
            />
          </div>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Deployment</p>
          <h2 className="text-base font-semibold text-brand-lea">AWS readiness</h2>
          <div className="mt-4 space-y-3 text-sm text-brand-grey">
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/50 p-3">
              Recommended path: AWS Amplify Hosting SSR, RDS PostgreSQL, and private S3 file storage.
            </div>
            <div className="rounded border border-brand-gold/30 bg-brand-gold/10 p-3 text-brand-lea">
              Static S3-only hosting is no longer enough because this app has API routes, Prisma writes, uploads,
              duplicate scans, interviews, and Google Calendar sync.
            </div>
            <div className="rounded border border-brand-lea/10 bg-white px-3 py-2 text-xs font-semibold text-brand-lea">
              Saved file: AWS_DEPLOYMENT_PLAN.md
            </div>
            <div className="rounded border border-brand-lea/10 bg-white px-3 py-2 text-xs font-semibold text-brand-lea">
              Saved file: PRODUCTION_DATABASE_MIGRATION_PLAN.md
            </div>
          </div>
        </section>
      </section>

      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Production readiness</p>
        <h2 className="text-base font-semibold text-brand-lea">Deployment checks</h2>
        <p className="mt-1 text-xs text-brand-grey">
          Mirrors the local command <span className="font-semibold text-brand-lea">npm run prod:check</span>.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {data.productionReadiness.map((item) => (
            <div
              key={item.label}
              className="rounded border border-brand-lea/10 bg-brand-cloudDancer/50 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey">
                  {item.label}
                </div>
                <span
                  className={
                    item.status === "ready"
                      ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800"
                      : "rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-lea"
                  }
                >
                  {item.status === "ready" ? "Ready" : "To do"}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-brand-grey">{item.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Google Calendar</p>
          <h2 className="text-base font-semibold text-brand-lea">Connection foundation</h2>
          <div className="mt-3 space-y-2 text-sm text-brand-grey">
            <div>Status: {data.calendarConnection?.status ?? "Local-only mode"}</div>
            <div>Direction: {data.calendarConnection?.syncDirection ?? "LOCAL_ONLY"}</div>
            <div>Account: {data.calendarConnection?.accountEmail ?? "Not connected"}</div>
            <div>Last sync: {formatDate(data.calendarConnection?.lastSyncedAt ?? null)}</div>
          </div>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Backup / Export</p>
          <h2 className="text-base font-semibold text-brand-lea">Backup runbook</h2>
          <p className="mt-3 text-sm leading-6 text-brand-grey">
            Production backup should cover PostgreSQL, private S3 files, import source files, and deployment
            configuration. The old static backup pattern is not enough for the full-stack app.
          </p>
        </section>

        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Security</p>
          <h2 className="text-base font-semibold text-brand-lea">Before real data</h2>
          <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-brand-lea">Auth mode: {data.auth.mode}</span>
              <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-lea">
                {data.auth.requireAuth ? "Required" : "Local bypass"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-brand-grey">{data.auth.detail}</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-brand-grey">
            <li>Authentication and roles must be added before real candidate data.</li>
            <li>Candidate files must move from local disk to private S3.</li>
            <li>Google OAuth secrets must stay in server-side environment variables.</li>
          </ul>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.auth.roles.map((role) => (
              <div key={role.role} className="rounded border border-brand-lea/10 bg-white px-3 py-2">
                <div className="text-xs font-semibold text-brand-lea">{role.role}</div>
                <div className="text-[11px] text-brand-grey">{role.permissionCount} permissions defined</div>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/50 px-3 py-2 text-xs font-semibold text-brand-lea">
              Saved file: PRIVATE_S3_FILE_STORAGE_PLAN.md
            </div>
            <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/50 px-3 py-2 text-xs font-semibold text-brand-lea">
              Saved file: AUTH_ROLES_FOUNDATION_PLAN.md
            </div>
          </div>
        </section>
      </section>

      {currentRole === "ADMIN" ? <BrandingPanel initialLogoDataUrl={data.logoDataUrl} /> : null}

      {currentRole === "ADMIN" ? (
        <ModuleVisibilityAccessPanel policy={data.moduleAccessPolicy} />
      ) : null}
    </div>
  );
}
