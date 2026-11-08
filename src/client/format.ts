export const KIND_LABEL: Record<string, string> = {
  cordon: "Siege cordon",
  containment: "Area seal",
  land_sar: "Land search",
  marine_sar: "Marine search",
  public_order: "Public order",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  contained: "Contained",
  suspended: "Suspended",
  closed: "Closed",
};

export const CLASS_LABEL: Record<string, string> = {
  training: "Training",
  official: "Official",
  sensitive: "Sensitive",
  restricted: "Restricted",
};

export const ROLE_LABEL: Record<string, string> = {
  superadmin: "System registrar",
  agency_admin: "Agency admin",
  commander: "Incident commander",
  planner: "Tactical planner",
  search_coordinator: "Search coordinator",
  field_officer: "Field officer",
  observer: "Observer",
};

export function canAudit(role: string) {
  return role === "superadmin" || role === "agency_admin" || role === "commander";
}

export function canAdmin(role: string) {
  return role === "superadmin" || role === "agency_admin";
}

export function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatKm(metres: number) {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

export function formatNm(nm: number) {
  return `${nm.toFixed(nm < 10 ? 2 : 1)} nm`;
}

export function coord(lat: number, lng: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lng).toFixed(5)}° ${ew}`;
}
