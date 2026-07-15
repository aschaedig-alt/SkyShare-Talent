"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { CrewGroup, Seat } from "@/lib/fleet/staffing/types";
import { normSeat, cntSeat } from "@/lib/fleet/staffing/compute";
import { CREW_GROUPS, CREW_LEADERSHIP, CREW_TRAINING, CREW_PILOT_TURNOVER, turnoverFor } from "@/lib/fleet/staffing/crew-data";
import { SeatSquares, PersonRow, SlotRow } from "./SeatParts";
import styles from "./OrgChart.module.css";

type SortKey = "Fleet size" | "Open seats";
type ParkedKey = "hide" | "show";

function ColBody({
  seat,
  leadName,
  showParked,
  tags
}: {
  seat?: Seat | null;
  leadName?: string;
  showParked: boolean;
  tags?: Record<string, string[]>;
}) {
  if (!seat) return <div className="m-empty">Single-pilot / two-captain aircraft — no first-officer seat.</div>;
  const o = normSeat(seat);
  const rows: ReactNode[] = [];
  o.line.forEach((n, i) => rows.push(<PersonRow key={`l${i}`} name={n} cls="g" rp="On line" lead={n === leadName} tags={tags?.[n]} />));
  o.train.forEach((n, i) => rows.push(<PersonRow key={`t${i}`} name={n} cls="t" rp="In training" tags={tags?.[n]} />));
  o.cand.forEach((n, i) => rows.push(<PersonRow key={`c${i}`} name={n} cls="r" rp="Tentative" tags={tags?.[n]} />));
  for (let i = 0; i < o.open; i++) rows.push(<SlotRow key={`o${i}`} label="Open seat" cls="o" rp="Sourcing" />);
  if (showParked) for (let i = 0; i < o.parked; i++) rows.push(<SlotRow key={`p${i}`} label="On hold (parked)" cls="p" rp="Not counted" />);
  if (rows.length === 0) return <div className="m-empty">No crew listed.</div>;
  return <>{rows}</>;
}

function Transitions({ d }: { d: CrewGroup }) {
  const inn: { name: string; note: string }[] = [];
  [d.pic, d.sic].forEach((seat) => {
    if (!seat) return;
    (seat.train || []).forEach((n) => inn.push({ name: n, note: CREW_TRAINING[n] || "arriving · in training" }));
  });
  const out = (d.out || []).map((x) => ({
    name: x.name,
    note: x.to ? `to ${x.to}${x.reason ? ` · ${x.reason}` : ""}` : x.reason || "departing"
  }));
  const block = (title: string, cls: string, arr: { name: string; note: string }[]) => (
    <div className={`tcard ${cls}`}>
      <div className="th">
        {title} ({arr.length})
      </div>
      {arr.length ? (
        arr.map((x, i) => (
          <div key={i} className="ti">
            <b>{x.name}</b>
            <span className="tz">{x.note}</span>
          </div>
        ))
      ) : (
        <div className="tnone">None recorded</div>
      )}
    </div>
  );
  return (
    <div className="m-move">
      <div className="mh4">Pilot movement</div>
      <div className="mgrid">
        {block("Transitioning in", "inn", inn)}
        {block("Transitioning out", "outt", out)}
      </div>
    </div>
  );
}

export default function CrewOrgChart() {
  const [sort, setSort] = useState<SortKey>("Fleet size");
  const [parked, setParked] = useState<ParkedKey>("hide");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const showParked = parked === "show";

  const groups = CREW_GROUPS.map((d, idx) => {
    const p = normSeat(d.pic);
    const s = d.sic ? normSeat(d.sic) : null;
    const cp = cntSeat(p);
    const cs = s ? cntSeat(s) : null;
    const o = cp.o + (cs ? cs.o : 0);
    const tr = cp.tr + (cs ? cs.tr : 0);
    let status = "STAFFED";
    let bBg = "var(--fill-soft)";
    let bFg = "var(--fill-fg)";
    let rule = "var(--green)";
    if (o > 0) {
      status = "HIRING";
      bBg = "var(--open-soft-bg)";
      bFg = "var(--open-soft-fg)";
      rule = "var(--accent)";
    } else if (tr > 0) {
      status = "TRAINING";
      bBg = "var(--train-bg)";
      bFg = "var(--train-fg)";
      rule = "var(--gold)";
    }
    return { d, idx, cp, cs, o, tr, status, bBg, bFg, rule };
  });

  const counted = groups.filter((g) => !g.d.noCount);
  // filled includes in-training (a signed pilot fills the seat, even pre-line)
  const filled = counted.reduce((a, g) => a + g.cp.f + g.cp.tr + (g.cs ? g.cs.f + g.cs.tr : 0), 0);
  const open = counted.reduce((a, g) => a + g.o, 0);
  const target = counted.reduce((a, g) => a + g.cp.at + (g.cs ? g.cs.at : 0), 0);
  const hiring = counted.filter((g) => g.o > 0).length;

  useEffect(() => {
    const equalize = () => {
      const root = wrapRef.current;
      if (!root) return;
      const cards = root.querySelectorAll<HTMLElement>(".card");
      cards.forEach((c) => {
        c.style.minHeight = "0px";
      });
      let mx = 0;
      cards.forEach((c) => {
        const h = c.getBoundingClientRect().height;
        if (h > mx) mx = h;
      });
      if (mx > 0) cards.forEach((c) => (c.style.minHeight = `${Math.round(mx)}px`));
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(equalize));
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(equalize, 120);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
    };
  }, [sort, parked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIdx(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  type G = (typeof groups)[number];
  const sortG = (list: G[]) => {
    const a = list.slice();
    if (sort === "Open seats") a.sort((x, y) => y.o - x.o);
    return a;
  };

  const Card = ({ g }: { g: G }) => {
    if (g.d.poolFlown) {
      return (
        <div className="gcol">
          <div
            className="card"
            tabIndex={0}
            role="button"
            onClick={() => setOpenIdx(g.idx)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpenIdx(g.idx);
              }
            }}
          >
            <div className="statusbar n">
              <span className="word">Shared</span>
            </div>
            <div className="ch">
              <div>
                <div className="nm">{g.d.name}</div>
                <div className="kk" style={{ marginTop: 6 }}>
                  {g.d.sub}
                </div>
              </div>
            </div>
            <div className="bd">
              <div className="shared" style={{ marginTop: 0 }}>
                {g.d.poolNote || "Crew drawn from the shared fractional pool — no dedicated seat or open req."}
              </div>
            </div>
            <div className="foot">
              <span className="kk" style={{ color: "inherit", opacity: 0.85 }}>
                Open reqs
              </span>
              <span className="n">0</span>
            </div>
          </div>
        </div>
      );
    }
    const totFilled = g.cp.f + g.cp.tr + (g.cs ? g.cs.f + g.cs.tr : 0);
    const totTgt = g.cp.at + (g.cs ? g.cs.at : 0);
    const cabinCount = g.d.cabin ? cntSeat(normSeat(g.d.cabin)) : null;
    const inN = g.cp.tr + (g.cs ? g.cs.tr : 0);
    const outN = g.d.out ? g.d.out.length : 0;
    const tn = turnoverFor(g.d);
    const turnEl = (
      <>
        Turnover <b>{tn && tn.r != null ? `${tn.r}%` : "—"}</b>
        {tn && tn.t != null ? (
          <>
            {" "}
            · fill <b>{tn.t}d</b>
          </>
        ) : null}
      </>
    );
    const barCls = g.o > 0 ? "r" : g.tr > 0 ? "y" : "g";
    const barWord = g.o > 0 ? "Hiring" : g.tr > 0 ? "Training" : "Staffed";
    return (
      <div className="gcol">
        <div
          className="card"
          tabIndex={0}
          role="button"
          onClick={() => setOpenIdx(g.idx)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpenIdx(g.idx);
            }
          }}
        >
          <div className={`statusbar ${barCls}`}>
            <span className="word">{barWord}</span>
          </div>
          <div className="ch">
            <div>
              <div className="nm">{g.d.name}</div>
              <div className="kk" style={{ marginTop: 6 }}>
                {g.d.sub}
              </div>
            </div>
          </div>
          <div className="meta">
            <span className="seats-txt">
              {totFilled} of {totTgt} seats
            </span>
            <span className="flow">
              <span className={inN ? "flow-in" : "flow-z"}>↑ {inN} in</span>
              <span className="flow-z">·</span>
              <span className="flow-out">↓ {outN} out</span>
            </span>
          </div>
          <div className="bd">
            <div className="row">
              <div className="kk">
                Captains ·{" "}
                <span className={`cnt${g.cp.o >= 2 ? " alert" : ""}`}>
                  <b>{g.cp.f + g.cp.tr}</b>/{g.cp.at}
                </span>
              </div>
              <SeatSquares seat={g.d.pic} showParked={showParked} />
            </div>
            {g.cs ? (
              <div className="row">
                <div className="kk">
                  First Officers ·{" "}
                  <span className={`cnt${g.cs.o >= 2 ? " alert" : ""}`}>
                    <b>{g.cs.f + g.cs.tr}</b>/{g.cs.at}
                  </span>
                </div>
                <SeatSquares seat={g.d.sic} showParked={showParked} />
              </div>
            ) : (
              <div className="row">
                <div className="kk">First Officers</div>
                <div className="shared">{g.d.pool === "SkyShare" ? "shared crew" : "no first-officer seat"}</div>
              </div>
            )}
            {g.d.cabin && cabinCount ? (
              <div className="row">
                <div className="kk">
                  Cabin ·{" "}
                  <span className={`cnt${cabinCount.o >= 2 ? " alert" : ""}`}>
                    <b>{cabinCount.f + cabinCount.tr}</b>/{cabinCount.at}
                  </span>
                </div>
                <SeatSquares seat={g.d.cabin} showParked={showParked} />
              </div>
            ) : null}
            {g.d.note ? <div className="cardnote">{g.d.note}</div> : null}
            {showParked ? <div className="turn">{turnEl}</div> : null}
          </div>
          <div className="foot">
            <span className="kk" style={{ color: "inherit", opacity: 0.85 }}>
              Open reqs
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="taphint" style={{ color: "var(--n400)" }}>
                view crew
              </span>
              <span className="n">{g.o}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  const Section = ({ title, list, bg, fg }: { title: string; list: G[]; bg: string; fg: string }) => {
    const cl = list.filter((g) => !g.d.noCount);
    const f = cl.reduce((n, g) => n + g.cp.f + g.cp.tr + (g.cs ? g.cs.f + g.cs.tr : 0), 0);
    const t = cl.reduce((n, g) => n + g.cp.at + (g.cs ? g.cs.at : 0), 0);
    const op = cl.reduce((n, g) => n + g.o, 0);
    return (
      <>
        <div className="divband" style={{ background: bg, color: fg }}>
          <div className="divtitle">{title}</div>
          <div className="divinline">
            {f}/{t} filled · <b>{op}</b> open
          </div>
        </div>
        <div className="grid">
          {sortG(list).map((g) => (
            <Card key={g.idx} g={g} />
          ))}
        </div>
      </>
    );
  };

  const ssG = groups.filter((g) => g.d.pool === "SkyShare");
  const mgG = groups.filter((g) => g.d.pool === "Managed");

  const active = openIdx != null ? CREW_GROUPS[openIdx] : null;
  const ap = active ? normSeat(active.pic) : null;
  const as = active && active.sic ? normSeat(active.sic) : null;
  const acp = ap ? cntSeat(ap) : null;
  const acs = as ? cntSeat(as) : null;
  const acab = active && active.cabin ? normSeat(active.cabin) : null;
  const acabc = acab ? cntSeat(acab) : null;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className="hd">
        <div>
          <div className="kk" style={{ color: "var(--gold)" }}>
            SkyShare · Flight Operations
          </div>
          <div className="ttl">Crew Org Chart</div>
          <div className="desc">
            Flight Operations by aircraft group — fractional/charter aircraft plus each managed tail.{" "}
            <b>Click any aircraft to see its pilots.</b> In-training pilots count as filled; turnover &amp; parked seats live under Additional info.
          </div>
          <div className="ctrls">
            <div className="seg">
              <span className="lbl">Sort</span>
              <button className={sort === "Fleet size" ? "on" : ""} onClick={() => setSort("Fleet size")}>
                Fleet size
              </button>
              <button className={sort === "Open seats" ? "on" : ""} onClick={() => setSort("Open seats")}>
                Open seats
              </button>
            </div>
            <div className="seg">
              <span className="lbl">Additional info</span>
              <button className={parked === "hide" ? "on" : ""} onClick={() => setParked("hide")}>
                Hide
              </button>
              <button className={parked === "show" ? "on" : ""} onClick={() => setParked("show")}>
                Show
              </button>
            </div>
          </div>
        </div>
        <div className="right">
          <div className="kk" style={{ color: "var(--gold)" }}>
            Open reqs
          </div>
          <div className="big">{open}</div>
          <div className="kk" style={{ marginTop: 8 }}>
            {hiring} groups hiring
          </div>
        </div>
      </div>

      <div className="toptree">
        <div className="mgmt">
          <div className="mbox">
            <div className="t">{CREW_LEADERSHIP.assistants[0].name}</div>
            <div className="mr">{CREW_LEADERSHIP.assistants[0].role}</div>
          </div>
          <div className="chief">
            <div className="role">
              <div className="kk kkw">{CREW_LEADERSHIP.reportsTo}</div>
              <div className="r1">{CREW_LEADERSHIP.chiefRole}</div>
              <div className="kk kkw" style={{ marginTop: 7, letterSpacing: "0.06em" }}>
                {CREW_LEADERSHIP.chiefName}
              </div>
            </div>
            <div className="stats">
              <div>
                <div className="n">{filled}</div>
                <div className="kk kkw" style={{ marginTop: 5 }}>
                  Filled
                </div>
              </div>
              <div>
                <div className="n acc">{open}</div>
                <div className="kk kkw" style={{ marginTop: 5 }}>
                  Open
                </div>
              </div>
              <div>
                <div className="n">{target}</div>
                <div className="kk kkw" style={{ marginTop: 5 }}>
                  Target
                </div>
              </div>
              <div>
                <div className="n">{CREW_PILOT_TURNOVER.rate}</div>
                <div className="kk kkw" style={{ marginTop: 5 }}>
                  Turnover · {CREW_PILOT_TURNOVER.period}
                </div>
              </div>
            </div>
          </div>
          <div className="mbox">
            <div className="t">{CREW_LEADERSHIP.assistants[1].name}</div>
            <div className="mr">{CREW_LEADERSHIP.assistants[1].role}</div>
          </div>
        </div>
        <div className="vline" />
      </div>

      <Section title="Fractional / Charter Aircraft" list={ssG} bg="var(--band-fractional-bg)" fg="var(--band-fractional-fg)" />
      <div className="secgap" />
      <Section title="Managed / Dedicated Aircraft" list={mgG} bg="var(--band-managed-bg)" fg="var(--band-managed-fg)" />

      <div className="legend">
        <span className="kk" style={{ color: "var(--n600)" }}>
          Legend
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--fill-bg)" }} />
          Filled
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--train-bg)" }} />
          In training
        </span>
        <span className="it">
          <span className="sw" style={{ background: "transparent", border: "1.5px dashed var(--accent)" }} />
          Open req
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--cand-bg)", border: "1.5px solid var(--accent)" }} />
          Tentative candidate
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--park-bg)", border: "1px dashed var(--park-bd)" }} />
          Parked · not counted
        </span>
        <span className="it">
          <span className="ptag" style={{ marginLeft: 0 }}>+TYPE</span>
          Dual-qualified
        </span>
        <Link className="grow" href="/fleet/maintenance" style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
          Maintenance org chart →
        </Link>
      </div>
      <span className="mockflag">Live data · Paycom + fleet summary + Recruiting Status Tracking (Master + Training) + turnover dashboard — Jul 2026 · roster, open reqs, training, time-to-fill &amp; department turnover all sourced</span>

      <div className={`backdrop${active ? " open" : ""}`} onClick={() => setOpenIdx(null)} />
      <div className={`modal${active ? " open" : ""}`} role="dialog" aria-modal="true">
        {active && active.poolFlown ? (
          <>
            <div className="m-h">
              <button className="m-close" aria-label="Close" onClick={() => setOpenIdx(null)}>
                ✕
              </button>
              <div className="m-ty">{active.name}</div>
              <div className="m-sub">{active.sub} · shared-pool tail</div>
            </div>
            <div className="m-move">
              <div className="m-empty">
                This managed tail has no dedicated crew — it is flown by the shared fractional PC-12 pool, so it carries no seats or open reqs of its own.
              </div>
            </div>
          </>
        ) : null}
        {active && !active.poolFlown && ap && acp ? (
          <>
            <div className="m-h">
              <button className="m-close" aria-label="Close" onClick={() => setOpenIdx(null)}>
                ✕
              </button>
              <div className="m-ty">{active.name}</div>
              <div className="m-sub">
                {active.sub} · {acp.f}/{acp.at} captains
                {as && acs ? ` · ${acs.f}/${acs.at} first officers` : ""}
              </div>
            </div>
            <div className="m-cols">
              <div className="m-col">
                <div className="colh">
                  <span>Captains</span>
                  <span>
                    {acp.f}/{acp.at}
                  </span>
                </div>
                <ColBody seat={active.pic} leadName={active.lead} showParked={showParked} tags={active.tags} />
              </div>
              <div className="m-col">
                <div className="colh">
                  <span>First Officers</span>
                  <span>{as && acs ? `${acs.f}/${acs.at}` : "—"}</span>
                </div>
                <ColBody seat={active.sic} showParked={showParked} tags={active.tags} />
              </div>
              {acab && acabc ? (
                <div className="m-cab">
                  <div className="colh">
                    <span>Cabin</span>
                    <span>
                      {acabc.f}/{acabc.at}
                    </span>
                  </div>
                  {acab.line.map((n, i) => (
                    <PersonRow key={`cl${i}`} name={n} cls="g" rp="On board" />
                  ))}
                  {acab.openNamed.map((l, i) => (
                    <SlotRow key={`co${i}`} label={l} cls="o" rp="To fill" />
                  ))}
                </div>
              ) : null}
            </div>
            <Transitions d={active} />
            <div className="m-photo">
              {active.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={active.photo} alt={`${active.name} photo`} />
              ) : (
                <div className="ph">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="1.5" />
                    <circle cx="8.5" cy="10" r="1.6" />
                    <path d="M4 17 l4.5-4.5 3 3 4-5 4.5 6" />
                  </svg>
                  <span>Aircraft photo</span>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
