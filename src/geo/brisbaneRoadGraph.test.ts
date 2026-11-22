import { describe, expect, it } from 'vitest';
import { QLD } from './qld';
import { routeAlongRoads, routeUsesOnlyBridgesForRiverCrossing } from './brisbaneRoadGraph';

describe('Brisbane road graph routing', () => {
  it('routes South Bank → CBD → Valley via bridges, not across water', () => {
    const result = routeAlongRoads([QLD.southBank, QLD.brisbaneCbd, QLD.fortitudeValley]);
    expect(result.route.length).toBeGreaterThan(5);
    expect(result.usedBridges.length).toBeGreaterThan(0);
    expect(result.usedBridges.some((b) => /Victoria|Goodwill|Story/i.test(b))).toBe(true);
    expect(routeUsesOnlyBridgesForRiverCrossing(result.route)).toBe(true);
    // Straight chord South Bank → Queen St would be ~1km; snapped path is longer via bridge
    expect(result.snappedFeatures.some((f) => /Victoria|Queen|Ann|Bridge/i.test(f))).toBe(true);
  });

  it('snaps user-drawn waypoints similarly', () => {
    const drawn = [
      { lat: -27.4782, lng: 153.0205 },
      { lat: -27.47, lng: 153.025 },
      { lat: -27.4575, lng: 153.0345 },
    ];
    const result = routeAlongRoads(drawn);
    expect(result.route.length).toBeGreaterThan(drawn.length);
    expect(routeUsesOnlyBridgesForRiverCrossing(result.route)).toBe(true);
  });
});
