import type { Incident } from '../domain/types';
import { planCordon } from '../engines/cordon';
import { planLandSar } from '../engines/landSar';
import { planMarineSar } from '../engines/marineSar';
import { planPublicOrder } from '../engines/publicOrder';
import { planRoadBlock } from '../engines/roadBlock';
import { QLD } from '../geo/qld';
import { buildCityStreetLights } from './streetLights';

/** Real OSM highway=street_lamp nodes for Brisbane CBD (coverage incomplete). */
export const SEED_STREET_LIGHTS = buildCityStreetLights();

export function buildSeedIncidents(): Incident[] {
  const cordonLoc = QLD.fortitudeValley;
  const landLoc = QLD.westEnd;
  const marineLoc = QLD.moretonBay;
  const poLoc = QLD.brisbaneCbd;
  const rbLoc = QLD.kangarooPoint;

  const cordon: Incident = {
    id: 'seed-cordon-1',
    jobNumber: 'QPS-2026-01001',
    type: 'cordon',
    title: 'Siege — Ann St commercial',
    securityLevel: 'restricted',
    status: 'active',
    createdAtIso: new Date(Date.now() - 90 * 60_000).toISOString(),
    createdBy: 'u-comms',
    location: cordonLoc,
    summary: 'Armed offender contained in commercial premises, Ann Street.',
    joinedUserIds: ['u-comms', 'u-sc', 'u-tcs'],
    cordon: planCordon({
      centre: cordonLoc,
      kind: 'siege',
      available: [
        { type: 'TCS', callSign: 'TCS-2' },
        { type: 'Dog Squad', callSign: 'DOG-1' },
        { type: 'SERT', callSign: 'SERT-3' },
        { type: 'General Duties', callSign: 'VKR-221' },
        { type: 'General Duties', callSign: 'VKR-118' },
        { type: 'General Duties', callSign: 'VKR-305' },
      ],
    }),
  };

  const land: Incident = {
    id: 'seed-land-1',
    jobNumber: 'QPS-2026-01002',
    type: 'land_sar',
    title: 'MP — West End river precinct',
    securityLevel: 'protected',
    status: 'active',
    createdAtIso: new Date(Date.now() - 180 * 60_000).toISOString(),
    createdBy: 'u-comms',
    location: landLoc,
    summary: 'Elderly male missing from residential care, West End.',
    joinedUserIds: ['u-comms', 'u-gd1'],
    landSar: planLandSar({
      lastKnown: landLoc,
      age: 78,
      mentalState: 'dementia / confused',
      areaKnowledge: 'limited',
      mobility: 'limited',
      transportMode: 'foot',
      timeLastSightedIso: new Date(Date.now() - 3 * 3600_000).toISOString(),
      description: 'Elderly male, blue cardigan, grey trousers, no shoes.',
      name: 'Harold Mitchell',
    }),
  };

  const marine: Incident = {
    id: 'seed-marine-1',
    jobNumber: 'QPS-2026-01003',
    type: 'marine_sar',
    title: 'Missing vessel — Moreton Bay',
    securityLevel: 'protected',
    status: 'open',
    createdAtIso: new Date(Date.now() - 150 * 60_000).toISOString(),
    createdBy: 'u-comms',
    location: marineLoc,
    summary: 'Overdue recreational vessel, last known Moreton Bay.',
    joinedUserIds: ['u-comms'],
    marineSar: planMarineSar({
      lastKnown: marineLoc,
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
    }),
  };

  const publicOrder: Incident = {
    id: 'seed-po-1',
    jobNumber: 'QPS-2026-01004',
    type: 'public_order',
    title: 'Public order — CBD march',
    securityLevel: 'protected',
    status: 'open',
    createdAtIso: new Date(Date.now() - 40 * 60_000).toISOString(),
    createdBy: 'u-comms',
    location: poLoc,
    summary: 'City protest route South Bank → CBD → Valley via bridges/streets.',
    joinedUserIds: ['u-comms'],
    publicOrder: planPublicOrder([QLD.southBank, QLD.brisbaneCbd, QLD.parliamentHouse, QLD.fortitudeValley]),
  };

  const publicOrderOpposing: Incident = {
    id: 'seed-po-2',
    jobNumber: 'QPS-2026-01005',
    type: 'public_order',
    title: 'Public order — counter gathering',
    securityLevel: 'protected',
    status: 'open',
    createdAtIso: new Date(Date.now() - 35 * 60_000).toISOString(),
    createdBy: 'u-comms',
    location: QLD.cityHall,
    summary: 'Opposing group assembling near City Hall.',
    joinedUserIds: ['u-comms'],
    publicOrder: {
      ...planPublicOrder([QLD.cityHall, QLD.brisbaneCbd]),
      linkedOpposingIncidentId: 'seed-po-1',
    },
  };

  publicOrder.publicOrder = {
    ...publicOrder.publicOrder!,
    linkedOpposingIncidentId: 'seed-po-2',
  };

  const road: Incident = {
    id: 'seed-rb-1',
    jobNumber: 'QPS-2026-01006',
    type: 'road_block',
    title: 'Stolen vehicle — KP cliffs',
    securityLevel: 'unclassified',
    status: 'open',
    createdAtIso: new Date(Date.now() - 20 * 60_000).toISOString(),
    createdBy: 'u-gd1',
    location: rbLoc,
    summary: 'Silver Camry stolen from Kangaroo Point car park.',
    joinedUserIds: ['u-gd1', 'u-comms'],
    roadBlock: planRoadBlock({
      theftLocation: rbLoc,
      vehicleDetails: 'Silver Toyota Camry, QLD 123ABC',
      offenderInfo: 'Male, mid-20s',
      stolenAtIso: new Date(Date.now() - 25 * 60_000).toISOString(),
      availableResources: 6,
    }),
  };

  return [cordon, land, marine, publicOrder, publicOrderOpposing, road];
}
