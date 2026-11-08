import type { LatLng } from "./geo.js";

export type PathWay = {
  id: string;
  name: string;
  kind: "footway" | "path" | "steps" | "pedestrian" | "cycleway" | "alley" | "bridleway" | "other";
  points: LatLng[];
};

export type ParkArea = {
  id: string;
  name: string;
  points: LatLng[];
};

export type StreetLight = {
  id: string;
  position: LatLng;
  source: "osm" | "agency";
};

const PATH_KINDS = new Set(["footway", "path", "steps", "pedestrian", "cycleway", "bridleway"]);

export function pathKind(highway: string, service?: string): PathWay["kind"] | null {
  if (highway === "service" && service === "alley") return "alley";
  if (PATH_KINDS.has(highway)) return highway as PathWay["kind"];
  return null;
}

export function isParkTag(tags: Map<string, string>): boolean {
  const leisure = tags.get("leisure");
  const landuse = tags.get("landuse");
  return leisure === "park" || leisure === "playground" || leisure === "garden" || landuse === "recreation_ground" || landuse === "grass";
}
