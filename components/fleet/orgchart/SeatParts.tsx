import type { ReactNode } from "react";
import Link from "next/link";
import type { Seat } from "@/lib/fleet/staffing/types";
import { normSeat, initials } from "@/lib/fleet/staffing/compute";

/** The row of colored seat squares shown inside a card. Filled/training/candidate
 *  seats carry the person's initials; open seats animate marching ants; parked
 *  seats render inline but only when Additional info is shown. */
export function SeatSquares({ seat, showParked }: { seat?: Seat | null; showParked: boolean }) {
  const o = normSeat(seat);
  const squares: ReactNode[] = [];
  let k = 0;
  o.line.forEach((n) => squares.push(<div key={k++} className="seat seat-f"><span>{initials(n)}</span></div>));
  o.train.forEach((n) => squares.push(<div key={k++} className="seat seat-t"><span>{initials(n)}</span></div>));
  o.cand.forEach((n) => squares.push(<div key={k++} className="seat seat-c"><span>{initials(n)}</span></div>));
  o.candInt.forEach((n) => squares.push(<div key={k++} className="seat seat-i"><span>{initials(n)}</span></div>));
  for (let i = 0; i < o.open; i++) squares.push(<div key={k++} className="seat seat-open" />);
  for (let i = 0; i < o.openNamed.length; i++) squares.push(<div key={k++} className="seat seat-open" />);
  if (showParked) {
    for (let i = 0; i < o.parked; i++) squares.push(<div key={k++} className="seat seat-p"><span>P</span></div>);
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
export function PersonRow({
  name,
  cls,
  rp,
  lead,
  tags,
  href
}: {
  name: string;
  cls: string;
  rp: string;
  lead?: boolean;
  tags?: string[];
  /** When set, the person's name links to their candidate profile. */
  href?: string;
}) {
  return (
    <div className={`prow ${cls}`}>
      <span className="av">{initials(name)}</span>
      <span className="pn">
        {href ? (
          <Link href={href} style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: "2px" }}>
            {name}
          </Link>
        ) : (
          name
        )}
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
