import type { LatLng } from '../domain/types';

/** Approximate QLD demo geography (Brisbane CBD / river / Moreton Bay). */
export const QLD = {
  brisbaneCbd: { lat: -27.4698, lng: 153.0251 } satisfies LatLng,
  southBank: { lat: -27.478, lng: 153.021 } satisfies LatLng,
  fortitudeValley: { lat: -27.457, lng: 153.035 } satisfies LatLng,
  moretonBay: { lat: -27.25, lng: 153.25 } satisfies LatLng,
  westEnd: { lat: -27.481, lng: 153.01 } satisfies LatLng,
  kangarooPoint: { lat: -27.476, lng: 153.035 } satisfies LatLng,
  parliamentHouse: { lat: -27.4753, lng: 153.027 } satisfies LatLng,
  rbwh: { lat: -27.447, lng: 153.027 } satisfies LatLng,
  romaStreetStation: { lat: -27.465, lng: 153.019 } satisfies LatLng,
  cityHall: { lat: -27.4688, lng: 153.0235 } satisfies LatLng,
};

/** Simple Brisbane River corridor polygon (demo clip for SAR). */
export const BRISBANE_RIVER_WATER: LatLng[] = [
  { lat: -27.44, lng: 153.01 },
  { lat: -27.45, lng: 153.04 },
  { lat: -27.48, lng: 153.05 },
  { lat: -27.49, lng: 153.03 },
  { lat: -27.475, lng: 153.0 },
  { lat: -27.45, lng: 152.995 },
];

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function destinationPoint(from: LatLng, bearingDeg: number, distanceM: number): LatLng {
  const R = 6371000;
  const δ = distanceM / R;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (from.lat * Math.PI) / 180;
  const λ1 = (from.lng * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );
  return { lat: (φ2 * 180) / Math.PI, lng: (λ2 * 180) / Math.PI };
}

export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function circlePolygon(centre: LatLng, radiusM: number, steps = 48): LatLng[] {
  const pts: LatLng[] = [];
  for (let i = 0; i < steps; i++) {
    pts.push(destinationPoint(centre, (360 * i) / steps, radiusM));
  }
  return pts;
}

/** Clip a circle into a polygon that excludes water polygons. */
export function clipCircleExcludingWater(
  centre: LatLng,
  radiusM: number,
  water: LatLng[],
  steps = 48,
): { polygon: LatLng[]; clippedByWater: boolean } {
  let clippedByWater = false;
  const polygon: LatLng[] = [];
  for (let i = 0; i < steps; i++) {
    const bearing = (360 * i) / steps;
    let dist = radiusM;
    let pt = destinationPoint(centre, bearing, dist);
    if (pointInPolygon(pt, water)) {
      clippedByWater = true;
      // binary search landward edge
      let lo = 0;
      let hi = radiusM;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        const candidate = destinationPoint(centre, bearing, mid);
        if (pointInPolygon(candidate, water)) hi = mid;
        else lo = mid;
      }
      dist = Math.max(0, lo - 5);
      pt = destinationPoint(centre, bearing, dist);
    }
    polygon.push(pt);
  }
  return { polygon, clippedByWater };
}

export function bearingBetween(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
