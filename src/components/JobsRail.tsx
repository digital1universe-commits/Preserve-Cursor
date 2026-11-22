import type { IncidentType } from '../domain/types';
import { INCIDENT_TYPE_LABELS } from '../domain/types';
import { DEMO_USERS, userHas } from '../auth/roles';
import { usePreserveStore } from '../store/preserveStore';

const NEW_TYPES: IncidentType[] = ['cordon', 'land_sar', 'marine_sar', 'public_order', 'road_block'];

export function JobsRail() {
  const incidents = usePreserveStore((s) => s.incidents);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  const openNewIncidentForm = usePreserveStore((s) => s.openNewIncidentForm);
  const selectIncident = usePreserveStore((s) => s.selectIncident);
  const currentUserId = usePreserveStore((s) => s.currentUserId);
  const user = DEMO_USERS.find((u) => u.id === currentUserId) ?? DEMO_USERS[0];
  const canCreate = userHas(user, 'incident:create');

  return (
    <aside className="ops-rail" data-testid="jobs-panel">
      <div className="rail-head">
        <h2>Jobs board</h2>
      </div>

      {canCreate && (
        <>
          <div className="rail-section">New incident · CAD entry</div>
          <div className="create-stack">
            {NEW_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="btn compact"
                data-testid={`new-${type}`}
                onClick={() => openNewIncidentForm(type)}
              >
                New {INCIDENT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="rail-section">Open jobs · {incidents.length}</div>
      <div className="job-scroll" data-testid="job-list">
        {incidents.map((inc) => (
          <button
            key={inc.id}
            type="button"
            className={`job-row ${inc.id === activeIncidentId ? 'active' : ''}`}
            data-testid={`job-${inc.id}`}
            onClick={() => selectIncident(inc.id)}
          >
            <div className="cad">{inc.jobNumber}</div>
            <div className="title">{inc.title}</div>
            <div className="meta">
              {INCIDENT_TYPE_LABELS[inc.type]} · {inc.securityLevel} · {inc.status}
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}
