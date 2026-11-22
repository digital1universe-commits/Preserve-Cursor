import { usePreserveStore } from '../store/preserveStore';

export function TrackingGate() {
  const consent = usePreserveStore((s) => s.trackingConsent);
  const setTrackingConsent = usePreserveStore((s) => s.setTrackingConsent);
  if (consent === true) return null;
  return (
    <div className="gate" data-testid="tracking-gate">
      <div className="gate-card">
        <div className="eyebrow">Queensland Police Service</div>
        <h1>Preserve</h1>
        <p>
          Device location tracking is required for operational use. Your call sign and position appear
          on the map for jobs you join. SERT locations stay hidden from non-SERT unless shared for that
          incident.
        </p>
        <p>
          Operational data stays inside the secure police / approved mobile network. Local planning
          engines run on-device — no incident content is sent to public internet AI services.
        </p>
        <div className="gate-actions">
          <button type="button" className="btn primary" data-testid="accept-tracking" onClick={() => setTrackingConsent(true)}>
            Accept tracking & enter
          </button>
          <button type="button" className="btn ghost" data-testid="deny-tracking" onClick={() => setTrackingConsent(false)}>
            Decline
          </button>
        </div>
        {consent === false && (
          <p className="tag threat" style={{ marginTop: '1rem', display: 'inline-block' }}>
            Tracking permission is required. Preserve cannot be used without it.
          </p>
        )}
      </div>
    </div>
  );
}
