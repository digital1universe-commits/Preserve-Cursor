export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/api/")) {
    throw new ApiError(0, "Blocked a request that would have left PRESERVE.");
  }
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  headers.set("x-preserve-request", "1");
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "The installation cannot be reached from this device.");
  }
  const text = await response.text();
  let data: { error?: string } | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as { error?: string };
    } catch {
      throw new ApiError(response.status || 0, "The installation did not return a usable reply.");
    }
  }
  if (!response.ok) throw new ApiError(response.status, data?.error || "The request was refused.");
  return data as T;
}

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  appointment: string;
  role: string;
  agencyId: string;
  agencyName: string;
  agencyShort: string;
  homeLat: number;
  homeLng: number;
  evaluation: boolean;
  callsign: string;
  unitId: string | null;
  unitShort: string | null;
  unitConcealed: boolean;
  showName: boolean;
};

export type PresencePin = {
  userId: string;
  callsign: string;
  name?: string;
  appointment: string;
  unitShort: string | null;
  lat: number;
  lng: number;
  accuracyM: number | null;
  heading: number | null;
  incidentId: string | null;
  updatedAt: string;
  self: boolean;
};

export type IncidentSummary = {
  id: string;
  reference: string;
  kind: string;
  classification: string;
  status: string;
  title: string;
  locationLabel: string;
  lat: number;
  lng: number;
  updatedAt: string;
  agencyId: string;
  agencyShort: string;
  summary?: string;
  agencyName?: string;
  createdAt?: string;
};

export type PlanRecord = {
  id: string;
  module: string;
  version: number;
  createdAt: string;
  createdByName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  local?: boolean;
};

export type IncidentDetail = {
  incident: IncidentSummary;
  members: { userId: string; duty: string; displayName: string; appointment: string; role: string }[];
  grants: { id: string; agencyId: string; agencyName: string; shortName: string; permission: string }[];
  plans: PlanRecord[];
  can: { update: boolean; plan: Record<string, boolean> };
  directory: { id: string; displayName: string; appointment: string; role: string }[];
};
