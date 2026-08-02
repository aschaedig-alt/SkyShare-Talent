"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CrewGroup } from "@/lib/fleet/staffing/types";
import type { TrainingRecord, TrainingRow, TrainingConfirmation, TrainingHireType, TrainingPool } from "@/lib/fleet/staffing/training";
import { PROGRESS_LABEL, trainingRows, parseTrainingPaste, trainingRecordId } from "@/lib/fleet/staffing/training";
import { DateCell, TonedSelect, hireTypeTone, poolTone, confirmationTone } from "./TrainingCells";

// The Training tab on the Crew Org Chart.
//
// The columns mirror the Recruiting Status Tracking "Training Info" sheet this
// data comes from — name, external/internal, pool, position, start, orientation,
// indoc, training start, training END, location, status — so a recruiter reading
// the sheet and a recruiter reading this see the same row in the same order.
//
// The end date is what turns training from a label into something actionable:
// once it passes, the chart offers to move that pilot onto the line instead of
// leaving them in a training seat until somebody notices. That prompt lives on
// the chart; this tab is where its dates come from.
//
// ARCHIVED rows are the sheet's own history — everything under its ARCHIVED
// divider. Kept in full and hidden by default: "we still want the info, just not
// active."

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 78,
  fontSize: 12,
  padding: "3px 5px",
  borderRadius: 4,
  border: "1px solid var(--line, #cdd7e2)",
  background: "transparent",
  color: "inherit"
};

const cellStyle: React.CSSProperties = {
  padding: "4px 6px",
  verticalAlign: "middle",
  fontSize: 11.5,
  whiteSpace: "nowrap"
};

const headStyle: React.CSSProperties = {
  padding: "6px 6px",
  textAlign: "left",
  fontSize: 9.5,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap"
};

const CONFIRMATIONS: TrainingConfirmation[] = ["Confirmed", "Tentative", "Canceled", "Unknown"];
const HIRE_TYPES: TrainingHireType[] = ["External", "Internal"];
const POOLS: TrainingPool[] = ["SS", "M", "PDP"];

type TextField = "name" | "position" | "vendor" | "note" | "startDate" | "orientationDate" | "indocDate" | "start" | "end";

/** The main line, in order. Every one of these sorts; `pre` marks the three
    onboarding dates that the Onboarding dates toggle hides. */
type SortKey = "name" | "position" | "startDate" | "orientationDate" | "indocDate" | "start" | "end" | "vendor" | "confirmation";
const SORTABLE: { key: SortKey; label: string; pre?: boolean }[] = [
  { key: "name", label: "Pilot" },
  { key: "position", label: "Position" },
  { key: "startDate", label: "Start", pre: true },
  { key: "orientationDate", label: "Orient.", pre: true },
  { key: "indocDate", label: "Indoc", pre: true },
  { key: "start", label: "Trn start" },
  { key: "end", label: "Trn end" },
  { key: "vendor", label: "Location" },
  { key: "confirmation", label: "Status" }
];

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
  onShowPerson: (name: string) => void;
}) {
  const [importOpen, setImportOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [importMsg, setImportMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  // The onboarding dates cost ~340px of table. On by default because the point
  // of widening this tab was to SEE everything; the toggle is the escape hatch
  // on a laptop rather than a default that hides data.
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [addName, setAddName] = useState("");
  // null = the default order (soonest training end first). Clicking a header
  // takes over; clicking the same one again reverses it.
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };
  const mainColumns = SORTABLE.filter((c) => !c.pre || showOnboarding).length;

  const rows = useMemo(() => trainingRows(groups, records, today), [groups, records, today]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (!showArchived && r.archived) return false;
      if (!q) return true;
      return `${r.name} ${r.position ?? ""} ${r.vendor ?? ""} ${r.note ?? ""}`.toLowerCase().includes(q);
    });
    return list.slice().sort((a, b) => {
      // ACTIVE ALWAYS ABOVE ARCHIVED, whatever the sort. Archived records are
      // history; letting a 2024 course sort above a pilot finishing this week
      // would bury the only rows anybody has to act on.
      if (a.archived !== b.archived) return a.archived ? 1 : -1;

      if (sortKey) {
        const av = (a[sortKey] ?? "").toString();
        const bv = (b[sortKey] ?? "").toString();
        // Blanks last in BOTH directions — reversing the sort should not
        // promote a column of empty cells to the top.
        if (Boolean(av) !== Boolean(bv)) return av ? -1 : 1;
        const cmp = sortKey === "name" ? av.localeCompare(bv) : av.localeCompare(bv, undefined, { numeric: true });
        if (cmp !== 0) return cmp * sortDir;
        return a.name.localeCompare(b.name);
      }

      // Default: soonest END first — the decisions that are due. Undated rows
      // sink, because those need DATA rather than a decision and would
      // otherwise sit above the pilot finishing tomorrow. Archived history
      // reads newest-first, since old courses matter less the older they get.
      const ax = a.end ?? a.start;
      const bx = b.end ?? b.start;
      if (Boolean(ax) !== Boolean(bx)) return ax ? -1 : 1;
      if (a.archived) return (bx ?? "").localeCompare(ax ?? "") || a.name.localeCompare(b.name);
      return (ax ?? "").localeCompare(bx ?? "") || a.name.localeCompare(b.name);
    });
  }, [rows, showArchived, query, sortKey, sortDir]);

  const liveRows = rows.filter((r) => !r.archived);
  const archivedCount = rows.length - liveRows.length;
  const missingEnd = liveRows.filter((r) => !r.end && r.confirmation !== "Canceled").length;
  const offChart = liveRows.filter((r) => !r.onChart && r.progress !== "complete" && r.confirmation !== "Canceled").length;

  /** Write one field of one RECORD, creating it if the row is a chart-derived
      placeholder. Keyed by record id, because one pilot can have several. */
  const setField = (row: TrainingRow, field: TextField | "confirmation" | "hireType" | "pool" | "archived", value: string | boolean) => {
    const existing = records.find((r) => r.id === row.id);
    const base: TrainingRecord = existing ?? {
      id: row.id,
      name: row.name,
      confirmation: row.confirmation,
      archived: row.archived,
      ...(row.position ? { position: row.position } : {})
    };
    const next: TrainingRecord = { ...base };

    if (field === "archived") next.archived = Boolean(value);
    else if (field === "confirmation") next.confirmation = value as TrainingConfirmation;
    else if (field === "hireType") {
      if (value) next.hireType = value as TrainingHireType;
      else delete next.hireType;
    } else if (field === "pool") {
      if (value) next.pool = value as TrainingPool;
      else delete next.pool;
    }
    else {
      const clean = String(value).trim();
      if (clean) next[field] = clean;
      else delete next[field];
    }

    onChange(existing ? records.map((r) => (r.id === existing.id ? next : r)) : [...records, next]);
  };

  const removeRecord = (id: string) => onChange(records.filter((r) => r.id !== id));

  /** Add a blank training record by hand. There was NO way to do this before —
      records only arrived by import or as a chart-derived placeholder — so a
      course somebody booked outside the sheet could not be entered at all.
      Created undated, which puts it in the "no training end date" warning until
      the dates are filled in. */
  const addRecord = () => {
    const name = addName.trim();
    if (!name) return;
    const id = trainingRecordId(name, undefined, "");
    if (records.some((r) => r.id === id)) {
      setImportMsg({ ok: false, lines: [`${name} already has an undated record — fill that one in rather than adding a second.`] });
      return;
    }
    onChange([...records, { id, name, confirmation: "Tentative", archived: false }]);
    setAddName("");
    setQuery("");
  };

  const runImport = () => {
    const year = today ? Number(today.slice(0, 4)) : new Date().getFullYear();
    const result = parseTrainingPaste(paste, year);
    if (result.records.length === 0) {
      setImportMsg({ ok: false, lines: result.problems.length ? result.problems : ["Nothing to import from that paste."] });
      return;
    }
    // MERGE by record id, never replace: a paste is often a subset, and
    // replacing would delete everyone the sheet no longer lists. Ids are
    // derived from name + training start + position, so re-pasting a corrected
    // sheet updates rows in place instead of doubling them.
    const byId = new Map(records.map((r) => [r.id, r]));
    for (const rec of result.records) {
      const prev = byId.get(rec.id);
      // completedAt is ours, not the sheet's — a re-import must not undo
      // somebody having already moved that pilot onto the line.
      byId.set(rec.id, prev?.completedAt ? { ...rec, completedAt: prev.completedAt } : rec);
    }
    onChange([...byId.values()]);

    const added = result.records.filter((r) => !records.some((e) => e.id === r.id)).length;
    const lines = [
      `Read ${result.records.length} training records — ${added} new, ${result.records.length - added} updated. ${result.archived} are archived history.`,
      `${result.skipped} rows had no name and were skipped (blank spacers and the ARCHIVED divider).`,
      "Nothing is stored until you press Save training below."
    ];
    lines.push(...result.problems);
    setImportMsg({ ok: true, lines });
    setPaste("");
  };

  // (the old hand-rolled pill helper lived here — superseded by TonedSelect,
  // which colours by the value itself and works in both read and edit mode)

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Training</div>
        <div style={{ fontSize: 12.5, opacity: 0.75, flex: "1 1 220px" }}>
          {liveRows.length} active · {archivedCount} archived. Once a training end date passes, the chart offers to move that pilot to the line — it never moves anyone on its own.
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, seat, location…"
          style={{ ...inputStyle, width: 190, minWidth: 140, fontSize: 12.5, padding: "5px 8px" }}
        />
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          style={{ fontSize: 12, fontWeight: 600, padding: "4px 9px", borderRadius: 4, cursor: "pointer", border: "1px solid var(--line, #cdd7e2)", background: showArchived ? "var(--navy, #0d2c43)" : "transparent", color: showArchived ? "#fff" : "inherit" }}
        >
          {showArchived ? "Hide" : "Show"} archived ({archivedCount})
        </button>
        <button
          type="button"
          onClick={() => setShowOnboarding((v) => !v)}
          title="Start date, orientation and indoc. Hide them to fit the training columns on a narrower screen."
          style={{ fontSize: 12, fontWeight: 600, padding: "4px 9px", borderRadius: 4, cursor: "pointer", border: "1px solid var(--line, #cdd7e2)", background: showOnboarding ? "var(--navy, #0d2c43)" : "transparent", color: showOnboarding ? "#fff" : "inherit" }}
        >
          Onboarding dates
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
            {importOpen ? "Close import" : "Import from the tracking sheet"}
          </button>
        ) : null}
      </div>

      {importOpen && canEdit ? (
        <div style={{ border: "1px solid var(--line, #cdd7e2)", borderRadius: 4, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Paste the Training Info sheet</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>
            Select the whole sheet including the header row and paste it here. It reads the columns by name — <b>Name</b>, Position, Start Date, Orientation
            Date, Basic Indoc Date, Training Start/End Date, Training Location, Training Status, Open Training Dates — and works out the two unlabelled
            columns (External/Internal and SS/M/PDP) from their contents. Everything under the <b>ARCHIVED</b> divider is imported and marked archived.
            People are matched by name plus seat plus training start, so re-pasting a corrected sheet updates rows rather than duplicating them, and nobody
            is ever deleted.
          </div>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={6}
            placeholder={"Name,,,Position,Start Date,Orientation Date,Basic Indoc Date,Training Start Date,Training End Date,Training Location,Training Status\nJonathan Siswick,External,M,Phenom 100 Captain,6/22/2026,6/29/2026,6/30/2026,07/07/2026,07/22/2026,CAE LAS,Tentative"}
            style={{ ...inputStyle, marginTop: 8, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, resize: "vertical" }}
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
            <span style={{ fontSize: 11.5, opacity: 0.65 }}>Review the table, then press Save training to store it.</span>
          </div>
          {importMsg ? (
            <div style={{ marginTop: 8, fontSize: 12, color: importMsg.ok ? "inherit" : "#c0392b", maxHeight: 160, overflowY: "auto" }}>
              {importMsg.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {missingEnd > 0 || offChart > 0 ? (
        <div style={{ fontSize: 12.5, padding: "8px 10px", marginBottom: 10, borderRadius: 4, border: "1px solid var(--gold, #eaaa00)", background: "var(--train-bg, rgba(234,170,0,.12))" }}>
          {missingEnd > 0 ? (
            <div>
              {missingEnd} active {missingEnd === 1 ? "record has" : "records have"} no training end date, so nothing can tell you when they finish.
            </div>
          ) : null}
          {offChart > 0 ? (
            <div>
              {offChart} {offChart === 1 ? "person is" : "people are"} training for a seat the chart does not show them in — either they have not been added
              to that aircraft yet, or the name is spelled differently here.
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ overflowX: "auto" }}>
        <table className="trtable" style={{ minWidth: showOnboarding ? 980 : 720 }}>
          <thead>
            <tr>
              {SORTABLE.filter((c) => c.pre !== true || showOnboarding).map((c) => (
                <th
                  key={c.key}
                  style={headStyle}
                  className={`sortable${c.pre ? " pre" : ""}`}
                  onClick={() => toggleSort(c.key)}
                  title={`Sort by ${c.label}`}
                >
                  {c.label}
                  {sortKey === c.key ? (sortDir > 0 ? " ▲" : " ▼") : ""}
                </th>
              ))}
              <th style={headStyle}>Progress</th>
            </tr>
          </thead>

          {visible.length === 0 ? (
            <tbody>
              <tr>
                <td style={{ ...cellStyle, opacity: 0.7 }} colSpan={mainColumns + 1}>
                  {rows.length === 0 ? "No training records yet — import the tracking sheet above." : "Nothing matches that search."}
                </td>
              </tr>
            </tbody>
          ) : null}

          {/* One tbody PER RECORD, holding its data line and its notes line.
              That is what lets the zebra striping alternate by record instead of
              by row — striping by row would shade one pilot's notes line and the
              next pilot's data line together. */}
          {visible.map((row) => {
            const due = row.progress === "complete" && row.onChart && !row.completedAt && !row.archived;
            const rowCls = due ? "due" : row.archived ? "arch" : undefined;
            const date = (field: "startDate" | "orientationDate" | "indocDate" | "start" | "end", label: string) => (
              <DateCell value={row[field]} canEdit={canEdit} label={`${label} for ${row.name}`} onChange={(v) => setField(row, field, v)} />
            );

            return (
              <tbody key={row.id}>
                <tr className={`main${rowCls ? ` ${rowCls}` : ""}`}>
                  <td style={{ ...cellStyle, minWidth: 150 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {/* EDITABLE in active and archived alike — the sheet carries
                          "Alvaro Martin (Was Nick Smout)", "Gavin Wulderlich" and
                          "Jermey McGraw", and there was no way to correct any of
                          them. The jump-to-chart moved to its own icon so typing
                          no longer competes with clicking. */}
                      {canEdit ? (
                        <input
                          value={row.name}
                          aria-label={`Name for ${row.name}`}
                          onChange={(e) => setField(row, "name", e.target.value)}
                          style={{ fontWeight: 700 }}
                        />
                      ) : (
                        <b>{row.name}</b>
                      )}
                      {row.onChart ? (
                        <button
                          type="button"
                          onClick={() => onShowPerson(row.name)}
                          title={`Show ${row.name} on the chart`}
                          style={{ flex: "0 0 auto", background: "none", border: "none", cursor: "pointer", fontSize: 11, opacity: 0.6, padding: "0 2px", color: "inherit" }}
                        >
                          ◎
                        </button>
                      ) : null}
                      {links[row.name] ? (
                        <Link href={`/candidates/${links[row.name]}`} title="Open profile" style={{ flex: "0 0 auto", fontSize: 10.5, opacity: 0.7, color: "inherit" }}>
                          profile
                        </Link>
                      ) : null}
                    </span>
                  </td>

                  <td style={{ ...cellStyle, whiteSpace: "normal", minWidth: 120 }}>
                    {canEdit ? (
                      <input value={row.position ?? ""} aria-label={`Position for ${row.name}`} onChange={(e) => setField(row, "position", e.target.value)} />
                    ) : (
                      row.position || "—"
                    )}
                  </td>

                  {showOnboarding ? (
                    <>
                      <td style={cellStyle} className="pre">{date("startDate", "Start date")}</td>
                      <td style={cellStyle} className="pre">{date("orientationDate", "Orientation")}</td>
                      <td style={cellStyle} className="pre">{date("indocDate", "Indoc")}</td>
                    </>
                  ) : null}

                  <td style={cellStyle}>{date("start", "Training start")}</td>
                  <td style={cellStyle}>
                    {date("end", "Training end")}
                    {due ? <div style={{ fontSize: 9.5, fontWeight: 800, color: "#b0670e" }}>move to line</div> : null}
                  </td>

                  <td style={{ ...cellStyle, whiteSpace: "normal", minWidth: 92 }}>
                    {canEdit ? (
                      <input value={row.vendor ?? ""} aria-label={`Location for ${row.name}`} onChange={(e) => setField(row, "vendor", e.target.value)} />
                    ) : (
                      row.vendor || "—"
                    )}
                  </td>

                  <td style={cellStyle}>
                    <TonedSelect
                      value={row.confirmation}
                      tone={confirmationTone(row.confirmation)}
                      options={CONFIRMATIONS}
                      allowBlank={false}
                      canEdit={canEdit}
                      label={`Status for ${row.name}`}
                      onChange={(v) => setField(row, "confirmation", v)}
                    />
                  </td>

                  <td style={{ ...cellStyle, fontWeight: 700, color: due ? "#b0670e" : undefined }}>{PROGRESS_LABEL[row.progress]}</td>
                </tr>

                {/* The second line. Type and Pool lead it, then the note, then
                    the actions pushed right. Always rendered, so every record is
                    the same height and the eye can run straight down the table. */}
                <tr className={`sub${rowCls ? ` ${rowCls}` : ""}`}>
                  <td colSpan={mainColumns + 1}>
                    <div className="subwrap">
                      <TonedSelect
                        value={row.hireType ?? ""}
                        tone={hireTypeTone(row.hireType)}
                        options={HIRE_TYPES}
                        canEdit={canEdit}
                        label={`Hire type for ${row.name}`}
                        onChange={(v) => setField(row, "hireType", v)}
                      />
                      <TonedSelect
                        value={row.pool ?? ""}
                        tone={poolTone(row.pool)}
                        options={POOLS}
                        canEdit={canEdit}
                        label={`Pool for ${row.name}`}
                        onChange={(v) => setField(row, "pool", v)}
                      />
                      <span className="subnote">
                        {canEdit ? (
                          <input
                            value={row.note ?? ""}
                            placeholder="Notes…"
                            aria-label={`Notes for ${row.name}`}
                            onChange={(e) => setField(row, "note", e.target.value)}
                            style={{ fontSize: 11, opacity: row.note ? 1 : 0.75 }}
                          />
                        ) : (
                          <span style={{ fontSize: 11, opacity: 0.85 }}>{row.note || ""}</span>
                        )}
                      </span>
                      {canEdit ? (
                        row.missing ? (
                          <span style={{ flex: "0 0 auto", fontSize: 10, opacity: 0.6 }}>from chart</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setField(row, "archived", !row.archived)}
                              title={row.archived ? "Make this active again" : "Archive — keeps the record, drops it out of the active list"}
                              style={{ flex: "0 0 auto", background: "none", border: "1px solid var(--line, #cdd7e2)", borderRadius: 4, cursor: "pointer", fontSize: 10, fontWeight: 700, padding: "1px 6px", color: "inherit", width: "auto" }}
                            >
                              {row.archived ? "restore" : "archive"}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeRecord(row.id)}
                              title="Delete this training record outright"
                              style={{ flex: "0 0 auto", background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 12, padding: "0 2px", width: "auto" }}
                            >
                              ✕
                            </button>
                          </>
                        )
                      ) : null}
                    </div>
                  </td>
                </tr>
              </tbody>
            );
          })}
        </table>
      </div>

      {canEdit ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addRecord();
          }}
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.7 }}>Add a record</span>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Pilot name…"
            style={{ ...inputStyle, width: 200, fontSize: 12.5, padding: "5px 8px" }}
          />
          <button
            type="submit"
            disabled={!addName.trim()}
            style={{ background: "var(--navy, #0d2c43)", color: "#fff", border: "none", borderRadius: 4, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, cursor: addName.trim() ? "pointer" : "default", opacity: addName.trim() ? 1 : 0.5 }}
          >
            Add
          </button>
          <span style={{ fontSize: 11.5, opacity: 0.65 }}>Adds a blank row you fill in — for a course that never went on the sheet.</span>
        </form>
      ) : null}

      <div style={{ fontSize: 11.5, opacity: 0.65, marginTop: 10 }}>
        Every column except <b>Progress</b> is editable — Progress is worked out from the dates and the status, so change those instead. One row per TRAINING EVENT, not per person — a pilot going back for a new seat, a new aircraft or recurrent training gets another row, and their
        history is kept. Rows marked <b>from chart</b> are pilots the chart shows in a training seat with no record entered yet. <b>Archive</b> keeps a
        record and drops it out of the active list; the ✕ deletes it.
      </div>
    </div>
  );
}
