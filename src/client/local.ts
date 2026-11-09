import { planCordon, type CordonPost } from "../engine/cordon.js";
import { planContainment } from "../engine/containment.js";
import type { PathWay, ParkArea, ProtectedSite, StreetLight } from "../engine/features.js";
import { planLandSearch, type LandInput } from "../engine/land.js";
import { planMarineSearch, type MarineEnvironment, type MarineInput } from "../engine/marine.js";
import { planPublicOrder } from "../engine/public_order.js";
import type { RoadWay } from "../engine/roads.js";
import type { LatLng } from "../engine/geo.js";

export type DeviceContext = {
  ways?: RoadWay[];
  paths?: PathWay[];
  parks?: ParkArea[];
  lights?: StreetLight[];
  sites?: ProtectedSite[];
  elevation?: LandInput["elevation"];
  environment?: MarineEnvironment;
};

export function runOnDevice(module: string, input: Record<string, unknown>, context: DeviceContext) {
  if (module === "cordon") {
    return planCordon({
      subject: input.subject as LatLng,
      structure: input.structure as "detached",
      risk: input.risk as "unknown",
      footprint: input.footprint as LatLng[] | undefined,
      escapeRadiusM: input.escapeRadiusM ? Number(input.escapeRadiusM) : undefined,
      lockedPosts: input.lockedPosts as CordonPost[] | undefined,
      ways: context.ways,
      paths: context.paths,
      parks: context.parks,
    });
  }
  if (module === "containment") {
    const plan = planContainment({
      polygon: input.polygon as LatLng[],
      ways: context.ways ?? [],
      coverage: undefined,
    });
    return {
      ...plan,
      minimumGuaranteed: false,
      narrative: [
        ...plan.narrative,
        "This was run on the device from roads already stored here. Treat the minimum set as unproved until the link can refresh the network.",
      ],
    };
  }
  if (module === "land_sar") {
    return planLandSearch({ ...(input as unknown as LandInput), ways: context.ways, elevation: context.elevation });
  }
  if (module === "marine_sar") {
    if (!context.environment) {
      throw new Error("Enter the wind, and the current if you have it. Conditions cannot be sampled while this device is on its own.");
    }
    return planMarineSearch(input as unknown as MarineInput, context.environment);
  }
  if (module === "public_order") {
    return planPublicOrder({
      start: input.start as LatLng | undefined,
      end: input.end as LatLng | undefined,
      drawn: input.drawn as LatLng[] | undefined,
      resources: input.resources as { serials?: number; traffic?: number; protection?: number; mobile?: number } | undefined,
      corridorM: input.corridorM ? Number(input.corridorM) : undefined,
      opposingAssembly: input.opposingAssembly as LatLng | undefined,
      ways: context.ways,
      paths: context.paths,
      sites: context.sites,
    });
  }
  throw new Error("That module is not available on the device.");
}
