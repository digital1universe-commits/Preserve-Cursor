import type { PathWay, ProtectedSite } from "./features.js";
import {
  bearingDeg,
  bboxOf,
  destination,
  expandBBox,
  formatCoord,
  haversineM,
  type BBox,
  type LatLng,
} from "./geo.js";
import { isDriveableHighway, type RoadWay } from "./roads.js";

export type { ProtectedSite };

export type PublicOrderResources = {
  serials: number;
  traffic: number;
  protection: number;
  mobile: number;
};

export type PublicOrderPost = {
  id: string;
  kind: "route_hold" | "side_block" | "protect" | "clash_buffer" | "assembly" | "dispersal" | "reserve";
  position: LatLng;
  label: string;
  resource: "serial" | "traffic" | "protection" | "mobile";
  rationale: string;
};

export type PublicOrderPlan = {
  model: "preserve-public-order-v1";
  mode: "endpoints" | "drawn";
  route: LatLng[];
  routeLengthM: number;
  snapped: boolean;
  corridorM: number;
  posts: PublicOrderPost[];
  protectedNearRoute: { site: ProtectedSite; distanceM: number }[];
  offRouteExits: { position: LatLng; name: string }[];
  resourcesUsed: PublicOrderResources;
  resourcesLeft: PublicOrderResources;
  narrative: string[];
  actions: string[];
};

type WalkEdge = {
  id: string;
  name: string;
  a: number;
  b: number;
  lengthM: number;
};

type Graph = {
  nodes: LatLng[];
  edges: WalkEdge[];
  adj: Map<number, { to: number; edge: number; lengthM: number }[]>;
};

const SNAP_M = 35;
const CORRIDOR_DEFAULT = 45;

export function planPublicOrder(input: {
  start?: LatLng;
  end?: LatLng;
  drawn?: LatLng[];
  resources?: Partial<PublicOrderResources>;
  corridorM?: number;
  opposingAssembly?: LatLng;
  ways?: RoadWay[];
  paths?: PathWay[];
  sites?: ProtectedSite[];
}): PublicOrderPlan {
  const corridorM = Math.max(20, Math.min(120, input.corridorM ?? CORRIDOR_DEFAULT));
  const resources: PublicOrderResources = {
    serials: Math.max(0, Math.round(input.resources?.serials ?? 12)),
    traffic: Math.max(0, Math.round(input.resources?.traffic ?? 6)),
    protection: Math.max(0, Math.round(input.resources?.protection ?? 6)),
    mobile: Math.max(0, Math.round(input.resources?.mobile ?? 4)),
  };
  const left = { ...resources };
  const ways = (input.ways ?? []).filter((way) => isDriveableHighway(way.highway));
  const paths = input.paths ?? [];
  const sites = input.sites ?? [];
  const graph = buildFootGraph(ways, paths);

  let mode: "endpoints" | "drawn" = "endpoints";
  let route: LatLng[] = [];
  let snapped = false;

  if (input.drawn && input.drawn.length >= 2) {
    mode = "drawn";
    const snappedRoute = snapDrawnRoute(input.drawn, graph);
    route = snappedRoute.route;
    snapped = snappedRoute.snapped;
  } else if (input.start && input.end) {
    const found = routeEndpoints(input.start, input.end, graph);
    route = found.route;
    snapped = found.snapped;
  } else {
    throw new Error("Set a start and end, or draw the protest route.");
  }

  if (route.length < 2) {
    throw new Error("A continuous foot route could not be formed on the loaded paths and streets.");
  }

  const routeLengthM = pathLength(route);
  const posts: PublicOrderPost[] = [];
  const offRouteExits = findOffRouteExits(route, graph, corridorM);

  // Assembly and dispersal
  pushPost(posts, left, {
    id: "AS-1",
    kind: "assembly",
    position: route[0],
    label: "AS-1",
    resource: "serial",
    rationale: `Assembly control at the start of the route. Hold the crowd onto the agreed line of march. ${formatCoord(route[0])}.`,
  });
  pushPost(posts, left, {
    id: "DS-1",
    kind: "dispersal",
    position: route[route.length - 1],
    label: "DS-1",
    resource: "serial",
    rationale: `Dispersal control at the finish. Keep people moving off the route without spilling into side streets. ${formatCoord(route[route.length - 1])}.`,
  });

  // Side blocks — prevent movement off the route (fewest first, spaced)
  const rankedExits = [...offRouteExits].sort((a, b) => {
    const da = distanceAlongRoute(route, a.position);
    const db = distanceAlongRoute(route, b.position);
    return Math.abs(da - routeLengthM / 2) - Math.abs(db - routeLengthM / 2);
  });
  let sideIndex = 0;
  for (const exit of rankedExits) {
    if (left.serials + left.traffic <= 0) break;
    if (posts.some((post) => haversineM(post.position, exit.position) < 55)) continue;
    sideIndex += 1;
    const useTraffic = left.traffic > 0 && sideIndex % 3 === 0;
    pushPost(posts, left, {
      id: `SB-${sideIndex}`,
      kind: "side_block",
      position: exit.position,
      label: `SB-${sideIndex}`,
      resource: useTraffic ? "traffic" : "serial",
      rationale: `Side block on ${exit.name}. Stops the march leaving the agreed route into adjoining streets or cut-throughs. ${formatCoord(exit.position)}.`,
    });
    if (sideIndex >= 18) break;
  }

  // Protect valuable infrastructure near the route
  const protectedNearRoute = sites
    .map((site) => ({ site, distanceM: distanceToPolylineM(site.position, route) }))
    .filter((item) => item.distanceM <= Math.max(120, corridorM * 3))
    .sort((a, b) => a.distanceM - b.distanceM);

  let protectIndex = 0;
  for (const item of protectedNearRoute) {
    if (left.protection <= 0 && left.serials <= 0) break;
    protectIndex += 1;
    const onRoute = nearestOnPolyline(item.site.position, route);
    pushPost(posts, left, {
      id: `PR-${protectIndex}`,
      kind: "protect",
      position: onRoute,
      label: `PR-${protectIndex}`,
      resource: left.protection > 0 ? "protection" : "serial",
      rationale: `Protect ${item.site.name} (${item.site.kind.replaceAll("_", " ")}), ${Math.round(item.distanceM)} m from the march. Keep protest foot traffic on the route and clear of the site. ${formatCoord(onRoute)}.`,
    });
    if (protectIndex >= 12) break;
  }

  // Clash buffer if an opposing assembly is known
  if (input.opposingAssembly) {
    const meet = nearestOnPolyline(input.opposingAssembly, route);
    const gap = haversineM(meet, input.opposingAssembly);
    if (gap < 800) {
      pushPost(posts, left, {
        id: "CL-1",
        kind: "clash_buffer",
        position: meet,
        label: "CL-1",
        resource: left.mobile > 0 ? "mobile" : "serial",
        rationale: `Clash buffer where the route comes within ${Math.round(gap)} m of a reported opposing assembly. Keep groups apart and hold the route line. ${formatCoord(meet)}.`,
      });
      const offset = destination(meet, bearingDeg(meet, input.opposingAssembly), Math.min(80, gap / 2));
      pushPost(posts, left, {
        id: "CL-2",
        kind: "clash_buffer",
        position: offset,
        label: "CL-2",
        resource: left.serials > 0 ? "serial" : "mobile",
        rationale: `Second clash buffer toward the opposing assembly. Do not treat this as permission to advance on another group. ${formatCoord(offset)}.`,
      });
    }
  }

  // Route holds along long stretches if resources remain
  const holdSpacing = 220;
  let holdIndex = 0;
  for (let distance = holdSpacing; distance < routeLengthM - holdSpacing / 2; distance += holdSpacing) {
    if (left.serials <= 0 && left.mobile <= 0) break;
    const point = pointAlong(route, distance);
    if (posts.some((post) => haversineM(post.position, point) < 70)) continue;
    holdIndex += 1;
    pushPost(posts, left, {
      id: `RH-${holdIndex}`,
      kind: "route_hold",
      position: point,
      label: `RH-${holdIndex}`,
      resource: left.serials > 0 ? "serial" : "mobile",
      rationale: `Route hold along the line of march. Keeps pace and stops unplanned turns off the route. ${formatCoord(point)}.`,
    });
    if (holdIndex >= 10) break;
  }

  // Reserve at a road-accessible point near mid-route
  if (left.mobile > 0) {
    const mid = pointAlong(route, routeLengthM / 2);
    const reserve = nearestRoadSample(mid, ways) ?? destination(mid, 90, 60);
    pushPost(posts, left, {
      id: "RV-1",
      kind: "reserve",
      position: reserve,
      label: "RV-1",
      resource: "mobile",
      rationale: `Mobile reserve near the mid-point of the route, kept off the march itself. ${formatCoord(reserve)}.`,
    });
  }

  const used: PublicOrderResources = {
    serials: resources.serials - left.serials,
    traffic: resources.traffic - left.traffic,
    protection: resources.protection - left.protection,
    mobile: resources.mobile - left.mobile,
  };

  return {
    model: "preserve-public-order-v1",
    mode,
    route,
    routeLengthM: Math.round(routeLengthM),
    snapped,
    corridorM,
    posts,
    protectedNearRoute,
    offRouteExits,
    resourcesUsed: used,
    resourcesLeft: left,
    narrative: [
      mode === "drawn"
        ? `Drawn protest route snapped onto footable streets, malls, alleys, and paths where the network allows (${Math.round(routeLengthM)} m).`
        : `Protest route from start to finish on the foot network (${Math.round(routeLengthM)} m). Roads are treated as walkable edges; paths, pedestrian streets, steps, and alleys are included.`,
      `${posts.filter((post) => post.kind === "side_block").length} side block${posts.filter((post) => post.kind === "side_block").length === 1 ? "" : "s"} to keep the march on the agreed route.`,
      protectedNearRoute.length
        ? `${protectedNearRoute.length} protected site${protectedNearRoute.length === 1 ? "" : "s"} within reach of the route (government, schools, police, stations, and similar).`
        : "No mapped protected sites were loaded near this route. Confirm schools, stations, and government buildings on the ground.",
      "Planning aid only. It positions available resources for containment of the march and protection of sites. It does not authorise use of force or an advance on another group.",
    ],
    actions: [
      "Walk the snapped route against the real malls, alleys, and cut-throughs before the event.",
      "Commit side blocks first where the crowd can leave the route, then site protection, then route holds.",
      "If a second group is reported, place clash buffers early and keep a clear separation.",
      "Rebuild if the route changes or more resources become available.",
    ],
  };
}

export function publicOrderCoverage(points: LatLng[], padM = 400): BBox {
  return expandBBox(bboxOf(points), padM);
}

function pushPost(
  posts: PublicOrderPost[],
  left: PublicOrderResources,
  post: PublicOrderPost,
) {
  const key =
    post.resource === "serial"
      ? "serials"
      : post.resource === "traffic"
        ? "traffic"
        : post.resource === "protection"
          ? "protection"
          : "mobile";
  if (left[key] <= 0) return;
  left[key] -= 1;
  posts.push(post);
}

function buildFootGraph(ways: RoadWay[], paths: PathWay[]): Graph {
  const nodes: LatLng[] = [];
  const index = new Map<string, number>();
  const edges: WalkEdge[] = [];

  function nodeId(point: LatLng): number {
    const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    const existing = index.get(key);
    if (existing != null) return existing;
    const id = nodes.length;
    nodes.push(point);
    index.set(key, id);
    return id;
  }

  function addPolyline(id: string, name: string, points: LatLng[]) {
    for (let i = 0; i < points.length - 1; i++) {
      const a = nodeId(points[i]);
      const b = nodeId(points[i + 1]);
      if (a === b) continue;
      const lengthM = haversineM(points[i], points[i + 1]);
      if (lengthM < 0.4) continue;
      edges.push({ id: `${id}:${i}`, name, a, b, lengthM });
    }
  }

  for (const way of ways) addPolyline(`r${way.id}`, way.name || "Street", way.points);
  for (const path of paths) addPolyline(`p${path.id}`, path.name || path.kind, path.points);

  const adj = new Map<number, { to: number; edge: number; lengthM: number }[]>();
  edges.forEach((edge, edgeIndex) => {
    if (!adj.has(edge.a)) adj.set(edge.a, []);
    if (!adj.has(edge.b)) adj.set(edge.b, []);
    adj.get(edge.a)!.push({ to: edge.b, edge: edgeIndex, lengthM: edge.lengthM });
    adj.get(edge.b)!.push({ to: edge.a, edge: edgeIndex, lengthM: edge.lengthM });
  });
  return { nodes, edges, adj };
}

function nearestNode(point: LatLng, graph: Graph, maxM = SNAP_M * 2): number | null {
  let best = -1;
  let bestD = maxM;
  for (let i = 0; i < graph.nodes.length; i++) {
    const distance = haversineM(point, graph.nodes[i]);
    if (distance < bestD) {
      bestD = distance;
      best = i;
    }
  }
  return best >= 0 ? best : null;
}

function routeEndpoints(start: LatLng, end: LatLng, graph: Graph): { route: LatLng[]; snapped: boolean } {
  const a = nearestNode(start, graph, 120);
  const b = nearestNode(end, graph, 120);
  if (a == null || b == null) {
    return { route: [start, end], snapped: false };
  }
  const path = dijkstra(graph, a, b);
  if (!path) return { route: [start, graph.nodes[a], graph.nodes[b], end], snapped: true };
  return { route: [start, ...path.map((id) => graph.nodes[id]), end], snapped: true };
}

function snapDrawnRoute(drawn: LatLng[], graph: Graph): { route: LatLng[]; snapped: boolean } {
  if (!graph.nodes.length) return { route: drawn, snapped: false };
  const snappedNodes: number[] = [];
  for (const point of drawn) {
    const node = nearestNode(point, graph, 90);
    if (node == null) continue;
    if (!snappedNodes.length || snappedNodes[snappedNodes.length - 1] !== node) snappedNodes.push(node);
  }
  if (snappedNodes.length < 2) return { route: drawn, snapped: false };

  const route: LatLng[] = [drawn[0]];
  for (let i = 0; i < snappedNodes.length - 1; i++) {
    const segment = dijkstra(graph, snappedNodes[i], snappedNodes[i + 1]);
    if (segment) {
      for (const id of segment) route.push(graph.nodes[id]);
    } else {
      route.push(graph.nodes[snappedNodes[i]], graph.nodes[snappedNodes[i + 1]]);
    }
  }
  route.push(drawn[drawn.length - 1]);
  return { route: dedupeRoute(route), snapped: true };
}

function dijkstra(graph: Graph, start: number, goal: number): number[] | null {
  const dist = new Map<number, number>([[start, 0]]);
  const prev = new Map<number, number>();
  const open = new Set<number>([start]);
  while (open.size) {
    let current = -1;
    let best = Infinity;
    for (const node of open) {
      const score = dist.get(node) ?? Infinity;
      if (score < best) {
        best = score;
        current = node;
      }
    }
    if (current < 0) break;
    if (current === goal) break;
    open.delete(current);
    for (const link of graph.adj.get(current) ?? []) {
      const next = best + link.lengthM;
      if (next < (dist.get(link.to) ?? Infinity)) {
        dist.set(link.to, next);
        prev.set(link.to, current);
        open.add(link.to);
      }
    }
  }
  if (!prev.has(goal) && start !== goal) return start === goal ? [start] : null;
  const path = [goal];
  let cursor = goal;
  while (cursor !== start) {
    const parent = prev.get(cursor);
    if (parent == null) return null;
    path.push(parent);
    cursor = parent;
  }
  path.reverse();
  return path;
}

function findOffRouteExits(route: LatLng[], graph: Graph, corridorM: number) {
  const exits: { position: LatLng; name: string }[] = [];
  const routeNodeIds = new Set<number>();
  for (const point of route) {
    const node = nearestNode(point, graph, corridorM);
    if (node != null) routeNodeIds.add(node);
  }
  for (const edge of graph.edges) {
    const aOn = [...routeNodeIds].some((id) => haversineM(graph.nodes[id], graph.nodes[edge.a]) < corridorM);
    const bOn = [...routeNodeIds].some((id) => haversineM(graph.nodes[id], graph.nodes[edge.b]) < corridorM);
    if (aOn === bOn) continue;
    const off = aOn ? edge.b : edge.a;
    const on = aOn ? edge.a : edge.b;
    // Exit leaves the corridor
    if (distanceToPolylineM(graph.nodes[off], route) < corridorM) continue;
    if (distanceToPolylineM(graph.nodes[on], route) > corridorM) continue;
    const position = graph.nodes[on];
    if (exits.some((item) => haversineM(item.position, position) < 40)) continue;
    exits.push({ position, name: edge.name });
  }
  return exits;
}

function pathLength(points: LatLng[]) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += haversineM(points[i], points[i + 1]);
  return total;
}

function pointAlong(points: LatLng[], distanceM: number): LatLng {
  let left = distanceM;
  for (let i = 0; i < points.length - 1; i++) {
    const span = haversineM(points[i], points[i + 1]);
    if (left <= span) {
      const t = span === 0 ? 0 : left / span;
      return {
        lat: points[i].lat + (points[i + 1].lat - points[i].lat) * t,
        lng: points[i].lng + (points[i + 1].lng - points[i].lng) * t,
      };
    }
    left -= span;
  }
  return points[points.length - 1];
}

function distanceAlongRoute(route: LatLng[], point: LatLng) {
  let best = 0;
  let bestD = Infinity;
  let walked = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const span = haversineM(a, b) || 1;
    const t = Math.max(0, Math.min(1, ((point.lat - a.lat) * (b.lat - a.lat) + (point.lng - a.lng) * (b.lng - a.lng)) / ((b.lat - a.lat) ** 2 + (b.lng - a.lng) ** 2 || 1)));
    const proj = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const distance = haversineM(point, proj);
    if (distance < bestD) {
      bestD = distance;
      best = walked + span * t;
    }
    walked += span;
  }
  return best;
}

function distanceToPolylineM(point: LatLng, line: LatLng[]) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const ab2 = (b.lat - a.lat) ** 2 + (b.lng - a.lng) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((point.lat - a.lat) * (b.lat - a.lat) + (point.lng - a.lng) * (b.lng - a.lng)) / ab2));
    const proj = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    best = Math.min(best, haversineM(point, proj));
  }
  return best;
}

function nearestOnPolyline(point: LatLng, line: LatLng[]) {
  let best = line[0];
  let bestD = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const ab2 = (b.lat - a.lat) ** 2 + (b.lng - a.lng) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((point.lat - a.lat) * (b.lat - a.lat) + (point.lng - a.lng) * (b.lng - a.lng)) / ab2));
    const proj = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const distance = haversineM(point, proj);
    if (distance < bestD) {
      bestD = distance;
      best = proj;
    }
  }
  return best;
}

function nearestRoadSample(point: LatLng, ways: RoadWay[]) {
  let best: LatLng | null = null;
  let bestD = 180;
  for (const way of ways) {
    for (const sample of way.points) {
      const distance = haversineM(point, sample);
      if (distance < bestD) {
        bestD = distance;
        best = sample;
      }
    }
  }
  return best;
}

function dedupeRoute(points: LatLng[]) {
  const out: LatLng[] = [];
  for (const point of points) {
    if (!out.length || haversineM(out[out.length - 1], point) > 1.5) out.push(point);
  }
  return out;
}
