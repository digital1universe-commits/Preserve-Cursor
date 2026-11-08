import { planCordon, type CordonPost } from "../engine/cordon.js";
import { planContainment } from "../engine/containment.js";
import type { PathWay, ParkArea, StreetLight } from "../engine/features.js";
import { planLandSearch, type LandInput } from "../engine/land.js";
import { planMarineSearch, type MarineEnvironment, type MarineInput } from "../engine/marine.js";
import type { RoadWay } from "../engine/roads.js";
import type { LatLng } from "../engine/geo.js";

export type DeviceContext = {
  ways?: RoadWay[];
  paths?: PathWay[];
  parks?: ParkArea[];
  lights?: StreetLight[];
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
  throw new Error("That module is not available on the device.");
}
