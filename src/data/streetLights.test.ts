import { describe, expect, it } from 'vitest';
import { buildCityStreetLights, getStreetLightSourceMeta, isOverWater } from './streetLights';

describe('street lights (OSM only)', () => {
  it('plots real OSM street_lamp nodes and never invents road poles', () => {
    const lights = buildCityStreetLights();
    const meta = getStreetLightSourceMeta(lights);
    expect(meta.source).toBe('OpenStreetMap');
    expect(meta.tag).toBe('highway=street_lamp');
    expect(lights.length).toBe(meta.plottedCount);
    expect(lights.length).toBeGreaterThan(50);
    expect(lights.length).toBeLessThanOrEqual(meta.rawCount);
    expect(lights.every((l) => l.id.startsWith('osm-'))).toBe(true);
  });

  it('clips mid-channel water as a sanity check', () => {
    const lights = buildCityStreetLights();
    expect(lights.every((l) => !isOverWater(l.position))).toBe(true);
    expect(isOverWater({ lat: -27.475, lng: 153.025 })).toBe(true);
  });
});
