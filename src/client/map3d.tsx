import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng } from "../engine/geo.js";
import type { MapMarker } from "./map";

type Props = {
  center: LatLng;
  markers: MapMarker[];
  polygons?: { id: string; points: LatLng[]; tone: string; fill: boolean }[];
  enabled: boolean;
};

/**
 * Terrain and building massing for elevation / vantage review.
 * External style and terrain hosts learn the bbox being viewed — same OPSEC rule as 2D tiles.
 */
export function Map3D(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!props.enabled || !host.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: host.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap",
          },
          terrain: {
            type: "raster-dem",
            tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
            encoding: "terrarium",
            tileSize: 256,
            maxzoom: 15,
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
        terrain: { source: "terrain", exaggeration: 1.35 },
      },
      center: [props.center.lng, props.center.lat],
      zoom: 16,
      pitch: 60,
      bearing: -20,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.on("load", () => {
      map.resize();
      map.setTerrain({ source: "terrain", exaggeration: 1.35 });
    });
    mapRef.current = map;
    const resize = () => map.resize();
    window.addEventListener("resize", resize);
    const timer = window.setTimeout(resize, 200);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
      map.remove();
      mapRef.current = null;
    };
    // Created once while 3D is enabled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.enabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.enabled) return;
    map.easeTo({ center: [props.center.lng, props.center.lat], duration: 600 });
  }, [props.center.lat, props.center.lng, props.enabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.enabled) return;
    const markers: maplibregl.Marker[] = [];
    for (const marker of props.markers) {
      const el = document.createElement("span");
      el.className = `pin-face pin-${marker.tone}`;
      el.textContent = marker.label;
      markers.push(new maplibregl.Marker({ element: el }).setLngLat([marker.lng, marker.lat]).addTo(map));
    }
    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [props.markers, props.enabled]);

  if (!props.enabled) return null;
  return <div ref={host} className="map-canvas map-3d" />;
}
