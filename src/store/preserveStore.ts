import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  DeviceTrack,
  Incident,
  IncidentType,
  MapMarking,
  SecurityLevel,
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

let jobSeq = 1000;

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
  markings: MapMarking[];
  structureLabels: StructureLabel[];
  tracks: DeviceTrack[];
  streetLights: StreetLight[];
  showStreetLights: boolean;
  mapPitch3d: boolean;
  online: boolean;
  airGapEnforced: boolean;
  egressBlockedCount: number;

  setTrackingConsent: (ok: boolean) => void;
  setCurrentUser: (userId: string) => void;
  setOnline: (online: boolean) => void;
  setAirGapEnforced: (v: boolean) => void;
  setMapPitch3d: (v: boolean) => void;
  setShowStreetLights: (v: boolean) => void;
  selectIncident: (id: string | null) => void;
  joinIncident: (incidentId: string, userId?: string) => void;

  /**
   * HARD RULE: always creates a brand-new incident.
   * Never opens or returns an existing incident id based on type.
   */
  createIncident: (args: {
    type: IncidentType;
    title?: string;
    securityLevel?: SecurityLevel;
    location?: { lat: number; lng: number };
    summary?: string;
  }) => Incident;

  updateIncident: (id: string, patch: Partial<Incident>) => void;
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

function enrichNewIncident(base: Incident): Incident {
  const incident = { ...base };
  if (incident.type === 'cordon') {
    incident.cordon = planCordon({
      centre: incident.location,
      kind: 'break_and_enter',
      available: [
        { type: 'TCS', callSign: 'TCS-2' },
        { type: 'Dog Squad', callSign: 'DOG-1' },
        { type: 'General Duties', callSign: 'VKR-221' },
        { type: 'General Duties', callSign: 'VKR-118' },
        { type: 'General Duties', callSign: 'VKR-305' },
        { type: 'Supervisor', callSign: 'SUP-4' },
      ],
    });
  }
  if (incident.type === 'land_sar') {
    incident.landSar = planLandSar({
      lastKnown: incident.location,
      age: 78,
      mentalState: 'dementia / confused',
      areaKnowledge: 'limited',
      mobility: 'limited',
      transportMode: 'foot',
      timeLastSightedIso: new Date(Date.now() - 3 * 3600_000).toISOString(),
      description: 'Elderly male, blue cardigan, grey trousers, no shoes.',
      name: 'Harold Mitchell',
    });
  }
  if (incident.type === 'marine_sar') {
    incident.marineSar = planMarineSar({
      lastKnown: incident.location,
      vesselType: 'recreational powerboat',
      vesselSizeM: 5.5,
      pob: 2,
      emergencyEquipment: ['lifejackets', 'EPIRB'],
      vesselName: 'Coastal Runner',
      rego: 'QH-4821',
      missingSinceIso: new Date(Date.now() - 2.5 * 3600_000).toISOString(),
      windDirDeg: 120,
      windSpeedKt: 12,
      currentDirDeg: 90,
      currentSpeedKt: 1.2,
    });
  }
  if (incident.type === 'public_order') {
    incident.publicOrder = planPublicOrder([
      QLD.southBank,
      QLD.brisbaneCbd,
      QLD.parliamentHouse,
      QLD.fortitudeValley,
    ]);
  }
  if (incident.type === 'road_block') {
    incident.roadBlock = planRoadBlock({
      theftLocation: incident.location,
      vehicleDetails: 'Silver Toyota Camry, QLD 123ABC',
      offenderInfo: 'Male, mid-20s, last seen alone',
      stolenAtIso: new Date(Date.now() - 25 * 60_000).toISOString(),
      availableResources: 6,
      juvenileSuspect: false,
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
      markings: [],
      structureLabels: [],
      tracks: defaultTracks(),
      streetLights: SEED_STREET_LIGHTS,
      showStreetLights: false,
      mapPitch3d: false,
      online: true,
      airGapEnforced: true,
      egressBlockedCount: 0,

      setTrackingConsent: (ok) => set({ trackingConsent: ok }),
      setCurrentUser: (userId) => set({ currentUserId: userId }),
      setOnline: (online) => set({ online }),
      setAirGapEnforced: (v) => set({ airGapEnforced: v }),
      setMapPitch3d: (v) => set({ mapPitch3d: v }),
      setShowStreetLights: (v) => set({ showStreetLights: v }),
      selectIncident: (id) => set({ activeIncidentId: id }),

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

      createIncident: ({ type, title, securityLevel, location, summary }) => {
        const user = currentUser(get());
        const defaults: Record<IncidentType, { title: string; location: { lat: number; lng: number } }> = {
          cordon: { title: 'New Cordon', location: QLD.fortitudeValley },
          land_sar: { title: 'New MP / Land SAR', location: QLD.westEnd },
          marine_sar: { title: 'New Marine SAR', location: QLD.moretonBay },
          public_order: { title: 'New Public Order', location: QLD.brisbaneCbd },
          road_block: { title: 'New Road Block', location: QLD.kangarooPoint },
        };
        const d = defaults[type];
        const base: Incident = {
          id: `inc-${crypto.randomUUID()}`,
          jobNumber: nextJobNumber(),
          type,
          title: title ?? d.title,
          securityLevel: securityLevel ?? 'protected',
          status: 'open',
          createdAtIso: new Date().toISOString(),
          createdBy: user.id,
          location: location ?? d.location,
          summary: summary ?? `${d.title} created by ${user.callSign}`,
          joinedUserIds: [user.id],
        };
        const incident = enrichNewIncident(base);
        // Always append a new record — never reuse / open existing by type.
        set((s) => ({
          incidents: [incident, ...s.incidents],
          activeIncidentId: incident.id,
        }));
        return incident;
      },

      updateIncident: (id, patch) =>
        set((s) => ({
          incidents: s.incidents.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),

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
          activeIncidentId: null,
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
      }),
    },
  ),
);
