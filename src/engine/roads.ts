import type { LatLng } from "./geo.js";

export type RoadWay = {
  id: string;
  name: string;
  highway: string;
  points: LatLng[];
};

const DRIVEABLE = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "motorway_link",
  "trunk_link",
  "primary_link",
  "secondary_link",
  "tertiary_link",
  "service",
  "track",
]);

const SKIP_SERVICE = new Set(["driveway", "parking_aisle", "parking", "spur"]);

export function isDriveableHighway(highway: string, service?: string): boolean {
  if (!DRIVEABLE.has(highway)) return false;
  if (highway === "service" && service && SKIP_SERVICE.has(service)) return false;
  return true;
}

export function roadClassRank(highway: string): number {
  switch (highway) {
    case "motorway":
    case "motorway_link":
      return 6;
    case "trunk":
    case "trunk_link":
      return 5;
    case "primary":
    case "primary_link":
      return 4;
    case "secondary":
    case "secondary_link":
      return 3;
    case "tertiary":
    case "tertiary_link":
      return 2;
    case "unclassified":
    case "residential":
    case "living_street":
      return 1;
    default:
      return 0;
  }
}
