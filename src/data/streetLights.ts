import type { LatLng, StreetLight } from '../domain/types';
import { pointInPolygon } from '../geo/qld';
import osmStreetLamps from './osmStreetLamps.json';

/**
 * Tight mid-channel Brisbane River polygons (sanity check only).
 * Real lamp positions come from OSM — these polys only reject clear mid-water points.
 */
export const RIVER_WATER_POLYS: LatLng[][] = [
  // CBD horseshoe mid-channel
  [
    { lat: -27.4708, lng: 153.0188 },
    { lat: -27.4716, lng: 153.0228 },
    { lat: -27.4728, lng: 153.0272 },
    { lat: -27.4744, lng: 153.0308 },
    { lat: -27.4766, lng: 153.0326 },
    { lat: -27.4788, lng: 153.0318 },
    { lat: -27.4798, lng: 153.0282 },
    { lat: -27.4786, lng: 153.0236 },
    { lat: -27.4768, lng: 153.0198 },
    { lat: -27.4742, lng: 153.0182 },
    { lat: -27.4722, lng: 153.0178 },
  ],
  // Town Reach / Eagle St mid-channel (James Warner Park water)
  [
    { lat: -27.4672, lng: 153.0322 },
    { lat: -27.468, lng: 153.0358 },
    { lat: -27.4696, lng: 153.038 },
    { lat: -27.4716, lng: 153.0386 },
    { lat: -27.4728, lng: 153.0368 },
    { lat: -27.4718, lng: 153.0336 },
    { lat: -27.4698, lng: 153.032 },
    { lat: -27.4682, lng: 153.0316 },
  ],
];

export interface StreetLightSourceMeta {
  source: string;
  tag: string;
  attribution: string;
  fetchedAt: string;
  rawCount: number;
  plottedCount: number;
  waterClippedCount: number;
  coverageNote: string;
}

export function isOverWater(p: LatLng): boolean {
  return RIVER_WATER_POLYS.some((poly) => pointInPolygon(p, poly));
}

/**
 * Real street lights only — OpenStreetMap `highway=street_lamp` nodes.
 * No interpolation, no road-network generation. Water polys are a sanity filter.
 */
export function buildCityStreetLights(): StreetLight[] {
  const lights: StreetLight[] = [];
  for (const f of osmStreetLamps.features) {
    const position = { lat: f.lat, lng: f.lng };
    if (isOverWater(position)) continue;
    lights.push({
      id: f.id,
      position,
      type: 'standard',
    });
  }
  return lights;
}

export function getStreetLightSourceMeta(plotted: StreetLight[] = buildCityStreetLights()): StreetLightSourceMeta {
  const rawCount = osmStreetLamps.rawCount;
  const plottedCount = plotted.length;
  return {
    source: osmStreetLamps.source,
    tag: osmStreetLamps.tag,
    attribution: osmStreetLamps.attribution,
    fetchedAt: osmStreetLamps.fetchedAt,
    rawCount,
    plottedCount,
    waterClippedCount: Math.max(0, rawCount - plottedCount),
    coverageNote: 'OSM coverage incomplete — only mapped street_lamp nodes shown',
  };
}
