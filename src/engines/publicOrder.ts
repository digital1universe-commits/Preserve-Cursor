import type { LatLng, PublicOrderPlan } from '../domain/types';
import { assertLocalOnlyInference } from '../security/airGap';
import { QLD, haversineM } from '../geo/qld';
import { routeAlongRoads } from '../geo/brisbaneRoadGraph';

const CRITICAL = [
  { ...QLD.parliamentHouse, name: 'Parliament House', type: 'government' },
  { ...QLD.rbwh, name: 'RBWH', type: 'hospital' },
  { ...QLD.romaStreetStation, name: 'Roma Street Station', type: 'transport' },
  { ...QLD.cityHall, name: 'City Hall', type: 'government' },
];

/** Snap drawn waypoints onto Brisbane road/bridge graph (offline). */
export function snapRoute(points: LatLng[]): { route: LatLng[]; snappedFeatures: string[] } {
  const routed = routeAlongRoads(points);
  const features = [...routed.snappedFeatures];
  for (const b of routed.usedBridges) {
    if (!features.includes(`Bridge: ${b}`)) features.push(`Bridge: ${b}`);
  }
  return { route: routed.route, snappedFeatures: features };
}

export function planPublicOrder(drawnRoute: LatLng[]): PublicOrderPlan {
  assertLocalOnlyInference('public_order');
  const defaults = [QLD.southBank, QLD.brisbaneCbd, QLD.parliamentHouse, QLD.fortitudeValley];
  const { route, snappedFeatures } = snapRoute(drawnRoute.length ? drawnRoute : defaults);

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

  if (route.length) {
    policePositions.push({
      ...route[0],
      label: 'Start containment',
      reason: 'Route terminal control',
    });
    policePositions.push({
      ...route[route.length - 1],
      label: 'Finish containment',
      reason: 'Route terminal control',
    });
  }

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
