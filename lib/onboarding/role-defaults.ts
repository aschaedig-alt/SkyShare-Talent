// Which checklist steps a new hire's ROLE rules out, so they start at N/A instead
// of sitting at To do until somebody marks them by hand. Her list, 2026-11-13:
//
//   Pilot app, Insurance form   pilots only
//   Document request email      pilots and maintenance
//   Drug screen (docs to ITS)   pilots, maintenance techs, line techs, flight
//                               (cabin) attendants and Sky Ops — the last two
//                               added at his correction the same day
//   iPad                        pilots only — support never needs one
//   Company credit card         NEVER defaulted. Pilots always get one (it reads
//                               "Requested", lib/onboarding/holds.ts); support
//                               may or may not, so it stays a decision.
//
// DEFAULTS, NOT RULES. Applied once, when the checklist is created, and only to
// steps still at To do; anything can be set back from the checklist. Nothing
// here touches a hire who already exists.
//
// The role is read from the position title first and the department second.
// Department strings are free text here ("FlightOps", "Pilot", "Maintenance",
// "FBO | DVO", "OGD FBO"...), so they are matched loosely and only where the
// title has not already decided it.
//
// This file imports nothing from the server; lib/onboarding/holds.ts and the
// client share it.

const PILOT_TITLE = /\b(captain|first officer|f\/?o|pic|sic|pilot)\b/i;
const MX_DEPARTMENT = /^\s*maint/i;
const MX_TITLE = /\b(maintenance|mx|mechanic|a&p|amt|avionics)\b/i;
const MX_TECH_TITLE = /\b(tech|technician|apprentice|mechanic|a&p|amt|avionics)\b/i;
const LINE_TECH_TITLE = /\b(line\s*(service\s*)?tech(nician)?|lineman|line\s*service)\b/i;
const CABIN_ATTENDANT_TITLE = /\b(cabin|flight)\s*attendant\b/i;
// Sky Ops by TITLE, because the department string is not enough on its own:
// detailing specialists are filed under "SkyOps | Detailing" and one charter
// sales seat under "SkyOps", and neither is ops.
const OPS_TITLE = /\b(sky\s*ops|flight\s*coordinator|dispatch(er)?)\b/i;

/** Sky Ops — coordinators, representatives, team lead, manager. */
export function isOpsRole(position: string | null | undefined, department: string | null | undefined): boolean {
  const title = position ?? "";
  // "Sky Ops Airplane Detailer" names Sky Ops but is detailing.
  if (/\b(sales|detail)/i.test(title)) return false;
  if (OPS_TITLE.test(title)) return true;
  return /^\s*sky\s*ops\s*$/i.test(department ?? "");
}

export function isCabinAttendant(position: string | null | undefined): boolean {
  return CABIN_ATTENDANT_TITLE.test(position ?? "");
}

export function isPilotRole(position: string | null | undefined, department: string | null | undefined): boolean {
  if (PILOT_TITLE.test(position ?? "")) return true;
  // A blank title filed under the department "Pilot".
  return !(position ?? "").trim() && /^\s*pilot\s*$/i.test(department ?? "");
}

export function isMaintenanceRole(position: string | null | undefined, department: string | null | undefined): boolean {
  return MX_DEPARTMENT.test(department ?? "") || MX_TITLE.test(position ?? "");
}

/** A hands-on maintenance technician, as opposed to a planner or manager. A bare
 * "Maintenance" title counts — that is how two techs are filed. */
export function isMaintenanceTech(position: string | null | undefined, department: string | null | undefined): boolean {
  if (!isMaintenanceRole(position, department)) return false;
  const title = (position ?? "").trim();
  // A facilities technician maintains the building, not aircraft.
  if (/facilit/i.test(title)) return false;
  return MX_TECH_TITLE.test(title) || /^maintenance$/i.test(title);
}

export function isLineTech(position: string | null | undefined): boolean {
  return LINE_TECH_TITLE.test(position ?? "");
}

/**
 * Should this step start at N/A for this person? `label` is needed for the iPad,
 * which is a custom milestone matched by key prefix or label.
 */
export function defaultsToNotApplicable(
  key: string,
  label: string | null | undefined,
  position: string | null | undefined,
  department: string | null | undefined
): boolean {
  const pilot = isPilotRole(position, department);
  if (pilot) return false;
  switch (key) {
    case "pilot_app":
    case "ebco_form":
      return true;
    case "pilot_doc_request":
      return !isMaintenanceRole(position, department);
    case "drug_screen":
      return (
        !isMaintenanceTech(position, department) &&
        !isLineTech(position) &&
        !isCabinAttendant(position) &&
        !isOpsRole(position, department)
      );
  }
  return key.startsWith("custom_received_ipad") || (key.startsWith("custom_") && /\bipad\b/i.test(label ?? ""));
}
