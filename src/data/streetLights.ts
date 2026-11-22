import type { StreetLight } from '../domain/types';
import { ROAD_EDGES, ROAD_NODES } from '../geo/brisbaneRoadGraph';
import { haversineM } from '../geo/qld';

/** Brisbane CBD + surrounds bounding box for city-scale lighting. */
const BOUNDS = {
  minLat: -27.492,
  maxLat: -27.448,
  minLng: 153.002,
  maxLng: 153.048,
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function alongSegment(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  spacingM: number,
): Array<{ lat: number; lng: number }> {
  const dist = haversineM(a, b);
  const steps = Math.max(1, Math.ceil(dist / spacingM));
  const out: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({ lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t) });
  }
  return out;
}

/**
 * City-scale street light grid: dense poles along the demo road network
 * plus a synthetic CBD street lattice so night ops cover surrounds, not a few streets.
 */
export function buildCityStreetLights(): StreetLight[] {
  const lights: StreetLight[] = [];
  let n = 0;
  const push = (lat: number, lng: number, high = false) => {
    if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) return;
    lights.push({
      id: `sl-${n++}`,
      position: { lat, lng },
      type: high ? 'high_mast' : 'standard',
    });
  };

  // 1) Along operational road / bridge graph (~35 m)
  for (const e of ROAD_EDGES) {
    const a = ROAD_NODES[e.a].position;
    const b = ROAD_NODES[e.b].position;
    const pts = alongSegment(a, b, 35);
    pts.forEach((p, i) => push(p.lat, p.lng, e.bridge || i % 6 === 0));
  }

  // 2) Synthetic E–W streets across CBD+surrounds (~120 m northing)
  const latStep = 0.0011; // ~120 m
  const lngStep = 0.00075; // ~75 m along street
  for (let lat = BOUNDS.minLat; lat <= BOUNDS.maxLat; lat += latStep) {
    for (let lng = BOUNDS.minLng; lng <= BOUNDS.maxLng; lng += lngStep) {
      const row = Math.round((lat - BOUNDS.minLat) / latStep);
      if (row % 2 === 0) push(lat, lng, row % 7 === 0);
      else push(lat, lng + lngStep * 0.5, false);
    }
  }

  // 3) Synthetic N–S cross streets (~140 m easting)
  const nsLngStep = 0.0014;
  const nsLatStep = 0.0007;
  for (let lng = BOUNDS.minLng; lng <= BOUNDS.maxLng; lng += nsLngStep) {
    for (let lat = BOUNDS.minLat; lat <= BOUNDS.maxLat; lat += nsLatStep) {
      push(lat, lng, false);
    }
  }

  // Deduplicate near-identical poles
  const seen = new Set<string>();
  const unique: StreetLight[] = [];
  for (const l of lights) {
    const key = `${l.position.lat.toFixed(4)},${l.position.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...l, id: `sl-${unique.length}` });
  }
  return unique;
}
