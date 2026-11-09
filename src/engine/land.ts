import {
  angleDiff,
  bearingDeg,
  clamp,
  haversineM,
  metersPerDegLat,
  metersPerDegLng,
} from "./geo.js";
import type { RoadWay } from "./roads.js";
import type { LatLng } from "./geo.js";

export type SubjectCategory =
  | "child_1_3"
  | "child_4_6"
  | "child_7_12"
  | "dementia"
  | "despondent"
  | "autism"
  | "mental_illness"
  | "intellectual_disability"
  | "hiker"
  | "hunter"
  | "climber"
  | "general_adult";

export type MentalState =
  | "calm"
  | "confused"
  | "panicked"
  | "despondent"
  | "intoxicated"
  | "evasive"
  | "unknown";

export type AreaKnowledge = "none" | "some" | "local";
export type Mobility = "impaired" | "limited" | "average" | "fit";
export type TerrainKind = "urban" | "suburban" | "rural" | "steep" | "dense" | "coastal" | "alpine";
export type Conditions = "clear" | "rain" | "night" | "storm" | "heat" | "cold" | "snow";

export type ElevationSample = { lat: number; lng: number; elevationM: number };

export type LandInput = {
  category: SubjectCategory;
  ageYears?: number;
  mentalState: MentalState;
  areaKnowledge: AreaKnowledge;
  mobility: Mobility;
  terrain: TerrainKind;
  conditions: Conditions;
  hoursMissing: number;
  lkp: LatLng;
  downslopeBearing?: number;
  intendedBearing?: number;
  features: { roads: boolean; water: boolean; coastline: boolean; trails: boolean };
  ways?: RoadWay[];
  elevation?: ElevationSample[];
};

export type HeatCell = { lat: number; lng: number; w: number };

export type SearchWedge = {
  id: string;
  fromBearing: number;
  toBearing: number;
  mass: number;
  priority: number;
};

export type LandPlan = {
  model: "preserve-land-sar-v1";
  categoryLabel: string;
  radius50M: number;
  radius75M: number;
  radius95M: number;
  travelLimitM: number;
  behavioural95M: number;
  downslopeBearing?: number;
  cells: HeatCell[];
  wedges: SearchWedge[];
  modifiers: { label: string; effect: string }[];
  narrative: string[];
  actions: string[];
};

type Profile = {
  label: string;
  p50Km: number;
  p95Km: number;
  downhill: number;
  linear: number;
  water: number;
  hide: number;
  purposeful: number;
  speedMps: number;
  behaviour: string;
};

/**
 * Original planning distances for PRESERVE. They follow published lost-person
 * principles (least effort, downhill, linear features, children close to the
 * last known point, despondent subjects remaining near) and are not a copy of
 * any statistical table. An agency should compare them with its own SAR manual.
 */
const PROFILES: Record<SubjectCategory, Profile> = {
  child_1_3: {
    label: "Child, 1–3 years",
    p50Km: 0.18,
    p95Km: 0.7,
    downhill: 0.45,
    linear: 0.3,
    water: 0.85,
    hide: 0.8,
    purposeful: 0.05,
    speedMps: 0.4,
    behaviour:
      "Very young children are usually close to the last known point and may be hidden rather than travelling. Water and anything that attracts them matter early.",
  },
  child_4_6: {
    label: "Child, 4–6 years",
    p50Km: 0.45,
    p95Km: 1.6,
    downhill: 0.55,
    linear: 0.55,
    water: 0.8,
    hide: 0.35,
    purposeful: 0.2,
    speedMps: 0.7,
    behaviour:
      "Children of this age follow easy ground, paths, and water, and they can travel farther than toddlers before tiring.",
  },
  child_7_12: {
    label: "Child, 7–12 years",
    p50Km: 0.8,
    p95Km: 2.8,
    downhill: 0.4,
    linear: 0.7,
    water: 0.45,
    hide: 0.15,
    purposeful: 0.45,
    speedMps: 1,
    behaviour:
      "Older children often take a path, a shortcut, or a route toward something familiar. They may not judge risk well.",
  },
  dementia: {
    label: "Dementia or severe confusion",
    p50Km: 0.7,
    p95Km: 3.2,
    downhill: 0.85,
    linear: 0.9,
    water: 0.25,
    hide: 0.05,
    purposeful: 0.15,
    speedMps: 0.6,
    behaviour:
      "People with dementia tend to take the easiest line — downhill, then along a road, fence, or track — and often do not turn back at a junction.",
  },
  despondent: {
    label: "Despondent",
    p50Km: 0.35,
    p95Km: 1.3,
    downhill: 0.2,
    linear: 0.25,
    water: 0.35,
    hide: 0.75,
    purposeful: 0.35,
    speedMps: 0.8,
    behaviour:
      "Despondent subjects are often not far from the last known point, in a place with a view, an edge, or some cover. The close ring matters more than a wide sweep.",
  },
  autism: {
    label: "Autism",
    p50Km: 0.55,
    p95Km: 2.2,
    downhill: 0.35,
    linear: 0.8,
    water: 0.75,
    hide: 0.25,
    purposeful: 0.3,
    speedMps: 0.9,
    behaviour:
      "Attraction to water and to linear features is common, and the person may not answer a call. Search the feature, not only the ground beside it.",
  },
  mental_illness: {
    label: "Mental illness",
    p50Km: 0.7,
    p95Km: 2.6,
    downhill: 0.45,
    linear: 0.4,
    water: 0.4,
    hide: 0.3,
    purposeful: 0.25,
    speedMps: 0.9,
    behaviour:
      "Travel can be less predictable. Still start with the least-effort ground, then water and the edges of roads, and allow for someone who avoids contact.",
  },
  intellectual_disability: {
    label: "Intellectual disability",
    p50Km: 0.5,
    p95Km: 2,
    downhill: 0.55,
    linear: 0.7,
    water: 0.4,
    hide: 0.2,
    purposeful: 0.2,
    speedMps: 0.75,
    behaviour:
      "Routes tend to be simple: a road, a path, or downhill. Hazards on that line, including water, need an early look.",
  },
  hiker: {
    label: "Hiker",
    p50Km: 1.8,
    p95Km: 7.5,
    downhill: 0.35,
    linear: 0.85,
    water: 0.2,
    hide: 0.05,
    purposeful: 0.8,
    speedMps: 1.15,
    behaviour:
      "Hikers are usually on or near a trail, a ridge, or the direction they intended. The ring is wide; the linear features inside it are the first work.",
  },
  hunter: {
    label: "Hunter",
    p50Km: 1.1,
    p95Km: 4.2,
    downhill: 0.7,
    linear: 0.45,
    water: 0.3,
    hide: 0.1,
    purposeful: 0.4,
    speedMps: 0.9,
    behaviour:
      "Hunters leave tracks for drainages, game trails, and the downslope. They may be off the path that a walker would keep.",
  },
  climber: {
    label: "Climber",
    p50Km: 0.5,
    p95Km: 2,
    downhill: 0.8,
    linear: 0.3,
    water: 0.15,
    hide: 0.1,
    purposeful: 0.55,
    speedMps: 0.7,
    behaviour:
      "Look downslope of the last known point, at the base of steep ground, before widening across easier country.",
  },
  general_adult: {
    label: "Adult, no specialist category",
    p50Km: 1.1,
    p95Km: 4,
    downhill: 0.7,
    linear: 0.65,
    water: 0.3,
    hide: 0.1,
    purposeful: 0.35,
    speedMps: 1.05,
    behaviour:
      "With no stronger category, plan for the path of least resistance: downhill, then along a road, fence, watercourse, or track.",
  },
};

const MOBILITY: Record<Mobility, number> = {
  impaired: 0.4,
  limited: 0.65,
  average: 1,
  fit: 1.25,
};

const TERRAIN: Record<TerrainKind, number> = {
  urban: 0.85,
  suburban: 0.95,
  rural: 1,
  steep: 0.5,
  dense: 0.55,
  coastal: 0.95,
  alpine: 0.45,
};

const CONDITIONS: Record<Conditions, number> = {
  clear: 1,
  rain: 0.85,
  night: 0.55,
  storm: 0.5,
  heat: 0.8,
  cold: 0.75,
  snow: 0.45,
};

const TERRAIN_LABEL: Record<TerrainKind, string> = {
  urban: "urban",
  suburban: "suburban",
  rural: "rural",
  steep: "steep",
  dense: "dense bush",
  coastal: "coastal",
  alpine: "alpine",
};

const CONDITION_LABEL: Record<Conditions, string> = {
  clear: "clear conditions",
  rain: "rain",
  night: "darkness",
  storm: "storm",
  heat: "heat",
  cold: "cold",
  snow: "snow",
};

export const CATEGORY_OPTIONS = Object.entries(PROFILES).map(([id, profile]) => ({
  id: id as SubjectCategory,
  label: profile.label,
}));

export function suggestCategory(ageYears: number | undefined, mentalState: MentalState): SubjectCategory {
  if (mentalState === "despondent") return "despondent";
  if (ageYears != null && ageYears < 4) return "child_1_3";
  if (ageYears != null && ageYears < 7) return "child_4_6";
  if (ageYears != null && ageYears < 13) return "child_7_12";
  if (mentalState === "confused" && ageYears != null && ageYears >= 65) return "dementia";
  if (mentalState === "evasive") return "mental_illness";
  return "general_adult";
}

export function planLandSearch(input: LandInput): LandPlan {
  const profile = PROFILES[input.category];
  const hours = clamp(input.hoursMissing, 0, 240);
  const mobility = MOBILITY[input.mobility];
  const terrain = TERRAIN[input.terrain];
  const conditions = CONDITIONS[input.conditions];
  const knowledge = input.areaKnowledge === "local" ? 1.12 : input.areaKnowledge === "some" ? 1.04 : 1;

  let mind = 1;
  let downhill = profile.downhill;
  let linear = profile.linear;
  let hide = profile.hide;
  const modifiers: { label: string; effect: string }[] = [];

  if (input.mentalState === "despondent") {
    mind = 0.7;
    hide += 0.15;
    modifiers.push({
      label: "Despondent",
      effect: "The ring is tightened. Concealment and the close ground are weighted up.",
    });
  } else if (input.mentalState === "panicked") {
    mind = 1.12;
    modifiers.push({
      label: "Panicked",
      effect: "Distance is slightly increased. Direction is treated as less settled.",
    });
  } else if (input.mentalState === "intoxicated") {
    mind = 0.75;
    downhill += 0.1;
    modifiers.push({
      label: "Intoxicated",
      effect: "Travel is shortened and the easiest downhill line is weighted up.",
    });
  } else if (input.mentalState === "evasive") {
    mind = 1.1;
    linear *= 0.55;
    modifiers.push({
      label: "May avoid contact",
      effect: "Roads are weighted down. The person may leave the easiest public line.",
    });
  } else if (input.mentalState === "confused") {
    downhill += 0.1;
    linear += 0.1;
    modifiers.push({
      label: "Confused",
      effect: "Downhill ground and linear features are weighted up.",
    });
  }

  if (input.areaKnowledge === "local") {
    linear += 0.15;
    modifiers.push({
      label: "Knows the area",
      effect: "Purposeful travel along known roads and paths is more likely, and the ring is slightly larger.",
    });
  } else if (input.areaKnowledge === "none") {
    modifiers.push({
      label: "Does not know the area",
      effect: "No local route is assumed. Least effort and visible features dominate.",
    });
  }

  modifiers.push({
    label: "Mobility",
    effect: `${input.mobility} mobility scales distance by ${mobility.toFixed(2)}.`,
  });
  modifiers.push({
    label: "Terrain and conditions",
    effect: `${TERRAIN_LABEL[input.terrain]} ground (${terrain.toFixed(2)}) and ${CONDITION_LABEL[input.conditions]} (${conditions.toFixed(2)}) both limit how far the ring is drawn.`,
  });

  const speed = profile.speedMps * mobility * terrain * conditions;
  const travelM = speed * 4 * 3600 * (1 - Math.exp(-hours / 4));
  const behavioural95M = profile.p95Km * 1000 * mobility * knowledge * conditions * mind;
  const behavioural50M = profile.p50Km * 1000 * mobility * knowledge * Math.max(0.75, conditions) * mind;
  const radius95M = Math.max(40, Math.min(behavioural95M, Math.max(travelM, 40)));
  const ratio = behavioural95M > 0 ? Math.min(1, behavioural50M / behavioural95M) : 0.35;
  const radius50M = Math.max(25, radius95M * ratio);
  const radius75M = radius50M + (radius95M - radius50M) * 0.55;

  const elevationBearing = estimateDownslope(input.lkp, input.elevation ?? []);
  const downslope =
    input.downslopeBearing != null ? input.downslopeBearing : elevationBearing.bearing;
  if (downslope != null) {
    modifiers.push({
      label: "Downslope",
      effect:
        elevationBearing.bearing != null && input.downslopeBearing == null
          ? `Ground falls toward ${Math.round(downslope)}° (from the elevation sample). Least-effort travel is weighted that way.`
          : `Downslope was set at ${Math.round(downslope)}°. Least-effort travel is weighted that way.`,
    });
  } else if (downhill > 0.4) {
    modifiers.push({
      label: "Downslope unknown",
      effect: "No slope could be read. The ring stays round, and the briefing tells teams to prefer lower ground once they can see it.",
    });
  }

  const grid = buildGrid({
    lkp: input.lkp,
    radius95M,
    radius50M,
    profile,
    downhill: clamp(downhill, 0, 1),
    linear: clamp(linear, 0, 1),
    hide: clamp(hide, 0, 1),
    downslope,
    intendedBearing: input.intendedBearing,
    features: input.features,
    elevation: input.elevation ?? [],
    elevAtLkp: elevationBearing.elevAtLkp,
    roadPoints: roadSamples(input.ways ?? [], Math.max(80, radius95M / 40)),
  });

  const wedges = rankWedges(grid, input.lkp);
  const actions = actionsFor(input.category, profile, input);

  const narrative = [
    profile.behaviour,
    `In ${formatHours(hours)}, with this mobility and ground, the farthest plausible distance is about ${formatKm(travelM)}. The behavioural distance for the category is about ${formatKm(behavioural95M)}. The 95% planning ring is the smaller of the two: ${formatKm(radius95M)}.`,
    "The ring is a planning area for the first operational periods. It is not a determination of where the person is.",
    "Lost people commonly take the path of least resistance. Where a slope is known, lower ground is searched sooner. Roads, tracks, fences, and water are searched as lines, not as empty country.",
  ];

  return {
    model: "preserve-land-sar-v1",
    categoryLabel: profile.label,
    radius50M: Math.round(radius50M),
    radius75M: Math.round(radius75M),
    radius95M: Math.round(radius95M),
    travelLimitM: Math.round(travelM),
    behavioural95M: Math.round(behavioural95M),
    downslopeBearing: downslope,
    cells: grid.filter((cell) => cell.w >= 0.35).slice(0, 700),
    wedges,
    modifiers,
    narrative,
    actions,
  };
}

function formatKm(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} hours`;
  return `${Math.round(hours / 24)} days`;
}

function estimateDownslope(
  lkp: LatLng,
  samples: ElevationSample[],
): { bearing?: number; elevAtLkp?: number } {
  if (samples.length < 6) return {};
  let nearest = samples[0];
  let nearestD = Infinity;
  for (const sample of samples) {
    const distance = haversineM(lkp, sample);
    if (distance < nearestD) {
      nearestD = distance;
      nearest = sample;
    }
  }
  const mLng = metersPerDegLng(lkp.lat);
  const mLat = metersPerDegLat();
  let east = 0;
  let north = 0;
  for (const sample of samples) {
    const dx = (sample.lng - lkp.lng) * mLng;
    const dy = (sample.lat - lkp.lat) * mLat;
    const distance = Math.hypot(dx, dy);
    if (distance < 40) continue;
    const slope = (sample.elevationM - nearest.elevationM) / distance;
    east += slope * (dx / distance);
    north += slope * (dy / distance);
  }
  if (Math.hypot(east, north) < 0.004) return { elevAtLkp: nearest.elevationM };
  const downEast = -east;
  const downNorth = -north;
  const bearing = (Math.atan2(downEast, downNorth) * 180) / Math.PI;
  return {
    bearing: (bearing + 360) % 360,
    elevAtLkp: nearest.elevationM,
  };
}

function elevationAt(point: LatLng, samples: ElevationSample[]): number | undefined {
  if (!samples.length) return undefined;
  let best = samples[0];
  let bestD = Infinity;
  for (const sample of samples) {
    const dLat = sample.lat - point.lat;
    const dLng = sample.lng - point.lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestD) {
      bestD = d;
      best = sample;
    }
  }
  return best.elevationM;
}

function roadSamples(ways: RoadWay[], stepM: number): LatLng[] {
  const points: LatLng[] = [];
  for (const way of ways) {
    for (let i = 0; i < way.points.length - 1; i++) {
      const a = way.points[i];
      const b = way.points[i + 1];
      const length = haversineM(a, b);
      const steps = Math.max(1, Math.ceil(length / stepM));
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        points.push({
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
        });
      }
    }
  }
  return points;
}

function buildGrid(args: {
  lkp: LatLng;
  radius95M: number;
  radius50M: number;
  profile: Profile;
  downhill: number;
  linear: number;
  hide: number;
  downslope?: number;
  intendedBearing?: number;
  features: LandInput["features"];
  elevation: ElevationSample[];
  elevAtLkp?: number;
  roadPoints: LatLng[];
}): HeatCell[] {
  const n = 35;
  const span = args.radius95M * 1.05;
  const mLat = metersPerDegLat();
  const mLng = metersPerDegLng(args.lkp.lat);
  const scale = args.radius50M / Math.LN2;
  const cells: HeatCell[] = [];
  const draft: { lat: number; lng: number; weight: number }[] = [];

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const north = ((row / (n - 1)) * 2 - 1) * span;
      const east = ((col / (n - 1)) * 2 - 1) * span;
      const distance = Math.hypot(north, east);
      if (distance > span) continue;
      const lat = args.lkp.lat + north / mLat;
      const lng = args.lkp.lng + east / mLng;
      let weight = Math.exp(-distance / scale);
      const cellBearing = distance < 8 ? args.downslope ?? 0 : (Math.atan2(east, north) * 180) / Math.PI;

      if (args.downslope != null && args.downhill > 0 && distance > 20) {
        const align = Math.cos((angleDiff(cellBearing, args.downslope) * Math.PI) / 180);
        weight *= 1 + args.downhill * 0.9 * align;
      }
      if (args.profile.purposeful > 0 && args.intendedBearing != null && distance > 20) {
        const align = Math.cos((angleDiff(cellBearing, args.intendedBearing) * Math.PI) / 180);
        weight *= 1 + args.profile.purposeful * 0.8 * align;
      }
      if (args.hide > 0) {
        weight *= 1 + args.hide * Math.exp(-distance / Math.max(80, args.radius50M * 0.7));
      }
      if (args.elevAtLkp != null && args.downhill > 0 && args.elevation.length) {
        const elev = elevationAt({ lat, lng }, args.elevation);
        if (elev != null) {
          const drop = clamp((args.elevAtLkp - elev) / 25, -1, 1);
          weight *= 1 + args.downhill * 0.75 * drop;
        }
      }
      if ((args.features.water || args.features.coastline) && args.profile.water > 0 && args.elevAtLkp != null) {
        const elev = elevationAt({ lat, lng }, args.elevation);
        if (elev != null && elev < args.elevAtLkp - 2) {
          weight *= 1 + args.profile.water * 0.45;
        }
      }
      if ((args.features.roads || args.features.trails) && args.linear > 0 && args.roadPoints.length) {
        if (nearRoad({ lat, lng }, args.roadPoints, args.features.trails ? 90 : 70)) {
          weight *= 1 + args.linear * 0.85;
        }
      } else if ((args.features.roads || args.features.trails) && args.linear > 0 && args.downslope != null && distance > 30) {
        const align = Math.cos((angleDiff(cellBearing, args.downslope) * Math.PI) / 180);
        if (align > 0.4) weight *= 1 + args.linear * 0.25;
      }

      weight = Math.max(weight, 0);
      draft.push({ lat, lng, weight });
    }
  }

  const peak = draft.reduce((max, cell) => Math.max(max, cell.weight), 0) || 1;
  for (const cell of draft) {
    const relative = cell.weight / peak;
    if (relative < 0.08) continue;
    cells.push({
      lat: cell.lat,
      lng: cell.lng,
      w: relative,
    });
  }
  cells.sort((a, b) => b.w - a.w);
  return cells;
}

function nearRoad(point: LatLng, roads: LatLng[], maxM: number): boolean {
  const mLat = metersPerDegLat();
  const mLng = metersPerDegLng(point.lat);
  const max2 = maxM * maxM;
  for (const road of roads) {
    const dy = (road.lat - point.lat) * mLat;
    const dx = (road.lng - point.lng) * mLng;
    if (dx * dx + dy * dy <= max2) return true;
  }
  return false;
}

function rankWedges(cells: HeatCell[], lkp: LatLng): SearchWedge[] {
  const bins = Array.from({ length: 8 }, () => 0);
  for (const cell of cells) {
    const bearing = bearingDeg(lkp, cell);
    const index = Math.min(7, Math.floor(bearing / 45));
    bins[index] += cell.w;
  }
  const wedges = bins.map((mass, index) => ({
    id: `S${index + 1}`,
    fromBearing: index * 45,
    toBearing: index * 45 + 45,
    mass,
    priority: 0,
  }));
  const order = [...wedges].sort((a, b) => b.mass - a.mass);
  order.forEach((wedge, index) => {
    wedge.priority = index + 1;
  });
  return wedges.sort((a, b) => a.priority - b.priority);
}

function actionsFor(category: SubjectCategory, profile: Profile, input: LandInput): string[] {
  const actions = [
    "Run a hasty search through the highest wedge and along any road, track, fence, or watercourse inside the 50% ring before starting a grid.",
    "Put containment on the roads that leave the 95% ring if the person is still likely to be moving.",
  ];
  if (category === "child_1_3" || category === "child_4_6") {
    actions.unshift(
      "Search slowly inside the close ring, including under and behind objects, and check water before widening.",
    );
  }
  if (category === "dementia" || category === "intellectual_disability") {
    actions.unshift(
      "Place lookouts where roads and tracks leave the ring. People in this category often stay on the easiest line and do not reverse it.",
    );
  }
  if (category === "despondent") {
    actions.unshift(
      "Search the 50% ring carefully, including edges, overlooks, and cover, before spending people on the outer ring.",
    );
  }
  if (category === "hiker" || category === "climber") {
    actions.unshift(
      "Follow the intended direction and the linear feature first. Widen only after that line has been properly looked at.",
    );
  }
  if (input.conditions === "night" || input.conditions === "storm") {
    actions.push("Detection is poor in these conditions. Shrink spacing and do not treat an unsearched dark sector as cleared.");
  }
  if (profile.water > 0.6 && (input.features.water || input.features.coastline)) {
    actions.push("Water is a high early task for this category. Task it as its own line, not as a leftover.");
  }
  return actions.slice(0, 5);
}
