import { useEffect, useRef } from "react";
import L from "leaflet";
import type { LatLng } from "../engine/geo.js";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  tone: string;
  detail?: string;
};

type Props = {
  center: LatLng;
  zoom: number;
  frame: number;
  tiles: boolean;
  tileUrl: string;
  attribution: string;
  markers: MapMarker[];
  circles?: { id: string; center: LatLng; radiusM: number; tone: string }[];
  polygons?: { id: string; points: LatLng[]; tone: string; fill: boolean }[];
  lines?: { id: string; points: LatLng[]; tone: string }[];
  heat?: { lat: number; lng: number; w: number }[];
  onClick?: (point: LatLng) => void;
};

export function OperationMap(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const heatRef = useRef<L.Layer | null>(null);
  const clickRef = useRef(props.onClick);
  clickRef.current = props.onClick;

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const map = L.map(host.current, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 19,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    map.setView([props.center.lat, props.center.lng], props.zoom);
    groupRef.current = L.layerGroup().addTo(map);
    map.on("click", (event) => {
      clickRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
    });
    mapRef.current = map;
    const resize = () => map.invalidateSize();
    const timer = window.setTimeout(resize, 150);
    window.addEventListener("resize", resize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", resize);
      map.remove();
      mapRef.current = null;
    };
    // The map is created once. Later effects move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) {
      map.removeLayer(tileRef.current);
      tileRef.current = null;
    }
    if (props.tiles && props.tileUrl) {
      tileRef.current = L.tileLayer(props.tileUrl, {
        attribution: props.attribution,
        maxZoom: 19,
      }).addTo(map);
    }
  }, [props.tiles, props.tileUrl, props.attribution]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo([props.center.lat, props.center.lng], props.zoom, { duration: 0.45 });
  }, [props.frame]);

  useEffect(() => {
    const map = mapRef.current;
    const group = groupRef.current;
    if (!map || !group) return;
    group.clearLayers();
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }
    if (props.heat?.length) {
      const layer = heatLayer(props.heat);
      layer.addTo(map);
      heatRef.current = layer;
    }
    for (const polygon of props.polygons ?? []) {
      if (polygon.points.length < 2) continue;
      L.polygon(
        polygon.points.map((point) => [point.lat, point.lng]),
        {
          color: toneColor(polygon.tone),
          weight: 2,
          fillColor: toneColor(polygon.tone),
          fillOpacity: polygon.fill ? 0.12 : 0,
        },
      ).addTo(group);
    }
    for (const line of props.lines ?? []) {
      if (line.points.length < 2) continue;
      L.polyline(
        line.points.map((point) => [point.lat, point.lng]),
        { color: toneColor(line.tone), weight: line.tone === "drift" ? 2.5 : 1.5, dashArray: line.tone === "tick" ? "4 4" : undefined },
      ).addTo(group);
    }
    for (const circle of props.circles ?? []) {
      L.circle([circle.center.lat, circle.center.lng], {
        radius: circle.radiusM,
        color: toneColor(circle.tone),
        weight: 1.25,
        fillOpacity: 0.03,
      }).addTo(group);
    }
    const bounds = L.latLngBounds([]);
    for (const marker of props.markers) {
      const width = Math.max(26, marker.label.length * 6.4 + 8);
      const icon = L.divIcon({
        className: "pin",
        html: `<span class="pin-face pin-${marker.tone}">${marker.label}</span>`,
        iconSize: [width, 16],
        iconAnchor: [width / 2, 8],
      });
      const placed = L.marker([marker.lat, marker.lng], { icon, keyboard: true }).addTo(group);
      if (marker.detail) placed.bindTooltip(marker.detail, { direction: "top", offset: [0, -8] });
      bounds.extend([marker.lat, marker.lng]);
    }
    for (const polygon of props.polygons ?? []) polygon.points.forEach((point) => bounds.extend([point.lat, point.lng]));
    for (const line of props.lines ?? []) line.points.forEach((point) => bounds.extend([point.lat, point.lng]));
    for (const circle of props.circles ?? []) {
      bounds.extend(L.latLng(circle.center.lat, circle.center.lng).toBounds(circle.radiusM * 2));
    }
    const planned = (props.polygons?.length ?? 0) + (props.circles?.length ?? 0) + (props.lines?.length ?? 0) > 0;
    if (planned && bounds.isValid()) {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16, animate: false });
    }
  }, [props.markers, props.circles, props.polygons, props.lines, props.heat]);

  return <div ref={host} className="map-canvas" />;
}

function toneColor(tone: string) {
  if (tone === "water" || tone === "drift") return "#6eafc8";
  if (tone === "inner" || tone === "scene") return "#e0b13a";
  if (tone === "outer") return "#f3f6fb";
  if (tone === "area") return "#e0b13a";
  if (tone === "search") return "#7eb6d6";
  if (tone === "presence") return "#e0b13a";
  if (tone === "light") return "#f3f6fb";
  if (tone === "command") return "#7eb6d6";
  if (tone === "hot") return "#e06b5c";
  return "#f3f6fb";
}

function heatLayer(cells: { lat: number; lng: number; w: number }[]) {
  const CanvasLayer = L.Layer.extend({
    onAdd(map: L.Map) {
      this._map = map;
      this._canvas = L.DomUtil.create("canvas", "heat-canvas") as HTMLCanvasElement;
      map.getPane("overlayPane")?.appendChild(this._canvas);
      this._reset = () => paint(map, this._canvas, cells);
      map.on("move zoom resize", this._reset);
      this._reset();
    },
    onRemove(map: L.Map) {
      map.off("move zoom resize", this._reset);
      this._canvas.remove();
    },
  });
  return new CanvasLayer();
}

function paint(map: L.Map, canvas: HTMLCanvasElement, cells: { lat: number; lng: number; w: number }[]) {
  const size = map.getSize();
  const topLeft = map.containerPointToLayerPoint([0, 0]);
  L.DomUtil.setPosition(canvas, topLeft);
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, size.x * ratio);
  canvas.height = Math.max(1, size.y * ratio);
  canvas.style.width = `${size.x}px`;
  canvas.style.height = `${size.y}px`;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size.x, size.y);
  for (const cell of cells) {
    const point = map.latLngToContainerPoint([cell.lat, cell.lng]);
    const alpha = 0.05 + cell.w * 0.38;
    const red = Math.round(80 + cell.w * 150);
    const green = Math.round(120 - cell.w * 40);
    const blue = Math.round(110 - cell.w * 50);
    context.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
    context.beginPath();
    context.arc(point.x, point.y, 16, 0, Math.PI * 2);
    context.fill();
  }
}
