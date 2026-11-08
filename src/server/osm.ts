import type { BBox, LatLng } from "../engine/geo.js";
import { isDriveableHighway, type RoadWay } from "../engine/roads.js";
import { InputError } from "../engine/validate.js";
import { egressGet } from "./egress.js";

const TILE = 0.009;

export function parseOsmHighways(xml: string): RoadWay[] {
  const nodes = new Map<string, LatLng>();
  const nodeRe = /<node id="(\d+)"[^>]*?\slat="(-?\d+(?:\.\d+)?)"\slon="(-?\d+(?:\.\d+)?)"/g;
  let nodeMatch: RegExpExecArray | null;
  while ((nodeMatch = nodeRe.exec(xml))) {
    nodes.set(nodeMatch[1], { lat: Number(nodeMatch[2]), lng: Number(nodeMatch[3]) });
  }

  const ways: RoadWay[] = [];
  const wayRe = /<way id="(\d+)"[\s\S]*?<\/way>/g;
  let wayMatch: RegExpExecArray | null;
  while ((wayMatch = wayRe.exec(xml))) {
    const body = wayMatch[0];
    const tags = new Map<string, string>();
    const tagRe = /<tag k="([^"]+)" v="([^"]*)"\/>/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRe.exec(body))) tags.set(tagMatch[1], decodeXml(tagMatch[2]));
    const highway = tags.get("highway");
    if (!highway || !isDriveableHighway(highway, tags.get("service"))) continue;
    if (tags.get("motor_vehicle") === "no" || tags.get("access") === "no") continue;
    const points: LatLng[] = [];
    const ndRe = /<nd ref="(\d+)"\/>/g;
    let ndMatch: RegExpExecArray | null;
    while ((ndMatch = ndRe.exec(body))) {
      const point = nodes.get(ndMatch[1]);
      if (point) points.push(point);
    }
    if (points.length < 2) continue;
    ways.push({
      id: wayMatch[1],
      name: (tags.get("name") || tags.get("ref") || "Unnamed road").slice(0, 80),
      highway,
      points,
    });
  }
  return ways;
}

export async function fetchHighways(box: BBox): Promise<RoadWay[]> {
  const tiles = tileBox(box, TILE);
  if (tiles.length > 9) {
    throw new InputError(
      "That area is too wide to load in one pass. Draw a smaller sector — about two kilometres across — and seal the rest beside it.",
    );
  }
  const byId = new Map<string, RoadWay>();
  for (const tile of tiles) {
    const query = `/api/0.6/map?bbox=${tile.west},${tile.south},${tile.east},${tile.north}`;
    const xml = await egressGet("api.openstreetmap.org", query);
    for (const way of parseOsmHighways(xml)) {
      const existing = byId.get(way.id);
      if (!existing || way.points.length > existing.points.length) byId.set(way.id, way);
    }
  }
  return [...byId.values()];
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
