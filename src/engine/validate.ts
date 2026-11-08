import type { BBox, LatLng } from "./geo.js";
import type { CordonPlan } from "./cordon.js";
import type { SubjectRisk, StructureKind } from "./cordon.js";
import type { ContainmentPlan } from "./containment.js";
import type {
  AreaKnowledge,
  Conditions,
  LandInput,
  MentalState,
  Mobility,
  SubjectCategory,
  TerrainKind,
} from "./land.js";
import type { MarineEnvironment, VesselKind } from "./marine.js";
import { polygonAreaM2 } from "./geo.js";
import type { RoadWay } from "./roads.js";

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

const CATEGORIES = new Set<SubjectCategory>([
  "child_1_3",
  "child_4_6",
  "child_7_12",
  "dementia",
  "despondent",
  "autism",
  "mental_illness",
  "intellectual_disability",
  "hiker",
  "hunter",
  "climber",
  "general_adult",
]);

const VESSELS = new Set<VesselKind>([
  "person_in_water",
  "kayak",
  "small_open_boat",
  "pwc",
  "cabin_cruiser",
  "sailing_monohull",
  "sailing_multihull",
  "fishing",
  "commercial",
  "life_raft",
  "life_raft_ballasted",
  "unknown",
]);

export function asPoint(value: unknown, label: string): LatLng {
  if (!value || typeof value !== "object") throw new InputError(`${label} is required.`);
  const point = value as { lat?: unknown; lng?: unknown };
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new InputError(`${label} latitude is not valid.`);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new InputError(`${label} longitude is not valid.`);
  return { lat, lng };
}

export function asPolygon(value: unknown): LatLng[] {
  if (!Array.isArray(value) || value.length < 3) {
    throw new InputError("Draw at least three corners around the area to seal.");
  }
  if (value.length > 80) throw new InputError("Use 80 corners or fewer.");
  const polygon = value.map((point, index) => asPoint(point, `Corner ${index + 1}`));
  const area = polygonAreaM2(polygon);
  if (area < 2000) throw new InputError("The area is too small to plan a road seal.");
  if (area > 40_000_000) {
    throw new InputError("Draw the suburb or sector to seal, not a whole city. Split a larger operation.");
  }
  return polygon;
}

export function asWays(value: unknown): RoadWay[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new InputError("Road data was not in the expected shape.");
  if (value.length > 4000) throw new InputError("Too many roads were supplied.");
  return value.map((way, index) => {
    if (!way || typeof way !== "object") throw new InputError("A road record was empty.");
    const record = way as { id?: unknown; name?: unknown; highway?: unknown; points?: unknown };
    const highway = String(record.highway ?? "");
    if (!/^[a-z_]{2,32}$/.test(highway)) throw new InputError("A road class was not recognised.");
    if (!Array.isArray(record.points) || record.points.length < 2 || record.points.length > 400) {
      throw new InputError("A road geometry was not usable.");
    }
    return {
      id: String(record.id ?? `way-${index}`).slice(0, 40),
      name: String(record.name ?? "Unnamed road").slice(0, 80),
      highway,
      points: record.points.map((point, pointIndex) => asPoint(point, `Road ${index + 1} point ${pointIndex + 1}`)),
    };
  });
}

export function validateCordonInput(value: unknown): {
  subject: LatLng;
  structure: StructureKind;
  risk: SubjectRisk;
  footprint?: LatLng[];
  escapeRadiusM?: number;
  lockedPosts?: {
    id: string;
    kind: "scene" | "escape" | "search" | "rvp" | "command";
    position: LatLng;
    label: string;
    side?: "north" | "east" | "south" | "west";
    locked?: boolean;
    sectorBearing?: number;
    rationale: string;
  }[];
} {
  const input = record(value);
  const structures = new Set(["detached", "commercial", "multi_storey", "open_ground"]);
  const risks = new Set(["unknown", "unarmed", "edged", "firearm"]);
  const structure = String(input.structure ?? "");
  const risk = String(input.risk ?? "");
  if (!structures.has(structure)) throw new InputError("Choose the kind of structure.");
  if (!risks.has(risk)) throw new InputError("Choose the reported risk.");
  const escapeRadiusM = optionalNumber(input.escapeRadiusM, 180, 1200, "Escape sector");
  let footprint: LatLng[] | undefined;
  if (input.footprint != null) {
    if (!Array.isArray(input.footprint) || input.footprint.length < 3) {
      throw new InputError("Draw at least three corners for the scene footprint.");
    }
    footprint = input.footprint.map((point, index) => asPoint(point, `Footprint corner ${index + 1}`));
  }
  const lockedPosts = Array.isArray(input.lockedPosts)
    ? input.lockedPosts.map((raw, index) => {
        const post = record(raw);
        const kinds = new Set(["scene", "escape", "search", "rvp", "command"]);
        const kind = String(post.kind ?? "");
        if (!kinds.has(kind)) throw new InputError(`Locked post ${index + 1} has an unknown kind.`);
        return {
          id: String(post.id || `locked-${index + 1}`),
          kind: kind as "scene" | "escape" | "search" | "rvp" | "command",
          position: asPoint(post.position, `Locked post ${index + 1}`),
          label: String(post.label || post.id || `Locked ${index + 1}`),
          side: post.side as "north" | "east" | "south" | "west" | undefined,
          locked: true,
          sectorBearing: typeof post.sectorBearing === "number" ? post.sectorBearing : undefined,
          rationale: String(post.rationale || "Locked by the commander."),
        };
      })
    : undefined;
  return {
    subject: asPoint(input.subject, "Subject"),
    structure: structure as StructureKind,
    risk: risk as SubjectRisk,
    footprint,
    escapeRadiusM,
    lockedPosts,
  };
}

export function validateLandInput(value: unknown): LandInput {
  const input = record(value);
  const category = String(input.category ?? "") as SubjectCategory;
  if (!CATEGORIES.has(category)) throw new InputError("Choose a subject category.");
  const mental = String(input.mentalState ?? "") as MentalState;
  const knowledge = String(input.areaKnowledge ?? "") as AreaKnowledge;
  const mobility = String(input.mobility ?? "") as Mobility;
  const terrain = String(input.terrain ?? "") as TerrainKind;
  const conditions = String(input.conditions ?? "") as Conditions;
  const mentalOk = new Set(["calm", "confused", "panicked", "despondent", "intoxicated", "evasive", "unknown"]);
  const knowledgeOk = new Set(["none", "some", "local"]);
  const mobilityOk = new Set(["impaired", "limited", "average", "fit"]);
  const terrainOk = new Set(["urban", "suburban", "rural", "steep", "dense", "coastal", "alpine"]);
  const conditionsOk = new Set(["clear", "rain", "night", "storm", "heat", "cold", "snow"]);
  if (!mentalOk.has(mental)) throw new InputError("Choose a mental state.");
  if (!knowledgeOk.has(knowledge)) throw new InputError("Choose how well the person knows the area.");
  if (!mobilityOk.has(mobility)) throw new InputError("Choose mobility.");
  if (!terrainOk.has(terrain)) throw new InputError("Choose the terrain.");
  if (!conditionsOk.has(conditions)) throw new InputError("Choose the conditions.");
  const hours = Number(input.hoursMissing);
  if (!Number.isFinite(hours) || hours < 0 || hours > 240) {
    throw new InputError("Time missing must be between 0 and 240 hours.");
  }
  const features = record(input.features ?? {});
  const age = input.ageYears == null || input.ageYears === "" ? undefined : Number(input.ageYears);
  if (age != null && (!Number.isFinite(age) || age < 0 || age > 120)) throw new InputError("Age is not valid.");
  return {
    category,
    ageYears: age,
    mentalState: mental,
    areaKnowledge: knowledge,
    mobility,
    terrain,
    conditions,
    hoursMissing: hours,
    lkp: asPoint(input.lkp, "Last known point"),
    downslopeBearing: optionalNumber(input.downslopeBearing, 0, 359.999, "Downslope bearing"),
    intendedBearing: optionalNumber(input.intendedBearing, 0, 359.999, "Intended bearing"),
    features: {
      roads: Boolean(features.roads),
      water: Boolean(features.water),
      coastline: Boolean(features.coastline),
      trails: Boolean(features.trails),
    },
  };
}

export function validateMarineInput(value: unknown): {
  lkp: LatLng;
  hoursMissing: number;
  vessel: VesselKind;
  lengthM?: number;
  positionErrorNm?: number;
} {
  const input = record(value);
  const vessel = String(input.vessel ?? "") as VesselKind;
  if (!VESSELS.has(vessel)) throw new InputError("Choose the vessel type.");
  const hours = Number(input.hoursMissing);
  if (!Number.isFinite(hours) || hours < 0 || hours > 240) {
    throw new InputError("Time adrift must be between 0 and 240 hours.");
  }
  return {
    lkp: asPoint(input.lkp, "Last known position"),
    hoursMissing: hours,
    vessel,
    lengthM: optionalNumber(input.lengthM, 0.5, 250, "Length"),
    positionErrorNm: optionalNumber(input.positionErrorNm, 0.02, 20, "Position error"),
  };
}

export function validateEnvironment(value: unknown): MarineEnvironment | undefined {
  if (value == null) return undefined;
  const input = record(value);
  const windSpeedKn = Number(input.windSpeedKn);
  const windFromDeg = Number(input.windFromDeg);
  if (!Number.isFinite(windSpeedKn) || windSpeedKn < 0 || windSpeedKn > 120) {
    throw new InputError("Wind speed must be between 0 and 120 knots.");
  }
  if (!Number.isFinite(windFromDeg) || windFromDeg < 0 || windFromDeg >= 360) {
    throw new InputError("Wind direction must be the bearing it comes from, 0 to 359.");
  }
  const currentSpeed = optionalNumber(input.currentSpeedKn, 0, 8, "Current speed");
  const currentBearing = optionalNumber(input.currentTowardDeg, 0, 359.999, "Current direction");
  if ((currentSpeed == null) !== (currentBearing == null) && currentSpeed !== 0) {
    throw new InputError("Enter both the current speed and the direction it sets toward.");
  }
  const source = String(input.source ?? "manual");
  if (!["live", "cache", "manual", "mixed"].includes(source)) throw new InputError("Condition source was not recognised.");
  return {
    windSpeedKn,
    windFromDeg,
    gustKn: optionalNumber(input.gustKn, 0, 160, "Gust"),
    currentSpeedKn: currentSpeed ?? 0,
    currentTowardDeg: currentBearing ?? 0,
    waveHeightM: optionalNumber(input.waveHeightM, 0, 20, "Wave height"),
    wavePeriodS: optionalNumber(input.wavePeriodS, 0, 40, "Wave period"),
    source: source as MarineEnvironment["source"],
  };
}

export function assertBox(box: BBox): void {
  if (
    ![box.south, box.west, box.north, box.east].every(Number.isFinite) ||
    box.south >= box.north ||
    box.west >= box.east ||
    box.south < -90 ||
    box.north > 90
  ) {
    throw new InputError("The map area is not valid.");
  }
  if (box.north - box.south > 0.25 || box.east - box.west > 0.25) {
    throw new InputError("That area is too large to load in one pass. Draw a tighter sector.");
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("The plan input was empty.");
  return value as Record<string, unknown>;
}

function optionalNumber(value: unknown, min: number, max: number, label: string): number | undefined {
  if (value == null || value === "") return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new InputError(`${label} must be between ${min} and ${max}.`);
  }
  return number;
}

export function isCordonPlan(value: unknown): value is CordonPlan {
  return Boolean(value && typeof value === "object" && (value as CordonPlan).model === "preserve-cordon-v2");
}

export function isContainmentPlan(value: unknown): value is ContainmentPlan {
  return Boolean(
    value && typeof value === "object" && (value as ContainmentPlan).model === "preserve-containment-v1",
  );
}
