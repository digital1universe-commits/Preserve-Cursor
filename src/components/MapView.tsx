import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Incident, LatLng, StructureSide } from '../domain/types';
import { STRUCTURE_SIDE_COLOURS } from '../domain/types';
import { circlePolygon } from '../geo/qld';
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

function ensureSources(map: MapLibreMap) {
  const empty: GjCollection = { type: 'FeatureCollection', features: [] };
  const add = (id: string, type: 'fill' | 'line' | 'circle' | 'symbol', paint: Record<string, unknown>, layout?: Record<string, unknown>) => {
    if (!map.getSource(id)) {
      map.addSource(id, { type: 'geojson', data: empty });
    }
    if (!map.getLayer(id)) {
      map.addLayer({
        id,
        type,
        source: id,
        paint,
        ...(layout ? { layout } : {}),
      } as maplibregl.AddLayerObject);
    }
  };


  add('preserve-polys', 'fill', {
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
  });
  add('preserve-lines', 'line', {
    'line-color': '#e8f0f6',
    'line-width': 2.5,
    'line-opacity': 0.85,
  });
  add('preserve-points', 'circle', {
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
  });
  add(
    'preserve-labels',
    'symbol',
    {
      'text-color': '#e8f0f6',
      'text-halo-color': '#0b1520',
      'text-halo-width': 1.2,
    },
    {
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, 1.2],
    },
  );
  add('preserve-lights', 'circle', {
    'circle-radius': ['match', ['get', 'type'], 'high_mast', 5, 3],
    'circle-color': '#fff59d',
    'circle-opacity': 0.75,
  });
  add('preserve-structures', 'circle', {
    'circle-radius': 8,
    'circle-color': ['get', 'colour'],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#e8f0f6',
  });
  add('preserve-markings', 'circle', {
    'circle-radius': 5,
    'circle-color': '#81d4fa',
  });
}

function setCollection(map: MapLibreMap, id: string, features: GjFeature[]) {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  src?.setData({ type: 'FeatureCollection', features });
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const incidents = usePreserveStore((s) => s.incidents);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  const mapPitch3d = usePreserveStore((s) => s.mapPitch3d);
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
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [153.0251, -27.4698],
      zoom: 12.5,
      pitch: 0,
      attributionControl: {},
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      ensureSources(map);
      // Soft terrain-like pitch feel without remote DEM dependency.
      map.easeTo({ pitch: 0, duration: 0 });
    });

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: mapPitch3d ? 60 : 0, bearing: mapPitch3d ? 20 : 0, duration: 600 });
  }, [mapPitch3d]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

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

    const lights = showStreetLights
      ? streetLights.map((l) => pointFeature(l.position, { type: l.type, label: l.type }))
      : [];

    const apply = () => {
      ensureSources(map);
      setCollection(map, 'preserve-polys', overlay.polys);
      setCollection(map, 'preserve-lines', overlay.lines);
      setCollection(map, 'preserve-points', [...overlay.points, ...visTracks]);
      setCollection(map, 'preserve-labels', [...overlay.points, ...visTracks, ...incidentMarkings, ...structures]);
      setCollection(map, 'preserve-lights', lights);
      setCollection(map, 'preserve-structures', structures);
      setCollection(map, 'preserve-markings', incidentMarkings);
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);

    if (incident) {
      map.flyTo({
        center: [incident.location.lng, incident.location.lat],
        zoom: incident.type === 'marine_sar' ? 10 : 13,
        essential: true,
      });
    }
  }, [
    incident,
    tracks,
    viewer,
    markings,
    structureLabels,
    activeIncidentId,
    showStreetLights,
    streetLights,
  ]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        updateOwnTrack({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // Demo fallback near Brisbane if permission denied after consent gate
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
        <span className="pill">Click+Alt: annotate · Click+Shift: structure side</span>
      </div>
    </div>
  );
}
