import { describe, expect, it } from 'vitest';
import { visibleTracks } from './visibility';
import { DEMO_USERS } from '../auth/roles';
import type { DeviceTrack } from '../domain/types';

const tracks: DeviceTrack[] = [
  {
    userId: 'u-gd1',
    callSign: 'VKR-221',
    name: 'Taylor Reid',
    position: { lat: -27.45, lng: 153.03 },
    updatedAtIso: new Date().toISOString(),
    isSert: false,
    shareWithNonSert: true,
    incidentId: 'inc-1',
  },
  {
    userId: 'u-sert1',
    callSign: 'SERT-3',
    name: 'Casey Holt',
    position: { lat: -27.46, lng: 153.03 },
    updatedAtIso: new Date().toISOString(),
    isSert: true,
    shareWithNonSert: false,
    incidentId: 'inc-1',
  },
  {
    userId: 'u-sert2',
    callSign: 'SERT-7',
    name: 'Riley Quinn',
    position: { lat: -27.461, lng: 153.031 },
    updatedAtIso: new Date().toISOString(),
    isSert: true,
    shareWithNonSert: true,
    incidentId: 'inc-1',
  },
];

describe('SERT privacy', () => {
  it('hides unshared SERT from general duties', () => {
    const gd = DEMO_USERS.find((u) => u.id === 'u-gd1')!;
    const vis = visibleTracks(gd, tracks);
    expect(vis.map((t) => t.userId)).toEqual(['u-gd1', 'u-sert2']);
  });

  it('lets SERT see each other always', () => {
    const sert = DEMO_USERS.find((u) => u.id === 'u-sert1')!;
    const vis = visibleTracks(sert, tracks);
    expect(vis.map((t) => t.userId).sort()).toEqual(['u-gd1', 'u-sert1', 'u-sert2']);
  });
});
