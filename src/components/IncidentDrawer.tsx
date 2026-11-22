import { useEffect, useState } from 'react';
import { DEMO_USERS, userHas } from '../auth/roles';
import { INCIDENT_TYPE_LABELS, STRUCTURE_SIDE_COLOURS, type SecurityLevel } from '../domain/types';
import { QLD } from '../geo/qld';
import { visibleTracks } from '../tracking/visibility';
import { usePreserveStore } from '../store/preserveStore';

export function IncidentDrawer({ open }: { open: boolean }) {
  const incidents = usePreserveStore((s) => s.incidents);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  const joinIncident = usePreserveStore((s) => s.joinIncident);
  const selectIncident = usePreserveStore((s) => s.selectIncident);
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
    ? visibleTracks(viewer, tracks.filter((t) => !t.incidentId || t.incidentId === incident.id || t.userId === viewer.id))
    : [];

  useEffect(() => {
    if (!incident) return;
    setEditTitle(incident.title);
    setEditSecurity(incident.securityLevel);
    setEditSummary(incident.summary);
    if (incident.publicOrder?.route?.length) {
      const pts = incident.publicOrder.route;
      const step = Math.max(1, Math.floor(pts.length / 4));
      const samples = [pts[0], pts[Math.min(step, pts.length - 1)], pts[Math.min(step * 2, pts.length - 1)], pts[pts.length - 1]];
      setEditWaypoints(samples.map((p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`).join('\n'));
    } else {
      setEditWaypoints(`${QLD.southBank.lat}, ${QLD.southBank.lng}\n${QLD.brisbaneCbd.lat}, ${QLD.brisbaneCbd.lng}\n${QLD.fortitudeValley.lat}, ${QLD.fortitudeValley.lng}`);
    }
  }, [incident]);

  const otherPublicOrders = incidents.filter((i) => i.type === 'public_order' && i.id !== incident?.id);

  return (
    <aside className={`ops-drawer ${open && incident ? 'open' : ''}`} data-testid="detail-panel">
      {!incident ? (
        <div className="drawer-body"><p className="muted">Select a job or create a new CAD entry.</p></div>
      ) : (
        <div className="drawer-body">
          <div className="drawer-head">
            <h2>{incident.title}</h2>
            <button type="button" className="btn ghost compact" onClick={() => selectIncident(null)}>Close</button>
          </div>
          <div className="tag-row">
            <span className="tag">{incident.jobNumber}</span>
            <span className="tag">{INCIDENT_TYPE_LABELS[incident.type]}</span>
            <span className="tag">{incident.securityLevel}</span>
            <span className="tag ok">{incident.status}</span>
          </div>
          <p className="muted">{incident.summary}</p>
          <div className="stack" style={{ marginTop: '0.65rem' }}>
            <button type="button" className="btn primary block" onClick={() => joinIncident(incident.id)}>Join job</button>
          </div>

          {userHas(viewer, 'incident:edit') && (
            <div className="section">
              <div className="section-label">Edit job</div>
              <div className="stack">
                <div className="field"><label>Title</label><input data-testid="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} /></div>
                <div className="field"><label>Security</label>
                  <select data-testid="edit-security" value={editSecurity} onChange={(e) => setEditSecurity(e.target.value as SecurityLevel)}>
                    <option value="unclassified">unclassified</option>
                    <option value="protected">protected</option>
                    <option value="restricted">restricted</option>
                    <option value="secret">secret</option>
                  </select>
                </div>
                <div className="field"><label>Summary</label><textarea rows={2} value={editSummary} onChange={(e) => setEditSummary(e.target.value)} /></div>
                {incident.type === 'public_order' && (
                  <div className="field"><label>Route waypoints (re-snaps to streets/bridges)</label>
                    <textarea data-testid="edit-po-waypoints" rows={4} value={editWaypoints} onChange={(e) => setEditWaypoints(e.target.value)} /></div>
                )}
                <button type="button" className="btn" data-testid="save-incident-edits" onClick={() => replanIncident(incident.id, {
                  type: incident.type, title: editTitle, securityLevel: editSecurity, summary: editSummary,
                  publicOrder: incident.type === 'public_order' ? { waypointsText: editWaypoints } : undefined,
                })}>Save & replan</button>
              </div>
            </div>
          )}

          {incident.cordon && (
            <div className="section">
              <div className="section-label">Cordon plan</div>
              <ul className="list-dense">{incident.cordon.methodologyNotes.map((n) => <li key={n}>{n}</li>)}</ul>
              <div className="section-label" style={{ marginTop: '0.65rem' }}>Resources placed</div>
              <ul className="list-dense">{incident.cordon.resources.map((r) => <li key={r.id}>{r.callSign} — {r.type} ({r.cordonRing})</li>)}</ul>
            </div>
          )}
          {incident.landSar && (
            <div className="section">
              <div className="section-label">Land SAR briefing</div>
              <div className="briefing" data-testid="land-sar-briefing">{incident.landSar.briefing}</div>
              <div className="tag-row">
                <span className="tag">Max {(incident.landSar.maxDistanceM / 1000).toFixed(2)} km</span>
                {incident.landSar.clippedByWater && <span className="tag ok">Water clipped</span>}
              </div>
            </div>
          )}
          {incident.marineSar && (
            <div className="section">
              <div className="section-label">Marine SAR briefing</div>
              <div className="briefing" data-testid="marine-sar-briefing">{incident.marineSar.briefing}</div>
              <div className="tag-row">
                <span className="tag">Fudge {incident.marineSar.fudgeFactor * 100}%</span>
                <span className="tag">Radius {(incident.marineSar.searchRadiusM / 1000).toFixed(2)} km</span>
              </div>
            </div>
          )}
          {incident.publicOrder && (
            <div className="section">
              <div className="section-label">Public order</div>
              <p className="muted">Snapped features: {incident.publicOrder.snappedFeatures.join(', ')}</p>
              <ul className="list-dense">{incident.publicOrder.policePositions.map((p) => <li key={`${p.label}-${p.lat}`}>{p.label} — {p.reason}</li>)}</ul>
              {incident.publicOrder.linkedOpposingIncidentId ? (
                <span className="tag ok">Linked opposing: {incident.publicOrder.linkedOpposingIncidentId}</span>
              ) : (
                userHas(viewer, 'incident:edit') && otherPublicOrders.map((o) => (
                  <button key={o.id} type="button" className="btn" style={{ marginTop: 8 }} data-testid={`link-opposing-${o.id}`} onClick={() => linkPublicOrderOpposing(incident.id, o.id)}>
                    Join opposing: {o.jobNumber}
                  </button>
                ))
              )}
            </div>
          )}
          {incident.roadBlock && (
            <div className="section">
              <div className="section-label">Road block / spikes</div>
              <p className="muted">{incident.roadBlock.likelyEscapeDirection}</p>
              <ul className="list-dense">{incident.roadBlock.notes.map((n) => <li key={n}>{n}</li>)}</ul>
              <span className="tag">{incident.roadBlock.spikePoints.length} spike points</span>
            </div>
          )}

          <div className="section">
            <div className="section-label">Units on map</div>
            <ul className="list-dense" data-testid="visible-tracks">{shownTracks.map((t) => <li key={t.userId}>{t.callSign} — {t.name}{t.isSert ? ' (SERT)' : ''}</li>)}</ul>
            {viewer.isSert && (
              <button type="button" className="btn" style={{ marginTop: 8 }} data-testid="sert-share-toggle" onClick={() => {
                const mine = tracks.find((t) => t.userId === viewer.id);
                setSertShare(viewer.id, incident.id, !(mine?.shareWithNonSert ?? false));
              }}>Toggle share my SERT location</button>
            )}
          </div>

          <div className="section">
            <div className="section-label">Structure sides</div>
            <div className="swatches">
              {(Object.keys(STRUCTURE_SIDE_COLOURS) as Array<keyof typeof STRUCTURE_SIDE_COLOURS>).map((side) => (
                <div key={side} className="swatch" style={{ background: STRUCTURE_SIDE_COLOURS[side], color: side === 'back' || side === 'right' ? '#fff' : '#111' }}>{side}</div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: '0.78rem', marginTop: 8 }}>
              Shift-click map for side labels ({structureLabels.filter((s) => s.incidentId === incident.id).length}). Alt-click annotate ({markings.filter((m) => m.incidentId === incident.id).length}).
            </p>
          </div>

          <div className="section">
            <div className="section-label">Air-gap check</div>
            <button type="button" className="btn" data-testid="probe-egress" onClick={() => tryLeakIncidentData('https://api.openai.com/v1/chat/completions')}>
              Probe blocked public AI egress
            </button>
            <p className="muted" data-testid="egress-blocked-count">Blocked attempts: {egressBlockedCount}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
