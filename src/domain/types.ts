export type IncidentType =
  | 'cordon'
  | 'land_sar'
  | 'marine_sar'
  | 'public_order'
  | 'road_block';

export type SecurityLevel = 'unclassified' | 'protected' | 'restricted' | 'secret';

export type RoleId =
  | 'super_admin'
  | 'comms'
  | 'supervisor'
  | 'scene_commander'
  | 'general_duties'
  | 'tcs'
  | 'dog_squad'
  | 'sert'
  | 'event_coordinator';

export type Permission =
  | 'incident:create'
  | 'incident:view'
  | 'incident:edit'
  | 'incident:join'
  | 'roles:manage'
  | 'users:manage'
  | 'markings:permanent'
  | 'markings:service'
  | 'sert:see_locations'
  | 'admin:security';

export interface Role {
  id: RoleId;
  name: string;
  permissions: Permission[];
}

export interface User {
  id: string;
  name: string;
  callSign: string;
  roleId: RoleId;
  unit?: string;
  isSert: boolean;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ResourceAllocation {
  id: string;
  type: string;
  callSign: string;
  cordonRing?: 'inner' | 'middle' | 'outer';
  position?: LatLng;
}

export interface CordonPlan {
  centre: LatLng;
  innerRadiusM: number;
  middleRadiusM: number;
  outerRadiusM: number;
  resources: ResourceAllocation[];
  methodologyNotes: string[];
}

export interface LandSarInputs {
  lastKnown: LatLng;
  age: number;
  mentalState: string;
  areaKnowledge: 'none' | 'limited' | 'familiar' | 'expert';
  mobility: 'immobile' | 'limited' | 'normal' | 'high';
  transportMode: 'foot' | 'bicycle' | 'vehicle' | 'unknown';
  timeLastSightedIso: string;
  description: string;
  name: string;
}

export interface SearchZone {
  id: string;
  label: string;
  probability: 'high' | 'medium' | 'low';
  polygon: LatLng[];
}

export interface LandSarPlan {
  inputs: LandSarInputs;
  likelyPath: LatLng[];
  maxDistanceM: number;
  zones: SearchZone[];
  clippedByWater: boolean;
  briefing: string;
}

export interface MarineSarInputs {
  lastKnown: LatLng;
  vesselType: string;
  vesselSizeM: number;
  pob: number;
  emergencyEquipment: string[];
  vesselName: string;
  rego: string;
  missingSinceIso: string;
  windDirDeg: number;
  windSpeedKt: number;
  currentDirDeg: number;
  currentSpeedKt: number;
}

export interface MarineSarPlan {
  inputs: MarineSarInputs;
  driftCentre: LatLng;
  searchRadiusM: number;
  driftLine: LatLng[];
  grid: LatLng[][];
  fudgeFactor: number;
  briefing: string;
}

export interface PublicOrderPlan {
  route: LatLng[];
  snappedFeatures: string[];
  policePositions: Array<LatLng & { label: string; reason: string }>;
  criticalSites: Array<LatLng & { name: string; type: string }>;
  linkedOpposingIncidentId?: string;
}

export interface RoadBlockPlan {
  theftLocation: LatLng;
  vehicleDetails: string;
  offenderInfo: string;
  stolenAtIso: string;
  spikePoints: Array<LatLng & { label: string }>;
  boxedArea: LatLng[];
  likelyEscapeDirection: string;
  notes: string[];
}

export type StructureSide = 'front' | 'back' | 'right' | 'left';

export interface StructureLabel {
  id: string;
  incidentId: string;
  position: LatLng;
  side: StructureSide;
  label: string;
}

export interface MapMarking {
  id: string;
  incidentId: string | null;
  position: LatLng;
  text: string;
  scope: 'incident' | 'permanent';
  visibility: 'personal' | 'service';
  createdBy: string;
  createdAtIso: string;
}

export interface DeviceTrack {
  userId: string;
  callSign: string;
  name: string;
  position: LatLng;
  updatedAtIso: string;
  isSert: boolean;
  shareWithNonSert: boolean;
  incidentId: string;
}

export interface StreetLight {
  id: string;
  position: LatLng;
  type: 'standard' | 'high_mast';
}

export interface Incident {
  id: string;
  jobNumber: string;
  type: IncidentType;
  title: string;
  securityLevel: SecurityLevel;
  status: 'open' | 'active' | 'closed';
  createdAtIso: string;
  createdBy: string;
  location: LatLng;
  summary: string;
  joinedUserIds: string[];
  cordon?: CordonPlan;
  landSar?: LandSarPlan;
  marineSar?: MarineSarPlan;
  publicOrder?: PublicOrderPlan;
  roadBlock?: RoadBlockPlan;
}

export interface NetworkMode {
  mode: 'online' | 'offline';
  airGapEnforced: boolean;
  lastEgressBlockedAt?: string;
  blockedAttempts: number;
}

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  cordon: 'Cordon',
  land_sar: 'MP / Land SAR',
  marine_sar: 'Missing Vessel / Marine SAR',
  public_order: 'Public Order',
  road_block: 'Road Block',
};

export const STRUCTURE_SIDE_COLOURS: Record<StructureSide, string> = {
  front: '#ffffff',
  back: '#111111',
  right: '#c62828',
  left: '#2e7d32',
};
