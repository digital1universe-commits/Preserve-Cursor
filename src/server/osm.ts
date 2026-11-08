import type { PathWay, ParkArea, ProtectedSite, StreetLight } from "../engine/features.js";
import { isParkTag, pathKind, siteFromTags } from "../engine/features.js";
import type { BBox, LatLng } from "../engine/geo.js";
import { isDriveableHighway, type RoadWay } from "../engine/roads.js";
import { InputError } from "../engine/validate.js";
import { egressGet } from "./egress.js";

const TILE = 0.009;

export type OsmBundle = {
  ways: RoadWay[];
  paths: PathWay[];
  parks: ParkArea[];
  lights: StreetLight[];
  sites: ProtectedSite[];
};

export function parseOsmBundle(xml: string): OsmBundle {
  const nodes = new Map<string, LatLng>();
  const nodeTags = new Map<string, Map<string, string>>();
  const nodeRe = /<node id="(\d+)"([\s\S]*?)\/>/g;
  let nodeMatch: RegExpExecArray | null;
  while ((nodeMatch = nodeRe.exec(xml))) {
    const head = nodeMatch[0];
    const lat = /lat="(-?\d+(?:\.\d+)?)"/.exec(head);
    const lon = /lon="(-?\d+(?:\.\d+)?)"/.exec(head);
    if (!lat || !lon) continue;
    const id = nodeMatch[1];
    nodes.set(id, { lat: Number(lat[1]), lng: Number(lon[1]) });
    const tags = readTags(head);
    if (tags.size) nodeTags.set(id, tags);
  }

  // Nodes with nested tags (rare in OSM API map responses but possible).
  const nodeBlockRe = /<node id="(\d+)"([\s\S]*?)<\/node>/g;
  while ((nodeMatch = nodeBlockRe.exec(xml))) {
    const id = nodeMatch[1];
    const head = nodeMatch[0];
    const lat = /lat="(-?\d+(?:\.\d+)?)"/.exec(head);
    const lon = /lon="(-?\d+(?:\.\d+)?)"/.exec(head);
    if (lat && lon) nodes.set(id, { lat: Number(lat[1]), lng: Number(lon[1]) });
    nodeTags.set(id, readTags(head));
  }

  const ways: RoadWay[] = [];
  const paths: PathWay[] = [];
  const parks: ParkArea[] = [];
  const lights: StreetLight[] = [];
  const sites: ProtectedSite[] = [];

  for (const [id, tags] of nodeTags) {
    const position = nodes.get(id);
    if (!position) continue;
    if (tags.get("highway") === "street_lamp" || tags.get("amenity") === "street_lamp") {
      lights.push({ id: `n${id}`, position, source: "osm" });
    }
    const site = siteFromTags(`n${id}`, tags, position);
    if (site) sites.push(site);
  }

  const wayRe = /<way id="(\d+)"[\s\S]*?<\/way>/g;
  let wayMatch: RegExpExecArray | null;
  while ((wayMatch = wayRe.exec(xml))) {
    const body = wayMatch[0];
    const id = wayMatch[1];
    const tags = readTags(body);
    const points = wayPoints(body, nodes);
    if (points.length < 2) continue;
    const highway = tags.get("highway");
    const name = (tags.get("name") || tags.get("ref") || "Unnamed").slice(0, 80);

    if (highway && isDriveableHighway(highway, tags.get("service"))) {
      if (tags.get("motor_vehicle") !== "no" && tags.get("access") !== "no") {
        ways.push({ id, name: name === "Unnamed" ? "Unnamed road" : name, highway, points });
      }
    }

    const kind = highway ? pathKind(highway, tags.get("service")) : null;
    if (kind) {
      paths.push({
        id,
        name: name === "Unnamed" ? `Unnamed ${kind}` : name,
        kind,
        points,
      });
    }

    if (isParkTag(tags) && points.length >= 3) {
      parks.push({
        id,
        name: name === "Unnamed" ? "Park / open ground" : name,
        points,
      });
    }

    if (points.length) {
      const mid = points[Math.floor(points.length / 2)];
      const site = siteFromTags(`w${id}`, tags, mid);
      if (site) sites.push(site);
    }
  }

  return { ways, paths, parks, lights, sites };
}

export function parseOsmHighways(xml: string): RoadWay[] {
  return parseOsmBundle(xml).ways;
}

export async function fetchOsmBundle(box: BBox): Promise<OsmBundle> {
  const tiles = tileBox(box, TILE);
  if (tiles.length > 9) {
    throw new InputError(
      "That area is too wide to load in one pass. Draw a smaller sector — about two kilometres across — and seal the rest beside it.",
    );
  }
  const ways = new Map<string, RoadWay>();
  const paths = new Map<string, PathWay>();
  const parks = new Map<string, ParkArea>();
  const lights = new Map<string, StreetLight>();
  const sites = new Map<string, ProtectedSite>();
  for (const tile of tiles) {
    const query = `/api/0.6/map?bbox=${tile.west},${tile.south},${tile.east},${tile.north}`;
    const xml = await egressGet("api.openstreetmap.org", query);
    const bundle = parseOsmBundle(xml);
    for (const way of bundle.ways) {
      const existing = ways.get(way.id);
      if (!existing || way.points.length > existing.points.length) ways.set(way.id, way);
    }
    for (const path of bundle.paths) {
      const existing = paths.get(path.id);
      if (!existing || path.points.length > existing.points.length) paths.set(path.id, path);
    }
    for (const park of bundle.parks) parks.set(park.id, park);
    for (const light of bundle.lights) lights.set(light.id, light);
    for (const site of bundle.sites) sites.set(site.id, site);
  }
  return {
    ways: [...ways.values()],
    paths: [...paths.values()],
    parks: [...parks.values()],
    lights: [...lights.values()],
    sites: [...sites.values()],
  };
}

export async function fetchHighways(box: BBox): Promise<RoadWay[]> {
  return (await fetchOsmBundle(box)).ways;
}

function readTags(body: string): Map<string, string> {
  const tags = new Map<string, string>();
  const tagRe = /<tag k="([^"]+)" v="([^"]*)"\/>/g;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRe.exec(body))) tags.set(tagMatch[1], decodeXml(tagMatch[2]));
  return tags;
}

function wayPoints(body: string, nodes: Map<string, LatLng>): LatLng[] {
  const points: LatLng[] = [];
  const ndRe = /<nd ref="(\d+)"\/>/g;
  let ndMatch: RegExpExecArray | null;
  while ((ndMatch = ndRe.exec(body))) {
    const point = nodes.get(ndMatch[1]);
    if (point) points.push(point);
  }
  return points;
}

function tileBox(box: BBox, step: number): BBox[] {
  const tiles: BBox[] = [];
  for (let south = box.south; south < box.north - 1e-8; south += step) {
    for (let west = box.west; west < box.east - 1e-8; west += step) {
      tiles.push({
        south,
        west,
        north: Math.min(box.north, south + step),
        east: Math.min(box.east, west + step),
      });
    }
  }
  return tiles.length ? tiles : [box];
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
