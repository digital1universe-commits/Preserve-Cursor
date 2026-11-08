export type LatLng = { lat: number; lng: number };

export type BBox = { south: number; west: number; north: number; east: number };

const EARTH_M = 6_371_000;

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeBearing(bearing: number): number {
  return ((bearing % 360) + 360) % 360;
}

export function angleDiff(a: number, b: number): number {
  const d = Math.abs(normalizeBearing(a) - normalizeBearing(b)) % 360;
  return d > 180 ? 360 - d : d;
}

export function metersPerDegLat(): number {
  return 111_320;
}

export function metersPerDegLng(lat: number): number {
  return 111_320 * Math.cos(toRad(lat));
}

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function destination(origin: LatLng, bearingDeg: number, distanceM: number): LatLng {
  let bearing = bearingDeg;
  let distance = distanceM;
  if (distance < 0) {
    bearing += 180;
    distance = -distance;
  }
  const δ = distance / EARTH_M;
  const θ = toRad(bearing);
  const φ1 = toRad(origin.lat);
  const λ1 = toRad(origin.lng);
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * sinδ * cosφ1,
      cosδ - sinφ1 * Math.sin(φ2),
    );
  return {
    lat: toDeg(φ2),
    lng: ((toDeg(λ2) + 540) % 360) - 180,
  };
}

export function bearingDeg(from: LatLng, to: LatLng): number {
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeBearing(toDeg(Math.atan2(y, x)));
}

export function midpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat;
    const xi = polygon[i].lng;
    const yj = polygon[j].lat;
    const xj = polygon[j].lng;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi || 1e-15) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Intersection of segments AB and CD in lat/lng, valid at suburb scale. */
export function segmentIntersection(a: LatLng, b: LatLng, c: LatLng, d: LatLng): LatLng | null {
  const rpx = b.lng - a.lng;
  const rpy = b.lat - a.lat;
  const spx = d.lng - c.lng;
  const spy = d.lat - c.lat;
  const den = rpx * spy - rpy * spx;
  if (Math.abs(den) < 1e-15) return null;
  const qpx = c.lng - a.lng;
  const qpy = c.lat - a.lat;
  const t = (qpx * spy - qpy * spx) / den;
  const u = (qpx * rpy - qpy * rpx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { lat: a.lat + t * rpy, lng: a.lng + t * rpx };
}

export function distancePointToSegmentM(point: LatLng, a: LatLng, b: LatLng): number {
  const mLng = metersPerDegLng(a.lat);
  const mLat = metersPerDegLat();
  const bx = (b.lng - a.lng) * mLng;
  const by = (b.lat - a.lat) * mLat;
  const px = (point.lng - a.lng) * mLng;
  const py = (point.lat - a.lat) * mLat;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : clamp((px * bx + py * by) / len2, 0, 1);
  return Math.hypot(px - t * bx, py - t * by);
}

export function distanceToBoundaryM(point: LatLng, polygon: LatLng[]): number {
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    best = Math.min(best, distancePointToSegmentM(point, a, b));
  }
  return best;
}

export function bboxOf(points: LatLng[], padM = 0): BBox {
  let south = 90;
  let north = -90;
  let west = 180;
  let east = -180;
  for (const point of points) {
    south = Math.min(south, point.lat);
    north = Math.max(north, point.lat);
    west = Math.min(west, point.lng);
    east = Math.max(east, point.lng);
  }
  if (!points.length) return { south: 0, west: 0, north: 0, east: 0 };
  if (padM > 0) {
    const midLat = (south + north) / 2;
    const dLat = padM / metersPerDegLat();
    const dLng = padM / metersPerDegLng(midLat);
    south -= dLat;
    north += dLat;
    west -= dLng;
    east += dLng;
  }
  return { south, west, north, east };
}

export function expandBBox(box: BBox, padM: number): BBox {
  const midLat = (box.south + box.north) / 2;
  const dLat = padM / metersPerDegLat();
  const dLng = padM / metersPerDegLng(midLat);
  return {
    south: box.south - dLat,
    north: box.north + dLat,
    west: box.west - dLng,
    east: box.east + dLng,
  };
}

export function pointInsideBBox(point: LatLng, box: BBox, insetM = 0): boolean {
  const midLat = (box.south + box.north) / 2;
  const dLat = insetM / metersPerDegLat();
  const dLng = insetM / metersPerDegLng(midLat);
  return (
    point.lat > box.south + dLat &&
    point.lat < box.north - dLat &&
    point.lng > box.west + dLng &&
    point.lng < box.east - dLng
  );
}

export function polygonAreaM2(polygon: LatLng[]): number {
  if (polygon.length < 3) return 0;
  const lat0 = polygon[0].lat;
  const mLng = metersPerDegLng(lat0);
  const mLat = metersPerDegLat();
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.lng * mLng * (b.lat * mLat) - b.lng * mLng * (a.lat * mLat);
  }
  return Math.abs(sum) / 2;
}

export function polygonIsSimple(polygon: LatLng[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = polygon[i];
    const a2 = polygon[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const adjacent =
        Math.abs(i - j) <= 1 ||
        (i === 0 && j === n - 1) ||
        (j + 1) % n === i ||
        (i + 1) % n === j;
      if (adjacent) continue;
      if (segmentIntersection(a1, a2, polygon[j], polygon[(j + 1) % n])) return false;
    }
  }
  return true;
}

export function circlePolygon(center: LatLng, radiusM: number, steps = 64): LatLng[] {
  const points: LatLng[] = [];
  for (let i = 0; i < steps; i++) {
    points.push(destination(center, (360 * i) / steps, radiusM));
  }
  return points;
}

export function ellipsePolygon(
  center: LatLng,
  alongM: number,
  crossM: number,
  bearing: number,
  steps = 48,
): LatLng[] {
  const points: LatLng[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const along = alongM * Math.cos(t);
    const cross = crossM * Math.sin(t);
    const shifted = destination(center, bearing, along);
    points.push(destination(shifted, bearing + 90, cross));
  }
  return points;
}

export function formatCoord(point: LatLng): string {
  const ns = point.lat >= 0 ? "N" : "S";
  const ew = point.lng >= 0 ? "E" : "W";
  return `${Math.abs(point.lat).toFixed(5)}° ${ns}, ${Math.abs(point.lng).toFixed(5)}° ${ew}`;
}

export function roundCoord(value: number, places = 5): number {
  const m = 10 ** places;
  return Math.round(value * m) / m;
}
