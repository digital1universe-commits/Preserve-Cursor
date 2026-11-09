import {
  bboxOf,
  distanceToBoundaryM,
  formatCoord,
  haversineM,
  pointInPolygon,
  pointInsideBBox,
  polygonAreaM2,
  polygonIsSimple,
  segmentIntersection,
  type BBox,
  type LatLng,
} from "./geo.js";
import { undirectedMinCut } from "./mincut.js";
import { isDriveableHighway, type RoadWay } from "./roads.js";

export type ClosureSite = {
  id: string;
  position: LatLng;
  roadName: string;
  highway: string;
  seals: number;
  rationale: string;
};

export type ExitPoint = {
  position: LatLng;
  roadName: string;
  highway: string;
};

export type ContainmentPlan = {
  model: "preserve-containment-v1";
  status: "sealed" | "no_exits" | "no_roads" | "invalid_area" | "incomplete";
  areaM2: number;
  exitCorridors: number;
  closureCount: number;
  minimumGuaranteed: boolean;
  closures: ClosureSite[];
  exits: ExitPoint[];
  narrative: string[];
  actions: string[];
};

const SNAP = 0.00011;

type GraphNode = {
  key: string;
  position: LatLng;
  inside: boolean;
  portal: boolean;
};

type GraphEdge = {
  u: number;
  v: number;
  name: string;
  highway: string;
  position: LatLng;
  exit: boolean;
};

function snapKey(point: LatLng): string {
  return `${Math.round(point.lat / SNAP)}:${Math.round(point.lng / SNAP)}`;
}

function classifyInside(point: LatLng, polygon: LatLng[]): boolean {
  if (!pointInPolygon(point, polygon)) return false;
  return distanceToBoundaryM(point, polygon) > 6;
}

export function planContainment(input: {
  polygon: LatLng[];
  ways: RoadWay[];
  coverage?: BBox;
}): ContainmentPlan {
  const polygon = input.polygon;
  const areaM2 = polygonAreaM2(polygon);
  const empty = (
    status: ContainmentPlan["status"],
    narrative: string[],
    minimumGuaranteed = false,
  ): ContainmentPlan => ({
    model: "preserve-containment-v1",
    status,
    areaM2,
    exitCorridors: 0,
    closureCount: 0,
    minimumGuaranteed,
    closures: [],
    exits: [],
    narrative,
    actions: [],
  });

  if (polygon.length < 3 || !polygonIsSimple(polygon)) {
    return empty("invalid_area", [
      "The area needs at least three corners and cannot cross itself.",
    ]);
  }

  const driveable = input.ways.filter(
    (way) => isDriveableHighway(way.highway) && way.points.length >= 2,
  );
  if (!driveable.length) {
    return empty("no_roads", [
      "No driveable roads are loaded for this area, so a seal cannot be proved.",
      "Connect once so PRESERVE can read the road network, or move back into an area already stored on this device.",
    ]);
  }

  const coverage = input.coverage ?? bboxOf(driveable.flatMap((way) => way.points));
  const built = buildGraph(polygon, driveable, coverage);
  const exits = built.edges.filter((edge) => edge.exit);
  const exitCorridors = clusterExits(exits, built.nodes);

  if (!exits.length) {
    return {
      ...empty("no_exits", [
        "No driveable road crosses the line you drew.",
        "Footpaths, driveways, and private parking aisles are not treated as escape routes. A motorcycle on a path is outside this model.",
      ], true),
      exitCorridors: 0,
    };
  }

  const portals = built.nodes
    .map((node, index) => (node.portal ? index : -1))
    .filter((index) => index >= 0);

  if (!portals.length) {
    return fallbackClosures(
      areaM2,
      exits,
      built.nodes,
      "Road coverage does not reach past the area, so every driveable exit is marked. This seals the line, but it may not be the smallest set.",
    );
  }

  const source = built.nodes.length;
  const sink = built.nodes.length + 1;
  const flowEdges = built.edges.map((edge) => ({ u: edge.u, v: edge.v, cap: 1 }));
  for (let index = 0; index < built.nodes.length; index++) {
    if (built.nodes[index].inside) flowEdges.push({ u: source, v: index, cap: 1e9 });
  }
  for (const portal of portals) flowEdges.push({ u: portal, v: sink, cap: 1e9 });

  const cut = undirectedMinCut(built.nodes.length + 2, flowEdges, source, sink);
  const cutEdges = cut.cut
    .map((index) => built.edges[index])
    .filter((edge): edge is GraphEdge => Boolean(edge));

  if (!cutEdges.length || cut.flow <= 0) {
    return fallbackClosures(
      areaM2,
      exits,
      built.nodes,
      "The road graph did not yield a proved minimum cut. Every driveable exit is marked so the line can still be sealed.",
    );
  }

  const seals = attributeExits(exits, cutEdges, built);
  const closures = mergeSites(cutEdges, built.nodes, seals.counts);
  const complete = seals.unsealed === 0 && closures.length > 0;

  const narrative = [
    `${exitCorridors.length} driveable exit corridor${exitCorridors.length === 1 ? "" : "s"} cross the area. The minimum set that leaves no driveable path out to the surrounding network is ${closures.length} closure site${closures.length === 1 ? "" : "s"}.`,
    "A vehicle may still be on a street inside the closures, including a street just outside the line you drew, but it cannot pass a site and reach the open network.",
    "One-way restrictions are ignored. An escaping driver may not observe them.",
    "Footpaths are not sealed. Spike strips, vehicles, or another authorised closure are a command decision at each site — this plan only chooses the places.",
  ];
  if (!complete) {
    narrative.push(
      "Not every exit could be tied to a site. Treat the seal as incomplete and review the exit markers before anyone is deployed.",
    );
  }

  return {
    model: "preserve-containment-v1",
    status: complete ? "sealed" : "incomplete",
    areaM2,
    exitCorridors: exitCorridors.length,
    closureCount: closures.length,
    minimumGuaranteed: complete,
    closures,
    exits: exitCorridors,
    narrative,
    actions: [
      "Confirm each site has a place to stand off the carriageway and a view of the road to be closed.",
      "Brief crews with the road name and the corridors that site seals, not with a count alone.",
      "Recompute if the area changes. A larger suburb is not a small edit to this set.",
    ],
  };
}

function buildGraph(polygon: LatLng[], ways: RoadWay[], coverage: BBox): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const usage = new Map<string, Set<string>>();
  for (const way of ways) {
    for (const point of way.points) {
      const key = snapKey(point);
      const record = usage.get(key) ?? new Set<string>();
      record.add(way.id);
      usage.set(key, record);
    }
  }

  const isJunction = (point: LatLng, way: RoadWay, index: number) => {
    if (index === 0 || index === way.points.length - 1) return true;
    const record = usage.get(snapKey(point));
    if (!record) return false;
    for (const id of record) {
      if (id !== way.id) return true;
    }
    return false;
  };

  const nodeIndex = new Map<string, number>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenPairs = new Set<string>();

  const ensureNode = (point: LatLng): number => {
    const key = snapKey(point);
    const existing = nodeIndex.get(key);
    if (existing != null) return existing;
    const inside = classifyInside(point, polygon);
    const portal = !inside && !pointInsideBBox(point, coverage, 55);
    const index = nodes.length;
    nodes.push({ key, position: point, inside, portal });
    nodeIndex.set(key, index);
    return index;
  };

  const addEdge = (
    a: LatLng,
    b: LatLng,
    name: string,
    highway: string,
    position: LatLng,
  ) => {
    const u = ensureNode(a);
    const v = ensureNode(b);
    if (u === v) return;
    const pair = u < v ? `${u}:${v}` : `${v}:${u}`;
    if (seenPairs.has(pair)) return;
    seenPairs.add(pair);
    const insideU = nodes[u].inside;
    const insideV = nodes[v].inside;
    edges.push({
      u,
      v,
      name: name || "Unnamed road",
      highway,
      position,
      exit: insideU !== insideV,
    });
  };

  for (const way of ways) {
    const cuts: number[] = [];
    way.points.forEach((point, index) => {
      if (isJunction(point, way, index)) cuts.push(index);
    });
    if (cuts.length < 2) continue;
    for (let c = 0; c < cuts.length - 1; c++) {
      const slice = way.points.slice(cuts[c], cuts[c + 1] + 1);
      emitSplit(slice, way.name, way.highway, polygon, addEdge);
    }
  }

  return { nodes, edges };
}

function emitSplit(
  points: LatLng[],
  name: string,
  highway: string,
  polygon: LatLng[],
  addEdge: (a: LatLng, b: LatLng, name: string, highway: string, position: LatLng) => void,
) {
  const chain: LatLng[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const hits: { t: number; point: LatLng }[] = [];
    for (let e = 0; e < polygon.length; e++) {
      const hit = segmentIntersection(a, b, polygon[e], polygon[(e + 1) % polygon.length]);
      if (!hit) continue;
      const dx = b.lng - a.lng;
      const dy = b.lat - a.lat;
      const t = Math.abs(dx) >= Math.abs(dy) ? (hit.lng - a.lng) / (dx || 1e-12) : (hit.lat - a.lat) / (dy || 1e-12);
      if (t > 0.01 && t < 0.99) hits.push({ t, point: hit });
    }
    hits.sort((left, right) => left.t - right.t);
    for (const hit of hits) {
      const prev = chain[chain.length - 1];
      if (haversineM(prev, hit.point) > 4) chain.push(hit.point);
    }
    if (haversineM(chain[chain.length - 1], b) > 4) chain.push(b);
  }

  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    const position = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    addEdge(a, b, name, highway, position);
  }
}

function clusterExits(exits: GraphEdge[], nodes: GraphNode[]): ExitPoint[] {
  const raw = exits.map((edge) => ({
    position: edge.position,
    roadName: edge.name,
    highway: edge.highway,
    used: false,
  }));
  const clustered: ExitPoint[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].used) continue;
    raw[i].used = true;
    let position = raw[i].position;
    let count = 1;
    for (let j = i + 1; j < raw.length; j++) {
      if (raw[j].used) continue;
      const sameName = raw[j].roadName === raw[i].roadName;
      if (sameName && haversineM(raw[i].position, raw[j].position) < 45) {
        raw[j].used = true;
        position = {
          lat: (position.lat * count + raw[j].position.lat) / (count + 1),
          lng: (position.lng * count + raw[j].position.lng) / (count + 1),
        };
        count += 1;
      }
    }
    clustered.push({ position, roadName: raw[i].roadName, highway: raw[i].highway });
  }
  void nodes;
  return clustered;
}

function attributeExits(
  exits: GraphEdge[],
  cutEdges: GraphEdge[],
  built: { nodes: GraphNode[]; edges: GraphEdge[] },
): { counts: Record<number, number>; unsealed: number } {
  const cutIds = new Set(cutEdges.map((edge) => edgeKey(edge)));
  const counts: Record<number, number> = {};
  cutEdges.forEach((_, index) => {
    counts[index] = 0;
  });
  const adj = new Map<number, { to: number; edge: GraphEdge }[]>();
  for (const edge of built.edges) {
    const listU = adj.get(edge.u) ?? [];
    listU.push({ to: edge.v, edge });
    adj.set(edge.u, listU);
    const listV = adj.get(edge.v) ?? [];
    listV.push({ to: edge.u, edge });
    adj.set(edge.v, listV);
  }

  let unsealed = 0;
  for (const exit of exits) {
    const own = cutEdges.findIndex((edge) => edgeKey(edge) === edgeKey(exit));
    if (own >= 0) {
      counts[own] += 1;
      continue;
    }
    const start = built.nodes[exit.u].inside ? exit.v : exit.u;
    const queue = [start];
    const seen = new Set<number>([start]);
    let credited = false;
    let reachedPortal = false;
    for (let head = 0; head < queue.length && !credited; head++) {
      const node = queue[head];
      if (built.nodes[node]?.portal) reachedPortal = true;
      for (const link of adj.get(node) ?? []) {
        if (cutIds.has(edgeKey(link.edge))) {
          const index = cutEdges.findIndex((edge) => edgeKey(edge) === edgeKey(link.edge));
          if (index >= 0) counts[index] += 1;
          credited = true;
          break;
        }
        if (!seen.has(link.to) && !built.nodes[link.to].inside) {
          seen.add(link.to);
          queue.push(link.to);
        }
      }
    }
    if (!credited && reachedPortal) unsealed += 1;
  }
  return { counts, unsealed };
}

function edgeKey(edge: GraphEdge): string {
  return edge.u < edge.v ? `${edge.u}:${edge.v}` : `${edge.v}:${edge.u}`;
}

function mergeSites(
  cutEdges: GraphEdge[],
  nodes: GraphNode[],
  seals: Record<number, number>,
): ClosureSite[] {
  const items = cutEdges.map((edge, index) => ({
    edge,
    index,
    used: false,
    seals: seals[index] ?? 0,
  }));
  const sites: ClosureSite[] = [];
  for (const item of items) {
    if (item.used) continue;
    item.used = true;
    const group = [item];
    for (const other of items) {
      if (other.used) continue;
      const sameRoad = other.edge.name === item.edge.name;
      if (sameRoad && haversineM(item.edge.position, other.edge.position) < 40) {
        other.used = true;
        group.push(other);
      }
    }
    const position = {
      lat: group.reduce((sum, current) => sum + current.edge.position.lat, 0) / group.length,
      lng: group.reduce((sum, current) => sum + current.edge.position.lng, 0) / group.length,
    };
    const sealed = group.reduce((sum, current) => sum + current.seals, 0);
    const outside =
      !nodes[item.edge.u].inside && !nodes[item.edge.v].inside
        ? "just outside the line, where the corridors have already joined"
        : "on the line where the road leaves the area";
    const parallel =
      group.length > 1 ? ` It covers ${group.length} parallel links of the same road.` : "";
    sites.push({
      id: `SS-${sites.length + 1}`,
      position,
      roadName: item.edge.name,
      highway: item.edge.highway,
      seals: sealed,
      rationale: `${item.edge.name} (${item.edge.highway}), ${outside}. ${
        sealed > 0
          ? `Seals ${sealed} driveable link${sealed === 1 ? "" : "s"} that would otherwise reach the open network.`
          : "Sits on the minimum cut out of the area."
      }${parallel} ${formatCoord(position)}.`,
    });
  }
  return sites;
}

function fallbackClosures(
  areaM2: number,
  exits: GraphEdge[],
  nodes: GraphNode[],
  reason: string,
): ContainmentPlan {
  const clustered = clusterExits(exits, nodes);
  const closures: ClosureSite[] = clustered.map((exit, index) => ({
    id: `SS-${index + 1}`,
    position: exit.position,
    roadName: exit.roadName,
    highway: exit.highway,
    seals: 1,
    rationale: `${exit.roadName} leaves the area here. ${formatCoord(exit.position)}.`,
  }));
  return {
    model: "preserve-containment-v1",
    status: "sealed",
    areaM2,
    exitCorridors: clustered.length,
    closureCount: closures.length,
    minimumGuaranteed: false,
    closures,
    exits: clustered,
    narrative: [
      reason,
      "One-way restrictions are ignored. Footpaths are not sealed.",
      "The commander authorises any closure. This plan does not.",
    ],
    actions: [
      "Treat every marked exit as requiring its own closure until a fuller road extract is loaded.",
    ],
  };
}
