import {
  bearingDeg,
  destination,
  ellipsePolygon,
  formatCoord,
  haversineM,
  normalizeBearing,
} from "./geo.js";
import type { LatLng } from "./geo.js";

export type VesselKind =
  | "person_in_water"
  | "kayak"
  | "small_open_boat"
  | "pwc"
  | "cabin_cruiser"
  | "sailing_monohull"
  | "sailing_multihull"
  | "fishing"
  | "commercial"
  | "life_raft"
  | "life_raft_ballasted"
  | "unknown";

export type MarineEnvironment = {
  windSpeedKn: number;
  windFromDeg: number;
  gustKn?: number;
  currentSpeedKn?: number;
  currentTowardDeg?: number;
  waveHeightM?: number;
  wavePeriodS?: number;
  source: "live" | "cache" | "manual" | "mixed";
  sampledAt?: string;
  sampleLat?: number;
  sampleLng?: number;
  note?: string;
};

export type MarineInput = {
  lkp: LatLng;
  hoursMissing: number;
  vessel: VesselKind;
  lengthM?: number;
  positionErrorNm?: number;
};

export type MarinePlan = {
  model: "preserve-marine-sar-v1";
  vesselLabel: string;
  datum: LatLng;
  leftDatum: LatLng;
  rightDatum: LatLng;
  driftNm: number;
  leewayKn: number;
  leewayBearing: number;
  divergenceDeg: number;
  currentKn: number;
  currentBearing: number;
  alongNm: number;
  crossNm: number;
  areaNm2: number;
  sweepNm: number;
  pattern: "expanding_square" | "creeping_line" | "sector";
  ellipse: LatLng[];
  fan: LatLng[][];
  environmentNote: string;
  narrative: string[];
  actions: string[];
};

type LeewaySpec = { fraction: number; divergence: number; label: string; sweepNm: number };

/**
 * Planning leeway for PRESERVE. Downwind drift is a fraction of wind speed,
 * with a left and right divergence, and current is added as its own vector.
 * The fractions are original planning values in the ranges used by maritime
 * SAR, not a transcription of a copyrighted leeway table.
 */
const LEEWAY: Record<VesselKind, LeewaySpec> = {
  person_in_water: { fraction: 0.02, divergence: 35, label: "Person in the water", sweepNm: 0.1 },
  kayak: { fraction: 0.035, divergence: 30, label: "Kayak or canoe", sweepNm: 0.2 },
  small_open_boat: { fraction: 0.05, divergence: 32, label: "Small open boat", sweepNm: 0.4 },
  pwc: { fraction: 0.03, divergence: 24, label: "Personal watercraft", sweepNm: 0.25 },
  cabin_cruiser: { fraction: 0.055, divergence: 18, label: "Cabin cruiser", sweepNm: 0.6 },
  sailing_monohull: { fraction: 0.07, divergence: 42, label: "Sailing monohull, drifting", sweepNm: 0.5 },
  sailing_multihull: { fraction: 0.06, divergence: 36, label: "Sailing multihull, drifting", sweepNm: 0.5 },
  fishing: { fraction: 0.045, divergence: 20, label: "Fishing vessel", sweepNm: 0.7 },
  commercial: { fraction: 0.03, divergence: 16, label: "Commercial vessel", sweepNm: 1 },
  life_raft: { fraction: 0.065, divergence: 40, label: "Life raft, unballasted", sweepNm: 0.3 },
  life_raft_ballasted: { fraction: 0.035, divergence: 28, label: "Life raft, ballasted", sweepNm: 0.3 },
  unknown: { fraction: 0.05, divergence: 48, label: "Unknown craft", sweepNm: 0.3 },
};

export const VESSEL_OPTIONS = Object.entries(LEEWAY).map(([id, spec]) => ({
  id: id as VesselKind,
  label: spec.label,
}));

const NM = 1852;

export function planMarineSearch(input: MarineInput, environment: MarineEnvironment): MarinePlan {
  const spec = LEEWAY[input.vessel];
  const hours = Math.max(0, input.hoursMissing);
  const lengthFactor =
    input.lengthM != null && input.lengthM > 0
      ? clampNum(1.2 - input.lengthM / 55, 0.72, 1.25)
      : 1;
  const wind = Math.max(0, environment.windSpeedKn);
  const leewayKn = wind * spec.fraction * lengthFactor;
  const leewayBearing = normalizeBearing(environment.windFromDeg + 180);
  const divergence = input.vessel === "unknown" ? spec.divergence : spec.divergence;
  const currentKn = Math.max(0, environment.currentSpeedKn ?? 0);
  const currentBearing = normalizeBearing(environment.currentTowardDeg ?? 0);

  const leewayNm = leewayKn * hours;
  const currentNm = currentKn * hours;
  const center = shift(shift(input.lkp, leewayBearing, leewayNm), currentBearing, currentNm);
  const left = shift(shift(input.lkp, leewayBearing - divergence, leewayNm), currentBearing, currentNm);
  const right = shift(shift(input.lkp, leewayBearing + divergence, leewayNm), currentBearing, currentNm);

  const driftNm = haversineM(input.lkp, center) / NM;
  const crossFanNm = haversineM(center, left) / NM;
  const positionError = input.positionErrorNm ?? 0.25;
  const gustExtra =
    environment.gustKn != null && wind > 1 && environment.gustKn > wind * 1.4
      ? 0.08 * driftNm
      : 0;
  const alongNm = Math.max(0.15, positionError + 0.28 * driftNm + 0.04 * hours + gustExtra);
  const crossNm = Math.max(0.15, positionError + crossFanNm + 0.1 * driftNm + 0.03 * hours);
  const orientation = driftNm > 0.05 ? bearingDeg(input.lkp, center) : leewayBearing;
  const areaNm2 = Math.PI * alongNm * crossNm;

  let sweep = spec.sweepNm;
  const wave = environment.waveHeightM ?? 0;
  if (wave >= 2.5) sweep *= 0.5;
  else if (wave >= 1.5) sweep *= 0.7;
  if (input.vessel === "person_in_water" && wave >= 1) sweep = Math.min(sweep, 0.08);

  const aspect = alongNm / crossNm;
  let pattern: MarinePlan["pattern"] = "expanding_square";
  if (hours < 0.75 && driftNm < 0.4) pattern = "sector";
  else if (aspect > 1.8 || aspect < 0.55) pattern = "creeping_line";

  const environmentNote = environment.note ?? sourceNote(environment);

  const narrative = [
    `${spec.label}${input.lengthM ? `, ${input.lengthM.toFixed(0)} m` : ""}. Leeway is planned at ${(spec.fraction * 100).toFixed(1)}% of the wind speed${lengthFactor !== 1 ? `, adjusted to ${(spec.fraction * lengthFactor * 100).toFixed(1)}% for length` : ""}, downwind, with ±${Math.round(divergence)}° of divergence.`,
    `Wind ${wind.toFixed(1)} kn from ${Math.round(normalizeBearing(environment.windFromDeg))}° gives ${leewayKn.toFixed(2)} kn of leeway toward ${Math.round(leewayBearing)}°. Over ${hours.toFixed(1)} h that is ${leewayNm.toFixed(2)} nm of wind drift.`,
    currentKn > 0.01
      ? `Current ${currentKn.toFixed(2)} kn toward ${Math.round(currentBearing)}° adds ${currentNm.toFixed(2)} nm. The datum is the vector sum, at ${formatCoord(center)}.`
      : "No current was applied. If a tide or a coastal set is running, enter it and recompute. The datum is the wind-drift position only.",
    `Position error ${positionError.toFixed(2)} nm plus drift uncertainty gives a search ellipse of ${alongNm.toFixed(2)} nm along the drift and ${crossNm.toFixed(2)} nm across it (${areaNm2.toFixed(1)} nm²).`,
    "Wave height changes detection and safety. It is not added as a third drift vector. Recompute when the wind or the current shifts.",
    environmentNote,
  ];

  const patternText =
    pattern === "sector"
      ? "Start with a sector search from the last known position. Drift is still small."
      : pattern === "creeping_line"
        ? "The area is elongated. A creeping line along the drift, centred on the datum, fits it better than a square."
        : "An expanding square centred on the datum is the first pattern.";

  return {
    model: "preserve-marine-sar-v1",
    vesselLabel: spec.label,
    datum: center,
    leftDatum: left,
    rightDatum: right,
    driftNm,
    leewayKn,
    leewayBearing,
    divergenceDeg: divergence,
    currentKn,
    currentBearing,
    alongNm,
    crossNm,
    areaNm2,
    sweepNm: sweep,
    pattern,
    ellipse: ellipsePolygon(center, alongNm * NM, crossNm * NM, orientation, 56),
    fan: [
      [input.lkp, left],
      [input.lkp, center],
      [input.lkp, right],
    ],
    environmentNote,
    narrative,
    actions: [
      patternText,
      `A planning sweep width of ${sweep.toFixed(2)} nm is a starting point for good visibility from a typical search height. Reduce it for sea state, glare, night, or a person in the water. It is not an order.`,
      "Search the datum area first, then the divergence fan back toward the last known position if the first pass is empty.",
      "The commander still has to match assets, daylight, and sea state to the area. The ellipse does not do that.",
    ],
  };
}

function shift(origin: LatLng, bearing: number, nauticalMiles: number): LatLng {
  if (nauticalMiles <= 0) return origin;
  return destination(origin, bearing, nauticalMiles * NM);
}

function clampNum(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function sourceNote(environment: MarineEnvironment): string {
  if (environment.source === "manual") {
    return "Wind and current are the figures entered for this plan. Nothing was fetched.";
  }
  if (environment.source === "cache") {
    return "Conditions came from the last sample stored for this position.";
  }
  if (environment.sampleLat != null && environment.sampleLng != null) {
    return `Conditions were sampled at ${formatCoord({
      lat: environment.sampleLat,
      lng: environment.sampleLng,
    })}. Only the position was sent, not the vessel or the incident.`;
  }
  return "Conditions were sampled for this position. Only the coordinates left the installation.";
}
