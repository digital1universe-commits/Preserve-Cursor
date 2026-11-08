export type Role =
  | "superadmin"
  | "agency_admin"
  | "commander"
  | "planner"
  | "search_coordinator"
  | "field_officer"
  | "observer";

export type ModuleName = "cordon" | "containment" | "land_sar" | "marine_sar";
export type IncidentKind = ModuleName;
export type GrantLevel = "none" | "view" | "plan";

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "System registrar",
  agency_admin: "Agency admin",
  commander: "Incident commander",
  planner: "Tactical planner",
  search_coordinator: "Search coordinator",
  field_officer: "Field officer",
  observer: "Observer",
};

const ROLES = new Set<Role>(Object.keys(ROLE_LABEL) as Role[]);

export function isRole(value: string): value is Role {
  return ROLES.has(value as Role);
}

export function canManageUsers(role: Role): boolean {
  return role === "superadmin" || role === "agency_admin";
}

export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor === "superadmin") return true;
  return actor === "agency_admin" && target !== "superadmin";
}

export function canCreateIncident(role: Role, kind: IncidentKind): boolean {
  if (role === "superadmin" || role === "agency_admin" || role === "commander" || role === "planner") {
    return true;
  }
  return role === "search_coordinator" && (kind === "land_sar" || kind === "marine_sar");
}

export function canViewIncident(args: {
  role: Role;
  sameAgency: boolean;
  grant: GrantLevel;
  member: boolean;
}): boolean {
  if (args.role === "superadmin") return true;
  if (!args.sameAgency && args.grant === "none") return false;
  if (args.role === "field_officer") return args.member;
  if (args.role === "observer") return args.sameAgency ? args.member : args.grant !== "none";
  return args.sameAgency || args.grant !== "none";
}

export function canUpdateIncident(role: Role, sameAgency: boolean): boolean {
  if (role === "superadmin") return true;
  return sameAgency && (role === "agency_admin" || role === "commander");
}

export function canRunPlan(
  role: Role,
  module: ModuleName,
  sameAgency: boolean,
  grant: GrantLevel,
): boolean {
  if (!sameAgency && grant !== "plan" && role !== "superadmin") return false;
  const allowed: Record<ModuleName, Role[]> = {
    cordon: ["superadmin", "agency_admin", "commander", "planner"],
    containment: ["superadmin", "agency_admin", "commander", "planner"],
    land_sar: ["superadmin", "agency_admin", "commander", "planner", "search_coordinator"],
    marine_sar: ["superadmin", "agency_admin", "commander", "planner", "search_coordinator"],
  };
  return allowed[module].includes(role);
}

export function canViewAudit(role: Role): boolean {
  return role === "superadmin" || role === "agency_admin" || role === "commander";
}

export function planPermissions(
  role: Role,
  sameAgency: boolean,
  grant: GrantLevel,
): Record<ModuleName, boolean> {
  return {
    cordon: canRunPlan(role, "cordon", sameAgency, grant),
    containment: canRunPlan(role, "containment", sameAgency, grant),
    land_sar: canRunPlan(role, "land_sar", sameAgency, grant),
    marine_sar: canRunPlan(role, "marine_sar", sameAgency, grant),
  };
}
