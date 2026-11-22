import type { LatLng, PublicOrderPlan } from '../domain/types';
import { assertLocalOnlyInference } from '../security/airGap';
import { QLD, haversineM } from '../geo/qld';

const CRITICAL = [
  { ...QLD.parliamentHouse, name: 'Parliament House', type: 'government' },
  { ...QLD.rbwh, name: 'RBWH', type: 'hospital' },
  { ...QLD.romaStreetStation, name: 'Roma Street Station', type: 'transport' },
  { ...QLD.cityHall, name: 'City Hall', type: 'government' },
];

const ROAD_FEATURES = [
  { name: 'Queen Street Mall', near: QLD.brisbaneCbd },
  { name: 'Ann Street', near: QLD.fortitudeValley },
  { name: 'George Street', near: QLD.parliamentHouse },
  { name: 'Roma Street', near: QLD.romaStreetStation },
  { name: 'South Bank Parklands', near: QLD.southBank },
];

/** Snap drawn points toward known QLD demo features within 250 m. */
export function snapRoute(points: LatLng[]): { route: LatLng[]; snappedFeatures: string[] } {
  const snappedFeatures: string[] = [];
  const route = points.map((p) => {
    let best = p;
    let bestDist = Infinity;
    let feature: string | null = null;
    for (const f of ROAD_FEATURES) {
      const d = haversineM(p, f.near);
      if (d < 250 && d < bestDist) {
        bestDist = d;
        best = f.near;
        feature = f.name;
      }
    }
    if (feature && !snappedFeatures.includes(feature)) snappedFeatures.push(feature);
    return best;
  });
  return { route, snappedFeatures };
}

export function planPublicOrder(drawnRoute: LatLng[]): PublicOrderPlan {
  assertLocalOnlyInference('public_order');
  const { route, snappedFeatures } = snapRoute(drawnRoute.length ? drawnRoute : [QLD.southBank, QLD.brisbaneCbd, QLD.fortitudeValley]);

  const policePositions: PublicOrderPlan['policePositions'] = [];
  for (const site of CRITICAL) {
    const nearRoute = route.some((p) => haversineM(p, site) < 800);
    if (nearRoute) {
      policePositions.push({
        lat: site.lat,
        lng: site.lng,
        label: `Protect ${site.name}`,
        reason: `Critical ${site.type} within route buffer`,
      });
    }
  }

  // Intersections along route
  route.forEach((p, i) => {
    if (i === 0 || i === route.length - 1) {
      policePositions.push({
        ...p,
        label: i === 0 ? 'Start containment' : 'Finish containment',
        reason: 'Route terminal control',
      });
    }
  });

  return {
    route,
    snappedFeatures,
    policePositions,
    criticalSites: CRITICAL.map((c) => ({ lat: c.lat, lng: c.lng, name: c.name, type: c.type })),
  };
}

export function linkOpposingPublicOrder(
  a: PublicOrderPlan,
  bIncidentId: string,
): PublicOrderPlan {
  return { ...a, linkedOpposingIncidentId: bIncidentId };
}
