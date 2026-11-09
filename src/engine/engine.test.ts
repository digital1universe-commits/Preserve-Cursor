import assert from "node:assert/strict";
import test from "node:test";
import { planContainment } from "./containment.js";
import { planCordon } from "./cordon.js";
import type { PathWay, ProtectedSite } from "./features.js";
import { bboxOf, destination, expandBBox, haversineM, pointInPolygon } from "./geo.js";
import { planLandSearch } from "./land.js";
import { planMarineSearch } from "./marine.js";
import { undirectedMinCut } from "./mincut.js";
import { planPublicOrder } from "./public_order.js";
import type { RoadWay } from "./roads.js";

test("minimum cut seals the shared edge, not every upstream road", () => {
  const edges = [
    { u: 0, v: 1, cap: 1e9 },
    { u: 0, v: 2, cap: 1e9 },
    { u: 1, v: 3, cap: 1 },
    { u: 2, v: 3, cap: 1 },
    { u: 3, v: 4, cap: 1 },
    { u: 4, v: 5, cap: 1e9 },
  ];
  const cut = undirectedMinCut(6, edges, 0, 5);
  assert.equal(Math.round(cut.flow), 1);
  assert.deepEqual(cut.cut, [4]);
});

test("minimum cut keeps two independent exits", () => {
  const edges = [
    { u: 0, v: 1, cap: 1e9 },
    { u: 0, v: 2, cap: 1e9 },
    { u: 1, v: 3, cap: 1 },
    { u: 2, v: 4, cap: 1 },
    { u: 3, v: 5, cap: 1e9 },
    { u: 4, v: 5, cap: 1e9 },
  ];
  const cut = undirectedMinCut(6, edges, 0, 5);
  assert.equal(Math.round(cut.flow), 2);
  assert.equal(cut.cut.length, 2);
});

test("containment reduces three merging exits to one site and keeps a separate road", () => {
  const center = { lat: -36.85, lng: 174.8 };
  const north = destination(center, 0, 250);
  const south = destination(center, 180, 250);
  const nw = destination(north, 270, 250);
  const ne = destination(north, 90, 250);
  const se = destination(south, 90, 250);
  const sw = destination(south, 270, 250);
  const polygon = [nw, ne, se, sw];
  const coverage = expandBBox(bboxOf(polygon), 1200);
  const junction = destination(center, 0, 700);
  const portalNorth = { lat: coverage.north - 20 / 111320, lng: center.lng };
  const portalEast = { lat: center.lat, lng: coverage.east - 20 / (111320 * Math.cos((-36.85 * Math.PI) / 180)) };
  const ways: RoadWay[] = [
    { id: "a", name: "Lane A", highway: "residential", points: [destination(center, 320, 80), junction] },
    { id: "b", name: "Lane B", highway: "residential", points: [center, junction] },
    { id: "c", name: "Lane C", highway: "residential", points: [destination(center, 40, 80), junction] },
    { id: "m", name: "Main Road", highway: "primary", points: [junction, portalNorth] },
    { id: "e", name: "Coast Road", highway: "secondary", points: [destination(center, 90, 40), portalEast] },
  ];

  const plan = planContainment({ polygon, ways, coverage });
  assert.equal(plan.status, "sealed");
  assert.equal(plan.minimumGuaranteed, true);
  assert.equal(plan.closureCount, 2);
  assert.ok(plan.exitCorridors >= 4);
  assert.ok(plan.closures.some((site) => site.roadName === "Main Road"));
  assert.ok(plan.closures.some((site) => site.roadName === "Coast Road"));
  const main = plan.closures.find((site) => site.roadName === "Main Road");
  assert.ok(main && main.seals >= 3);
});

test("a point in a square is classified correctly", () => {
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 },
  ];
  assert.equal(pointInPolygon({ lat: 0.5, lng: 0.5 }, square), true);
  assert.equal(pointInPolygon({ lat: 1.5, lng: 0.5 }, square), false);
});

test("cordon surrounds four faces, seals escape, and does not invent an approach", () => {
  const subject = { lat: -36.85, lng: 174.8 };
  const plan = planCordon({
    subject,
    structure: "detached",
    risk: "firearm",
  });
  assert.ok(plan.standoffM >= 90);
  assert.ok(plan.escapeRadiusM >= 650);
  assert.equal(plan.posts.filter((post) => post.kind === "scene").length, 4);
  assert.ok(plan.posts.some((post) => post.kind === "rvp"));
  assert.match(plan.riskNote, /does not describe an approach/i);

  const locked = plan.posts.find((post) => post.id === "SC-1")!;
  const again = planCordon({
    subject,
    structure: "detached",
    risk: "firearm",
    lockedPosts: [{ ...locked, position: destination(subject, 10, 120), locked: true }],
  });
  const kept = again.posts.find((post) => post.id === "SC-1");
  assert.ok(kept?.locked);
  assert.ok(haversineM(kept!.position, destination(subject, 10, 120)) < 1);
});

test("land search shrinks with time and mobility and leans downhill", () => {
  const lkp = { lat: -36.9, lng: 174.7 };
  const child = planLandSearch({
    category: "child_1_3",
    mentalState: "calm",
    areaKnowledge: "none",
    mobility: "limited",
    terrain: "suburban",
    conditions: "clear",
    hoursMissing: 0.4,
    lkp,
    features: { roads: true, water: true, coastline: false, trails: false },
  });
  const hiker = planLandSearch({
    category: "hiker",
    mentalState: "calm",
    areaKnowledge: "local",
    mobility: "fit",
    terrain: "rural",
    conditions: "clear",
    hoursMissing: 8,
    lkp,
    features: { roads: true, water: false, coastline: false, trails: true },
    intendedBearing: 40,
  });
  assert.ok(child.radius95M < hiker.radius95M);
  assert.ok(child.radius95M < 900);

  const sloped = planLandSearch({
    category: "dementia",
    mentalState: "confused",
    areaKnowledge: "none",
    mobility: "average",
    terrain: "rural",
    conditions: "clear",
    hoursMissing: 4,
    lkp,
    downslopeBearing: 90,
    features: { roads: true, water: false, coastline: false, trails: false },
  });
  let east = 0;
  let west = 0;
  for (const cell of sloped.cells) {
    if (cell.lng >= lkp.lng) east += cell.w;
    else west += cell.w;
  }
  assert.ok(east > west * 1.15, `expected downhill mass, east ${east} west ${west}`);
  assert.match(sloped.narrative.join(" "), /least resistance/i);
});

test("marine datum moves downwind and then with the current", () => {
  const lkp = { lat: -36.7, lng: 174.9 };
  const downwind = planMarineSearch(
    { lkp, hoursMissing: 6, vessel: "cabin_cruiser", lengthM: 12, positionErrorNm: 0.25 },
    { windSpeedKn: 20, windFromDeg: 0, currentSpeedKn: 0, currentTowardDeg: 0, source: "manual" },
  );
  assert.ok(downwind.datum.lat < lkp.lat);
  assert.ok(Math.abs(downwind.datum.lng - lkp.lng) < 0.02);

  const withCurrent = planMarineSearch(
    { lkp, hoursMissing: 6, vessel: "cabin_cruiser", lengthM: 12, positionErrorNm: 0.25 },
    { windSpeedKn: 20, windFromDeg: 0, currentSpeedKn: 1.5, currentTowardDeg: 90, source: "manual" },
  );
  assert.ok(withCurrent.datum.lng > downwind.datum.lng);
  assert.ok(withCurrent.areaNm2 > 0.5);
  assert.ok(withCurrent.ellipse.length > 20);

  const calm = planMarineSearch(
    { lkp, hoursMissing: 2, vessel: "unknown", positionErrorNm: 0.3 },
    { windSpeedKn: 0, windFromDeg: 180, currentSpeedKn: 0, currentTowardDeg: 0, source: "manual" },
  );
  assert.ok(haversineM(lkp, calm.datum) < 50);
});

test("public order snaps a foot route and places side blocks and site protection", () => {
  const start = { lat: -36.84, lng: 174.79 };
  const mid = destination(start, 90, 400);
  const end = destination(mid, 0, 350);
  const spur = destination(mid, 180, 180);
  const ways: RoadWay[] = [
    { id: "1", name: "Main Street", highway: "residential", points: [start, mid, end] },
    { id: "2", name: "Side Lane", highway: "residential", points: [mid, spur] },
  ];
  const paths: PathWay[] = [
    {
      id: "p1",
      name: "Arcade",
      kind: "pedestrian",
      points: [destination(start, 45, 40), destination(mid, 225, 40)],
    },
  ];
  const sites: ProtectedSite[] = [
    { id: "s1", name: "Civic centre", kind: "government", position: destination(mid, 45, 60) },
    { id: "s2", name: "Primary school", kind: "school", position: destination(end, 270, 50) },
  ];
  const plan = planPublicOrder({
    start,
    end,
    ways,
    paths,
    sites,
    resources: { serials: 10, traffic: 4, protection: 4, mobile: 2 },
  });
  assert.equal(plan.model, "preserve-public-order-v1");
  assert.ok(plan.route.length >= 2);
  assert.ok(plan.routeLengthM > 500);
  assert.ok(plan.posts.some((post) => post.kind === "assembly"));
  assert.ok(plan.posts.some((post) => post.kind === "dispersal"));
  assert.ok(plan.posts.some((post) => post.kind === "side_block"));
  assert.ok(plan.posts.some((post) => post.kind === "protect"));
  assert.ok(plan.protectedNearRoute.length >= 1);

  const drawn = planPublicOrder({
    drawn: [start, destination(start, 70, 150), mid, end],
    ways,
    paths,
    sites,
  });
  assert.equal(drawn.mode, "drawn");
  assert.ok(drawn.snapped);
  assert.ok(drawn.route.length >= 2);
});
