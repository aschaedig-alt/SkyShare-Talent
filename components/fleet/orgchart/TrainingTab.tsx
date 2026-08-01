"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CrewGroup } from "@/lib/fleet/staffing/types";
import type { TrainingRecord, TrainingStatus } from "@/lib/fleet/staffing/training";
import { TRAINING_STATUS_LABEL, trainingRows, parseTrainingPaste } from "@/lib/fleet/staffing/training";

// The Training tab on the Crew Org Chart: who is in training, on what, where,
// and — the column everything else hangs off — WHEN IT ENDS.
//
// The end date is what turns training from a label into something that can be
// acted on: once it passes, the chart can say "this pilot has finished, do you
// want them on the line?" instead of leaving them sitting in a training seat
// until somebody notices. That prompt lives on the chart itself (the banner in
// CrewOrgChart); this tab is where the dates come from.
//
// IMPORTING: training is tracked in a spreadsheet today, so the fastest honest
// path from there to here is paste. Copy the rows out of the sheet, paste, and
// the columns are matched by their headers. Nothing is written until the chart
// is saved, same as every other edit on this page.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const inputStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 12.5,
  padding: "4px 6px",
  borderRadius: 4,
  border: "1px solid var(--line, #cdd7e2)",
  background: "transparent",
  color: "inherit"
};

const cellStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--line, #cdd7e2)",
  verticalAlign: "middle",
  fontSize: 12.5
};

const headStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "2px solid var(--line, #cdd7e2)",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  opacity: 0.7,
  whiteSpace: "nowrap"
};

/** yyyy-mm-dd -> "Jul 19" / "Jul 19 2025", without a Date object (no timezone
    shift — an ISO date parsed as UTC and printed locally can land a day early). */
function pretty(iso: string | undefined, today: string | null): string {
  if (!iso || !ISO.test(iso)) return "—";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m, d] = iso.split("-");
  const label = `${MONTHS[Number(m) - 1]} ${Number(d)}`;
  return today && today.slice(0, 4) === y ? label : `${label} ${y}`;
}

export function TrainingTab({
  groups,
  records,
  links,
  today,
  canEdit,
  onChange,
  onShowPerson
}: {
  groups: CrewGroup[];
  records: TrainingRecord[];
  links: Record<string, string>;
  /** yyyy-mm-dd, or null before hydration. */
  today: string | null;
  canEdit: boolean;
  onChange: (next: TrainingRecord[]) => void;
  /** Open the aircraft card this person sits on, and highlight them. */
  onShowPerson: (name: string) => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [importMsg, setImportMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [showComplete, setShowComplete] = useState(false);

  const rows = useMemo(() => trainingRows(groups, records), [groups, records]);
  const visible = useMemo(() => {
    const list = showComplete ? rows : rows.filter((r) => r.status !== "complete");
    // Soonest end date first — the ones about to need a decision at the top.
    // Undated rows sink, because they are the ones needing DATA, not a decision,
    // and they would otherwise sit above the pilot finishing tomorrow.
    return list.slice().sort((a, b) => {
      if (Boolean(a.end) !== Boolean(b.end)) return a.end ? -1 : 1;
      return (a.end ?? "").localeCompare(b.end ?? "") || a.name.localeCompare(b.name);
    });
  }, [rows, showComplete]);

  const completeCount = rows.filter((r) => r.status === "complete").length;
  const missingDates = rows.filter((r) => !r.end && r.status !== "complete").length;

  /** The optional text fields, i.e. everything except `name` (the key) and
      `status` (which is required and never blank). */
  type TextField = "aircraft" | "seat" | "start" | "end" | "vendor" | "note";

  /** Write one field of one person's record, creating the record if this row is
      still a chart-derived placeholder. A blank value CLEARS the field rather
      than storing an empty string — an empty end date has to mean "no date", or
      the completion prompt would compare against "". */
  const setField = (name: string, field: TextField | "status", value: string) => {
    const existing = records.find((r) => r.name.toLowerCase() === name.toLowerCase());
    const seed = rows.find((r) => r.name.toLowerCase() === name.toLowerCase());
    const next: TrainingRecord = existing
      ? { ...existing }
      : {
          name,
          status: "in-training",
          ...(seed?.aircraft ? { aircraft: seed.aircraft } : {}),
          ...(seed?.seat ? { seat: seed.seat } : {})
        };

    if (field === "status") {
      next.status = value as TrainingStatus;
    } else {
      const clean = value.trim();
      if (clean) next[field] = clean;
      else delete next[field];
    }

    onChange(existing ? records.map((r) => (r === existing ? next : r)) : [...records, next]);
  };

  const removeRecord = (name: string) => onChange(records.filter((r) => r.name.toLowerCase() !== name.toLowerCase()));

  const runImport = () => {
    const year = today ? Number(today.slice(0, 4)) : new Date().getFullYear();
    const result = parseTrainingPaste(paste, year);
    if (result.records.length === 0) {
      setImportMsg({ ok: false, lines: result.problems.length ? result.problems : ["Nothing to import from that paste."] });
      return;
    }
    // MERGE, don't replace: a paste is usually a subset (this month's courses),
    // and replacing would quietly delete everyone the sheet no longer lists.
    // Matching is by name, so re-pasting a corrected sheet updates in place.
    const byName = new Map(records.map((r) => [r.name.toLowerCase(), r]));
    for (const rec of result.records) byName.set(rec.name.toLowerCase(), { ...byName.get(rec.name.toLowerCase()), ...rec });
    onChange([...byName.values()]);

    const lines = [`Imported ${result.records.length} training record${result.records.length === 1 ? "" : "s"}. Nothing is stored until you press Save below.`];
    if (result.skipped) lines.push(`${result.skipped} row${result.skipped === 1 ? "" : "s"} had no name and were skipped.`);
    lines.push(...result.problems);
    setImportMsg({ ok: true, lines });
    setPaste("");
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Training</div>
        <div style={{ fontSize: 12.5, opacity: 0.75, flex: "1 1 240px" }}>
          Every pilot in training, and when it ends. Once an end date passes, the chart offers to move them to the line — it never moves anyone on its own.
        </div>
        <button
          type="button"
          onClick={() => setShowComplete((v) => !v)}
          style={{ fontSize: 12, fontWeight: 600, padding: "4px 9px", borderRadius: 4, cursor: "pointer", border: "1px solid var(--line, #cdd7e2)", background: "transparent", color: "inherit" }}
        >
          {showComplete ? "Hide" : "Show"} completed ({completeCount})
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setImportOpen((v) => !v);
              setImportMsg(null);
            }}
            style={{ fontSize: 12, fontWeight: 600, padding: "4px 9px", borderRadius: 4, cursor: "pointer", border: "1px solid var(--line, #cdd7e2)", background: "transparent", color: "inherit" }}
          >
            {importOpen ? "Close import" : "Import from a spreadsheet"}
          </button>
        ) : null}
      </div>

      {importOpen && canEdit ? (
        <div style={{ border: "1px solid var(--line, #cdd7e2)", borderRadius: 4, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Paste the training rows</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
            Copy the rows out of the tracking sheet, header row included, and paste them here. Recognised headers:{" "}
            <b>Name</b> (required), Aircraft, Seat, Start, End, Vendor/Location, Status, Notes. Dates can be 7/13/2026, 07-13-26 or 2026-07-13. Existing
            people are updated by name; nobody is deleted.
          </div>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={6}
            placeholder={"Name\tAircraft\tSeat\tStart\tEnd\tVendor\tStatus\nBrett Moreland\tG450 / GV\tCaptain\t7/13/2026\t7/19/2026\tCAE\tin-training"}
            style={{ ...inputStyle, marginTop: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={runImport}
              disabled={!paste.trim()}
              style={{ background: "var(--navy, #0d2c43)", color: "#fff", border: "none", borderRadius: 4, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: paste.trim() ? "pointer" : "default", opacity: paste.trim() ? 1 : 0.5 }}
            >
              Import
            </button>
            <span style={{ fontSize: 11.5, opacity: 0.65 }}>Review the table, then press Save below to store it.</span>
          </div>
          {importMsg ? (
            <div style={{ marginTop: 8, fontSize: 12, color: importMsg.ok ? "inherit" : "#c0392b" }}>
              {importMsg.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {missingDates > 0 ? (
        <div style={{ fontSize: 12.5, padding: "8px 10px", marginBottom: 10, borderRadius: 4, border: "1px solid var(--gold, #eaaa00)", background: "var(--train-bg, rgba(234,170,0,.12))" }}>
          {missingDates} {missingDates === 1 ? "pilot has" : "pilots have"} no training end date, so nothing can tell you when they finish. Add the dates below or import them.
        </div>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
          <thead>
            <tr>
              <th style={headStyle}>Pilot</th>
              <th style={headStyle}>Aircraft</th>
              <th style={headStyle}>Seat</th>
              <th style={headStyle}>Start</th>
              <th style={headStyle}>End</th>
              <th style={headStyle}>Where</th>
              <th style={headStyle}>Status</th>
              {canEdit ? <th style={headStyle} /> : null}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td style={{ ...cellStyle, opacity: 0.7 }} colSpan={canEdit ? 8 : 7}>
                  Nobody is in training right now.
                </td>
              </tr>
            ) : null}
            {visible.map((row) => {
              const done = Boolean(row.end && today && row.end <= today && row.status !== "complete" && row.onChart);
              return (
                <tr key={row.name} style={done ? { background: "var(--train-bg, rgba(234,170,0,.12))" } : undefined}>
                  <td style={cellStyle}>
                    <button
                      type="button"
                      onClick={() => onShowPerson(row.name)}
                      disabled={!row.onChart}
                      title={row.onChart ? "Show this pilot on the chart" : "Not currently in a training seat on the chart"}
                      style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: "inherit", cursor: row.onChart ? "pointer" : "default", textAlign: "left", opacity: row.onChart ? 1 : 0.7 }}
                    >
                      {row.name}
                    </button>
                    {links[row.name] ? (
                      <>
                        {" "}
                        <Link href={`/candidates/${links[row.name]}`} style={{ fontSize: 11, opacity: 0.7, color: "inherit" }}>
                          profile
                        </Link>
                      </>
                    ) : null}
                    {!row.onChart ? <span style={{ fontSize: 11, opacity: 0.6 }}> · not in a training seat</span> : null}
                  </td>
                  <td style={cellStyle}>
                    {canEdit ? (
                      <input value={row.aircraft ?? ""} onChange={(e) => setField(row.name, "aircraft", e.target.value)} style={inputStyle} />
                    ) : (
                      row.aircraft || "—"
                    )}
                  </td>
                  <td style={cellStyle}>
                    {canEdit ? <input value={row.seat ?? ""} onChange={(e) => setField(row.name, "seat", e.target.value)} style={inputStyle} /> : row.seat || "—"}
                  </td>
                  <td style={cellStyle}>
                    {canEdit ? (
                      <input type="date" value={row.start ?? ""} onChange={(e) => setField(row.name, "start", e.target.value)} style={inputStyle} />
                    ) : (
                      pretty(row.start, today)
                    )}
                  </td>
                  <td style={cellStyle}>
                    {canEdit ? (
                      <input type="date" value={row.end ?? ""} onChange={(e) => setField(row.name, "end", e.target.value)} style={inputStyle} />
                    ) : (
                      pretty(row.end, today)
                    )}
                    {done ? <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gold, #b0670e)" }}>finished</div> : null}
                  </td>
                  <td style={cellStyle}>
                    {canEdit ? <input value={row.vendor ?? ""} onChange={(e) => setField(row.name, "vendor", e.target.value)} style={inputStyle} /> : row.vendor || "—"}
                  </td>
                  <td style={cellStyle}>
                    {canEdit ? (
                      <select value={row.status} onChange={(e) => setField(row.name, "status", e.target.value)} style={inputStyle}>
                        {(Object.keys(TRAINING_STATUS_LABEL) as TrainingStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {TRAINING_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      TRAINING_STATUS_LABEL[row.status]
                    )}
                  </td>
                  {canEdit ? (
                    <td style={cellStyle}>
                      {row.missing ? (
                        <span style={{ fontSize: 11, opacity: 0.6 }}>from chart</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => removeRecord(row.name)}
                          title="Remove this training record"
                          style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 13, padding: 2 }}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 10 }}>
        Rows marked <b>from chart</b> are pilots the chart shows in a training seat with no record entered yet — fill in their dates and they become records. Removing a
        record does not move anyone; use the aircraft card for that.
      </div>
    </div>
  );
}
