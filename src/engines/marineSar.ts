import type { LatLng, MarineSarInputs, MarineSarPlan } from '../domain/types';
import { assertLocalOnlyInference } from '../security/airGap';
import { destinationPoint } from '../geo/qld';

const FUDGE = 0.05;

function knToMps(kn: number): number {
  return kn * 0.514444;
}

export function planMarineSar(inputs: MarineSarInputs, now = new Date()): MarineSarPlan {
  assertLocalOnlyInference('marine_sar');

  const elapsedH = Math.max(
    0.05,
    (now.getTime() - new Date(inputs.missingSinceIso).getTime()) / 3_600_000,
  );

  // Vector sum of wind (leeway fraction) + current; add 5% fudge on distance.
  const leewayFraction = /sail/i.test(inputs.vesselType) ? 0.08 : 0.03;
  const windDriftMps = knToMps(inputs.windSpeedKt) * leewayFraction;
  const currentMps = knToMps(inputs.currentSpeedKt);

  const wx = windDriftMps * Math.sin((inputs.windDirDeg * Math.PI) / 180);
  const wy = windDriftMps * Math.cos((inputs.windDirDeg * Math.PI) / 180);
  const cx = currentMps * Math.sin((inputs.currentDirDeg * Math.PI) / 180);
  const cy = currentMps * Math.cos((inputs.currentDirDeg * Math.PI) / 180);
  const vx = wx + cx;
  const vy = wy + cy;
  const speedMps = Math.hypot(vx, vy);
  const bearing = ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360;
  const nominalDist = speedMps * elapsedH * 3600;
  const distWithFudge = nominalDist * (1 + FUDGE);

  const driftCentre = destinationPoint(inputs.lastKnown, bearing, distWithFudge);
  const searchRadiusM = Math.max(400, distWithFudge * 0.35 + 200 * Math.sqrt(elapsedH));

  const driftLine: LatLng[] = [inputs.lastKnown];
  for (let i = 1; i <= 6; i++) {
    driftLine.push(destinationPoint(inputs.lastKnown, bearing, (distWithFudge * i) / 6));
  }

  // Expanding square-ish grid around drift centre
  const grid: LatLng[][] = [];
  const cell = searchRadiusM / 3;
  for (let r = -2; r <= 2; r++) {
    const row: LatLng[] = [];
    for (let c = -2; c <= 2; c++) {
      const north = destinationPoint(driftCentre, 0, r * cell);
      row.push(destinationPoint(north, 90, c * cell));
    }
    grid.push(row);
  }

  const briefing = [
    `MARINE SAR BRIEFING — ${inputs.vesselName} (${inputs.rego})`,
    `Vessel: ${inputs.vesselType}, ${inputs.vesselSizeM} m, POB ${inputs.pob}.`,
    `Emergency equipment: ${inputs.emergencyEquipment.join(', ') || 'nil advised'}.`,
    `LKP: ${inputs.lastKnown.lat.toFixed(5)}, ${inputs.lastKnown.lng.toFixed(5)}. Missing ~${elapsedH.toFixed(1)} h.`,
    `Drift model: wind ${inputs.windSpeedKt} kt @ ${inputs.windDirDeg}°, current ${inputs.currentSpeedKt} kt @ ${inputs.currentDirDeg}°.`,
    `Centre of search: ${driftCentre.lat.toFixed(5)}, ${driftCentre.lng.toFixed(5)}; radius ${(searchRadiusM / 1000).toFixed(2)} km (includes ${FUDGE * 100}% fudge).`,
    'Plan: fly/search expanding square from drift centre; task vessels along drift line; update with latest weather.',
  ].join('\n');

  return {
    inputs,
    driftCentre,
    searchRadiusM,
    driftLine,
    grid,
    fudgeFactor: FUDGE,
    briefing,
  };
}
