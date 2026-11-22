import { usePreserveStore } from '../store/preserveStore';

export function TrackingGate() {
  const consent = usePreserveStore((s) => s.trackingConsent);
  const setTrackingConsent = usePreserveStore((s) => s.setTrackingConsent);

  if (consent === true) return null;

  return (
    <div className="gate" data-testid="tracking-gate">
      <div className="gate-card">
        <div className="brand-sub">Queensland Police Service</div>
        <h1>Preserve</h1>
        <p>
          Device location tracking is required to use Preserve. Your call sign and position are shown
          on the map for incidents you join. SERT locations stay hidden from non-SERT unless shared
          for that job.
        </p>
        <p className="muted">
          Operational data stays inside the secure police / approved mobile network. Local heuristic
          engines run on-device — no incident content is sent to public internet AI services.
        </p>
        <div className="gate-actions">
          <button
            type="button"
            className="btn primary"
            data-testid="accept-tracking"
            onClick={() => setTrackingConsent(true)}
          >
            Accept tracking & enter
          </button>
          <button
            type="button"
            className="btn ghost"
            data-testid="deny-tracking"
            onClick={() => setTrackingConsent(false)}
          >
            Decline
          </button>
        </div>
        {consent === false && (
          <p className="tag danger" style={{ marginTop: '1rem' }}>
            Tracking permission is required. Preserve cannot be used without it.
          </p>
        )}
      </div>
    </div>
  );
}
