import type {
  IncidentType,
  LandSarInputs,
  LatLng,
  MarineSarInputs,
  SecurityLevel,
} from '../domain/types';
import type { CordonIncidentKind } from '../engines/cordon';

export interface CreateIncidentInput {
  type: IncidentType;
  title?: string;
  securityLevel?: SecurityLevel;
  /** Optional CAD override; otherwise auto-issued. */
  jobNumber?: string;
  location?: LatLng;
  summary?: string;
  cordon?: {
    kind: CordonIncidentKind;
    resourcesText: string;
  };
  landSar?: Partial<LandSarInputs> & { lastKnown?: LatLng };
  marineSar?: Partial<MarineSarInputs> & { lastKnown?: LatLng };
  publicOrder?: {
    waypointsText: string;
  };
  roadBlock?: {
    vehicleDetails: string;
    offenderInfo: string;
    stolenMinutesAgo: number;
    availableResources: number;
    juvenileSuspect: boolean;
  };
}

export function parseLatLngPair(text: string, fallback: LatLng): LatLng {
  const m = text.trim().match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return fallback;
  return { lat: Number(m[1]), lng: Number(m[2]) };
}

/** Parse lines like "TCS TCS-2" or "General Duties, VKR-221". */
export function parseResources(text: string): Array<{ type: string; callSign: string }> {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const parts = line.split(/[|,]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) return { type: parts[0], callSign: parts[1] };
      if (parts.length === 1) return { type: parts[0], callSign: `UNIT-${i + 1}` };
      return { type: 'General Duties', callSign: `GD-${i + 1}` };
    });
}

/** Parse waypoints as lat,lng per line. */
export function parseWaypoints(text: string, fallback: LatLng[]): LatLng[] {
  const pts = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => parseLatLngPair(line, fallback[0]))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return pts.length ? pts : fallback;
}
