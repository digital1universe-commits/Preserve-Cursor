import { useEffect, useState } from 'react';
import { DEMO_USERS, userHas } from '../auth/roles';
import {
  INCIDENT_TYPE_LABELS,
  STRUCTURE_SIDE_COLOURS,
  type SecurityLevel,
} from '../domain/types';
import { QLD } from '../geo/qld';
import { visibleTracks } from '../tracking/visibility';
import { usePreserveStore } from '../store/preserveStore';

export function DetailPanel() {
  const incidents = usePreserveStore((s) => s.incidents);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  const joinIncident = usePreserveStore((s) => s.joinIncident);
  const linkPublicOrderOpposing = usePreserveStore((s) => s.linkPublicOrderOpposing);
  const replanIncident = usePreserveStore((s) => s.replanIncident);
  const tracks = usePreserveStore((s) => s.tracks);
  const currentUserId = usePreserveStore((s) => s.currentUserId);
  const setSertShare = usePreserveStore((s) => s.setSertShare);
  const structureLabels = usePreserveStore((s) => s.structureLabels);
  const markings = usePreserveStore((s) => s.markings);
  const tryLeakIncidentData = usePreserveStore((s) => s.tryLeakIncidentData);
  const egressBlockedCount = usePreserveStore((s) => s.egressBlockedCount);

  const [editTitle, setEditTitle] = useState('');
  const [editSecurity, setEditSecurity] = useState<SecurityLevel>('protected');
  const [editSummary, setEditSummary] = useState('');
  const [editWaypoints, setEditWaypoints] = useState('');

  const incident = incidents.find((i) => i.id === activeIncidentId) ?? null;
  const viewer = DEMO_USERS.find((u) => u.id === currentUserId) ?? DEMO_USERS[0];
  const shownTracks = incident
    ? visibleTracks(
        viewer,
        tracks.filter((t) => !t.incidentId || t.incidentId === incident.id || t.userId === viewer.id),
      )
    : [];

  useEffect(() => {
    if (!incident) return;
    setEditTitle(incident.title);
    setEditSecurity(incident.securityLevel);
    setEditSummary(incident.summary);
    if (incident.publicOrder?.route?.length) {
      // Sample every ~nth point so the form stays editable
      const pts = incident.publicOrder.route;
      const step = Math.max(1, Math.floor(pts.length / 4));
      const samples = [pts[0], pts[Math.min(step, pts.length - 1)], pts[Math.min(step * 2, pts.length - 1)], pts[pts.length - 1]];
      const uniq = samples.filter((p, i, arr) => i === 0 || p.lat !== arr[i - 1].lat || p.lng !== arr[i - 1].lng);
      setEditWaypoints(uniq.map((p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`).join('\n'));
    } else {
      setEditWaypoints(
        `${QLD.southBank.lat}, ${QLD.southBank.lng}\n${QLD.brisbaneCbd.lat}, ${QLD.brisbaneCbd.lng}\n${QLD.fortitudeValley.lat}, ${QLD.fortitudeValley.lng}`,
      );
    }
  }, [incident]);

  if (!incident) {
    return (
      <aside className="detail">
        <h2 className="panel-title">Incident</h2>
        <p className="muted">Select a job or create a new incident to begin.</p>
      </aside>
    );
  }

  const otherPublicOrders = incidents.filter(
    (i) => i.type === 'public_order' && i.id !== incident.id,
  );

  return (
    <aside className="detail" data-testid="detail-panel">
      <h2 className="panel-title">Incident</h2>
      <h3>{incident.title}</h3>
      <div className="tag-row">
        <span className="tag">{incident.jobNumber}</span>
        <span className="tag">{INCIDENT_TYPE_LABELS[incident.type]}</span>
        <span className="tag">{incident.securityLevel}</span>
        <span className="tag ok">{incident.status}</span>
      </div>
      <p className="muted">{incident.summary}</p>

      <div className="stack" style={{ marginTop: '0.75rem' }}>
        <button type="button" className="btn primary" onClick={() => joinIncident(incident.id)}>
          Join job
        </button>
      </div>

      {userHas(viewer, 'incident:edit') && (
        <>
          <div className="section-label">Edit job details</div>
          <div className="stack">
            <div className="field">
              <label htmlFor="edit-title">Title</label>
              <input id="edit-title" data-testid="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="edit-security">Security level</label>
              <select
                id="edit-security"
                data-testid="edit-security"
                value={editSecurity}
                onChange={(e) => setEditSecurity(e.target.value as SecurityLevel)}
              >
                <option value="unclassified">unclassified</option>
                <option value="protected">protected</option>
                <option value="restricted">restricted</option>
                <option value="secret">secret</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-summary">Summary</label>
              <textarea id="edit-summary" rows={2} value={editSummary} onChange={(e) => setEditSummary(e.target.value)} />
            </div>
            {incident.type === 'public_order' && (
              <div className="field">
                <label htmlFor="edit-waypoints">Route waypoints (lat, lng). Re-snaps to streets/bridges.</label>
                <textarea
                  id="edit-waypoints"
                  data-testid="edit-po-waypoints"
                  rows={4}
                  value={editWaypoints}
                  onChange={(e) => setEditWaypoints(e.target.value)}
                />
              </div>
            )}
            <button
              type="button"
              className="btn"
              data-testid="save-incident-edits"
              onClick={() =>
                replanIncident(incident.id, {
                  type: incident.type,
                  title: editTitle,
                  securityLevel: editSecurity,
                  summary: editSummary,
                  publicOrder:
                    incident.type === 'public_order' ? { waypointsText: editWaypoints } : undefined,
                })
              }
            >
              Save & replan
            </button>
          </div>
        </>
      )}

      {incident.cordon && (
        <>
          <div className="section-label">Cordon plan</div>
          <ul className="muted">
            {incident.cordon.methodologyNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className="section-label">Resources placed</div>
          <ul>
            {incident.cordon.resources.map((r) => (
              <li key={r.id}>
                {r.callSign} — {r.type} ({r.cordonRing})
              </li>
            ))}
          </ul>
        </>
      )}

      {incident.landSar && (
        <>
          <div className="section-label">Land SAR briefing</div>
          <div className="briefing" data-testid="land-sar-briefing">
            {incident.landSar.briefing}
          </div>
          <div className="tag-row">
            <span className="tag">Max {(incident.landSar.maxDistanceM / 1000).toFixed(2)} km</span>
            {incident.landSar.clippedByWater && <span className="tag ok">Water clipped</span>}
          </div>
        </>
      )}

      {incident.marineSar && (
        <>
          <div className="section-label">Marine SAR briefing</div>
          <div className="briefing" data-testid="marine-sar-briefing">
            {incident.marineSar.briefing}
          </div>
          <div className="tag-row">
            <span className="tag">Fudge {incident.marineSar.fudgeFactor * 100}%</span>
            <span className="tag">
              Radius {(incident.marineSar.searchRadiusM / 1000).toFixed(2)} km
            </span>
          </div>
        </>
      )}

      {incident.publicOrder && (
        <>
          <div className="section-label">Public order</div>
          <p className="muted">
            Snapped features: {incident.publicOrder.snappedFeatures.join(', ') || 'drawn route'}
          </p>
          <ul>
            {incident.publicOrder.policePositions.map((p) => (
              <li key={`${p.label}-${p.lat}`}>
                {p.label} — {p.reason}
              </li>
            ))}
          </ul>
          {incident.publicOrder.linkedOpposingIncidentId ? (
            <span className="tag ok">
              Linked opposing: {incident.publicOrder.linkedOpposingIncidentId}
            </span>
          ) : (
            otherPublicOrders.length > 0 &&
            userHas(viewer, 'incident:edit') && (
              <div className="stack">
                {otherPublicOrders.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="btn"
                    data-testid={`link-opposing-${o.id}`}
                    onClick={() => linkPublicOrderOpposing(incident.id, o.id)}
                  >
                    Join opposing: {o.jobNumber}
                  </button>
                ))}
              </div>
            )
          )}
        </>
      )}

      {incident.roadBlock && (
        <>
          <div className="section-label">Road block / spikes</div>
          <p className="muted">{incident.roadBlock.likelyEscapeDirection}</p>
          <ul>
            {incident.roadBlock.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className="tag-row">
            <span className="tag">{incident.roadBlock.spikePoints.length} spike points</span>
          </div>
        </>
      )}

      <div className="section-label">Units on map (privacy filtered)</div>
      <ul data-testid="visible-tracks">
        {shownTracks.map((t) => (
          <li key={t.userId}>
            {t.callSign} — {t.name}
            {t.isSert ? ' (SERT)' : ''}
          </li>
        ))}
      </ul>

      {viewer.isSert && (
        <div className="stack" style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn"
            data-testid="sert-share-toggle"
            onClick={() => {
              const mine = tracks.find((t) => t.userId === viewer.id);
              setSertShare(viewer.id, incident.id, !(mine?.shareWithNonSert ?? false));
            }}
          >
            Toggle share my SERT location with non-SERT
          </button>
        </div>
      )}

      <div className="section-label">Structure sides</div>
      <div className="structure-swatches">
        {(Object.keys(STRUCTURE_SIDE_COLOURS) as Array<keyof typeof STRUCTURE_SIDE_COLOURS>).map(
          (side) => (
            <div
              key={side}
              className="swatch"
              style={{ background: STRUCTURE_SIDE_COLOURS[side], color: side === 'front' || side === 'left' ? '#111' : '#fff' }}
            >
              {side}
            </div>
          ),
        )}
      </div>
      <p className="muted" style={{ fontSize: '0.82rem' }}>
        Shift-click map to place next side label. Labels on this job:{' '}
        {structureLabels.filter((s) => s.incidentId === incident.id).length}
      </p>
      <p className="muted" style={{ fontSize: '0.82rem' }}>
        Annotations: {markings.filter((m) => m.incidentId === incident.id).length} (Alt-click map)
      </p>

      <div className="section-label">Air-gap check</div>
      <button
        type="button"
        className="btn"
        data-testid="probe-egress"
        onClick={() => {
          tryLeakIncidentData('https://api.openai.com/v1/chat/completions');
        }}
      >
        Probe blocked public AI egress
      </button>
      <p className="muted" data-testid="egress-blocked-count">
        Blocked attempts this session: {egressBlockedCount}
      </p>
    </aside>
  );
}
