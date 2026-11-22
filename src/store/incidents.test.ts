import { beforeEach, describe, expect, it } from 'vitest';
import { __resetJobSeq, nextJobNumber, usePreserveStore } from './preserveStore';
import type { IncidentType } from '../domain/types';

describe('incident management', () => {
  beforeEach(() => {
    __resetJobSeq(1000);
    usePreserveStore.setState({
      trackingConsent: true,
      currentUserId: 'u-comms',
      incidents: [],
      activeIncidentId: null,
      markings: [],
      structureLabels: [],
      egressBlockedCount: 0,
    });
  });

  it('issues CAD-like job numbers', () => {
    expect(nextJobNumber(new Date('2026-11-22T00:00:00Z'))).toMatch(/^QPS-2026-\d{5}$/);
  });

  it('new-incident controls always create distinct incidents', () => {
    const types: IncidentType[] = ['cordon', 'land_sar', 'marine_sar', 'public_order', 'road_block'];
    const created = types.map((type) => usePreserveStore.getState().createIncident({ type }));
    const ids = new Set(created.map((c) => c.id));
    const jobs = new Set(created.map((c) => c.jobNumber));
    expect(ids.size).toBe(types.length);
    expect(jobs.size).toBe(types.length);
    expect(usePreserveStore.getState().incidents).toHaveLength(types.length);

    // Creating another cordon must not open/reuse the first cordon
    const again = usePreserveStore.getState().createIncident({ type: 'cordon' });
    expect(again.id).not.toBe(created[0].id);
    expect(usePreserveStore.getState().incidents).toHaveLength(types.length + 1);
  });

  it('smoke: every incident type gets engine payload', () => {
    const cordon = usePreserveStore.getState().createIncident({ type: 'cordon' });
    const land = usePreserveStore.getState().createIncident({ type: 'land_sar' });
    const marine = usePreserveStore.getState().createIncident({ type: 'marine_sar' });
    const po = usePreserveStore.getState().createIncident({ type: 'public_order' });
    const rb = usePreserveStore.getState().createIncident({ type: 'road_block' });

    expect(cordon.cordon?.resources.length).toBeGreaterThan(0);
    expect(land.landSar?.briefing).toBeTruthy();
    expect(marine.marineSar?.fudgeFactor).toBe(0.05);
    expect(po.publicOrder?.route.length).toBeGreaterThan(0);
    expect(rb.roadBlock?.spikePoints.length).toBeGreaterThan(0);
  });

  it('blocks incident data egress probe', () => {
    const result = usePreserveStore
      .getState()
      .tryLeakIncidentData('https://api.openai.com/v1/chat/completions');
    expect(result.blocked).toBe(true);
    expect(usePreserveStore.getState().egressBlockedCount).toBe(1);
  });
});
