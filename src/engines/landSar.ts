import type { LandSarInputs, LandSarPlan, LatLng, SearchZone } from '../domain/types';
import { assertLocalOnlyInference } from '../security/airGap';
import {
  BRISBANE_RIVER_WATER,
  clipCircleExcludingWater,
  destinationPoint,
  haversineM,
} from '../geo/qld';

function mobilitySpeedMps(mobility: LandSarInputs['mobility'], transport: LandSarInputs['transportMode']): number {
  const base =
    mobility === 'immobile' ? 0.05 : mobility === 'limited' ? 0.5 : mobility === 'high' ? 1.6 : 1.1;
  const mult =
    transport === 'bicycle' ? 2.2 : transport === 'vehicle' ? 8 : transport === 'unknown' ? 1.2 : 1;
  return base * mult;
}

function ageModifier(age: number): number {
  if (age < 5) return 0.45;
  if (age < 12) return 0.7;
  if (age > 75) return 0.55;
  if (age > 60) return 0.75;
  return 1;
}

function mentalModifier(state: string): number {
  const s = state.toLowerCase();
  if (/dementia|alzheimer|confused/.test(s)) return 0.65;
  if (/suicid|despond/.test(s)) return 0.85;
  if (/autism|asd/.test(s)) return 0.9;
  if (/intox|drug/.test(s)) return 0.7;
  return 1;
}

function preferredBearing(inputs: LandSarInputs): number {
  // Behavioural bias: familiar people tend toward known routes / downhill / toward activity.
  if (inputs.areaKnowledge === 'expert' || inputs.areaKnowledge === 'familiar') return 45; // NE toward valley/activity
  if (/suicid|despond/i.test(inputs.mentalState)) return 200; // toward water/isolation bias
  if (inputs.age < 12) return 90; // toward interesting/open spaces
  return 15;
}

export function planLandSar(inputs: LandSarInputs, now = new Date()): LandSarPlan {
  assertLocalOnlyInference('land_sar');

  const elapsedH = Math.max(
    0.1,
    (now.getTime() - new Date(inputs.timeLastSightedIso).getTime()) / 3_600_000,
  );
  const speed = mobilitySpeedMps(inputs.mobility, inputs.transportMode) * ageModifier(inputs.age) * mentalModifier(inputs.mentalState);
  const maxDistanceM = Math.min(25_000, speed * elapsedH * 3600);

  const bearing = preferredBearing(inputs);
  const pathSteps = 8;
  const likelyPath: LatLng[] = [inputs.lastKnown];
  for (let i = 1; i <= pathSteps; i++) {
    const wobble = ((i % 3) - 1) * 12;
    likelyPath.push(destinationPoint(inputs.lastKnown, bearing + wobble, (maxDistanceM * i) / pathSteps));
  }

  const high = clipCircleExcludingWater(inputs.lastKnown, maxDistanceM * 0.35, BRISBANE_RIVER_WATER);
  const med = clipCircleExcludingWater(inputs.lastKnown, maxDistanceM * 0.7, BRISBANE_RIVER_WATER);
  const low = clipCircleExcludingWater(inputs.lastKnown, maxDistanceM, BRISBANE_RIVER_WATER);

  const zones: SearchZone[] = [
    { id: 'high', label: 'High probability', probability: 'high', polygon: high.polygon },
    { id: 'medium', label: 'Medium probability', probability: 'medium', polygon: med.polygon },
    { id: 'max', label: 'Maximum reachable', probability: 'low', polygon: low.polygon },
  ];

  const clippedByWater = high.clippedByWater || med.clippedByWater || low.clippedByWater;
  const pathLen = haversineM(likelyPath[0], likelyPath[likelyPath.length - 1]);

  const briefing = [
    `MISSING PERSON BRIEFING — ${inputs.name || 'Unknown'}`,
    `Last known: ${inputs.lastKnown.lat.toFixed(5)}, ${inputs.lastKnown.lng.toFixed(5)}`,
    `Age ${inputs.age}; mental state: ${inputs.mentalState}; mobility: ${inputs.mobility}; transport: ${inputs.transportMode}; area knowledge: ${inputs.areaKnowledge}.`,
    `Time since last sighted: ~${elapsedH.toFixed(1)} h. Estimated max distance: ${(maxDistanceM / 1000).toFixed(2)} km.`,
    `Likely path of travel bearing ~${bearing.toFixed(0)}° (${(pathLen / 1000).toFixed(2)} km modelled).`,
    clippedByWater
      ? 'Search radii clipped against waterways (river/dam waterline) — no search over water.'
      : 'No water clipping applied for this LKP.',
    `Description: ${inputs.description}`,
    'Plan: task high-probability sector first; hold containment on max-distance ring; revisit medium after high clear.',
    'Likely state of mind inferred from inputs for field brief only — confirm with family/witnesses.',
  ].join('\n');

  return {
    inputs,
    likelyPath,
    maxDistanceM,
    zones,
    clippedByWater,
    briefing,
  };
}
