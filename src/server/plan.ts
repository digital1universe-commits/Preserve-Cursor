import { planCordon } from "../engine/cordon.js";
import { planContainment } from "../engine/containment.js";
import { bboxOf, expandBBox, haversineM, type BBox } from "../engine/geo.js";
import { planLandSearch, type ElevationSample, type LandInput } from "../engine/land.js";
import { planMarineSearch, type MarineEnvironment } from "../engine/marine.js";
import type { RoadWay } from "../engine/roads.js";
import {
  asPolygon,
  asWays,
  assertBox,
  InputError,
  validateCordonInput,
  validateEnvironment,
  validateLandInput,
  validateMarineInput,
} from "../engine/validate.js";
import type { ModuleName } from "./rbac.js";
import { fetchElevation, fetchMarineConditions } from "./environment.js";
import { fetchHighways } from "./osm.js";
import type { AppContext } from "./db.js";

export type PlanContext = {
  ways?: RoadWay[];
  elevation?: ElevationSample[];
  environment?: MarineEnvironment;
  coverage?: BBox;
};

export async function executePlan(
  app: AppContext,
  module: ModuleName,
  input: unknown,
  supplied: { ways?: unknown; environment?: unknown },
): Promise<{ output: unknown; input: unknown; context: PlanContext; meta: Record<string, unknown> }> {
  if (module === "cordon") return runCordon(app, input, supplied.ways);
  if (module === "containment") return runContainment(app, input, supplied.ways);
  if (module === "land_sar") return runLand(app, input, supplied.ways);
  if (module === "marine_sar") return runMarine(app, input, supplied.environment);
  throw new InputError("That planning module is not available.");
}

async function runCordon(app: AppContext, input: unknown, suppliedWays: unknown) {
  const parsed = validateCordonInput(input);
  const outer = parsed.outerRadiusM ?? (parsed.risk === "firearm" ? 400 : 250);
  const coverage = expandBBox(bboxOf([parsed.subject]), outer + 500);
  const loaded = await loadWays(app, coverage, suppliedWays);
  const output = planCordon({ ...parsed, ways: loaded.ways });
  return {
    input: parsed,
    output,
    context: { ways: loaded.ways, coverage },
    meta: { roadSource: loaded.source, roadCount: loaded.ways.length },
  };
}

async function runContainment(app: AppContext, input: unknown, suppliedWays: unknown) {
  const record = asRecord(input);
  const polygon = asPolygon(record.polygon);
  const coverage = expandBBox(bboxOf(polygon), 480);
  assertBox(coverage);
  const loaded = await loadWays(app, coverage, suppliedWays);
  const output = planContainment({ polygon, ways: loaded.ways, coverage });
  if (loaded.source === "device") {
    output.narrative = [
      ...output.narrative,
      "Roads came from the copy on the device because the installation could not reach the map source. Treat the minimum set as unproved until the roads are refreshed.",
    ];
    output.minimumGuaranteed = false;
  }
  return {
    input: { polygon },
    output,
    context: { ways: loaded.ways, coverage },
    meta: { roadSource: loaded.source, roadCount: loaded.ways.length },
  };
}

async function runLand(app: AppContext, input: unknown, suppliedWays: unknown) {
  const parsed = validateLandInput(input);
  let elevation: ElevationSample[] = [];
  let elevationSource = "none";
  try {
    const draft = planLandSearch(parsed);
    elevation = await loadElevation(app, parsed.lkp, draft.radius95M);
    elevationSource = "live";
  } catch {
    elevationSource = "unavailable";
  }
  let ways: RoadWay[] = [];
  let roadSource = "not_requested";
  if (parsed.features.roads || parsed.features.trails) {
    const radius = planLandSearch({ ...parsed, elevation }).radius95M;
    const coverage = expandBBox(bboxOf([parsed.lkp]), Math.min(radius + 300, 8000));
    try {
      assertBox(coverage);
      const loaded = await loadWays(app, coverage, suppliedWays);
      ways = loaded.ways;
      roadSource = loaded.source;
    } catch {
      ways = safeWays(suppliedWays);
      roadSource = ways.length ? "device" : "unavailable";
    }
  }
  const full: LandInput = { ...parsed, elevation, ways };
  const output = planLandSearch(full);
  if (elevationSource === "unavailable") {
    output.narrative = [
      ...output.narrative,
      "Elevation could not be read. The ring is round unless a downslope bearing was entered.",
    ];
  }
  return {
    input: parsed,
    output,
    context: { elevation, ways },
    meta: { elevationSource, roadSource, roadCount: ways.length },
  };
}

async function runMarine(app: AppContext, input: unknown, suppliedEnvironment: unknown) {
  const parsed = validateMarineInput(input);
  let environment = validateEnvironment(suppliedEnvironment);
  let source = environment?.source ?? "live";
  if (!environment) {
    try {
      environment = await loadConditions(app, parsed.lkp);
      source = environment.source;
    } catch {
      const cached = readCache(app, marineKey(parsed.lkp));
      if (!cached) {
        throw new InputError(
          "Conditions could not be read. Enter the wind and, if you have it, the current. Nothing about the vessel has been sent anywhere.",
        );
      }
      environment = { ...(JSON.parse(cached) as MarineEnvironment), source: "cache" };
      environment.note = "Live conditions were unavailable. This is the last sample stored for the position.";
      source = "cache";
    }
  }
  const output = planMarineSearch(parsed, environment);
  return {
    input: parsed,
    output,
    context: { environment },
    meta: { conditionSource: source },
  };
}

async function loadWays(
  app: AppContext,
  coverage: BBox,
  supplied: unknown,
): Promise<{ ways: RoadWay[]; source: "live" | "cache" | "device" | "none" }> {
  const key = `roads:${coverage.south.toFixed(3)}:${coverage.west.toFixed(3)}:${coverage.north.toFixed(3)}:${coverage.east.toFixed(3)}`;
  try {
    const ways = thinWays(await fetchHighways(coverage));
    writeCache(app, key, "roads", JSON.stringify(ways));
    return { ways, source: "live" };
  } catch (error) {
    if (error instanceof InputError) throw error;
    const cached = readCache(app, key);
    if (cached) return { ways: thinWays(JSON.parse(cached) as RoadWay[]), source: "cache" };
    const ways = safeWays(supplied);
    if (ways.length) return { ways, source: "device" };
    return { ways: [], source: "none" };
  }
}

async function loadElevation(app: AppContext, center: { lat: number; lng: number }, radiusM: number) {
  const key = `elev:${center.lat.toFixed(2)}:${center.lng.toFixed(2)}:${Math.round(radiusM / 200)}`;
  try {
    const elevation = await fetchElevation(center, radiusM);
    writeCache(app, key, "elevation", JSON.stringify(elevation));
    return elevation;
  } catch (error) {
    const cached = readCache(app, key);
    if (cached) return JSON.parse(cached) as ElevationSample[];
    throw error;
  }
}

async function loadConditions(app: AppContext, center: { lat: number; lng: number }) {
  const key = marineKey(center);
  const environment = await fetchMarineConditions(center);
  writeCache(app, key, "marine", JSON.stringify(environment));
  return environment;
}

function marineKey(center: { lat: number; lng: number }) {
  return `marine:${center.lat.toFixed(2)}:${center.lng.toFixed(2)}`;
}

function safeWays(value: unknown): RoadWay[] {
  if (value == null) return [];
  return asWays(value);
}

function readCache(app: AppContext, key: string): string | null {
  const row = app.db.prepare("SELECT body FROM cache WHERE cache_key = ?").get(key) as { body: string } | undefined;
  return row?.body ?? null;
}

function thinWays(ways: RoadWay[]): RoadWay[] {
  return ways.map((way) => ({ ...way, points: thinPoints(way.points, 14) }));
}

function thinPoints(points: { lat: number; lng: number }[], minM: number) {
  if (points.length < 3) return points;
  const kept = [points[0]];
  for (let index = 1; index < points.length - 1; index++) {
    if (haversineM(kept[kept.length - 1], points[index]) >= minM) kept.push(points[index]);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

function writeCache(app: AppContext, key: string, kind: string, body: string) {
  app.db
    .prepare(
      `INSERT INTO cache (cache_key, kind, body, stored_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, stored_at = excluded.stored_at, kind = excluded.kind`,
    )
    .run(key, kind, body, new Date().toISOString());
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("The plan input was empty.");
  return value as Record<string, unknown>;
}
