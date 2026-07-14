import type { ReactNode } from "react";
import type { Seat } from "@/lib/fleet/staffing/types";
import { normSeat, cntSeat, initials } from "@/lib/fleet/staffing/compute";

/** The row of colored seat squares shown inside a card. */
export function SeatSquares({ seat, showParked }: { seat?: Seat | null; showParked: boolean }) {
  const o = normSeat(seat);
  const c = cntSeat(o);
  const squares: ReactNode[] = [];
  let k = 0;
  for (let i = 0; i < c.f; i++) {
    squares.push(<div key={k++} className="seat" style={{ background: "var(--fill-bg)", color: "var(--fill-fg)" }} />);
  }
  for (let i = 0; i < c.tr; i++) {
    squares.push(<div key={k++} className="seat" style={{ background: "var(--train-bg)", color: "var(--train-fg)" }}>T</div>);
  }
  for (let i = 0; i < o.open; i++) {
    squares.push(<div key={k++} className="seat" style={{ background: "transparent", color: "var(--accent)", border: "1.5px dashed var(--accent)" }}>+</div>);
  }
  for (let i = 0; i < o.openNamed.length; i++) {
    squares.push(<div key={k++} className="seat" style={{ background: "transparent", color: "var(--accent)", border: "1.5px dashed var(--accent)" }}>+</div>);
  }
  for (let i = 0; i < o.cand.length; i++) {
    squares.push(<div key={k++} className="seat" style={{ background: "var(--cand-bg)", color: "var(--cand-fg)", border: "1.5px solid var(--accent)" }}>C</div>);
  }
  if (showParked) {
    for (let i = 0; i < c.p; i++) {
      squares.push(<div key={k++} className="seat" style={{ background: "var(--park-bg)", color: "var(--park-fg)", border: "1px dashed var(--park-bd)" }}>P</div>);
    }
  }
  return <div className="seats">{squares}</div>;
}

const TAG_LABEL: Record<string, string> = {
  ARGUS: "ARGUS",
  "Check Airman": "CHECK",
  Standards: "STD",
  "1099": "1099"
};

/** A named person row in a modal column, with optional Lead + qualification tags. */
export function PersonRow({ name, cls, rp, lead, tags }: { name: string; cls: string; rp: string; lead?: boolean; tags?: string[] }) {
  return (
    <div className={`prow ${cls}`}>
      <span className="av">{initials(name)}</span>
      <span className="pn">
        {name}
        {lead ? <span className="ltag">Lead</span> : null}
        {(tags || []).map((t, i) => (
          <span key={i} className={t === "ARGUS" ? "ltag" : "ptag"}>
            {TAG_LABEL[t] || t}
          </span>
        ))}
      </span>
      <span className="rp">{rp}</span>
    </div>
  );
}

/** An unfilled / on-hold slot row in a modal column. */
export function SlotRow({ label, cls, rp }: { label: string; cls: string; rp: string }) {
  return (
    <div className={`prow ${cls}`}>
      <span className="av">{cls === "p" ? "◌" : "+"}</span>
      <span className="pn">{label}</span>
      <span className="rp">{rp}</span>
    </div>
  );
}
