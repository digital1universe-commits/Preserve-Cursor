import {
  bearingDeg,
  circlePolygon,
  destination,
  formatCoord,
  haversineM,
  segmentIntersection,
} from "./geo.js";
import { isDriveableHighway, roadClassRank, type RoadWay } from "./roads.js";
import type { LatLng } from "./geo.js";

export type StructureKind = "detached" | "commercial" | "multi_storey" | "open_ground";
export type SubjectRisk = "unknown" | "unarmed" | "edged" | "firearm";

export type CordonPost = {
  id: string;
  kind: "inner" | "outer" | "traffic" | "rvp" | "command";
  position: LatLng;
  label: string;
  sectorBearing?: number;
  sectorWidth?: number;
  rationale: string;
};

export type CordonPlan = {
  model: "preserve-cordon-v1";
  innerRadiusM: number;
  outerRadiusM: number;
  posts: CordonPost[];
  innerRing: LatLng[];
  outerRing: LatLng[];
  narrative: string[];
  actions: string[];
  riskNote: string;
};

const INNER_DEFAULT: Record<StructureKind, number> = {
  detached: 45,
  commercial: 60,
  multi_storey: 75,
  open_ground: 90,
};

const OUTER_DEFAULT: Record<SubjectRisk, number> = {
  unarmed: 160,
  edged: 200,
  unknown: 250,
  firearm: 400,
};

export function planCordon(input: {
  subject: LatLng;
  structure: StructureKind;
  exits: number;
  risk: SubjectRisk;
  innerRadiusM?: number;
  outerRadiusM?: number;
  ways?: RoadWay[];
}): CordonPlan {
  const exits = Math.max(1, Math.min(12, Math.round(input.exits || 4)));
  let inner = input.innerRadiusM ?? INNER_DEFAULT[input.structure];
  let outer = input.outerRadiusM ?? OUTER_DEFAULT[input.risk];
  if (input.risk === "firearm") inner = Math.max(inner, 100);
  if (outer < inner + 40) outer = inner + 80;

  const spacing = input.structure === "open_ground" ? 80 : 100;
  const postCount = Math.max(
    exits,
    input.structure === "commercial" || input.structure === "multi_storey" ? 6 : 4,
    Math.ceil((2 * Math.PI * inner) / spacing),
  );
  const count = Math.min(12, postCount);
  const ways = (input.ways ?? []).filter((way) => isDriveableHighway(way.highway));
  const samples = sampleRoads(ways, 25);

  const posts: CordonPost[] = [];
  const sectorWidth = 360 / count;
  for (let index = 0; index < count; index++) {
    const bearing = (index * 360) / count;
    const ideal = destination(input.subject, bearing, inner);
    const snap = nearestSample(ideal, samples, 40);
    const position = snap ?? ideal;
    const facing = bearingDeg(position, input.subject);
    posts.push({
      id: `IC-${index + 1}`,
      kind: "inner",
      position,
      label: `Inner ${index + 1}`,
      sectorBearing: facing,
      sectorWidth,
      rationale: snap
        ? `Observation post on the inner cordon, moved onto the nearest road within 40 m. Sector faces the subject at ${Math.round(facing)}°, about ${Math.round(sectorWidth)}° wide. ${formatCoord(position)}.`
        : `Observation post plotted on the ${Math.round(inner)} m ring. No road within 40 m, so confirm a covered position on the ground. Sector faces the subject at ${Math.round(facing)}°.`,
    });
  }

  const outerRing = circlePolygon(input.subject, outer, 72);
  const traffic = trafficPoints(input.subject, outer, ways);
  if (traffic.length) {
    traffic.forEach((point, index) => {
      posts.push({
        id: `TCP-${index + 1}`,
        kind: "traffic",
        position: point.position,
        label: `Traffic ${index + 1}`,
        rationale: `${point.name} crosses the outer cordon. Hold vehicle and foot traffic here. ${formatCoord(point.position)}.`,
      });
    });
  } else {
    for (let index = 0; index < 4; index++) {
      const bearing = 45 + index * 90;
      const position = destination(input.subject, bearing, outer);
      posts.push({
        id: `OC-${index + 1}`,
        kind: "outer",
        position,
        label: `Outer ${index + 1}`,
        rationale: `Outer cordon plotted on the ${Math.round(outer)} m ring because no driveable road was loaded across it. Confirm the real access roads before posting. ${formatCoord(position)}.`,
      });
    }
  }

  const rvp = chooseRvp(input.subject, outer, samples);
  posts.push({
    id: "RVP",
    kind: "rvp",
    position: rvp.position,
    label: "RVP",
    rationale: rvp.rationale,
  });
  const command = commandPost(input.subject, rvp.position, outer);
  posts.push({
    id: "CP",
    kind: "command",
    position: command,
    label: "Command",
    rationale: `Suggested command position, offset from the rendezvous so arriving vehicles do not sit on the command point. Move it to the real premises. ${formatCoord(command)}.`,
  });

  const riskNote =
    input.risk === "firearm"
      ? "A firearm is reported. Inner posts are a containment ring only. Occupy them from ballistic cover, and only when the commander accepts that exposure. This model does not describe an approach, a field of fire, or an entry."
      : input.risk === "edged"
        ? "An edged weapon is reported. Keep the inner ring back from sudden contact and do not close it without a command direction."
        : input.risk === "unarmed"
          ? "No weapon is reported. The ring is still a containment and observation plan, not permission to approach."
          : "The risk is unknown, so the outer cordon is set wide. Narrow it only when the commander is satisfied about weapons.";

  return {
    model: "preserve-cordon-v1",
    innerRadiusM: Math.round(inner),
    outerRadiusM: Math.round(outer),
    posts,
    innerRing: circlePolygon(input.subject, inner, 64),
    outerRing,
    narrative: [
      `Inner cordon at ${Math.round(inner)} m with ${count} observation posts. Sectors overlap around the subject and face inward.`,
      `Outer cordon at ${Math.round(outer)} m. ${
        traffic.length
          ? `${traffic.length} road crossing${traffic.length === 1 ? "" : "s"} should be held as traffic points.`
          : "Road crossings could not be read, so the outer ring is plotted as four points to be confirmed."
      }`,
      "Posts are spaced evenly because the direction of each exit was not supplied. After a look at the building, slide a post to cover a door, gate, or alley the ring does not see.",
      riskNote,
    ],
    actions: [
      "Walk the inner posts against the actual doors and corners before they are occupied.",
      "Keep the rendezvous and command point outside the outer cordon, off the direct line to the subject.",
      "Recompute if the subject moves or the cordon is handed to another agency.",
    ],
    riskNote,
  };
}

function sampleRoads(ways: RoadWay[], stepM: number): { position: LatLng; name: string; highway: string }[] {
  const samples: { position: LatLng; name: string; highway: string }[] = [];
  for (const way of ways) {
    for (let i = 0; i < way.points.length - 1; i++) {
      const a = way.points[i];
      const b = way.points[i + 1];
      const length = haversineM(a, b);
      const steps = Math.max(1, Math.ceil(length / stepM));
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        samples.push({
          position: {
            lat: a.lat + (b.lat - a.lat) * t,
            lng: a.lng + (b.lng - a.lng) * t,
          },
          name: way.name || "Unnamed road",
          highway: way.highway,
        });
      }
    }
  }
  return samples;
}

function nearestSample(
  point: LatLng,
  samples: { position: LatLng; name: string; highway: string }[],
  maxM: number,
): LatLng | null {
  let best: LatLng | null = null;
  let bestDistance = maxM;
  for (const sample of samples) {
    const distance = haversineM(point, sample.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = sample.position;
    }
  }
  return best;
}

function trafficPoints(
  subject: LatLng,
  radiusM: number,
  ways: RoadWay[],
): { position: LatLng; name: string; highway: string }[] {
  const ring = circlePolygon(subject, radiusM, 72);
  const hits: { position: LatLng; name: string; highway: string }[] = [];
  for (const way of ways) {
    for (let i = 0; i < way.points.length - 1; i++) {
      const a = way.points[i];
      const b = way.points[i + 1];
      if (haversineM(a, subject) > radiusM + 400 && haversineM(b, subject) > radiusM + 400) continue;
      for (let e = 0; e < ring.length; e++) {
        const hit = segmentIntersection(a, b, ring[e], ring[(e + 1) % ring.length]);
        if (!hit) continue;
        hits.push({
          position: hit,
          name: way.name || "Unnamed road",
          highway: way.highway,
        });
      }
    }
  }
  const kept: { position: LatLng; name: string; highway: string }[] = [];
  for (const hit of hits) {
    const near = kept.find(
      (item) =>
        haversineM(item.position, hit.position) < 55 &&
        (item.name === hit.name || haversineM(item.position, hit.position) < 25),
    );
    if (!near) kept.push(hit);
  }
  kept.sort((a, b) => roadClassRank(b.highway) - roadClassRank(a.highway));
  return kept.slice(0, 14);
}

function chooseRvp(
  subject: LatLng,
  outer: number,
  samples: { position: LatLng; name: string; highway: string }[],
): { position: LatLng; rationale: string } {
  let best: { position: LatLng; name: string; highway: string; score: number } | null = null;
  for (const sample of samples) {
    const distance = haversineM(subject, sample.position);
    if (distance < outer * 1.08 || distance > outer * 1.75) continue;
    const score = roadClassRank(sample.highway) * 1000 - Math.abs(distance - outer * 1.3);
    if (!best || score > best.score) best = { ...sample, score };
  }
  if (best) {
    return {
      position: best.position,
      rationale: `Rendezvous on ${best.name}, outside the outer cordon and on the highest class of road in that band. Confirm it is not on the direct approach the subject can see. ${formatCoord(best.position)}.`,
    };
  }
  const position = destination(subject, 200, outer * 1.35);
  return {
    position,
    rationale: `No suitable road was loaded outside the outer cordon. The rendezvous is plotted ${Math.round(outer * 1.35)} m from the subject and must be moved onto a real approach. ${formatCoord(position)}.`,
  };
}

function commandPost(subject: LatLng, rvp: LatLng, outer: number): LatLng {
  const bearing = bearingDeg(subject, rvp);
  let command = destination(rvp, bearing + 80, 85);
  if (haversineM(subject, command) < outer * 1.02) {
    command = destination(rvp, bearing, 110);
  }
  return command;
}

export function sectorTick(post: CordonPost, subject: LatLng): LatLng[] | null {
  if (post.sectorBearing == null) return null;
  const toward = bearingDeg(post.position, subject);
  return [post.position, destination(post.position, toward, 22)];
}
