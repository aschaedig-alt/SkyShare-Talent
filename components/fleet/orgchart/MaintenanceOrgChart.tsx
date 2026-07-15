"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { MxGroup, MxSection } from "@/lib/fleet/staffing/types";
import { normSeat, cntSeat } from "@/lib/fleet/staffing/compute";
import { MX_GROUPS, MX_DIRECTOR, MX_TURNOVER } from "@/lib/fleet/staffing/maintenance-data";
import { SeatSquares, PersonRow, SlotRow } from "./SeatParts";
import styles from "./OrgChart.module.css";

type SortKey = "Team size" | "Open seats";

function groupTotals(d: MxGroup) {
  let f = 0;
  let tr = 0;
  let o = 0;
  let at = 0;
  let p = 0;
  d.sections.forEach((sec) => {
    const c = cntSeat(normSeat(sec));
    f += c.f;
    tr += c.tr;
    o += c.o;
    at += c.at;
    p += c.p;
  });
  return { f, tr, o, at, p };
}

function SectionCol({ sec }: { sec: MxSection }) {
  const o = normSeat(sec);
  const c = cntSeat(o);
  const rows: ReactNode[] = [];
  o.line.forEach((n, i) => rows.push(<PersonRow key={`l${i}`} name={n} cls="g" rp="On staff" />));
  o.train.forEach((n, i) => rows.push(<PersonRow key={`t${i}`} name={n} cls="t" rp="In training" />));
  o.cand.forEach((n, i) => rows.push(<PersonRow key={`c${i}`} name={n} cls="r" rp="Candidate" />));
  o.openNamed.forEach((lbl, i) => rows.push(<SlotRow key={`on${i}`} label={lbl} cls="o" rp="To fill" />));
  for (let i = 0; i < o.open; i++) rows.push(<SlotRow key={`o${i}`} label="Open position" cls="o" rp="Sourcing" />);
  return (
    <div className="m-col">
      <div className="colh">
        <span>{sec.label}</span>
        <span>
          {c.f + c.tr}/{c.at}
        </span>
      </div>
      {rows}
    </div>
  );
}

function Pipeline({ d }: { d: MxGroup }) {
  const inn: { name: string; note: string }[] = [];
  const open: { name: string; note: string }[] = [];
  d.sections.forEach((sec) => {
    const shift = sec.label.split("·")[0].trim();
    (sec.cand || []).forEach((n) => inn.push({ name: n, note: `${shift} · candidate` }));
    (sec.train || []).forEach((n) => inn.push({ name: n, note: `${shift} · in training` }));
    (sec.openNamed || []).forEach((lbl) => open.push({ name: lbl, note: "to fill" }));
    for (let i = 0; i < (sec.open || 0); i++) open.push({ name: `Open ${shift} req`, note: "sourcing" });
  });
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
      <div className="mh4">Hiring pipeline</div>
      <div className="mgrid">
        {block("In progress", "inn", inn)}
        {block("Unfilled reqs", "outt", open)}
      </div>
    </div>
  );
}

export default function MaintenanceOrgChart() {
  const [sort, setSort] = useState<SortKey>("Team size");
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const groups = MX_GROUPS.map((d, idx) => {
    const t = groupTotals(d);
    let status = "STAFFED";
    let bBg = "var(--fill-soft)";
    let bFg = "var(--fill-fg)";
    let rule = "var(--green)";
    if (t.o > 0) {
      status = "HIRING";
      bBg = "var(--open-soft-bg)";
      bFg = "var(--open-soft-fg)";
      rule = "var(--accent)";
    } else if (t.tr > 0) {
      status = "TRAINING";
      bBg = "var(--train-bg)";
      bFg = "var(--train-fg)";
      rule = "var(--gold)";
    }
    return { d, idx, t, status, bBg, bFg, rule };
  });

  const filled = groups.reduce((a, g) => a + g.t.f + g.t.tr, 0);
  const open = groups.reduce((a, g) => a + g.t.o, 0);
  const target = groups.reduce((a, g) => a + g.t.at, 0);
  const hiring = groups.filter((g) => g.t.o > 0).length;

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
  }, [sort]);

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
    if (sort === "Open seats") a.sort((x, y) => y.t.o - x.t.o);
    return a;
  };

  const Card = ({ g }: { g: G }) => {
    const barCls = g.t.o > 0 ? "r" : g.t.tr > 0 ? "y" : "g";
    const barWord = g.t.o > 0 ? "Hiring" : g.t.tr > 0 ? "Training" : "Staffed";
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
              {g.t.f + g.t.tr} of {g.t.at} staffed
            </span>
          </div>
          <div className="bd">
            {g.d.sections.map((sec, i) => {
              const c = cntSeat(normSeat(sec));
              return (
                <div className="row" key={i}>
                  <div className="kk">
                    {sec.label} ·{" "}
                    <span className={`cnt${c.o >= 2 ? " alert" : ""}`}>
                      <b>{c.f + c.tr}</b>/{c.at}
                    </span>
                  </div>
                  <SeatSquares seat={sec} showParked={false} />
                </div>
              );
            })}
          </div>
          <div className="foot">
            <span className="kk" style={{ color: "inherit", opacity: 0.85 }}>
              Open reqs
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="taphint" style={{ color: "var(--n400)" }}>
                view team
              </span>
              <span className="n">{g.t.o}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  const Section = ({ title, list, bg, fg }: { title: string; list: G[]; bg: string; fg: string }) => {
    const f = list.reduce((n, g) => n + g.t.f + g.t.tr, 0);
    const t = list.reduce((n, g) => n + g.t.at, 0);
    const op = list.reduce((n, g) => n + g.t.o, 0);
    return (
      <>
        <div className="divband" style={{ background: bg, color: fg }}>
          <div className="divtitle">{title}</div>
          <div className="divinline">
            {f}/{t} filled · <b>{op}</b> open
          </div>
        </div>
        <div className="grid g4">
          {sortG(list).map((g) => (
            <Card key={g.idx} g={g} />
          ))}
        </div>
      </>
    );
  };

  const lineG = groups.filter((g) => g.d.pool === "Line");
  const admG = groups.filter((g) => g.d.pool === "Admin");

  const active = openIdx != null ? MX_GROUPS[openIdx] : null;
  const at = active ? groupTotals(active) : null;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className="hd">
        <div>
          <div className="kk" style={{ color: "var(--gold)" }}>
            SkyShare · Maintenance
          </div>
          <div className="ttl">Maintenance Org Chart</div>
          <div className="desc">
            Maintenance staffing across the maintenance teams and the administrative group.{" "}
            <b>Click any group to see its people.</b> Candidates and unfilled lead roles count as open positions until they start.
          </div>
          <div className="ctrls">
            <div className="seg">
              <span className="lbl">Sort</span>
              <button className={sort === "Team size" ? "on" : ""} onClick={() => setSort("Team size")}>
                Team size
              </button>
              <button className={sort === "Open seats" ? "on" : ""} onClick={() => setSort("Open seats")}>
                Open seats
              </button>
            </div>
          </div>
        </div>
        <div className="right">
          <div className="kk" style={{ color: "var(--gold)" }}>
            Open positions
          </div>
          <div className="big">{open}</div>
          <div className="kk" style={{ marginTop: 8 }}>
            {hiring} groups hiring
          </div>
        </div>
      </div>

      <div className="toptree">
        <div className="mgmt">
          <div className="chief">
            <div className="role">
              <div className="kk kkw">{MX_DIRECTOR.org}</div>
              <div className="r1">{MX_DIRECTOR.role}</div>
              <div className="kk kkw" style={{ marginTop: 7, letterSpacing: "0.06em" }}>
                {MX_DIRECTOR.name}
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
                <div className="n">{MX_TURNOVER.rate}</div>
                <div className="kk kkw" style={{ marginTop: 5 }}>
                  Turnover · {MX_TURNOVER.period}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="vline" />
      </div>

      <Section title="Maintenance" list={lineG} bg="var(--band-fractional-bg)" fg="var(--band-fractional-fg)" />
      <div className="secgap" />
      <Section title="Administrative" list={admG} bg="var(--band-managed-bg)" fg="var(--band-managed-fg)" />

      <div className="legend">
        <span className="kk" style={{ color: "var(--n600)" }}>
          Legend
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--fill-bg)" }} />
          On staff
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--cand-bg)", border: "1.5px solid var(--accent)" }} />
          Candidate · hiring
        </span>
        <span className="it">
          <span className="sw" style={{ background: "var(--train-bg)" }} />
          In training
        </span>
        <span className="it">
          <span className="sw" style={{ background: "transparent", border: "1.5px dashed var(--accent)" }} />
          Open req
        </span>
        <Link className="grow" href="/fleet/crew" style={{ color: "var(--ink)", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}>
          Crew org chart →
        </Link>
      </div>
      <span className="mockflag">Seed data · current MX roster + active candidates · candidates count as open until start date</span>

      <div className={`backdrop${active ? " open" : ""}`} onClick={() => setOpenIdx(null)} />
      <div className={`modal${active ? " open" : ""}`} role="dialog" aria-modal="true">
        {active && at ? (
          <>
            <div className="m-h">
              <button className="m-close" aria-label="Close" onClick={() => setOpenIdx(null)}>
                ✕
              </button>
              <div className="m-ty">{active.name}</div>
              <div className="m-sub">
                {active.sub} · {at.f}/{at.at} staffed · reports to {active.mgr}
              </div>
            </div>
            <div className="m-cols">
              {active.sections.map((sec, i) => (
                <SectionCol key={i} sec={sec} />
              ))}
            </div>
            <Pipeline d={active} />
          </>
        ) : null}
      </div>
    </div>
  );
}
