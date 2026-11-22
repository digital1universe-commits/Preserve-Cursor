import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  DeviceTrack,
  Incident,
  IncidentType,
  MapMarking,
  StreetLight,
  StructureLabel,
  User,
} from '../domain/types';
import { DEMO_USERS } from '../auth/roles';
import { planCordon } from '../engines/cordon';
import { planLandSar } from '../engines/landSar';
import { planMarineSar } from '../engines/marineSar';
import { linkOpposingPublicOrder, planPublicOrder } from '../engines/publicOrder';
import { planRoadBlock } from '../engines/roadBlock';
import { QLD } from '../geo/qld';
import { evaluateEgress } from '../security/airGap';
import { buildSeedIncidents, SEED_STREET_LIGHTS } from '../data/seed';
import {
  type CreateIncidentInput,
  parseResources,
  parseWaypoints,
} from '../incidents/createTypes';

let jobSeq = 1000;

export function peekJobNumber(now = new Date()): string {
  const y = now.getFullYear();
  return `QPS-${y}-${String(jobSeq + 1).padStart(5, '0')}`;
}

export function nextJobNumber(now = new Date()): string {
  jobSeq += 1;
  const y = now.getFullYear();
  return `QPS-${y}-${String(jobSeq).padStart(5, '0')}`;
}

/** Reset job sequence (tests only). */
export function __resetJobSeq(n = 1000) {
  jobSeq = n;
}

export interface PreserveState {
  trackingConsent: boolean | null;
  currentUserId: string;
  users: User[];
  incidents: Incident[];
  activeIncidentId: string | null;
  draftType: IncidentType | null;
  markings: MapMarking[];
  structureLabels: StructureLabel[];
  tracks: DeviceTrack[];
  streetLights: StreetLight[];
  showStreetLights: boolean;
  mapPitch3d: boolean;
  mapDarkMode: boolean;
  online: boolean;
  airGapEnforced: boolean;
  egressBlockedCount: number;

  setTrackingConsent: (ok: boolean) => void;
  setCurrentUser: (userId: string) => void;
  setOnline: (online: boolean) => void;
  setAirGapEnforced: (v: boolean) => void;
  setMapPitch3d: (v: boolean) => void;
  setMapDarkMode: (v: boolean) => void;
  setShowStreetLights: (v: boolean) => void;
  selectIncident: (id: string | null) => void;
  openNewIncidentForm: (type: IncidentType) => void;
  closeNewIncidentForm: () => void;
  joinIncident: (incidentId: string, userId?: string) => void;

  /**
   * HARD RULE: always creates a brand-new incident.
   * Never opens or returns an existing incident id based on type.
   */
  createIncident: (args: CreateIncidentInput) => Incident;

  updateIncident: (id: string, patch: Partial<Incident>) => void;
  replanIncident: (id: string, input: CreateIncidentInput) => void;
  linkPublicOrderOpposing: (aId: string, bId: string) => void;
  addMarking: (m: Omit<MapMarking, 'id' | 'createdAtIso' | 'createdBy'> & { createdBy?: string }) => void;
  addStructureLabel: (s: Omit<StructureLabel, 'id'>) => void;
  setSertShare: (userId: string, incidentId: string, share: boolean) => void;
  updateOwnTrack: (position: { lat: number; lng: number }) => void;
  tryLeakIncidentData: (url: string) => { blocked: boolean; reason: string };
  resetDemoData: () => void;
}

function currentUser(state: PreserveState): User {
  return state.users.find((u) => u.id === state.currentUserId) ?? state.users[0];
}

export function buildIncidentPlans(base: Incident, input: CreateIncidentInput = { type: base.type }): Incident {
  const incident = { ...base };

  if (incident.type === 'cordon') {
    const resources = input.cordon?.resourcesText
      ? parseResources(input.cordon.resourcesText)
      : [
          { type: 'TCS', callSign: 'TCS-2' },
          { type: 'Dog Squad', callSign: 'DOG-1' },
          { type: 'General Duties', callSign: 'VKR-221' },
          { type: 'General Duties', callSign: 'VKR-118' },
          { type: 'General Duties', callSign: 'VKR-305' },
          { type: 'Supervisor', callSign: 'SUP-4' },
        ];
    incident.cordon = planCordon({
      centre: incident.location,
      kind: input.cordon?.kind ?? 'break_and_enter',
      available: resources,
    });
  }

  if (incident.type === 'land_sar') {
    const lastKnown = input.landSar?.lastKnown ?? incident.location;
    incident.location = lastKnown;
    incident.landSar = planLandSar({
      lastKnown,
      age: input.landSar?.age ?? 78,
      mentalState: input.landSar?.mentalState ?? 'dementia / confused',
      areaKnowledge: input.landSar?.areaKnowledge ?? 'limited',
      mobility: input.landSar?.mobility ?? 'limited',
      transportMode: input.landSar?.transportMode ?? 'foot',
      timeLastSightedIso:
        input.landSar?.timeLastSightedIso ?? new Date(Date.now() - 3 * 3600_000).toISOString(),
      description: input.landSar?.description ?? 'Elderly male, blue cardigan, grey trousers, no shoes.',
      name: input.landSar?.name ?? 'Harold Mitchell',
    });
  }

  if (incident.type === 'marine_sar') {
    const lastKnown = input.marineSar?.lastKnown ?? incident.location;
    incident.location = lastKnown;
    incident.marineSar = planMarineSar({
      lastKnown,
      vesselType: input.marineSar?.vesselType ?? 'recreational powerboat',
      vesselSizeM: input.marineSar?.vesselSizeM ?? 5.5,
      pob: input.marineSar?.pob ?? 2,
      emergencyEquipment: input.marineSar?.emergencyEquipment ?? ['lifejackets', 'EPIRB'],
      vesselName: input.marineSar?.vesselName ?? 'Coastal Runner',
      rego: input.marineSar?.rego ?? 'QH-4821',
      missingSinceIso:
        input.marineSar?.missingSinceIso ?? new Date(Date.now() - 2.5 * 3600_000).toISOString(),
      windDirDeg: input.marineSar?.windDirDeg ?? 120,
      windSpeedKt: input.marineSar?.windSpeedKt ?? 12,
      currentDirDeg: input.marineSar?.currentDirDeg ?? 90,
      currentSpeedKt: input.marineSar?.currentSpeedKt ?? 1.2,
    });
  }

  if (incident.type === 'public_order') {
    const defaults = [QLD.southBank, QLD.brisbaneCbd, QLD.parliamentHouse, QLD.fortitudeValley];
    const waypoints = input.publicOrder?.waypointsText
      ? parseWaypoints(input.publicOrder.waypointsText, defaults)
      : defaults;
    incident.location = waypoints[0] ?? incident.location;
    incident.publicOrder = planPublicOrder(waypoints);
  }

  if (incident.type === 'road_block') {
    incident.roadBlock = planRoadBlock({
      theftLocation: incident.location,
      vehicleDetails: input.roadBlock?.vehicleDetails ?? 'Silver Toyota Camry, QLD 123ABC',
      offenderInfo: input.roadBlock?.offenderInfo ?? 'Male, mid-20s, last seen alone',
      stolenAtIso: new Date(
        Date.now() - (input.roadBlock?.stolenMinutesAgo ?? 25) * 60_000,
      ).toISOString(),
      availableResources: input.roadBlock?.availableResources ?? 6,
      juvenileSuspect: input.roadBlock?.juvenileSuspect ?? false,
    });
  }

  return incident;
}

const defaultTracks = (): DeviceTrack[] => [
  {
    userId: 'u-gd1',
    callSign: 'VKR-221',
    name: 'Taylor Reid',
    position: { lat: QLD.fortitudeValley.lat + 0.002, lng: QLD.fortitudeValley.lng },
    updatedAtIso: new Date().toISOString(),
    isSert: false,
    shareWithNonSert: true,
    incidentId: '',
  },
  {
    userId: 'u-sert1',
    callSign: 'SERT-3',
    name: 'Casey Holt',
    position: { lat: QLD.brisbaneCbd.lat + 0.001, lng: QLD.brisbaneCbd.lng + 0.001 },
    updatedAtIso: new Date().toISOString(),
    isSert: true,
    shareWithNonSert: false,
    incidentId: '',
  },
  {
    userId: 'u-sert2',
    callSign: 'SERT-7',
    name: 'Riley Quinn',
    position: { lat: QLD.brisbaneCbd.lat - 0.001, lng: QLD.brisbaneCbd.lng + 0.002 },
    updatedAtIso: new Date().toISOString(),
    isSert: true,
    shareWithNonSert: false,
    incidentId: '',
  },
];

export const usePreserveStore = create<PreserveState>()(
  persist(
    (set, get) => ({
      trackingConsent: null,
      currentUserId: 'u-comms',
      users: DEMO_USERS,
      incidents: buildSeedIncidents(),
      activeIncidentId: null,
      draftType: null,
      markings: [],
      structureLabels: [],
      tracks: defaultTracks(),
      streetLights: SEED_STREET_LIGHTS,
      showStreetLights: false,
      mapPitch3d: true,
      mapDarkMode: true,
      online: true,
      airGapEnforced: true,
      egressBlockedCount: 0,

      setTrackingConsent: (ok) => set({ trackingConsent: ok }),
      setCurrentUser: (userId) => set({ currentUserId: userId }),
      setOnline: (online) => set({ online }),
      setAirGapEnforced: (v) => set({ airGapEnforced: v }),
      setMapPitch3d: (v) => set({ mapPitch3d: v }),
      setMapDarkMode: (v) => set({ mapDarkMode: v }),
      setShowStreetLights: (v) => set({ showStreetLights: v }),
      selectIncident: (id) => set({ activeIncidentId: id, draftType: null }),
      openNewIncidentForm: (type) => set({ draftType: type }),
      closeNewIncidentForm: () => set({ draftType: null }),

      joinIncident: (incidentId, userId) => {
        const uid = userId ?? get().currentUserId;
        set((s) => ({
          incidents: s.incidents.map((inc) =>
            inc.id === incidentId && !inc.joinedUserIds.includes(uid)
              ? { ...inc, joinedUserIds: [...inc.joinedUserIds, uid], status: 'active' }
              : inc,
          ),
          activeIncidentId: incidentId,
          tracks: s.tracks.map((t) => (t.userId === uid ? { ...t, incidentId } : t)),
        }));
      },

      createIncident: (input) => {
        const user = currentUser(get());
        const type = input.type;
        const defaults: Record<IncidentType, { title: string; location: { lat: number; lng: number } }> = {
          cordon: { title: 'New Cordon', location: QLD.fortitudeValley },
          land_sar: { title: 'New MP / Land SAR', location: QLD.westEnd },
          marine_sar: { title: 'New Marine SAR', location: QLD.moretonBay },
          public_order: { title: 'New Public Order', location: QLD.brisbaneCbd },
          road_block: { title: 'New Road Block', location: QLD.kangarooPoint },
        };
        const d = defaults[type];
        let location = input.location ?? d.location;
        if (type === 'land_sar' && input.landSar?.lastKnown) location = input.landSar.lastKnown;
        if (type === 'marine_sar' && input.marineSar?.lastKnown) location = input.marineSar.lastKnown;
        if (typeof input.location === 'undefined' && type === 'land_sar' && input.landSar) {
          /* already handled */
        }

        const base: Incident = {
          id: `inc-${crypto.randomUUID()}`,
          jobNumber: input.jobNumber?.trim() || nextJobNumber(),
          type,
          title: input.title ?? d.title,
          securityLevel: input.securityLevel ?? 'protected',
          status: 'open',
          createdAtIso: new Date().toISOString(),
          createdBy: user.id,
          location,
          summary: input.summary ?? `${input.title ?? d.title} created by ${user.callSign}`,
          joinedUserIds: [user.id],
        };
        const incident = buildIncidentPlans(base, input);
        set((s) => ({
          incidents: [incident, ...s.incidents],
          activeIncidentId: incident.id,
          draftType: null,
        }));
        return incident;
      },

      updateIncident: (id, patch) =>
        set((s) => ({
          incidents: s.incidents.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),

      replanIncident: (id, input) => {
        set((s) => ({
          incidents: s.incidents.map((inc) => {
            if (inc.id !== id) return inc;
            const next: Incident = {
              ...inc,
              title: input.title ?? inc.title,
              securityLevel: input.securityLevel ?? inc.securityLevel,
              jobNumber: input.jobNumber?.trim() || inc.jobNumber,
              summary: input.summary ?? inc.summary,
              location: input.location ?? inc.location,
            };
            return buildIncidentPlans(next, { ...input, type: inc.type });
          }),
        }));
      },

      linkPublicOrderOpposing: (aId, bId) => {
        set((s) => ({
          incidents: s.incidents.map((inc) => {
            if (inc.id === aId && inc.publicOrder) {
              return { ...inc, publicOrder: linkOpposingPublicOrder(inc.publicOrder, bId) };
            }
            if (inc.id === bId && inc.publicOrder) {
              return { ...inc, publicOrder: linkOpposingPublicOrder(inc.publicOrder, aId) };
            }
            return inc;
          }),
        }));
      },

      addMarking: (m) => {
        const marking: MapMarking = {
          ...m,
          id: `mk-${crypto.randomUUID()}`,
          createdAtIso: new Date().toISOString(),
          createdBy: m.createdBy ?? get().currentUserId,
        };
        set((s) => ({ markings: [...s.markings, marking] }));
      },

      addStructureLabel: (s) => {
        const label: StructureLabel = { ...s, id: `st-${crypto.randomUUID()}` };
        set((state) => ({ structureLabels: [...state.structureLabels, label] }));
      },

      setSertShare: (userId, incidentId, share) =>
        set((s) => ({
          tracks: s.tracks.map((t) =>
            t.userId === userId && (t.incidentId === incidentId || !t.incidentId)
              ? { ...t, shareWithNonSert: share, incidentId: incidentId || t.incidentId }
              : t,
          ),
        })),

      updateOwnTrack: (position) => {
        const uid = get().currentUserId;
        const user = currentUser(get());
        set((s) => {
          const existing = s.tracks.find((t) => t.userId === uid);
          const track: DeviceTrack = {
            userId: uid,
            callSign: user.callSign,
            name: user.name,
            position,
            updatedAtIso: new Date().toISOString(),
            isSert: user.isSert,
            shareWithNonSert: existing?.shareWithNonSert ?? !user.isSert,
            incidentId: s.activeIncidentId ?? existing?.incidentId ?? '',
          };
          return {
            tracks: existing
              ? s.tracks.map((t) => (t.userId === uid ? track : t))
              : [...s.tracks, track],
          };
        });
      },

      tryLeakIncidentData: (url) => {
        const { online, airGapEnforced } = get();
        const decision = evaluateEgress(
          { url, category: 'incident_data', payloadSummary: 'incident blob' },
          { online, airGapEnforced },
        );
        if (!decision.allowed) {
          set((s) => ({ egressBlockedCount: s.egressBlockedCount + 1 }));
        }
        return { blocked: !decision.allowed, reason: decision.reason };
      },

      resetDemoData: () =>
        set({
          incidents: buildSeedIncidents(),
          markings: [],
          structureLabels: [],
          tracks: defaultTracks(),
          streetLights: SEED_STREET_LIGHTS,
          activeIncidentId: null,
          draftType: null,
          egressBlockedCount: 0,
        }),
    }),
    {
      name: 'preserve-qld-demo',
      partialize: (s) => ({
        trackingConsent: s.trackingConsent,
        currentUserId: s.currentUserId,
        incidents: s.incidents,
        markings: s.markings,
        structureLabels: s.structureLabels,
        online: s.online,
        airGapEnforced: s.airGapEnforced,
        showStreetLights: s.showStreetLights,
        mapPitch3d: s.mapPitch3d,
        mapDarkMode: s.mapDarkMode,
      }),
    },
  ),
);
