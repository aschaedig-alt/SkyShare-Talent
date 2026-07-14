import type { MxGroup } from "./types";

// Director + department leadership shown in the top node/row.
export const MX_DIRECTOR = {
  org: "SkyShare Maintenance",
  role: "Director of Maintenance",
  name: "Jonathan Schaedig"
};

// Department turnover from the Turnover Manager Dashboard (trailing 12 mo).
export const MX_TURNOVER = { rate: "12.5%", period: "12 mo · Jun '25–May '26" };

// Seed roster for the Maintenance Org Chart, from the current MX employees +
// active candidates CSV. `line` = current employees, `cand` = active candidates
// (count as open until start date), `openNamed` = unfilled roles with a label.
export const MX_GROUPS: MxGroup[] = [
  {
    name: "Supervisors",
    pool: "Line",
    sub: "Maintenance leadership",
    mgr: "Jonathan Schaedig",
    sections: [{ label: "Base Leadership", line: ["Rich Paden"], openNamed: ["Ogden Team Lead", "SLC Team Lead"] }]
  },
  {
    name: "Ogden",
    pool: "Line",
    sub: "OGD · Line Station",
    mgr: "Rich Paden",
    sections: [
      { label: "Days · A&P Techs", line: ["Jeff Gammel", 'Jonathan "JJ" Jehle', "Angel Martinez"] },
      { label: "Afternoons · A&P Techs", cand: ["Daniel Irey"] },
      { label: "Weekends · A&P Techs", line: ["Ben Huff"] },
      { label: "Part-Time · Apprentices", line: ["Dayton James"], cand: ["Gavin Craner"] }
    ]
  },
  {
    name: "Salt Lake City",
    pool: "Line",
    sub: "SLC · Line Station",
    mgr: "Rich Paden",
    sections: [
      { label: "Days · A&P Techs", line: ["Mike Hopkins", "Poom Padmanuja", "Shawn Stafford", "Scott Strahan"] },
      { label: "Afternoons · A&P Techs", cand: ["Jordan Pashayan"] },
      { label: "Weekends · A&P Techs", line: ["Luke Webb"] },
      { label: "Part-Time · Apprentices", cand: ["Bryan Weber"] }
    ]
  },
  {
    name: "Flex Pool",
    pool: "Line",
    sub: "Either Base · OGD / SLC",
    mgr: "Rich Paden",
    sections: [
      { label: "Afternoons · A&P Techs", cand: ["Augustin Quintero", "Ed/Ted Towne"] },
      { label: "Part-Time · A&P Techs", line: ["Spencer Olsen"] }
    ]
  },
  {
    name: "Maintenance Control",
    pool: "Admin",
    sub: "Remote · MX Control",
    mgr: "Jonathan Schaedig",
    sections: [{ label: "Controllers", line: ["Drew Bassett", "Joel Hansen"] }]
  },
  {
    name: "Planning",
    pool: "Admin",
    sub: "Remote · MX Planner",
    mgr: "Jonathan Schaedig",
    sections: [{ label: "Planner", line: ["Charles Hicks"] }]
  },
  {
    name: "Parts & Logistics",
    pool: "Admin",
    sub: "OGD · MX Parts",
    mgr: "Jonathan Schaedig",
    sections: [{ label: "Parts Admin", line: ["Jessica Storey"] }]
  },
  {
    name: "Aircraft Compliance",
    pool: "Admin",
    sub: "Remote · Compliance",
    mgr: "Jonathan Schaedig",
    sections: [{ label: "Compliance Manager", line: ["Don St George"] }]
  }
];
