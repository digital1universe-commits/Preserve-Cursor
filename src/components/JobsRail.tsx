import { useEffect, useRef, useState } from 'react';
import type { IncidentType, SecurityLevel } from '../domain/types';
import { INCIDENT_TYPE_LABELS } from '../domain/types';
import { DEMO_USERS, userHas } from '../auth/roles';
import { usePreserveStore } from '../store/preserveStore';

const NEW_TYPES: IncidentType[] = ['cordon', 'land_sar', 'marine_sar', 'public_order', 'road_block'];

const TYPE_SHORT: Record<IncidentType, string> = {
  cordon: 'CORDON',
  land_sar: 'MP/SAR',
  marine_sar: 'MARINE',
  public_order: 'PUB ORD',
  road_block: 'ROAD BLK',
};

const SEC_SHORT: Record<SecurityLevel, string> = {
  unclassified: 'U',
  protected: 'P',
  restricted: 'R',
  secret: 'S',
};

export function JobsRail() {
  const incidents = usePreserveStore((s) => s.incidents);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  const openNewIncidentForm = usePreserveStore((s) => s.openNewIncidentForm);
  const selectIncident = usePreserveStore((s) => s.selectIncident);
  const openIncidentWorkspace = usePreserveStore((s) => s.openIncidentWorkspace);
  const workspaceMode = usePreserveStore((s) => s.workspaceMode);
  const currentUserId = usePreserveStore((s) => s.currentUserId);
  const user = DEMO_USERS.find((u) => u.id === currentUserId) ?? DEMO_USERS[0];
  const canCreate = userHas(user, 'incident:create');

  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = filter.trim().toLowerCase();
  const visible = incidents.filter((inc) => {
    if (!q) return true;
    return (
      inc.jobNumber.toLowerCase().includes(q) ||
      inc.title.toLowerCase().includes(q) ||
      INCIDENT_TYPE_LABELS[inc.type].toLowerCase().includes(q) ||
      TYPE_SHORT[inc.type].toLowerCase().includes(q) ||
      inc.securityLevel.includes(q) ||
      inc.status.includes(q)
    );
  });

  return (
    <aside className="ops-rail" data-testid="jobs-panel">
      <div className="rail-head">
        <div className="rail-head-copy">
          <h2>Jobs board</h2>
          <div className="rail-sub">
            {visible.length === incidents.length
              ? `${incidents.length} jobs`
              : `${visible.length} of ${incidents.length}`}
            {' · '}duty scan
          </div>
        </div>
        {canCreate && (
          <div className="new-menu" ref={menuRef}>
            <button
              type="button"
              className="btn primary new-incident-btn"
              data-testid="new-incident-menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              + New incident
            </button>
            {menuOpen && (
              <div className="new-menu-panel" role="menu" data-testid="new-incident-menu-panel">
                {NEW_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`new-menu-item type-${type}`}
                    role="menuitem"
                    data-testid={`new-${type}`}
                    onClick={() => {
                      setMenuOpen(false);
                      openNewIncidentForm(type);
                    }}
                  >
                    <span className={`type-swatch type-${type}`} aria-hidden="true" />
                    <span className="new-menu-type">{TYPE_SHORT[type]}</span>
                    <span>{INCIDENT_TYPE_LABELS[type]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rail-filter">
        <input
          type="search"
          placeholder="Filter CAD, type, title, status…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="job-filter"
          aria-label="Filter jobs"
        />
      </div>

      <div className="job-table-head" aria-hidden="true">
        <span>CAD</span>
        <span>Type</span>
        <span>Title</span>
        <span>Status</span>
        <span>Sec</span>
      </div>

      <div className="job-scroll" data-testid="job-list" role="listbox" aria-label="Open jobs">
        {visible.length === 0 && <p className="rail-empty">No jobs match.</p>}
        {visible.map((inc) => {
          const selected = inc.id === activeIncidentId;
          return (
            <button
              key={inc.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`job-row type-${inc.type} ${selected ? 'active' : ''}`}
              data-testid={`job-${inc.id}`}
              onClick={() => {
                selectIncident(inc.id);
                if (workspaceMode === 'incident') openIncidentWorkspace(inc.id);
              }}
              onDoubleClick={() => openIncidentWorkspace(inc.id)}
            >
              <span className="cad">{inc.jobNumber}</span>
              <span className={`type-pill type-${inc.type}`}>{TYPE_SHORT[inc.type]}</span>
              <span className="title" title={inc.title}>
                {inc.title}
              </span>
              <span className={`status-pill status-${inc.status}`}>{inc.status}</span>
              <span
                className={`sec-pill sec-${inc.securityLevel}`}
                title={inc.securityLevel}
              >
                {SEC_SHORT[inc.securityLevel]}
                <span className="sec-full">{inc.securityLevel}</span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
