import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Incident, LatLng, StructureSide } from '../domain/types';
import { STRUCTURE_SIDE_COLOURS } from '../domain/types';
import { circlePolygon } from '../geo/qld';
import { QLD } from '../geo/qld';
import { mapStyleUrl } from '../map/styles';
import { visibleTracks } from '../tracking/visibility';
import { usePreserveStore } from '../store/preserveStore';
import { DEMO_USERS } from '../auth/roles';

type GjFeature = {
  type: 'Feature';
  properties: Record<string, string | number | boolean>;
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Polygon'; coordinates: [number, number][][] };
};

type GjCollection = { type: 'FeatureCollection'; features: GjFeature[] };

function lineFeature(coords: LatLng[]): GjFeature {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: coords.map((c) => [c.lng, c.lat] as [number, number]),
    },
  };
}

function polyFeature(coords: LatLng[], props: Record<string, string | number> = {}): GjFeature {
  const ring = coords.map((c) => [c.lng, c.lat] as [number, number]);
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0]);
  }
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

function pointFeature(p: LatLng, props: Record<string, string | number | boolean> = {}): GjFeature {
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
  };
}

function buildOverlay(incident: Incident | null) {
  const lines: GjFeature[] = [];
  const polys: GjFeature[] = [];
  const points: GjFeature[] = [];

  if (!incident) {
    return { lines, polys, points };
  }

  points.push(pointFeature(incident.location, { label: incident.jobNumber, kind: 'lkp' }));

  if (incident.cordon) {
    const c = incident.cordon;
    polys.push(polyFeature(circlePolygon(c.centre, c.innerRadiusM), { ring: 'inner' }));
    polys.push(polyFeature(circlePolygon(c.centre, c.middleRadiusM), { ring: 'middle' }));
    polys.push(polyFeature(circlePolygon(c.centre, c.outerRadiusM), { ring: 'outer' }));
    for (const r of c.resources) {
      if (r.position) {
        points.push(
          pointFeature(r.position, {
            label: `${r.callSign} (${r.cordonRing})`,
            kind: 'resource',
          }),
        );
      }
    }
  }

  if (incident.landSar) {
    lines.push(lineFeature(incident.landSar.likelyPath));
    for (const z of incident.landSar.zones) {
      polys.push(polyFeature(z.polygon, { ring: z.probability, label: z.label }));
    }
  }

  if (incident.marineSar) {
    lines.push(lineFeature(incident.marineSar.driftLine));
    polys.push(
      polyFeature(circlePolygon(incident.marineSar.driftCentre, incident.marineSar.searchRadiusM), {
        ring: 'search',
      }),
    );
    points.push(
      pointFeature(incident.marineSar.driftCentre, {
        label: 'Drift centre',
        kind: 'drift',
      }),
    );
    for (const row of incident.marineSar.grid) {
      lines.push(lineFeature(row));
    }
  }

  if (incident.publicOrder) {
    lines.push(lineFeature(incident.publicOrder.route));
    for (const p of incident.publicOrder.policePositions) {
      points.push(pointFeature(p, { label: p.label, kind: 'po' }));
    }
    for (const s of incident.publicOrder.criticalSites) {
      points.push(pointFeature(s, { label: s.name, kind: 'critical' }));
    }
  }

  if (incident.roadBlock) {
    polys.push(polyFeature(incident.roadBlock.boxedArea, { ring: 'box' }));
    for (const s of incident.roadBlock.spikePoints) {
      points.push(pointFeature(s, { label: s.label, kind: 'spike' }));
    }
  }

  return { lines, polys, points };
}

export function ensureOverlayLayers(map: MapLibreMap) {
  const empty: GjCollection = { type: 'FeatureCollection', features: [] };
  const addSource = (id: string) => {
    if (!map.getSource(id)) {
      map.addSource(id, { type: 'geojson', data: empty });
    }
  };
  const addLayer = (layer: maplibregl.AddLayerObject) => {
    if (!map.getLayer(layer.id)) {
      map.addLayer(layer);
    }
  };

  for (const id of [
    'preserve-polys',
    'preserve-lines',
    'preserve-points',
    'preserve-labels',
    'preserve-lights',
    'preserve-lights-glow',
    'preserve-structures',
    'preserve-markings',
  ]) {
    addSource(id);
  }

  addLayer({
    id: 'preserve-polys',
    type: 'fill',
    source: 'preserve-polys',
    paint: {
      'fill-color': [
        'match',
        ['get', 'ring'],
        'inner',
        '#c62828',
        'middle',
        '#d4a017',
        'outer',
        '#3d7ea6',
        'high',
        '#c62828',
        'medium',
        '#d4a017',
        'low',
        '#3d7ea6',
        'search',
        '#2e7d32',
        'box',
        '#6a1b9a',
        '#3d7ea6',
      ],
      'fill-opacity': 0.18,
    },
  } as maplibregl.AddLayerObject);

  addLayer({
    id: 'preserve-lines',
    type: 'line',
    source: 'preserve-lines',
    paint: {
      'line-color': '#ffd54f',
      'line-width': 4,
      'line-opacity': 0.95,
    },
  } as maplibregl.AddLayerObject);

  addLayer({
    id: 'preserve-points',
    type: 'circle',
    source: 'preserve-points',
    paint: {
      'circle-radius': 6,
      'circle-color': [
        'match',
        ['get', 'kind'],
        'spike',
        '#c62828',
        'resource',
        '#d4a017',
        'sert',
        '#111111',
        'critical',
        '#2e7d32',
        '#e8f0f6',
      ],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#0b1520',
    },
  } as maplibregl.AddLayerObject);

  addLayer({
    id: 'preserve-labels',
    type: 'symbol',
    source: 'preserve-labels',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, 1.2],
    },
    paint: {
      'text-color': '#e8f0f6',
      'text-halo-color': '#0b1520',
      'text-halo-width': 1.2,
    },
  } as maplibregl.AddLayerObject);

  addLayer({
    id: 'preserve-lights-glow',
    type: 'circle',
    source: 'preserve-lights',
    paint: {
      'circle-radius': ['match', ['get', 'type'], 'high_mast', 18, 12],
      'circle-color': '#fff59d',
      'circle-opacity': 0.25,
      'circle-blur': 0.6,
    },
  } as maplibregl.AddLayerObject);

  addLayer({
    id: 'preserve-lights',
    type: 'circle',
    source: 'preserve-lights',
    paint: {
      'circle-radius': ['match', ['get', 'type'], 'high_mast', 7, 5],
      'circle-color': '#ffe082',
      'circle-stroke-width': 1,
      'circle-stroke-color': '#fffde7',
      'circle-opacity': 0.95,
    },
  } as maplibregl.AddLayerObject);

  addLayer({
    id: 'preserve-structures',
    type: 'circle',
    source: 'preserve-structures',
    paint: {
      'circle-radius': 8,
      'circle-color': ['get', 'colour'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#e8f0f6',
    },
  } as maplibregl.AddLayerObject);

  addLayer({
    id: 'preserve-markings',
    type: 'circle',
    source: 'preserve-markings',
    paint: {
      'circle-radius': 5,
      'circle-color': '#81d4fa',
    },
  } as maplibregl.AddLayerObject);
}

function setCollection(map: MapLibreMap, id: string, features: GjFeature[]) {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  src?.setData({ type: 'FeatureCollection', features });
}

function setLightsVisible(map: MapLibreMap, visible: boolean) {
  const vis = visible ? 'visible' : 'none';
  for (const id of ['preserve-lights', 'preserve-lights-glow']) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', vis);
    }
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const lastIncidentFlyRef = useRef<string | null>(null);

  const incidents = usePreserveStore((s) => s.incidents);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  const mapPitch3d = usePreserveStore((s) => s.mapPitch3d);
  const mapDarkMode = usePreserveStore((s) => s.mapDarkMode);
  const showStreetLights = usePreserveStore((s) => s.showStreetLights);
  const streetLights = usePreserveStore((s) => s.streetLights);
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

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyleUrl(usePreserveStore.getState().mapDarkMode),
      center: [153.0251, -27.4698],
      zoom: 13,
      pitch: 0,
      attributionControl: {},
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    const onReady = () => {
      ensureOverlayLayers(map);
      setLightsVisible(map, usePreserveStore.getState().showStreetLights);
    };
    map.on('load', onReady);
    map.on('style.load', onReady);

    map.on('click', (e) => {
      const state = usePreserveStore.getState();
      if (!state.activeIncidentId) return;
      if (e.originalEvent.shiftKey) {
        const sides: StructureSide[] = ['front', 'back', 'right', 'left'];
        const side = sides[state.structureLabels.filter((s) => s.incidentId === state.activeIncidentId).length % 4];
        addStructureLabel({
          incidentId: state.activeIncidentId,
          position: { lat: e.lngLat.lat, lng: e.lngLat.lng },
          side,
          label: side.toUpperCase(),
        });
      } else if (e.originalEvent.altKey) {
        addMarking({
          incidentId: state.activeIncidentId,
          position: { lat: e.lngLat.lat, lng: e.lngLat.lng },
          text: 'Annotation',
          scope: 'incident',
          visibility: 'service',
        });
      }
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [addMarking, addStructureLabel]);

  // Dark / light basemap swap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const url = mapStyleUrl(mapDarkMode);
    map.setStyle(url);
  }, [mapDarkMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: mapPitch3d ? 60 : 0, bearing: mapPitch3d ? 20 : 0, duration: 600 });
  }, [mapPitch3d]);

  // Street lights overlay — independent of incident flyTo
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyLights = () => {
      ensureOverlayLayers(map);
      const features = streetLights.map((l) =>
        pointFeature(l.position, { type: l.type, label: l.type === 'high_mast' ? 'High mast' : 'Light' }),
      );
      setCollection(map, 'preserve-lights', features);
      setLightsVisible(map, showStreetLights);
      if (showStreetLights) {
        map.easeTo({
          center: [QLD.brisbaneCbd.lng, QLD.brisbaneCbd.lat],
          zoom: Math.max(map.getZoom(), 14),
          duration: 700,
        });
      }
    };

    if (map.isStyleLoaded()) applyLights();
    else map.once('style.load', applyLights);
  }, [showStreetLights, streetLights]);

  // Incident overlays
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const overlay = buildOverlay(incident);
    const visTracks = visibleTracks(viewer, tracks).map((t) =>
      pointFeature(t.position, {
        label: `${t.callSign} ${t.name}`,
        kind: t.isSert ? 'sert' : 'unit',
      }),
    );

    const incidentMarkings = markings
      .filter((m) => m.incidentId === activeIncidentId || m.scope === 'permanent')
      .map((m) => pointFeature(m.position, { label: m.text, kind: 'mark' }));

    const structures = structureLabels
      .filter((s) => s.incidentId === activeIncidentId)
      .map((s) =>
        pointFeature(s.position, {
          label: s.label,
          colour: STRUCTURE_SIDE_COLOURS[s.side],
          kind: 'structure',
        }),
      );

    const apply = () => {
      ensureOverlayLayers(map);
      setCollection(map, 'preserve-polys', overlay.polys);
      setCollection(map, 'preserve-lines', overlay.lines);
      setCollection(map, 'preserve-points', [...overlay.points, ...visTracks]);
      setCollection(map, 'preserve-labels', [...overlay.points, ...visTracks, ...incidentMarkings, ...structures]);
      setCollection(map, 'preserve-structures', structures);
      setCollection(map, 'preserve-markings', incidentMarkings);
      // Re-assert lights after style rebuilds
      const lights = usePreserveStore.getState().streetLights.map((l) =>
        pointFeature(l.position, { type: l.type, label: l.type }),
      );
      setCollection(map, 'preserve-lights', lights);
      setLightsVisible(map, usePreserveStore.getState().showStreetLights);
    };

    if (map.isStyleLoaded()) apply();
    else map.once('style.load', apply);

    if (incident && lastIncidentFlyRef.current !== incident.id) {
      lastIncidentFlyRef.current = incident.id;
      map.flyTo({
        center: [incident.location.lng, incident.location.lat],
        zoom: incident.type === 'marine_sar' ? 10 : 13.5,
        essential: true,
      });
    }
  }, [incident, tracks, viewer, markings, structureLabels, activeIncidentId]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        updateOwnTrack({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        updateOwnTrack({ lat: -27.47, lng: 153.03 });
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [updateOwnTrack]);

  return (
    <div className="map-pane">
      <div ref={containerRef} className="map-root" data-testid="map-root" />
      <div className="map-overlay-tools">
        <span className="pill">{online ? 'Map online (asset allow-list)' : 'Offline — cached tiles only'}</span>
        <span className="pill" data-testid="lights-status">
          Lights {showStreetLights ? `ON (${streetLights.length})` : 'OFF'}
        </span>
        <span className="pill">Click+Alt: annotate · Click+Shift: structure side</span>
      </div>
    </div>
  );
}
