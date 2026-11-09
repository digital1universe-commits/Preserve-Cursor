import { destination, haversineM, type LatLng } from "../engine/geo.js";
import type { ElevationSample } from "../engine/land.js";
import type { MarineEnvironment } from "../engine/marine.js";
import { egressGet } from "./egress.js";

const NM_PER_KMH = 1 / 1.852;

export async function fetchElevation(center: LatLng, radiusM: number): Promise<ElevationSample[]> {
  const span = Math.min(Math.max(radiusM, 250), 12_000);
  const steps = 7;
  const lats: number[] = [];
  const lngs: number[] = [];
  for (let row = 0; row < steps; row++) {
    for (let col = 0; col < steps; col++) {
      const north = ((row / (steps - 1)) * 2 - 1) * span;
      const east = ((col / (steps - 1)) * 2 - 1) * span;
      const shifted = destination(destination(center, 0, north), 90, east);
      lats.push(round(shifted.lat));
      lngs.push(round(shifted.lng));
    }
  }
  const body = await egressGet(
    "api.open-meteo.com",
    `/v1/elevation?latitude=${lats.join(",")}&longitude=${lngs.join(",")}`,
  );
  const parsed = JSON.parse(body) as { elevation?: number[] };
  if (!parsed.elevation || parsed.elevation.length !== lats.length) {
    throw new Error("Elevation sample was incomplete.");
  }
  return lats.map((lat, index) => ({
    lat,
    lng: lngs[index],
    elevationM: parsed.elevation![index],
  }));
}

export async function fetchMarineConditions(lkp: LatLng): Promise<MarineEnvironment> {
  const lat = round(lkp.lat);
  const lng = round(lkp.lng);
  const [forecastRaw, marineRaw] = await Promise.all([
    egressGet(
      "api.open-meteo.com",
      `/v1/forecast?latitude=${lat}&longitude=${lng}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn&timezone=UTC`,
    ),
    egressGet(
      "marine-api.open-meteo.com",
      `/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction&timezone=UTC`,
    ).catch(() => ""),
  ]);
  const forecast = JSON.parse(forecastRaw) as {
    latitude?: number;
    longitude?: number;
    current?: { wind_speed_10m?: number; wind_direction_10m?: number; wind_gusts_10m?: number };
  };
  const windSpeed = forecast.current?.wind_speed_10m;
  const windFrom = forecast.current?.wind_direction_10m;
  if (windSpeed == null || windFrom == null) throw new Error("Wind was not in the sample.");

  let currentSpeedKn = 0;
  let currentTowardDeg = 0;
  let waveHeightM: number | undefined;
  let wavePeriodS: number | undefined;
  let sampleLat = forecast.latitude ?? lat;
  let sampleLng = forecast.longitude ?? lng;
  let marineNote = "";
  if (marineRaw) {
    const marine = JSON.parse(marineRaw) as {
      latitude?: number;
      longitude?: number;
      current?: {
        wave_height?: number;
        wave_period?: number;
        ocean_current_velocity?: number;
        ocean_current_direction?: number;
      };
    };
    if (marine.latitude != null && marine.longitude != null) {
      sampleLat = marine.latitude;
      sampleLng = marine.longitude;
      const distanceKm = haversineM(lkp, { lat: sampleLat, lng: sampleLng }) / 1000;
      if (distanceKm > 20) {
        marineNote = ` The marine cell is ${distanceKm.toFixed(0)} km from the last known position, so treat the current as a regional sample.`;
      }
    }
    const velocity = marine.current?.ocean_current_velocity;
    if (velocity != null) currentSpeedKn = velocity * NM_PER_KMH;
    if (marine.current?.ocean_current_direction != null) {
      currentTowardDeg = marine.current.ocean_current_direction;
    }
    waveHeightM = marine.current?.wave_height;
    wavePeriodS = marine.current?.wave_period;
  } else {
    marineNote = " Marine current was not available. Wind drift only, unless a current is entered.";
  }

  return {
    windSpeedKn: windSpeed,
    windFromDeg: windFrom,
    gustKn: forecast.current?.wind_gusts_10m,
    currentSpeedKn,
    currentTowardDeg,
    waveHeightM,
    wavePeriodS,
    source: "live",
    sampledAt: new Date().toISOString(),
    sampleLat,
    sampleLng,
    note: `Wind and current were sampled for the position only.${marineNote}`,
  };
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
