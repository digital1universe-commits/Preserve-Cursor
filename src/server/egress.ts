const ALLOWED: Record<string, string[]> = {
  "api.openstreetmap.org": ["/api/0.6/map"],
  "api.open-meteo.com": ["/v1/forecast", "/v1/elevation"],
  "marine-api.open-meteo.com": ["/v1/marine"],
};

const NUMBER_LIST = /^-?\d+(?:\.\d+)?(?:,-?\d+(?:\.\d+)?){0,100}$/;

/**
 * The only outbound calls PRESERVE makes. Hosts, paths, and parameter shapes
 * are fixed. Case text cannot be appended.
 */
export function assertEgress(host: string, pathAndQuery: string): URL {
  const paths = ALLOWED[host];
  if (!paths) throw new Error("Egress blocked.");
  if (
    pathAndQuery.includes("://") ||
    pathAndQuery.includes("..") ||
    pathAndQuery.includes("@") ||
    pathAndQuery.includes("\\") ||
    pathAndQuery.includes(" ")
  ) {
    throw new Error("Egress blocked.");
  }
  const path = pathAndQuery.split("?")[0];
  if (!paths.includes(path)) throw new Error("Egress blocked.");
  const url = new URL(`https://${host}${pathAndQuery}`);
  if (url.username || url.password || url.host !== host || url.protocol !== "https:") {
    throw new Error("Egress blocked.");
  }
  for (const [key, value] of url.searchParams) {
    if (key === "current" || key === "timezone" || key === "wind_speed_unit") {
      if (!/^[A-Za-z0-9_,]{1,90}$/.test(value)) throw new Error("Egress blocked.");
      continue;
    }
    if ((key === "latitude" || key === "longitude" || key === "bbox") && NUMBER_LIST.test(value)) {
      continue;
    }
    throw new Error("Egress blocked.");
  }
  return url;
}

export async function egressGet(host: string, pathAndQuery: string): Promise<string> {
  if (process.env.PRESERVE_BLOCK_EGRESS === "1") {
    throw new Error("Egress blocked by installation policy.");
  }
  const url = assertEgress(host, pathAndQuery);
  const response = await fetch(url, {
    headers: {
      "user-agent": "PRESERVE/1.0 (on-premises planning; coordinates only)",
      accept: host.includes("openstreetmap") ? "application/xml" : "application/json",
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`Environmental source returned ${response.status}.`);
  }
  return response.text();
}

export const EGRESS_HOSTS = Object.keys(ALLOWED);
