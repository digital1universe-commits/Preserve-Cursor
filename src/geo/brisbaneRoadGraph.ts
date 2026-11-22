import type { LatLng } from '../domain/types';
import { haversineM } from './qld';

/**
 * Offline-friendly Brisbane CBD / South Bank / Valley road graph.
 * Routes must cross the river only via bridge edges — never water shortcuts.
 */
export type RoadNodeId =
  | 'west_end'
  | 'grey_st'
  | 'melbourne_st_sb'
  | 'south_bank'
  | 'victoria_br_s'
  | 'victoria_br_n'
  | 'queens_wharf'
  | 'george_st_south'
  | 'parliament'
  | 'city_hall'
  | 'queen_st_mall'
  | 'adelaide_st'
  | 'roma_st'
  | 'ann_st_west'
  | 'ann_st_valley'
  | 'fortitude_valley'
  | 'wickham_st'
  | 'kangaroo_point'
  | 'story_br_s'
  | 'story_br_n'
  | 'eagle_st'
  | 'creek_st'
  | 'edward_st'
  | 'alice_st'
  | 'goodwill_br_s'
  | 'goodwill_br_n'
  | 'elizabeth_st'
  | 'charlotte_st'
  | 'mary_st'
  | 'turbot_st'
  | 'brunswick_st'
  | 'james_st'
  | 'wickham_tce'
  | 'cordelia_st'
  | 'merivale_st'
  | 'vulture_st'
  | 'boundary_st'
  | 'hope_st'
  | 'albert_st'
  | 'edward_st_north'
  | 'ann_st_mid'
  | 'creek_st_north'
  | 'wharf_st'
  | 'makerston_st'
  | 'countess_st'
  | 'upper_roma';

export interface RoadNode {
  id: RoadNodeId;
  name: string;
  position: LatLng;
  kind?: 'bridge' | 'street' | 'landmark';
}

/** Undirected edge; cost is metres. */
export interface RoadEdge {
  a: RoadNodeId;
  b: RoadNodeId;
  name: string;
  bridge?: boolean;
}

export const ROAD_NODES: Record<RoadNodeId, RoadNode> = {
  west_end: { id: 'west_end', name: 'West End', position: { lat: -27.481, lng: 153.01 } },
  grey_st: { id: 'grey_st', name: 'Grey Street', position: { lat: -27.4792, lng: 153.0165 } },
  melbourne_st_sb: {
    id: 'melbourne_st_sb',
    name: 'Melbourne St (South Bank)',
    position: { lat: -27.4775, lng: 153.0188 },
  },
  south_bank: { id: 'south_bank', name: 'South Bank Parklands', position: { lat: -27.478, lng: 153.021 } },
  victoria_br_s: {
    id: 'victoria_br_s',
    name: 'Victoria Bridge (south)',
    position: { lat: -27.4738, lng: 153.0202 },
    kind: 'bridge',
  },
  victoria_br_n: {
    id: 'victoria_br_n',
    name: 'Victoria Bridge (north)',
    position: { lat: -27.4716, lng: 153.0215 },
    kind: 'bridge',
  },
  queens_wharf: { id: 'queens_wharf', name: 'Queens Wharf', position: { lat: -27.471, lng: 153.0232 } },
  george_st_south: {
    id: 'george_st_south',
    name: 'George Street south',
    position: { lat: -27.4742, lng: 153.0255 },
  },
  parliament: { id: 'parliament', name: 'Parliament House', position: { lat: -27.4753, lng: 153.027 } },
  city_hall: { id: 'city_hall', name: 'City Hall', position: { lat: -27.4688, lng: 153.0235 } },
  queen_st_mall: { id: 'queen_st_mall', name: 'Queen Street Mall', position: { lat: -27.4698, lng: 153.0251 } },
  adelaide_st: { id: 'adelaide_st', name: 'Adelaide Street', position: { lat: -27.4675, lng: 153.0268 } },
  roma_st: { id: 'roma_st', name: 'Roma Street', position: { lat: -27.465, lng: 153.019 } },
  ann_st_west: { id: 'ann_st_west', name: 'Ann Street west', position: { lat: -27.4625, lng: 153.0275 } },
  ann_st_valley: { id: 'ann_st_valley', name: 'Ann Street (Valley)', position: { lat: -27.4585, lng: 153.0335 } },
  fortitude_valley: {
    id: 'fortitude_valley',
    name: 'Fortitude Valley',
    position: { lat: -27.457, lng: 153.035 },
  },
  wickham_st: { id: 'wickham_st', name: 'Wickham Street', position: { lat: -27.4558, lng: 153.0368 } },
  kangaroo_point: { id: 'kangaroo_point', name: 'Kangaroo Point', position: { lat: -27.476, lng: 153.035 } },
  story_br_s: {
    id: 'story_br_s',
    name: 'Story Bridge (south)',
    position: { lat: -27.4688, lng: 153.0358 },
    kind: 'bridge',
  },
  story_br_n: {
    id: 'story_br_n',
    name: 'Story Bridge (north)',
    position: { lat: -27.4635, lng: 153.0365 },
    kind: 'bridge',
  },
  eagle_st: { id: 'eagle_st', name: 'Eagle Street', position: { lat: -27.4682, lng: 153.0305 } },
  creek_st: { id: 'creek_st', name: 'Creek Street', position: { lat: -27.4668, lng: 153.0288 } },
  edward_st: { id: 'edward_st', name: 'Edward Street', position: { lat: -27.4678, lng: 153.0272 } },
  alice_st: { id: 'alice_st', name: 'Alice Street', position: { lat: -27.4748, lng: 153.0295 } },
  goodwill_br_s: {
    id: 'goodwill_br_s',
    name: 'Goodwill Bridge (south)',
    position: { lat: -27.4805, lng: 153.0255 },
    kind: 'bridge',
  },
  goodwill_br_n: {
    id: 'goodwill_br_n',
    name: 'Goodwill Bridge (north)',
    position: { lat: -27.4778, lng: 153.0278 },
    kind: 'bridge',
  },
  elizabeth_st: { id: 'elizabeth_st', name: 'Elizabeth Street', position: { lat: -27.4708, lng: 153.0262 } },
  charlotte_st: { id: 'charlotte_st', name: 'Charlotte Street', position: { lat: -27.4718, lng: 153.0272 } },
  mary_st: { id: 'mary_st', name: 'Mary Street', position: { lat: -27.4728, lng: 153.028 } },
  turbot_st: { id: 'turbot_st', name: 'Turbot Street', position: { lat: -27.4662, lng: 153.0228 } },
  brunswick_st: { id: 'brunswick_st', name: 'Brunswick Street', position: { lat: -27.4562, lng: 153.0342 } },
  james_st: { id: 'james_st', name: 'James Street', position: { lat: -27.4548, lng: 153.0375 } },
  wickham_tce: { id: 'wickham_tce', name: 'Wickham Terrace', position: { lat: -27.4642, lng: 153.0245 } },
  cordelia_st: { id: 'cordelia_st', name: 'Cordelia Street', position: { lat: -27.4788, lng: 153.0145 } },
  merivale_st: { id: 'merivale_st', name: 'Merivale Street', position: { lat: -27.4768, lng: 153.0158 } },
  vulture_st: { id: 'vulture_st', name: 'Vulture Street', position: { lat: -27.4825, lng: 153.0185 } },
  boundary_st: { id: 'boundary_st', name: 'Boundary Street', position: { lat: -27.4795, lng: 153.0085 } },
  hope_st: { id: 'hope_st', name: 'Hope Street', position: { lat: -27.4772, lng: 153.0122 } },
  albert_st: { id: 'albert_st', name: 'Albert Street', position: { lat: -27.4688, lng: 153.0258 } },
  edward_st_north: { id: 'edward_st_north', name: 'Edward Street north', position: { lat: -27.4655, lng: 153.0278 } },
  ann_st_mid: { id: 'ann_st_mid', name: 'Ann Street mid', position: { lat: -27.4605, lng: 153.0305 } },
  creek_st_north: { id: 'creek_st_north', name: 'Creek Street north', position: { lat: -27.4648, lng: 153.0295 } },
  wharf_st: { id: 'wharf_st', name: 'Wharf Street', position: { lat: -27.4665, lng: 153.0312 } },
  makerston_st: { id: 'makerston_st', name: 'Makerston Street', position: { lat: -27.4648, lng: 153.0168 } },
  countess_st: { id: 'countess_st', name: 'Countess Street', position: { lat: -27.4635, lng: 153.0152 } },
  upper_roma: { id: 'upper_roma', name: 'Upper Roma Street', position: { lat: -27.4668, lng: 153.0145 } },
};

export const ROAD_EDGES: RoadEdge[] = [
  { a: 'west_end', b: 'grey_st', name: 'Montague Rd / Grey St' },
  { a: 'grey_st', b: 'melbourne_st_sb', name: 'Grey St' },
  { a: 'melbourne_st_sb', b: 'south_bank', name: 'Melbourne St' },
  { a: 'south_bank', b: 'victoria_br_s', name: 'South Bank boardwalk' },
  { a: 'victoria_br_s', b: 'victoria_br_n', name: 'Victoria Bridge', bridge: true },
  { a: 'victoria_br_n', b: 'queens_wharf', name: 'North Quay' },
  { a: 'victoria_br_n', b: 'queen_st_mall', name: 'Queen St approach' },
  { a: 'queens_wharf', b: 'city_hall', name: 'William / Adelaide' },
  { a: 'queen_st_mall', b: 'city_hall', name: 'Queen / Adelaide' },
  { a: 'queen_st_mall', b: 'edward_st', name: 'Queen Street' },
  { a: 'edward_st', b: 'adelaide_st', name: 'Edward / Adelaide' },
  { a: 'adelaide_st', b: 'creek_st', name: 'Adelaide Street' },
  { a: 'creek_st', b: 'eagle_st', name: 'Creek / Eagle' },
  { a: 'eagle_st', b: 'story_br_n', name: 'Eagle St Pier' },
  { a: 'city_hall', b: 'roma_st', name: 'Roma Street' },
  { a: 'city_hall', b: 'ann_st_west', name: 'Ann Street westbound' },
  { a: 'ann_st_west', b: 'ann_st_valley', name: 'Ann Street' },
  { a: 'ann_st_valley', b: 'fortitude_valley', name: 'Ann / Brunswick' },
  { a: 'fortitude_valley', b: 'wickham_st', name: 'Brunswick / Wickham' },
  { a: 'adelaide_st', b: 'ann_st_west', name: 'Creek connector' },
  { a: 'george_st_south', b: 'parliament', name: 'George Street' },
  { a: 'parliament', b: 'alice_st', name: 'Alice / George' },
  { a: 'alice_st', b: 'goodwill_br_n', name: 'Alice Street east' },
  { a: 'queen_st_mall', b: 'george_st_south', name: 'George Street' },
  { a: 'george_st_south', b: 'victoria_br_n', name: 'George / North Quay' },
  { a: 'south_bank', b: 'goodwill_br_s', name: 'South Bank east' },
  { a: 'goodwill_br_s', b: 'goodwill_br_n', name: 'Goodwill Bridge', bridge: true },
  { a: 'goodwill_br_n', b: 'parliament', name: 'Gardens Point' },
  { a: 'kangaroo_point', b: 'story_br_s', name: 'Main Street KP' },
  { a: 'story_br_s', b: 'story_br_n', name: 'Story Bridge', bridge: true },
  { a: 'story_br_n', b: 'fortitude_valley', name: 'Wickham Tce approach' },
  { a: 'story_br_n', b: 'ann_st_valley', name: 'Bowen Tce' },
  { a: 'roma_st', b: 'ann_st_west', name: 'Roma / Ann' },
  // CBD inland grid
  { a: 'queen_st_mall', b: 'elizabeth_st', name: 'Elizabeth / Queen' },
  { a: 'elizabeth_st', b: 'charlotte_st', name: 'Charlotte Street' },
  { a: 'charlotte_st', b: 'mary_st', name: 'Mary Street' },
  { a: 'mary_st', b: 'alice_st', name: 'Alice / Mary' },
  { a: 'elizabeth_st', b: 'edward_st', name: 'Elizabeth / Edward' },
  { a: 'charlotte_st', b: 'albert_st', name: 'Charlotte / Albert' },
  { a: 'albert_st', b: 'city_hall', name: 'Albert Street' },
  { a: 'albert_st', b: 'adelaide_st', name: 'Albert / Adelaide' },
  { a: 'city_hall', b: 'turbot_st', name: 'Turbot approach' },
  { a: 'turbot_st', b: 'wickham_tce', name: 'Turbot / Wickham Tce' },
  { a: 'wickham_tce', b: 'ann_st_west', name: 'Wickham Tce east' },
  { a: 'roma_st', b: 'turbot_st', name: 'Roma / Turbot' },
  { a: 'roma_st', b: 'makerston_st', name: 'Makerston' },
  { a: 'makerston_st', b: 'countess_st', name: 'Countess St' },
  { a: 'countess_st', b: 'upper_roma', name: 'Upper Roma' },
  { a: 'upper_roma', b: 'roma_st', name: 'Roma loop' },
  // Valley inland
  { a: 'ann_st_west', b: 'ann_st_mid', name: 'Ann Street mid' },
  { a: 'ann_st_mid', b: 'ann_st_valley', name: 'Ann Street east' },
  { a: 'ann_st_mid', b: 'brunswick_st', name: 'Brunswick connector' },
  { a: 'brunswick_st', b: 'fortitude_valley', name: 'Brunswick Street' },
  { a: 'fortitude_valley', b: 'james_st', name: 'James Street' },
  { a: 'james_st', b: 'wickham_st', name: 'James / Wickham' },
  { a: 'creek_st', b: 'creek_st_north', name: 'Creek Street north' },
  { a: 'creek_st_north', b: 'edward_st_north', name: 'Creek / Edward north' },
  { a: 'edward_st_north', b: 'ann_st_west', name: 'Edward / Ann' },
  { a: 'creek_st_north', b: 'wharf_st', name: 'Wharf Street' },
  { a: 'wharf_st', b: 'eagle_st', name: 'Wharf / Eagle' },
  // South Brisbane inland (not water)
  { a: 'west_end', b: 'boundary_st', name: 'Boundary Street' },
  { a: 'boundary_st', b: 'hope_st', name: 'Hope Street' },
  { a: 'hope_st', b: 'cordelia_st', name: 'Cordelia west' },
  { a: 'cordelia_st', b: 'grey_st', name: 'Cordelia / Grey' },
  { a: 'cordelia_st', b: 'merivale_st', name: 'Merivale' },
  { a: 'merivale_st', b: 'melbourne_st_sb', name: 'Merivale / Melbourne' },
  { a: 'vulture_st', b: 'south_bank', name: 'Vulture / South Bank' },
  { a: 'vulture_st', b: 'grey_st', name: 'Vulture / Grey' },
  { a: 'vulture_st', b: 'hope_st', name: 'Vulture / Hope' },
];

function edgeLength(e: RoadEdge): number {
  return haversineM(ROAD_NODES[e.a].position, ROAD_NODES[e.b].position);
}

function neighbours(id: RoadNodeId): Array<{ to: RoadNodeId; edge: RoadEdge; cost: number }> {
  const out: Array<{ to: RoadNodeId; edge: RoadEdge; cost: number }> = [];
  for (const e of ROAD_EDGES) {
    if (e.a === id) out.push({ to: e.b, edge: e, cost: edgeLength(e) });
    if (e.b === id) out.push({ to: e.a, edge: e, cost: edgeLength(e) });
  }
  return out;
}

export function nearestNode(point: LatLng): RoadNodeId {
  let best: RoadNodeId = 'queen_st_mall';
  let bestD = Infinity;
  for (const node of Object.values(ROAD_NODES)) {
    const d = haversineM(point, node.position);
    if (d < bestD) {
      bestD = d;
      best = node.id;
    }
  }
  return best;
}

/** Dijkstra shortest path between two graph nodes. */
export function shortestPath(from: RoadNodeId, to: RoadNodeId): { nodes: RoadNodeId[]; edges: RoadEdge[]; metres: number } {
  if (from === to) return { nodes: [from], edges: [], metres: 0 };

  const dist = new Map<RoadNodeId, number>();
  const prev = new Map<RoadNodeId, { node: RoadNodeId; edge: RoadEdge }>();
  const open = new Set<RoadNodeId>(Object.keys(ROAD_NODES) as RoadNodeId[]);
  for (const id of open) dist.set(id, Infinity);
  dist.set(from, 0);

  while (open.size) {
    let u: RoadNodeId | null = null;
    let best = Infinity;
    for (const id of open) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        u = id;
      }
    }
    if (u === null || best === Infinity) break;
    open.delete(u);
    if (u === to) break;
    for (const n of neighbours(u)) {
      if (!open.has(n.to)) continue;
      const alt = best + n.cost;
      if (alt < (dist.get(n.to) ?? Infinity)) {
        dist.set(n.to, alt);
        prev.set(n.to, { node: u, edge: n.edge });
      }
    }
  }

  if (!prev.has(to) && from !== to) {
    // Unreachable in graph — return endpoints only (caller should not water-shortcut)
    return {
      nodes: [from, to],
      edges: [],
      metres: haversineM(ROAD_NODES[from].position, ROAD_NODES[to].position),
    };
  }

  const nodes: RoadNodeId[] = [to];
  const edges: RoadEdge[] = [];
  let cur: RoadNodeId = to;
  while (cur !== from) {
    const p = prev.get(cur);
    if (!p) break;
    edges.unshift(p.edge);
    nodes.unshift(p.node);
    cur = p.node;
  }
  return { nodes, edges, metres: dist.get(to) ?? 0 };
}

/** Interpolate points along consecutive node positions for a smoother map line. */
function densify(points: LatLng[], stepM = 40): LatLng[] {
  if (points.length < 2) return points;
  const out: LatLng[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = haversineM(a, b);
    const steps = Math.max(1, Math.ceil(d / stepM));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      });
    }
  }
  return out;
}

/**
 * Snap an ordered list of waypoints onto the road graph and route between them.
 * Crosses water only via bridge edges.
 */
export function routeAlongRoads(waypoints: LatLng[]): {
  route: LatLng[];
  snappedFeatures: string[];
  usedBridges: string[];
  nodeIds: RoadNodeId[];
} {
  if (waypoints.length === 0) {
    return { route: [], snappedFeatures: [], usedBridges: [], nodeIds: [] };
  }

  const nodeIds = waypoints.map(nearestNode);
  // Collapse consecutive duplicates
  const uniqueSequential: RoadNodeId[] = [];
  for (const id of nodeIds) {
    if (uniqueSequential.length === 0 || uniqueSequential[uniqueSequential.length - 1] !== id) {
      uniqueSequential.push(id);
    }
  }

  const pathNodes: RoadNodeId[] = [];
  const snappedFeatures: string[] = [];
  const usedBridges: string[] = [];

  for (let i = 0; i < uniqueSequential.length; i++) {
    if (i === 0) {
      pathNodes.push(uniqueSequential[i]);
      snappedFeatures.push(ROAD_NODES[uniqueSequential[i]].name);
      continue;
    }
    const seg = shortestPath(uniqueSequential[i - 1], uniqueSequential[i]);
    for (const e of seg.edges) {
      if (e.bridge && !usedBridges.includes(e.name)) usedBridges.push(e.name);
      if (!snappedFeatures.includes(e.name)) snappedFeatures.push(e.name);
    }
    for (const n of seg.nodes.slice(1)) {
      pathNodes.push(n);
      const name = ROAD_NODES[n].name;
      if (!snappedFeatures.includes(name)) snappedFeatures.push(name);
    }
  }

  const corners = pathNodes.map((id) => ROAD_NODES[id].position);
  return {
    route: densify(corners),
    snappedFeatures,
    usedBridges,
    nodeIds: pathNodes,
  };
}

/** Assert a route never takes a straight chord across the river polygon mid-span. */
export function routeUsesOnlyBridgesForRiverCrossing(route: LatLng[]): boolean {
  // Heuristic: any segment longer than 350 m that midpoints in the river corridor is bad
  const riverBox = { minLat: -27.48, maxLat: -27.468, minLng: 153.018, maxLng: 153.032 };
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const d = haversineM(a, b);
    if (d < 120) continue;
    const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
    const inRiver =
      mid.lat >= riverBox.minLat &&
      mid.lat <= riverBox.maxLat &&
      mid.lng >= riverBox.minLng &&
      mid.lng <= riverBox.maxLng;
    if (inRiver && d > 350) {
      // Allowed only if endpoints are near known bridge nodes
      const nearBridge = (p: LatLng) =>
        [ROAD_NODES.victoria_br_s, ROAD_NODES.victoria_br_n, ROAD_NODES.story_br_s, ROAD_NODES.story_br_n, ROAD_NODES.goodwill_br_s, ROAD_NODES.goodwill_br_n].some(
          (n) => haversineM(p, n.position) < 120,
        );
      if (!(nearBridge(a) && nearBridge(b))) return false;
    }
  }
  return true;
}
