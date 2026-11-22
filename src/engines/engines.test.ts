import { describe, expect, it } from 'vitest';
import { planCordon } from './cordon';
import { planLandSar } from './landSar';
import { planMarineSar } from './marineSar';
import { planPublicOrder, linkOpposingPublicOrder } from './publicOrder';
import { planRoadBlock } from './roadBlock';
import { QLD } from '../geo/qld';

describe('local engines', () => {
  it('places TCS/dog on inner cordon for siege', () => {
    const plan = planCordon({
      centre: QLD.fortitudeValley,
      kind: 'siege',
      available: [
        { type: 'TCS', callSign: 'TCS-2' },
        { type: 'Dog Squad', callSign: 'DOG-1' },
        { type: 'General Duties', callSign: 'VKR-1' },
        { type: 'General Duties', callSign: 'VKR-2' },
      ],
    });
    const innerTypes = plan.resources.filter((r) => r.cordonRing === 'inner').map((r) => r.type);
    expect(innerTypes).toContain('TCS');
    expect(innerTypes).toContain('Dog Squad');
    expect(plan.outerRadiusM).toBeGreaterThan(plan.innerRadiusM);
  });

  it('land SAR clips water and produces briefing + path', () => {
    const plan = planLandSar({
      lastKnown: QLD.westEnd,
      age: 78,
      mentalState: 'dementia / confused',
      areaKnowledge: 'limited',
      mobility: 'limited',
      transportMode: 'foot',
      timeLastSightedIso: new Date(Date.now() - 4 * 3600_000).toISOString(),
      description: 'Blue cardigan',
      name: 'Harold Mitchell',
    });
    expect(plan.likelyPath.length).toBeGreaterThan(2);
    expect(plan.zones.length).toBe(3);
    expect(plan.briefing).toMatch(/MISSING PERSON BRIEFING/);
    expect(plan.maxDistanceM).toBeGreaterThan(0);
  });

  it('marine SAR applies 5% fudge and search grid', () => {
    const plan = planMarineSar({
      lastKnown: QLD.moretonBay,
      vesselType: 'powerboat',
      vesselSizeM: 5,
      pob: 2,
      emergencyEquipment: ['EPIRB'],
      vesselName: 'Coastal Runner',
      rego: 'QH-1',
      missingSinceIso: new Date(Date.now() - 3 * 3600_000).toISOString(),
      windDirDeg: 90,
      windSpeedKt: 10,
      currentDirDeg: 90,
      currentSpeedKt: 1,
    });
    expect(plan.fudgeFactor).toBe(0.05);
    expect(plan.grid.length).toBeGreaterThan(0);
    expect(plan.driftLine.length).toBeGreaterThan(1);
    expect(plan.briefing).toMatch(/MARINE SAR BRIEFING/);
  });

  it('public order snaps to streets/bridges and recommends critical-site protection', () => {
    const plan = planPublicOrder([QLD.southBank, QLD.brisbaneCbd, QLD.parliamentHouse]);
    expect(plan.route.length).toBeGreaterThan(3);
    expect(plan.snappedFeatures.some((f) => /Bridge|Victoria|Queen|George|Ann/i.test(f))).toBe(true);
    expect(plan.policePositions.some((p) => /Parliament|containment/i.test(p.label))).toBe(true);
    const linked = linkOpposingPublicOrder(plan, 'other-po');
    expect(linked.linkedOpposingIncidentId).toBe('other-po');
  });

  it('road block lays spike box', () => {
    const plan = planRoadBlock({
      theftLocation: QLD.kangarooPoint,
      vehicleDetails: 'Camry',
      offenderInfo: 'male',
      stolenAtIso: new Date(Date.now() - 15 * 60_000).toISOString(),
      availableResources: 5,
    });
    expect(plan.spikePoints.length).toBeGreaterThanOrEqual(4);
    expect(plan.boxedArea.length).toBeGreaterThan(3);
  });
});
