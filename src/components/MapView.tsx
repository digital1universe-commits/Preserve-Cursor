import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Incident, LatLng, StructureSide } from '../domain/types';
import { STRUCTURE_SIDE_COLOURS } from '../domain/types';
import { circlePolygon, QLD } from '../geo/qld';
import { mapStyleUrl, OMT_SOURCE } from '../map/styles';
import { visibleTracks } from '../tracking/visibility';
import { usePreserveStore } from '../store/preserveStore';
import { DEMO_USERS } from '../auth/roles';
import { getStreetLightSourceMeta } from '../data/streetLights';

type GjFeature = {
  type: 'Feature';
  properties: Record<string, string | number | boolean>;
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Polygon'; coordinates: [number, number][][] };
};

function lineFeature(coords: LatLng[]): GjFeature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: coords.map((c) => [c.lng, c.lat] as [number, number]) },
  };
}

function polyFeature(coords: LatLng[], props: Record<string, string | number> = {}): GjFeature {
  const ring = coords.map((c) => [c.lng, c.lat] as [number, number]);
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0]);
  }
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } };
}

function pointFeature(p: LatLng, props: Record<string, string | number | boolean> = {}): GjFeature {
  return { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } };
}

function buildOverlay(incident: Incident | null) {
  const lines: GjFeature[] = [];
  const polys: GjFeature[] = [];
  const points: GjFeature[] = [];
  if (!incident) return { lines, polys, points };
  points.push(pointFeature(incident.location, { label: incident.jobNumber, kind: 'lkp' }));
  if (incident.cordon) {
    const c = incident.cordon;
    polys.push(polyFeature(circlePolygon(c.centre, c.innerRadiusM), { ring: 'inner' }));
    polys.push(polyFeature(circlePolygon(c.centre, c.middleRadiusM), { ring: 'middle' }));
    polys.push(polyFeature(circlePolygon(c.centre, c.outerRadiusM), { ring: 'outer' }));
    for (const r of c.resources) {
      if (r.position) points.push(pointFeature(r.position, { label: `${r.callSign}`, kind: 'resource' }));
    }
  }
  if (incident.landSar) {
    lines.push(lineFeature(incident.landSar.likelyPath));
    for (const z of incident.landSar.zones) polys.push(polyFeature(z.polygon, { ring: z.probability, label: z.label }));
  }
  if (incident.marineSar) {
    lines.push(lineFeature(incident.marineSar.driftLine));
    polys.push(polyFeature(circlePolygon(incident.marineSar.driftCentre, incident.marineSar.searchRadiusM), { ring: 'search' }));
    points.push(pointFeature(incident.marineSar.driftCentre, { label: 'Drift centre', kind: 'drift' }));
    for (const row of incident.marineSar.grid) lines.push(lineFeature(row));
  }
  if (incident.publicOrder) {
    lines.push(lineFeature(incident.publicOrder.route));
    for (const p of incident.publicOrder.policePositions) points.push(pointFeature(p, { label: p.label, kind: 'po' }));
    for (const s of incident.publicOrder.criticalSites) points.push(pointFeature(s, { label: s.name, kind: 'critical' }));
  }
  if (incident.roadBlock) {
    polys.push(polyFeature(incident.roadBlock.boxedArea, { ring: 'box' }));
    for (const s of incident.roadBlock.spikePoints) points.push(pointFeature(s, { label: s.label, kind: 'spike' }));
  }
  return { lines, polys, points };
}

function setData(map: MapLibreMap, id: string, features: GjFeature[]) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
}

export function ensureNightBuildings(map: MapLibreMap, dark: boolean) {
  if (!map.getSource(OMT_SOURCE)) return;
  if (map.getLayer('preserve-3d-buildings')) {
    map.setPaintProperty('preserve-3d-buildings', 'fill-extrusion-color', dark ? '#1a2433' : '#c4ccd4');
    map.setPaintProperty('preserve-3d-buildings', 'fill-extrusion-opacity', dark ? 0.9 : 0.65);
    return;
  }
  try {
    map.addLayer({
      id: 'preserve-3d-buildings',
      source: OMT_SOURCE,
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': dark ? '#1a2433' : '#c4ccd4',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['coalesce', ['get', 'render_height'], ['get', 'height'], 12]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': dark ? 0.9 : 0.65,
      },
    });
  } catch { /* building layer unavailable */ }
}

export function ensureOverlayLayers(map: MapLibreMap) {
  const empty = { type: 'FeatureCollection' as const, features: [] as GjFeature[] };
  const src = (id: string) => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: empty }); };
  for (const id of ['preserve-polys', 'preserve-lines', 'preserve-points', 'preserve-labels', 'preserve-lights', 'preserve-structures', 'preserve-markings']) src(id);
  const add = (layer: maplibregl.AddLayerObject) => { if (!map.getLayer(layer.id)) map.addLayer(layer); };

  add({ id: 'preserve-polys', type: 'fill', source: 'preserve-polys', paint: {
    'fill-color': ['match', ['get', 'ring'], 'inner', '#d64545', 'middle', '#e6b422', 'outer', '#3db8c5', 'high', '#d64545', 'medium', '#e6b422', 'low', '#3db8c5', 'search', '#3d9a6a', 'box', '#8e24aa', '#3db8c5'],
    'fill-opacity': 0.2,
  }} as maplibregl.AddLayerObject);
  add({ id: 'preserve-lines', type: 'line', source: 'preserve-lines', paint: { 'line-color': '#e6b422', 'line-width': 3.5, 'line-opacity': 0.95 }} as maplibregl.AddLayerObject);
  add({ id: 'preserve-lights', type: 'circle', source: 'preserve-lights', paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'type'], 'high_mast', 2.2, 1.4], 14, ['match', ['get', 'type'], 'high_mast', 5.5, 3.5], 16, ['match', ['get', 'type'], 'high_mast', 9, 6]],
    'circle-color': '#ffe082', 'circle-opacity': 0.85, 'circle-blur': 0.35,
  }} as maplibregl.AddLayerObject);
  add({ id: 'preserve-points', type: 'circle', source: 'preserve-points', paint: {
    'circle-radius': 6,
    'circle-color': ['match', ['get', 'kind'], 'spike', '#d64545', 'resource', '#e6b422', 'sert', '#111111', 'critical', '#3d9a6a', '#dce6ef'],
    'circle-stroke-width': 1.5, 'circle-stroke-color': '#05080c',
  }} as maplibregl.AddLayerObject);
  add({ id: 'preserve-labels', type: 'symbol', source: 'preserve-labels', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.15] },
    paint: { 'text-color': '#dce6ef', 'text-halo-color': '#05080c', 'text-halo-width': 1.2 }} as maplibregl.AddLayerObject);
  add({ id: 'preserve-structures', type: 'circle', source: 'preserve-structures', paint: {
    'circle-radius': 8, 'circle-color': ['get', 'colour'], 'circle-stroke-width': 2, 'circle-stroke-color': '#dce6ef',
  }} as maplibregl.AddLayerObject);
  add({ id: 'preserve-markings', type: 'circle', source: 'preserve-markings', paint: { 'circle-radius': 5, 'circle-color': '#3db8c5' }} as maplibregl.AddLayerObject);
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const lastFly = useRef<string | null>(null);
  const incidents = usePreserveStore((s) => s.incidents);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  const mapPitch3d = usePreserveStore((s) => s.mapPitch3d);
  const mapDarkMode = usePreserveStore((s) => s.mapDarkMode);
  const showStreetLights = usePreserveStore((s) => s.showStreetLights);
  const streetLights = usePreserveStore((s) => s.streetLights);
  const streetLightMeta = getStreetLightSourceMeta(streetLights);
  const workspaceMode = usePreserveStore((s) => s.workspaceMode);
  const tracks = usePreserveStore((s) => s.tracks);
  const currentUserId = usePreserveStore((s) => s.currentUserId);
  const markings = usePreserveStore((s) => s.markings);
  const structureLabels = usePreserveStore((s) => s.structureLabels);
  const addMarking = usePreserveStore((s) => s.addMarking);
  const addStructureLabel = usePreserveStore((s) => s.addStructureLabel);
  const updateOwnTrack = usePreserveStore((s) => s.updateOwnTrack);
  const online = usePreserveStore((s) => s.online);
  const incident = incidents.find((i) => i.id === activeIncidentId) ?? null;
  const viewer = DEMO_USERS.find((u) => u.id === currentUserId) ?? DEMO_USERS[0];

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const dark = usePreserveStore.getState().mapDarkMode;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl(dark),
      center: [153.0251, -27.4698],
      zoom: 13.6,
      pitch: usePreserveStore.getState().mapPitch3d ? 60 : 0,
      bearing: 18,
      attributionControl: {},
      maxPitch: 75,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    const boot = () => {
      ensureOverlayLayers(map);
      ensureNightBuildings(map, usePreserveStore.getState().mapDarkMode);
      setData(map, 'preserve-lights', usePreserveStore.getState().streetLights.map((l) => pointFeature(l.position, { type: l.type })));
      if (map.getLayer('preserve-lights')) {
        map.setLayoutProperty('preserve-lights', 'visibility', usePreserveStore.getState().showStreetLights ? 'visible' : 'none');
      }
    };
    map.on('load', boot);
    map.on('style.load', boot);
    map.on('click', (e) => {
      const state = usePreserveStore.getState();
      if (!state.activeIncidentId) return;
      if (e.originalEvent.shiftKey) {
        const sides: StructureSide[] = ['front', 'back', 'right', 'left'];
        const side = sides[state.structureLabels.filter((s) => s.incidentId === state.activeIncidentId).length % 4];
        addStructureLabel({ incidentId: state.activeIncidentId, position: { lat: e.lngLat.lat, lng: e.lngLat.lng }, side, label: side.toUpperCase() });
      } else if (e.originalEvent.altKey) {
        addMarking({ incidentId: state.activeIncidentId, position: { lat: e.lngLat.lat, lng: e.lngLat.lng }, text: 'Annotation', scope: 'incident', visibility: 'service' });
      }
    });
    mapRef.current = map;
    (window as unknown as { __preserveMap?: MapLibreMap }).__preserveMap = map;
    return () => {
      const w = window as unknown as { __preserveMap?: MapLibreMap };
      if (w.__preserveMap === map) delete w.__preserveMap;
      map.remove();
      mapRef.current = null;
    };
  }, [addMarking, addStructureLabel]);

  useEffect(() => { const map = mapRef.current; if (!map) return; map.setStyle(mapStyleUrl(mapDarkMode)); }, [mapDarkMode]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (workspaceMode === 'home') {
      map.easeTo({ pitch: 28, bearing: 12, duration: 500 });
    } else {
      map.easeTo({ pitch: mapPitch3d ? 62 : 0, bearing: mapPitch3d ? 28 : 0, duration: 700 });
    }
  }, [mapPitch3d, workspaceMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const resize = () => map.resize();
    resize();
    const t = window.setTimeout(resize, 80);
    if (workspaceMode === 'home') {
      map.easeTo({
        center: [QLD.brisbaneCbd.lng, QLD.brisbaneCbd.lat],
        zoom: 12.4,
        pitch: 28,
        bearing: 12,
        duration: 500,
      });
      lastFly.current = null;
    }
    return () => window.clearTimeout(t);
  }, [workspaceMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      ensureOverlayLayers(map);
      setData(map, 'preserve-lights', streetLights.map((l) => pointFeature(l.position, { type: l.type })));
      if (map.getLayer('preserve-lights')) map.setLayoutProperty('preserve-lights', 'visibility', showStreetLights ? 'visible' : 'none');
      if (showStreetLights && workspaceMode === 'incident') {
        map.easeTo({ center: [QLD.brisbaneCbd.lng, QLD.brisbaneCbd.lat], zoom: Math.max(map.getZoom(), 13.2), duration: 600 });
      }
    };
    if (map.isStyleLoaded()) apply(); else map.once('style.load', apply);
  }, [showStreetLights, streetLights, workspaceMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const overlay = buildOverlay(workspaceMode === 'incident' ? incident : null);
    const visTracks = visibleTracks(viewer, tracks).map((t) => pointFeature(t.position, { label: `${t.callSign}`, kind: t.isSert ? 'sert' : 'unit' }));
    const marks = markings.filter((m) => m.incidentId === activeIncidentId || m.scope === 'permanent').map((m) => pointFeature(m.position, { label: m.text, kind: 'mark' }));
    const structures = structureLabels.filter((s) => s.incidentId === activeIncidentId).map((s) => pointFeature(s.position, { label: s.label, colour: STRUCTURE_SIDE_COLOURS[s.side] }));
    const apply = () => {
      ensureOverlayLayers(map);
      ensureNightBuildings(map, usePreserveStore.getState().mapDarkMode);
      setData(map, 'preserve-polys', overlay.polys);
      setData(map, 'preserve-lines', overlay.lines);
      setData(map, 'preserve-points', [...overlay.points, ...visTracks]);
      setData(map, 'preserve-labels', [...overlay.points, ...visTracks, ...marks, ...structures]);
      setData(map, 'preserve-structures', structures);
      setData(map, 'preserve-markings', marks);
      setData(map, 'preserve-lights', usePreserveStore.getState().streetLights.map((l) => pointFeature(l.position, { type: l.type })));
      if (map.getLayer('preserve-lights')) map.setLayoutProperty('preserve-lights', 'visibility', usePreserveStore.getState().showStreetLights ? 'visible' : 'none');
    };
    if (map.isStyleLoaded()) apply(); else map.once('style.load', apply);
    if (workspaceMode === 'incident' && incident && lastFly.current !== incident.id) {
      lastFly.current = incident.id;
      map.flyTo({ center: [incident.location.lng, incident.location.lat], zoom: incident.type === 'marine_sar' ? 10.5 : 14, pitch: usePreserveStore.getState().mapPitch3d ? 62 : map.getPitch(), essential: true });
    }
  }, [incident, tracks, viewer, markings, structureLabels, activeIncidentId, workspaceMode]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => updateOwnTrack({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => updateOwnTrack({ lat: -27.47, lng: 153.03 }),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [updateOwnTrack]);

  return (
    <div className="map-stage">
      <div ref={containerRef} className="map-canvas" data-testid="map-root" />
      <div className="map-hud">
        <span className="chip">{online ? 'NET ONLINE' : 'OFFLINE CACHE'}</span>
        <span
          className="chip"
          data-testid="lights-status"
          title={`${streetLightMeta.attribution}. ${streetLightMeta.coverageNote}. Raw ${streetLightMeta.rawCount}, water-clipped ${streetLightMeta.waterClippedCount}.`}
        >
          {showStreetLights
            ? `OSM street_lamp · ${streetLights.length} · incomplete`
            : 'LIGHTS OFF'}
        </span>
        <span className="chip">{mapDarkMode ? 'NIGHT BASEMAP' : 'DAY BASEMAP'}</span>
        <span className="chip">{mapPitch3d ? '3D ORBIT' : '2D'}</span>
        <span className="chip">ALT annotate · SHIFT structure</span>
      </div>
    </div>
  );
}
