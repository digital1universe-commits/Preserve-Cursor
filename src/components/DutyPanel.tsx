import { INCIDENT_TYPE_LABELS } from '../domain/types';
import { usePreserveStore } from '../store/preserveStore';

const ALERTS = [
  {
    id: 'a1',
    level: 'priority' as const,
    title: 'Priority 2 — Fortitude Valley',
    detail: 'Siege CAD open · Ann St containment active',
    time: '21:14',
  },
  {
    id: 'a2',
    level: 'traffic' as const,
    title: 'Road disruption — Victoria Bridge',
    detail: 'Public order march route may impact CBD approaches',
    time: '20:58',
  },
  {
    id: 'a3',
    level: 'info' as const,
    title: 'Marine SAR watch — Moreton Bay',
    detail: 'Recreational vessel overdue · search sectors tasked',
    time: '20:41',
  },
  {
    id: 'a4',
    level: 'weather' as const,
    title: 'BOM wind advisory',
    detail: 'SE 20–30 km/h · gusts to 45 · bay chop rising',
    time: '20:30',
  },
];

const WEATHER = {
  location: 'Brisbane CBD',
  condition: 'Clear · night',
  tempC: 21,
  feelsC: 19,
  wind: 'SE 22 km/h',
  humidity: '58%',
  visibility: '16 km',
  updated: 'BOM synthetic · local demo',
};

export function DutyPanel() {
  const incidents = usePreserveStore((s) => s.incidents);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  const openIncidentWorkspace = usePreserveStore((s) => s.openIncidentWorkspace);
  const joinIncident = usePreserveStore((s) => s.joinIncident);
  const selected = incidents.find((i) => i.id === activeIncidentId) ?? null;
  const activeCount = incidents.filter((i) => i.status === 'active').length;
  const openCount = incidents.filter((i) => i.status === 'open').length;

  return (
    <aside className="duty-panel" data-testid="duty-panel">
      <div className="duty-head">
        <h2>Duty desk</h2>
        <div className="rail-sub">
          {activeCount} active · {openCount} open
        </div>
      </div>

      <section className="duty-section">
        <div className="section-label">Weather</div>
        <div className="weather-card" data-testid="duty-weather">
          <div className="weather-top">
            <div>
              <div className="weather-loc">{WEATHER.location}</div>
              <div className="weather-cond">{WEATHER.condition}</div>
            </div>
            <div className="weather-temp">
              {WEATHER.tempC}
              <span>°C</span>
            </div>
          </div>
          <div className="weather-grid">
            <span>Feels {WEATHER.feelsC}°</span>
            <span>{WEATHER.wind}</span>
            <span>RH {WEATHER.humidity}</span>
            <span>Vis {WEATHER.visibility}</span>
          </div>
          <div className="weather-note">{WEATHER.updated}</div>
        </div>
      </section>

      <section className="duty-section duty-alerts">
        <div className="section-label">Alerts</div>
        <div className="alert-list" data-testid="duty-alerts">
          {ALERTS.map((a) => (
            <article key={a.id} className={`duty-alert level-${a.level}`}>
              <div className="alert-meta">
                <span className="alert-level">{a.level}</span>
                <span className="alert-time">{a.time}</span>
              </div>
              <div className="alert-title">{a.title}</div>
              <div className="alert-detail">{a.detail}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="duty-section">
        <div className="section-label">Selected job</div>
        {selected ? (
          <div className="selected-job-card" data-testid="duty-selected-job">
            <div className="cad">{selected.jobNumber}</div>
            <div className="title">{selected.title}</div>
            <div className="muted">
              {INCIDENT_TYPE_LABELS[selected.type]} · {selected.status} · {selected.securityLevel}
            </div>
            <div className="stack" style={{ marginTop: '0.55rem' }}>
              <button
                type="button"
                className="btn primary block"
                data-testid="open-incident-workspace"
                onClick={() => openIncidentWorkspace(selected.id)}
              >
                Open on map
              </button>
              <button
                type="button"
                className="btn ghost block"
                onClick={() => {
                  joinIncident(selected.id);
                  openIncidentWorkspace(selected.id);
                }}
              >
                Join & open
              </button>
            </div>
          </div>
        ) : (
          <p className="muted duty-empty">Select a CAD row to preview actions.</p>
        )}
      </section>
    </aside>
  );
}
