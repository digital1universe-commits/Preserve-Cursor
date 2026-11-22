import type { DeviceTrack, User } from '../domain/types';

/**
 * SERT privacy: SERT locations hidden from non-SERT unless they agree to share
 * for that incident. SERT always see each other.
 */
export function visibleTracks(viewer: User, tracks: DeviceTrack[]): DeviceTrack[] {
  return tracks.filter((t) => {
    if (t.userId === viewer.id) return true;
    if (!t.isSert) return true;
    if (viewer.isSert || viewer.roleId === 'sert') return true;
    return t.shareWithNonSert;
  });
}
