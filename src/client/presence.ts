import { api, type PresencePin } from "./api";

const MOVE_M = 8;
const MOVING_MS = 10_000;
const STILL_MS = 90_000;

export type PresenceScope = "incident" | "agency";

export function startPresenceTracking(options: {
  getIncidentId: () => string | null;
  onError?: (message: string) => void;
}): () => void {
  if (!("geolocation" in navigator)) {
    options.onError?.("This device cannot share a GPS position.");
    return () => undefined;
  }

  let lastSent: { lat: number; lng: number; at: number } | null = null;
  let latest: GeolocationPosition | null = null;
  let stopped = false;

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      latest = position;
      void maybeSend(true);
    },
    (error) => {
      options.onError?.(error.message || "Location permission was refused.");
    },
    {
      enableHighAccuracy: false,
      maximumAge: MOVING_MS,
      timeout: 20_000,
    },
  );

  const timer = window.setInterval(() => {
    void maybeSend(false);
  }, MOVING_MS);

  async function maybeSend(fromWatch: boolean) {
    if (stopped || !latest) return;
    const { latitude: lat, longitude: lng, accuracy, heading } = latest.coords;
    const now = Date.now();
    const moved = !lastSent || haversineM(lastSent, { lat, lng }) >= MOVE_M;
    const due = !lastSent || now - lastSent.at >= (moved ? MOVING_MS : STILL_MS);
    if (!due && !(fromWatch && moved)) return;
    try {
      await api("/api/presence", {
        method: "PUT",
        body: JSON.stringify({
          lat,
          lng,
          accuracyM: accuracy,
          heading: heading == null || Number.isNaN(heading) ? undefined : heading,
          incidentId: options.getIncidentId(),
        }),
      });
      lastSent = { lat, lng, at: now };
    } catch {
      /* keep trying on the next tick */
    }
  }

  return () => {
    stopped = true;
    navigator.geolocation.clearWatch(watchId);
    window.clearInterval(timer);
  };
}

export async function fetchPresence(scope: PresenceScope, incidentId: string | null): Promise<PresencePin[]> {
  const query = new URLSearchParams({ scope });
  if (incidentId) query.set("incidentId", incidentId);
  const data = await api<{ positions: PresencePin[] }>(`/api/presence?${query}`);
  return data.positions;
}

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
