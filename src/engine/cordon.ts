import { planContainment } from "./containment.js";
import type { PathWay, ParkArea } from "./features.js";
import {
  bearingDeg,
  bboxOf,
  destination,
  expandBBox,
  formatCoord,
  haversineM,
  pointInPolygon,
  polygonAreaM2,
  type LatLng,
} from "./geo.js";
import { isDriveableHighway, type RoadWay } from "./roads.js";

export type StructureKind = "detached" | "commercial" | "multi_storey" | "open_ground";
export type SubjectRisk = "unknown" | "unarmed" | "edged" | "firearm";

export type CordonPost = {
  id: string;
  kind: "scene" | "escape" | "search" | "rvp" | "command";
  position: LatLng;
  label: string;
  side?: "north" | "east" | "south" | "west";
  locked?: boolean;
  sectorBearing?: number;
  rationale: string;
};

export type SearchTask = {
  id: string;
  kind: "park" | "walkway" | "alley" | "easement" | "path";
  name: string;
  points: LatLng[];
  rationale: string;
};

export type CordonPlan = {
  model: "preserve-cordon-v2";
  standoffM: number;
  escapeRadiusM: number;
  footprint: LatLng[];
  escapePolygon: LatLng[];
  posts: CordonPost[];
  searchTasks: SearchTask[];
  closures: { id: string; position: LatLng; roadName: string; seals: number; rationale: string }[];
  narrative: string[];
  actions: string[];
  riskNote: string;
};

const FOOTPRINT_HALF_M: Record<StructureKind, number> = {
  detached: 18,
  commercial: 32,
  multi_storey: 28,
  open_ground: 45,
};

const STANDOFF_M: Record<SubjectRisk, number> = {
  unarmed: 18,
  edged: 28,
  unknown: 40,
  firearm: 90,
};

const ESCAPE_RADIUS_M: Record<SubjectRisk, number> = {
  unarmed: 350,
  edged: 400,
  unknown: 500,
  firearm: 650,
};

const SIDES = ["north", "east", "south", "west"] as const;

export function planCordon(input: {
  subject: LatLng;
  structure: StructureKind;
  risk: SubjectRisk;
  footprint?: LatLng[];
  escapeRadiusM?: number;
  lockedPosts?: CordonPost[];
  ways?: RoadWay[];
  paths?: PathWay[];
  parks?: ParkArea[];
}): CordonPlan {
  const footprint = normaliseFootprint(input.footprint, input.subject, input.structure);
  const standoff = STANDOFF_M[input.risk];
  const escapeRadius = Math.max(180, Math.min(1200, input.escapeRadiusM ?? ESCAPE_RADIUS_M[input.risk]));
  const escapePolygon = expandFootprint(footprint, escapeRadius);
  const ways = (input.ways ?? []).filter((way) => isDriveableHighway(way.highway));
  const paths = input.paths ?? [];
  const parks = input.parks ?? [];
  const locked = (input.lockedPosts ?? []).filter((post) => post.locked);

  const scenePosts = surroundScene(footprint, input.subject, standoff, input.risk, locked);
  const coverage = expandBBox(bboxOf(escapePolygon), 120);
  const seal = planContainment({ polygon: escapePolygon, ways, coverage });
  const escapePosts = seal.closures.map((site, index) => {
    const lockedMatch = locked.find((post) => post.kind === "escape" && post.id === site.id);
    if (lockedMatch) return lockedMatch;
    return {
      id: site.id,
      kind: "escape" as const,
      position: site.position,
      label: site.id,
      locked: false,
      rationale: `Street block on ${site.roadName}. Part of the minimum set that seals driveable escape from the local sector. ${site.rationale}`,
    };
  });
  // Keep locked escape posts that the new cut did not reproduce.
  for (const post of locked.filter((item) => item.kind === "escape")) {
    if (!escapePosts.some((item) => item.id === post.id)) escapePosts.push(post);
  }

  const searchTasks = buildSearchTasks(escapePolygon, paths, parks, ways);
  const searchPosts = searchTasks.slice(0, 16).map((task, index) => {
    const mid = task.points[Math.floor(task.points.length / 2)] || task.points[0];
    const lockedMatch = locked.find((post) => post.kind === "search" && post.id === `SR-${index + 1}`);
    if (lockedMatch) return lockedMatch;
    return {
      id: `SR-${index + 1}`,
      kind: "search" as const,
      position: mid,
      label: `SR-${index + 1}`,
      locked: false,
      rationale: task.rationale,
    };
  });

  const rvpLocked = locked.find((post) => post.kind === "rvp");
  const commandLocked = locked.find((post) => post.kind === "command");
  const rvp = rvpLocked ?? chooseRvp(input.subject, escapePolygon, ways, escapeRadius);
  const command =
    commandLocked ??
    ({
      id: "CP",
      kind: "command" as const,
      position: offsetOutside(rvp.position, input.subject, 90),
      label: "Command",
      locked: false,
      rationale: `Suggested command point, kept off the rendezvous so arriving units do not stack on the commander. Move it to the real premises. ${formatCoord(offsetOutside(rvp.position, input.subject, 90))}.`,
    } satisfies CordonPost);

  const posts = [...scenePosts, ...escapePosts, ...searchPosts, rvp, command];
  const riskNote = riskCopy(input.risk);

  return {
    model: "preserve-cordon-v2",
    standoffM: Math.round(standoff),
    escapeRadiusM: Math.round(escapeRadius),
    footprint,
    escapePolygon,
    posts,
    searchTasks,
    closures: seal.closures.map((site) => ({
      id: site.id,
      position: site.position,
      roadName: site.roadName,
      seals: site.seals,
      rationale: site.rationale,
    })),
    narrative: [
      `Scene surround: observation posts on the north, east, south, and west faces at about ${Math.round(standoff)} m standoff from the footprint. This is containment and observation, not an approach or an entry.`,
      `Local escape sector: about ${Math.round(escapeRadius)} m around the scene. ${seal.closures.length} street block${seal.closures.length === 1 ? "" : "s"} for ${seal.exits.length} driveable exit corridor${seal.exits.length === 1 ? "" : "s"} — the fewest sites that seal the loaded roads.`,
      searchTasks.length
        ? `${searchTasks.length} search task${searchTasks.length === 1 ? "" : "s"} for parks, walkways, alleys, and easements so a person on foot cannot leave the sector without meeting a search or a street block.`
        : "No parks or walkways were loaded in the sector. Confirm open ground, easements, and cut-throughs on the ground.",
      riskNote,
      locked.length ? `${locked.length} post${locked.length === 1 ? "" : "s"} locked by the commander and kept through this recompute.` : "Posts can be moved and locked so a later recompute does not wipe the ground truth.",
    ],
    actions: [
      "Occupy the four scene faces from cover that matches the reported risk. Do not treat the pins as an approach path onto the structure.",
      "Place the street blocks first with the fewest units, then push search teams through parks, alleys, walkways, and easements inside the sector.",
      "Lock any post you have already committed on the ground before you rebuild the plan.",
      "Recompute if the subject moves, the footprint changes, or another agency takes the ground.",
    ],
    riskNote,
  };
}

function normaliseFootprint(footprint: LatLng[] | undefined, subject: LatLng, structure: StructureKind): LatLng[] {
  if (footprint && footprint.length >= 3) {
    const closed = [...footprint];
    const first = closed[0];
    const last = closed[closed.length - 1];
    if (haversineM(first, last) > 1) closed.push(first);
    if (polygonAreaM2(closed) >= 80) return closed;
  }
  const half = FOOTPRINT_HALF_M[structure];
  const n = destination(subject, 0, half);
  const e = destination(subject, 90, half);
  const s = destination(subject, 180, half);
  const w = destination(subject, 270, half);
  return [
    { lat: n.lat, lng: w.lng },
    { lat: n.lat, lng: e.lng },
    { lat: s.lat, lng: e.lng },
    { lat: s.lat, lng: w.lng },
  ];
}

function expandFootprint(footprint: LatLng[], radiusM: number): LatLng[] {
  const center = centroid(footprint);
  return footprint.map((corner) => {
    const bearing = bearingDeg(center, corner);
    const distance = haversineM(center, corner) + radiusM;
    return destination(center, bearing, distance);
  });
}

function surroundScene(
  footprint: LatLng[],
  subject: LatLng,
  standoffM: number,
  risk: SubjectRisk,
  locked: CordonPost[],
): CordonPost[] {
  const center = centroid(footprint);
  return SIDES.map((side, index) => {
    const id = `SC-${index + 1}`;
    const lockedMatch = locked.find((post) => post.id === id || (post.kind === "scene" && post.side === side));
    if (lockedMatch) return { ...lockedMatch, locked: true };
    const face = facePoint(footprint, center, side);
    const outward = bearingDeg(center, face);
    const position = destination(face, outward, standoffM);
    const facing = bearingDeg(position, subject);
    return {
      id,
      kind: "scene",
      position,
      label: id,
      side,
      locked: false,
      sectorBearing: facing,
      rationale: `Scene face ${side}. Observation and containment on that side of the footprint at about ${Math.round(standoffM)} m. ${
        risk === "firearm" ? "Occupy only from ballistic cover accepted by the commander. " : risk === "edged" ? "Keep sudden-contact distance. " : ""
      }Sector faces the subject at ${Math.round(facing)}°. ${formatCoord(position)}.`,
    };
  });
}

function facePoint(footprint: LatLng[], center: LatLng, side: (typeof SIDES)[number]): LatLng {
  const targetBearing = side === "north" ? 0 : side === "east" ? 90 : side === "south" ? 180 : 270;
  let best = footprint[0];
  let bestDelta = 180;
  for (const corner of footprint) {
    const bearing = bearingDeg(center, corner);
    let delta = Math.abs(bearing - targetBearing);
    if (delta > 180) delta = 360 - delta;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = corner;
    }
  }
  // Midpoint of the two footprint vertices nearest this compass face.
  const ranked = [...footprint].sort((a, b) => {
    const da = angleDelta(bearingDeg(center, a), targetBearing);
    const db = angleDelta(bearingDeg(center, b), targetBearing);
    return da - db;
  });
  if (ranked.length >= 2 && angleDelta(bearingDeg(center, ranked[1]), targetBearing) < 70) {
    return {
      lat: (ranked[0].lat + ranked[1].lat) / 2,
      lng: (ranked[0].lng + ranked[1].lng) / 2,
    };
  }
  return best;
}

function angleDelta(a: number, b: number): number {
  let delta = Math.abs(a - b);
  if (delta > 180) delta = 360 - delta;
  return delta;
}

function buildSearchTasks(escapePolygon: LatLng[], paths: PathWay[], parks: ParkArea[], ways: RoadWay[]): SearchTask[] {
  const tasks: SearchTask[] = [];
  for (const park of parks) {
    if (!park.points.some((point) => pointInPolygon(point, escapePolygon))) continue;
    tasks.push({
      id: `park-${park.id}`,
      kind: "park",
      name: park.name,
      points: park.points,
      rationale: `Search ${park.name}. Open ground inside the escape sector — a person on foot can cut through here without using a sealed street.`,
    });
  }
  for (const path of paths) {
    const inside = path.points.filter((point) => pointInPolygon(point, escapePolygon));
    if (inside.length < 2) continue;
    const kind =
      path.kind === "alley" ? "alley" : path.kind === "footway" || path.kind === "pedestrian" ? "walkway" : path.kind === "path" ? "path" : "easement";
    tasks.push({
      id: `path-${path.id}`,
      kind,
      name: path.name,
      points: inside,
      rationale: `Search ${path.name} (${kind}). Keep it under observation so the subject cannot leave the sector on foot without walking into police.`,
    });
  }
  // Service alleys sometimes arrive only as driveable service ways.
  for (const way of ways) {
    if (way.highway !== "service") continue;
    const inside = way.points.filter((point) => pointInPolygon(point, escapePolygon));
    if (inside.length < 2) continue;
    if (tasks.some((task) => task.name === way.name && task.kind === "alley")) continue;
    tasks.push({
      id: `alley-${way.id}`,
      kind: "alley",
      name: way.name,
      points: inside,
      rationale: `Search ${way.name} (service / alley). Confirm it is walked or held so it is not a quiet foot exit.`,
    });
  }
  return tasks.slice(0, 40);
}

function chooseRvp(subject: LatLng, escapePolygon: LatLng[], ways: RoadWay[], escapeRadius: number): CordonPost {
  const center = centroid(escapePolygon);
  let best: { position: LatLng; name: string; score: number } | null = null;
  for (const way of ways) {
    for (const point of way.points) {
      if (pointInPolygon(point, escapePolygon)) continue;
      const distance = haversineM(center, point);
      if (distance < escapeRadius * 1.05 || distance > escapeRadius * 1.8) continue;
      const score = distance;
      if (!best || score < best.score) best = { position: point, name: way.name, score };
    }
  }
  if (best) {
    return {
      id: "RVP",
      kind: "rvp",
      position: best.position,
      label: "RVP",
      locked: false,
      rationale: `Rendezvous on ${best.name}, outside the escape sector. Confirm it is not in the subject's direct view. ${formatCoord(best.position)}.`,
    };
  }
  const position = destination(subject, 200, escapeRadius * 1.35);
  return {
    id: "RVP",
    kind: "rvp",
    position,
    label: "RVP",
    locked: false,
    rationale: `No road was loaded outside the sector. The rendezvous is plotted for confirmation on a real approach. ${formatCoord(position)}.`,
  };
}

function offsetOutside(from: LatLng, subject: LatLng, metres: number): LatLng {
  const bearing = bearingDeg(subject, from);
  return destination(from, bearing + 75, metres);
}

function centroid(points: LatLng[]): LatLng {
  const lat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lng = points.reduce((sum, point) => sum + point.lng, 0) / points.length;
  return { lat, lng };
}

function riskCopy(risk: SubjectRisk): string {
  if (risk === "firearm") {
    return "A firearm is reported. Scene faces are a containment ring only. Occupy them from ballistic cover, and only when the commander accepts that exposure. This model does not describe an approach onto the structure, a field of fire, or an entry.";
  }
  if (risk === "edged") {
    return "An edged weapon is reported. Keep the scene faces back from sudden contact. Street blocks and foot searches still apply.";
  }
  if (risk === "unarmed") {
    return "No weapon is reported. The plan is still containment, street blocks, and foot-search tasks — not permission to approach the subject.";
  }
  return "The risk is unknown, so standoff and the escape sector are set wide. Narrow them only when the commander is satisfied about weapons and how far the subject may already have walked.";
}

/** @deprecated kept for map ticks that face the subject */
export function sectorTick(post: CordonPost, subject: LatLng): LatLng[] | null {
  if (post.sectorBearing == null) return null;
  const toward = bearingDeg(post.position, subject);
  return [post.position, destination(post.position, toward, 22)];
}
