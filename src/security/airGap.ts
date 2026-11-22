/**
 * Air-gap / secure-boundary controls for Preserve.
 *
 * Production assumption: the app runs on the QPS secure network (and approved
 * mobile network). Incident payloads and local AI/heuristic outputs must never
 * leave that boundary. Map tiles may be served from an approved internal tile
 * mirror; public AI APIs are never used for operational content.
 */

export type EgressCategory =
  | 'incident_data'
  | 'ai_inference'
  | 'analytics'
  | 'map_tiles'
  | 'fonts'
  | 'unknown';

export interface EgressRequest {
  url: string;
  category: EgressCategory;
  payloadSummary?: string;
}

export interface EgressDecision {
  allowed: boolean;
  reason: string;
}

/** Domains allowed when online for non-operational assets only (demo / internal mirror). */
const ALLOWED_ASSET_HOSTS = new Set([
  'demotiles.maplibre.org',
  'tiles.openfreemap.org',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

/** Also allow OpenFreeMap tile CDN subdomains used by the liberty style. */
export function isAllowedAssetHost(host: string): boolean {
  if (ALLOWED_ASSET_HOSTS.has(host)) return true;
  if (host.endsWith('.openfreemap.org')) return true;
  if (host.endsWith('.qps.internal')) return true;
  return false;
}

const blockedLog: Array<{ at: string; url: string; category: EgressCategory; reason: string }> = [];

export function getBlockedEgressLog() {
  return [...blockedLog];
}

export function clearBlockedEgressLog() {
  blockedLog.length = 0;
}

export function classifyUrl(url: string): EgressCategory {
  try {
    const host = new URL(url, 'http://localhost').hostname;
    if (host.includes('openai') || host.includes('anthropic') || host.includes('googleapis.com/ai')) {
      return 'ai_inference';
    }
    if (host.includes('maplibre') || host.includes('openfreemap') || host.includes('tile')) {
      return 'map_tiles';
    }
    if (host.includes('fonts.')) return 'fonts';
  } catch {
    return 'unknown';
  }
  return 'unknown';
}

export function evaluateEgress(
  request: EgressRequest,
  opts: { online: boolean; airGapEnforced: boolean },
): EgressDecision {
  if (request.category === 'incident_data' || request.category === 'ai_inference' || request.category === 'analytics') {
    const decision = {
      allowed: false,
      reason: 'Operational / AI data must remain inside the secure police network boundary.',
    };
    blockedLog.push({
      at: new Date().toISOString(),
      url: request.url,
      category: request.category,
      reason: decision.reason,
    });
    return decision;
  }

  if (!opts.online) {
    const decision = {
      allowed: false,
      reason: 'Offline mode: external asset fetches are suspended; use cached tiles.',
    };
    if (request.category === 'map_tiles' || request.category === 'fonts') {
      blockedLog.push({
        at: new Date().toISOString(),
        url: request.url,
        category: request.category,
        reason: decision.reason,
      });
    }
    return decision;
  }

  if (!opts.airGapEnforced) {
    return { allowed: true, reason: 'Air-gap enforcement disabled (lab only).' };
  }

  try {
    const host = new URL(request.url, 'http://localhost').hostname;
    if (isAllowedAssetHost(host)) {
      return { allowed: true, reason: 'Host is on the approved asset allow-list.' };
    }
  } catch {
    /* fall through */
  }

  const decision = {
    allowed: false,
    reason: 'Destination is outside the configured secure boundary allow-list.',
  };
  blockedLog.push({
    at: new Date().toISOString(),
    url: request.url,
    category: request.category,
    reason: decision.reason,
  });
  return decision;
}

/** Guard used by local engines — never ships prompts/payloads to public AI. */
export function assertLocalOnlyInference(engineName: string): void {
  // Intentional no-op hook: local engines call this to document the boundary.
  if (!engineName) {
    throw new Error('Local inference engine name required');
  }
}

export function createSecureFetch(getState: () => { online: boolean; airGapEnforced: boolean }) {
  return async (url: string, init?: RequestInit & { category?: EgressCategory }) => {
    const category = init?.category ?? classifyUrl(url);
    const decision = evaluateEgress({ url, category }, getState());
    if (!decision.allowed) {
      throw new Error(`Egress blocked (${category}): ${decision.reason}`);
    }
    const { category: _c, ...rest } = init ?? {};
    return fetch(url, rest);
  };
}
