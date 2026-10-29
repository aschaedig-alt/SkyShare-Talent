// Who the calendar file's interviewer addresses are, where Journey cannot tell by
// itself. Journey names an address ("dcarter") only when somebody's SkyShare email
// is exactly it; these are past employees whose address is no longer on file, older
// addresses of people still here, and a shared inbox. Every one was identified by
// Aimee on 2026-10-29 - never inferred from the address.

/** An address no one in Journey carries -> the person it belonged to (NewHire id). */
export const HANDLE_PERSON: Record<string, string> = {
  ayousef: "cmr5dz10q004n6grmtqy2y8f7", // Allen Youssef, former assistant chief pilot
  blowe: "cmr18a8zo003n04jq9v7s9zsp", // Brent Lowe, former chief pilot
  dmahan: "cmr18a7uk003204jqb2bnzqea", // Dalton Mahan, OGD FBO
  gjohnson: "cmr5jc2ds000u2crmchzsfony", // Greg Johnson, former VP
  phil: "cmr5dwsmp000l0ormm9k67w30", // Phil Torsello, former VP
  lbeach: "cmr18a7kp002x04jqd1dvz3vw", // Linda Beach
  tgreen: "cmr18a711002n04jq3lstnthm", // Trent Green
  dmoore: "cmr18a78w002r04jql319c36u", // Destini Moore
  nengel: "cmr5dwt0f000t0orm61z2snlo", // Nikki (Nichole) Engel
  sadams: "cmr18a93l003p04jqvg44f5az", // Scott Adams, pilot
  michael: "cmr5dwrw500080orm0czohygz", // Michael Patwin, former VP
  patrick: "cmr18a39i000q04jqsuhn0j1e" // Patrick Mcpartland, former DO
};

/** An older or shared address -> the address it stands for; null means it is not a
    person and is dropped (svr@ is the SVR inbox - Chantil Hughes, already on the invite). */
export const HANDLE_SAME_AS: Record<string, string | null> = {
  coryb: "cb", // Cory Bengtzen's older address
  craig: "crich", // Craig Rich's older address
  athrossell: "areeder", // Amanda Reeder, before her name changed
  svr: null
};

/** The people on an invite, each once, under their current address. */
export function canonicalHandles(handles: string[]): string[] {
  const out = handles.map((h) => (h in HANDLE_SAME_AS ? HANDLE_SAME_AS[h] : h)).filter((h): h is string => !!h);
  return [...new Set(out)];
}
