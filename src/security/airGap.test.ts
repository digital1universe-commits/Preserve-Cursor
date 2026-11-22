import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearBlockedEgressLog,
  evaluateEgress,
  getBlockedEgressLog,
  assertLocalOnlyInference,
} from './airGap';

describe('air-gap egress', () => {
  beforeEach(() => clearBlockedEgressLog());

  it('blocks incident data to public endpoints', () => {
    const d = evaluateEgress(
      { url: 'https://api.openai.com/v1/chat/completions', category: 'incident_data' },
      { online: true, airGapEnforced: true },
    );
    expect(d.allowed).toBe(false);
    expect(getBlockedEgressLog().length).toBe(1);
  });

  it('blocks public AI inference always', () => {
    const d = evaluateEgress(
      { url: 'https://api.anthropic.com/v1/messages', category: 'ai_inference' },
      { online: true, airGapEnforced: true },
    );
    expect(d.allowed).toBe(false);
  });

  it('allows approved map tile hosts when online', () => {
    const d = evaluateEgress(
      { url: 'https://demotiles.maplibre.org/style.json', category: 'map_tiles' },
      { online: true, airGapEnforced: true },
    );
    expect(d.allowed).toBe(true);
  });

  it('blocks map tiles when offline', () => {
    const d = evaluateEgress(
      { url: 'https://demotiles.maplibre.org/style.json', category: 'map_tiles' },
      { online: false, airGapEnforced: true },
    );
    expect(d.allowed).toBe(false);
  });

  it('local inference assert requires engine name', () => {
    expect(() => assertLocalOnlyInference('cordon')).not.toThrow();
    expect(() => assertLocalOnlyInference('')).toThrow();
  });
});
