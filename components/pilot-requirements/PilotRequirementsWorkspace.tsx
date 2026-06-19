import Link from "next/link";
import type { PilotRequirementsData, PilotRequirementDetail } from "@/lib/data/pilot-requirements";
import { PilotRequirementEditor } from "@/components/pilot-requirements/PilotRequirementEditor";
import { CandidateTriagePanel } from "@/components/pilot-requirements/CandidateTriagePanel";
import { FleetPositionEditor } from "@/components/pilot-requirements/FleetPositionEditor";

type PilotRequirementsWorkspaceProps = {
  data: PilotRequirementsData;
  query: string;
};

const statLabels: Array<[keyof PilotRequirementsData["stats"], string]> = [
  ["total", "Profiles"],
  ["active", "Active"],
  ["needsReview", "Need review"],
  ["catalogItems", "Catalog gates"]
];

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function getGateDisplayValue(gate: PilotRequirementDetail["gatesByCategory"][number]["gates"][number]) {
  if (typeof gate.numericValue === "number") {
    return compactNumber(gate.numericValue);
  }

  if (gate.textValue) {
    return gate.textValue;
  }

  return "Required";
}

function EvidencePanel({ requirement }: { requirement: PilotRequirementDetail }) {
  const evidence = requirement.rawMinimumRequirements || requirement.originalJobDescriptionText;

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
            Source evidence
          </p>
          <h3 className="text-base font-semibold text-brand-lea">Original imported job text</h3>
        </div>
        <span className="rounded bg-brand-cloudDancer px-3 py-1 text-xs font-semibold text-brand-eden">
          Preserved
        </span>
      </div>
      {evidence ? (
        <div className="mt-3 max-h-[320px] overflow-auto rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm leading-6 text-brand-black/78 whitespace-pre-wrap">
          {evidence}
        </div>
      ) : (
        <p className="mt-3 text-sm text-brand-grey">No source text is attached to this requirement yet.</p>
      )}
    </section>
  );
}

function RequirementDetail({
  requirement,
  candidateMatches,
  canEditScoring,
  scannedCount
}: {
  requirement: PilotRequirementDetail | null;
  candidateMatches: PilotRequirementsData["candidateMatches"];
  canEditScoring: boolean;
  scannedCount: number;
}) {
  if (!requirement) {
    return (
      <div className="rounded bg-white p-8 text-center shadow-panel ring-1 ring-brand-lea/10">
        <div className="text-lg font-semibold text-brand-lea">No pilot requirements yet</div>
        <p className="mt-2 text-sm text-brand-grey">Seed or import job requirements to populate this workspace.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
              Pilot requirement review
            </p>
            <h2 className="text-2xl font-semibold text-brand-lea">{requirement.title}</h2>
            <p className="mt-1 text-sm text-brand-grey">
              Version {requirement.version} - {requirement.status} - {requirement.reviewStatus}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[requirement.operatorType, requirement.pilotSeat, requirement.base, ...requirement.aircraftTypes]
                .filter(Boolean)
                .map((item) => (
                  <span
                    key={item}
                    className="rounded border border-brand-sweet/60 bg-brand-sweet/18 px-2.5 py-1 text-[11px] font-semibold text-brand-lea"
                  >
                    {item}
                  </span>
                ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 xl:min-w-[420px]">
            {requirement.numericSummary.map((item) => (
              <div key={item.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">{item.label}</div>
                <div className="mt-1 text-lg font-semibold text-brand-lea">{compactNumber(item.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {canEditScoring ? (
        <FleetPositionEditor
          requirementId={requirement.id}
          currentSlug={requirement.fleetPositionSlug}
          currentAdvertised={requirement.advertisedTitle}
          currentAircraftTypes={requirement.aircraftTypes}
          rawTitle={requirement.title}
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
                  Hard gates
                </p>
                <h3 className="text-base font-semibold text-brand-lea">Enabled requirement gates</h3>
              </div>
              <span className="rounded bg-brand-cloudDancer px-3 py-1 text-xs font-semibold text-brand-eden">
                {requirement.activeGateCount} active
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {requirement.gatesByCategory.map((group) => (
                <div key={group.category}>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey">
                    {group.category}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                    {group.gates.map((gate) => (
                      <div
                        key={gate.id}
                        className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3"
                      >
                        <div className="text-sm font-semibold text-brand-lea">{gate.label}</div>
                        <div className="mt-1 text-sm text-brand-black/76">{getGateDisplayValue(gate)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <EvidencePanel requirement={requirement} />
          <PilotRequirementEditor key={requirement.id} requirement={requirement} />
        </div>

        <aside className="space-y-4">
          <CandidateTriagePanel
            key={requirement.id}
            matches={candidateMatches}
            requirementId={requirement.id}
            canEdit={canEditScoring}
            scannedCount={scannedCount}
          />

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
              Extraction status
            </p>
            <div className="mt-3 flex items-end gap-2">
              <div className="text-3xl font-semibold text-brand-lea">
                {requirement.extractionConfidence ?? 0}%
              </div>
              <div className="pb-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-grey">
                confidence
              </div>
            </div>
            {requirement.extractionWarnings.length > 0 ? (
              <ul className="mt-3 space-y-2 text-sm text-brand-grey">
                {requirement.extractionWarnings.map((warning) => (
                  <li key={warning} className="rounded border border-brand-gold/30 bg-brand-gold/10 p-2">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-brand-grey">No extraction warnings recorded.</p>
            )}
          </section>

          <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
              Linked source
            </p>
            <div className="mt-3 text-sm font-semibold text-brand-lea">
              {requirement.sourceJobTitle ?? "No linked source job"}
            </div>
            <p className="mt-1 text-xs text-brand-grey">
              {requirement.sourceJobStatus ? `Source job status: ${requirement.sourceJobStatus}` : "A source job can be linked after import."}
            </p>
            {requirement.payScaleRaw ? (
              <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 text-sm text-brand-black/76">
                {requirement.payScaleRaw}
              </div>
            ) : null}
          </section>
        </aside>
      </section>
    </div>
  );
}

export function PilotRequirementsWorkspace({ data, query }: PilotRequirementsWorkspaceProps) {
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">
              Pilot gates
            </p>
            <h1 className="text-2xl font-semibold text-brand-lea">Pilot Requirements</h1>
            <p className="mt-1 max-w-3xl text-sm text-brand-grey">
              Structured qualification profiles extracted from job records. Source text stays preserved while
              gates become editable matching inputs.
            </p>
          </div>
          <form className="flex w-full gap-2 xl:w-[520px]">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search aircraft, seat, base, status, hours"
              className="min-w-0 flex-1 rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
            />
            <button
              type="submit"
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden"
            >
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statLabels.map(([key, label]) => (
          <div key={key} className="rounded bg-white p-3 shadow-panel ring-1 ring-brand-lea/10">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-grey">
              {label}
            </div>
            <div className="mt-1 text-xl font-semibold text-brand-lea">{data.stats[key]}</div>
            <div className="mt-2 h-1 rounded-full bg-brand-gold/25">
              <div className="h-1 w-2/3 rounded-full bg-brand-sweet" />
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <aside className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10">
          <div className="border-b border-brand-lea/10 px-4 py-3">
            <h2 className="text-base font-semibold text-brand-lea">Profiles</h2>
            <p className="text-xs text-brand-grey">
              {data.requirements.length} shown{query ? ` for "${query}"` : ""}
            </p>
          </div>
          <div className="max-h-[calc(100vh-310px)] min-h-[360px] overflow-y-auto p-3">
            {data.requirements.length > 0 ? (
              <div className="space-y-2">
                {data.requirements.map((requirement) => {
                  const isSelected = requirement.id === data.selectedRequirement?.id;
                  return (
                    <Link
                      key={requirement.id}
                      href={`/pilot-requirements?id=${requirement.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                      className={`block rounded border p-3 transition ${
                        isSelected
                          ? "border-brand-gold bg-brand-sweet/18"
                          : "border-brand-lea/10 bg-white hover:border-brand-sweet hover:bg-brand-cloudDancer/65"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-brand-lea">{requirement.title}</div>
                          <div className="mt-1 text-xs text-brand-grey">
                            {[requirement.pilotSeat, requirement.status, requirement.reviewStatus].filter(Boolean).join(" - ")}
                          </div>
                        </div>
                        {requirement.operatorType ? (
                          <span className="rounded border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 text-[10px] font-bold text-brand-lea">
                            {requirement.operatorType}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {requirement.aircraftTypes.slice(0, 2).map((aircraft) => (
                          <span key={aircraft} className="rounded bg-brand-sweet/25 px-2 py-0.5 text-[10px] font-semibold text-brand-eden">
                            {aircraft}
                          </span>
                        ))}
                        {requirement.base ? (
                          <span className="rounded bg-brand-sweet/25 px-2 py-0.5 text-[10px] font-semibold text-brand-eden">
                            {requirement.base}
                          </span>
                        ) : null}
                      </div>
                      {requirement.numericSummary.length > 0 ? (
                        <div className="mt-3 grid grid-cols-3 gap-1">
                          {requirement.numericSummary.slice(0, 3).map((item) => (
                            <div key={item.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/60 p-2">
                              <div className="text-[9px] font-bold uppercase text-brand-grey">{item.label}</div>
                              <div className="text-sm font-semibold text-brand-lea">{compactNumber(item.value)}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-12 text-center">
                <div className="text-base font-semibold text-brand-lea">No profiles found</div>
                <p className="mt-2 text-sm text-brand-grey">Clear search or import pilot job requirements.</p>
              </div>
            )}
          </div>
        </aside>

        <RequirementDetail
          key={data.selectedRequirement?.id ?? "none"}
          requirement={data.selectedRequirement}
          candidateMatches={data.candidateMatches}
          canEditScoring={data.canEditScoring}
          scannedCount={data.scannedCount}
        />
      </section>
    </div>
  );
}
