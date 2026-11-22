import type { LatLng, RoadBlockPlan } from '../domain/types';
import { assertLocalOnlyInference } from '../security/airGap';
import { destinationPoint } from '../geo/qld';

export interface RoadBlockInput {
  theftLocation: LatLng;
  vehicleDetails: string;
  offenderInfo: string;
  stolenAtIso: string;
  availableResources: number;
  juvenileSuspect?: boolean;
}

/**
 * Spike-box heuristic: box the theft area toward main-road / suburb exits
 * using desperate-offender psychology (low-resistance escape).
 */
export function planRoadBlock(input: RoadBlockInput, now = new Date()): RoadBlockPlan {
  assertLocalOnlyInference('road_block');

  const elapsedMin = Math.max(
    1,
    (now.getTime() - new Date(input.stolenAtIso).getTime()) / 60_000,
  );

  // Prefer arterial escape bearings; juveniles bias toward familiar residential exits.
  const primaryBearing = input.juvenileSuspect ? 110 : 35;
  const secondary = (primaryBearing + 180) % 360;
  const boxRadius = Math.min(4000, 600 + elapsedMin * 40);

  const n = destinationPoint(input.theftLocation, 0, boxRadius);
  const e = destinationPoint(input.theftLocation, 90, boxRadius);
  const s = destinationPoint(input.theftLocation, 180, boxRadius);
  const w = destinationPoint(input.theftLocation, 270, boxRadius);
  const boxedArea = [n, e, s, w, n];

  const spikeCount = Math.max(4, Math.min(8, input.availableResources || 4));
  const spikePoints: RoadBlockPlan['spikePoints'] = [];
  for (let i = 0; i < spikeCount; i++) {
    const bearing = primaryBearing + (i % 2 === 0 ? 0 : 40) + i * (360 / spikeCount);
    const pt = destinationPoint(input.theftLocation, bearing, boxRadius * 0.95);
    spikePoints.push({ ...pt, label: `Spike ${i + 1}` });
  }

  // Ensure exits on primary escape corridor are covered
  spikePoints.push({
    ...destinationPoint(input.theftLocation, primaryBearing, boxRadius),
    label: 'Primary exit sting',
  });
  spikePoints.push({
    ...destinationPoint(input.theftLocation, secondary, boxRadius * 0.85),
    label: 'Secondary exit sting',
  });

  const notes = [
    'Box intended so vehicle cannot leave without tires being stung.',
    input.juvenileSuspect
      ? 'Juvenile psychology: favour known residential / school corridors over freeways.'
      : 'Desperate adult offender: bias toward arterial roads and suburb/town exits.',
    `Elapsed since theft ~${elapsedMin.toFixed(0)} min — box radius ${(boxRadius / 1000).toFixed(1)} km.`,
  ];

  return {
    theftLocation: input.theftLocation,
    vehicleDetails: input.vehicleDetails,
    offenderInfo: input.offenderInfo,
    stolenAtIso: input.stolenAtIso,
    spikePoints,
    boxedArea,
    likelyEscapeDirection: `${primaryBearing.toFixed(0)}° (primary arterial / low-resistance)`,
    notes,
  };
}
