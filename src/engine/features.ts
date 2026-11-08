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

export type ProtectedSiteKind =
  | "government"
  | "school"
  | "police"
  | "bus_station"
  | "train_station"
  | "hospital"
  | "place_of_worship"
  | "other";

export type ProtectedSite = {
  id: string;
  name: string;
  kind: ProtectedSiteKind;
  position: LatLng;
};

export function siteFromTags(id: string, tags: Map<string, string>, position: LatLng): ProtectedSite | null {
  const name = (tags.get("name") || tags.get("ref") || "").slice(0, 80);
  const amenity = tags.get("amenity");
  const building = tags.get("building");
  const office = tags.get("office");
  const railway = tags.get("railway");
  const highway = tags.get("highway");
  const landuse = tags.get("landuse");

  if (amenity === "school" || amenity === "kindergarten" || amenity === "college" || amenity === "university") {
    return { id, name: name || "School", kind: "school", position };
  }
  if (amenity === "police") return { id, name: name || "Police station", kind: "police", position };
  if (amenity === "hospital" || amenity === "clinic") return { id, name: name || "Hospital", kind: "hospital", position };
  if (amenity === "place_of_worship") return { id, name: name || "Place of worship", kind: "place_of_worship", position };
  if (amenity === "bus_station" || highway === "bus_station") {
    return { id, name: name || "Bus station", kind: "bus_station", position };
  }
  if (railway === "station" || railway === "halt" || publicTransportStation(tags)) {
    return { id, name: name || "Train / transit station", kind: "train_station", position };
  }
  if (
    amenity === "townhall" ||
    office === "government" ||
    building === "government" ||
    building === "civic" ||
    landuse === "military"
  ) {
    return { id, name: name || "Government / civic", kind: "government", position };
  }
  return null;
}

function publicTransportStation(tags: Map<string, string>) {
  return tags.get("public_transport") === "station" || tags.get("public_transport") === "stop_area";
}

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
