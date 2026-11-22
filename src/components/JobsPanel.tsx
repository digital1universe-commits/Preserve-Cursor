import type { IncidentType } from '../domain/types';
import { INCIDENT_TYPE_LABELS } from '../domain/types';
import { usePreserveStore } from '../store/preserveStore';
import { userHas } from '../auth/roles';
import { DEMO_USERS } from '../auth/roles';

const NEW_TYPES: IncidentType[] = ['cordon', 'land_sar', 'marine_sar', 'public_order', 'road_block'];

export function JobsPanel() {
  const incidents = usePreserveStore((s) => s.incidents);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  const openNewIncidentForm = usePreserveStore((s) => s.openNewIncidentForm);
  const selectIncident = usePreserveStore((s) => s.selectIncident);
  const currentUserId = usePreserveStore((s) => s.currentUserId);
  const user = DEMO_USERS.find((u) => u.id === currentUserId) ?? DEMO_USERS[0];
  const canCreate = userHas(user, 'incident:create');

  return (
    <aside className="side" data-testid="jobs-panel">
      <h2 className="panel-title">Jobs</h2>

      {canCreate && (
        <>
          <div className="section-label">Create new incident</div>
          <div className="new-incident-grid">
            {NEW_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="btn"
                data-testid={`new-${type}`}
                onClick={() => {
                  // HARD RULE: opens a form that always creates a NEW incident — never an existing one.
                  openNewIncidentForm(type);
                }}
              >
                New {INCIDENT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-label">Open jobs</div>
      <ul className="job-list" data-testid="job-list">
        {incidents.map((inc) => (
          <li key={inc.id}>
            <button
              type="button"
              className={`job-item ${inc.id === activeIncidentId ? 'active' : ''}`}
              data-testid={`job-${inc.id}`}
              onClick={() => selectIncident(inc.id)}
              style={{ width: '100%' }}
            >
              <div className="job-no">{inc.jobNumber}</div>
              <div>{inc.title}</div>
              <div className="meta">
                {INCIDENT_TYPE_LABELS[inc.type]} · {inc.securityLevel} · {inc.status}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
