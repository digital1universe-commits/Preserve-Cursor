import type { CordonPlan, LatLng, ResourceAllocation } from '../domain/types';
import { assertLocalOnlyInference } from '../security/airGap';
import { destinationPoint } from '../geo/qld';

export type CordonIncidentKind = 'break_and_enter' | 'siege' | 'generic';

export interface CordonInput {
  centre: LatLng;
  kind: CordonIncidentKind;
  available: Array<{ type: string; callSign: string }>;
}

/**
 * Local QPS-style cordon placement heuristic.
 * Example methodology: GD on middle/outer; TCS + dog squad on inner for B&E / siege.
 */
export function planCordon(input: CordonInput): CordonPlan {
  assertLocalOnlyInference('cordon');

  const radii =
    input.kind === 'siege'
      ? { inner: 40, middle: 120, outer: 250 }
      : input.kind === 'break_and_enter'
        ? { inner: 30, middle: 90, outer: 180 }
        : { inner: 50, middle: 150, outer: 300 };

  const notes: string[] = [
    'Inner cordon: contain immediate threat / preserve scene.',
    'Middle cordon: control access and witness management.',
    'Outer cordon: traffic diversion and public exclusion.',
  ];

  if (input.kind === 'break_and_enter' || input.kind === 'siege') {
    notes.push('Priority: TCS and Dog Squad on inner; General Duties on middle/outer.');
  }

  const buckets = {
    inner: [] as Array<{ type: string; callSign: string }>,
    middle: [] as Array<{ type: string; callSign: string }>,
    outer: [] as Array<{ type: string; callSign: string }>,
  };

  const priorityInner = (t: string) =>
    /tcs|dog|sert|negotiat/i.test(t) ? 0 : /supervisor|commander/i.test(t) ? 1 : 2;

  const sorted = [...input.available].sort((a, b) => priorityInner(a.type) - priorityInner(b.type));

  for (const unit of sorted) {
    if (/tcs|dog|sert/i.test(unit.type) && buckets.inner.length < 4) {
      buckets.inner.push(unit);
    } else if (/gd|general|patrol|car/i.test(unit.type)) {
      if (buckets.middle.length <= buckets.outer.length) buckets.middle.push(unit);
      else buckets.outer.push(unit);
    } else if (buckets.inner.length < 2) {
      buckets.inner.push(unit);
    } else if (buckets.middle.length <= buckets.outer.length) {
      buckets.middle.push(unit);
    } else {
      buckets.outer.push(unit);
    }
  }

  const placeRing = (
    ring: 'inner' | 'middle' | 'outer',
    radius: number,
    units: Array<{ type: string; callSign: string }>,
  ): ResourceAllocation[] => {
    if (units.length === 0) return [];
    return units.map((u, i) => {
      const bearing = (360 * i) / units.length;
      return {
        id: `${ring}-${u.callSign}`,
        type: u.type,
        callSign: u.callSign,
        cordonRing: ring,
        position: destinationPoint(input.centre, bearing, radius),
      };
    });
  };

  const resources = [
    ...placeRing('inner', radii.inner, buckets.inner),
    ...placeRing('middle', radii.middle, buckets.middle),
    ...placeRing('outer', radii.outer, buckets.outer),
  ];

  return {
    centre: input.centre,
    innerRadiusM: radii.inner,
    middleRadiusM: radii.middle,
    outerRadiusM: radii.outer,
    resources,
    methodologyNotes: notes,
  };
}
