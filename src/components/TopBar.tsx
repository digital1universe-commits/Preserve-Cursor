import { DEMO_USERS } from '../auth/roles';
import { usePreserveStore } from '../store/preserveStore';

export function TopBar() {
  const currentUserId = usePreserveStore((s) => s.currentUserId);
  const setCurrentUser = usePreserveStore((s) => s.setCurrentUser);
  const online = usePreserveStore((s) => s.online);
  const setOnline = usePreserveStore((s) => s.setOnline);
  const airGapEnforced = usePreserveStore((s) => s.airGapEnforced);
  const setAirGapEnforced = usePreserveStore((s) => s.setAirGapEnforced);
  const mapPitch3d = usePreserveStore((s) => s.mapPitch3d);
  const setMapPitch3d = usePreserveStore((s) => s.setMapPitch3d);
  const mapDarkMode = usePreserveStore((s) => s.mapDarkMode);
  const setMapDarkMode = usePreserveStore((s) => s.setMapDarkMode);
  const showStreetLights = usePreserveStore((s) => s.showStreetLights);
  const setShowStreetLights = usePreserveStore((s) => s.setShowStreetLights);
  const resetDemoData = usePreserveStore((s) => s.resetDemoData);

  const user = DEMO_USERS.find((u) => u.id === currentUserId) ?? DEMO_USERS[0];

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">Preserve</div>
        <div className="brand-sub">QLD Police · situational awareness</div>
      </div>
      <div className="topbar-controls">
        <label className="pill user-pill" htmlFor="user-select">
          User
          <select
            id="user-select"
            data-testid="user-select"
            value={currentUserId}
            onChange={(e) => setCurrentUser(e.target.value)}
          >
            {DEMO_USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.callSign} — {u.name} ({u.roleId})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`pill ${online ? 'active' : 'warn'}`}
          data-testid="toggle-online"
          onClick={() => setOnline(!online)}
        >
          {online ? 'Online' : 'Offline'}
        </button>
        <button
          type="button"
          className={`pill ${airGapEnforced ? 'active' : 'warn'}`}
          data-testid="toggle-airgap"
          onClick={() => setAirGapEnforced(!airGapEnforced)}
        >
          Air-gap {airGapEnforced ? 'ON' : 'OFF'}
        </button>
        <button
          type="button"
          className={`pill ${mapDarkMode ? 'active' : ''}`}
          data-testid="toggle-map-dark"
          onClick={() => setMapDarkMode(!mapDarkMode)}
        >
          Map {mapDarkMode ? 'dark' : 'light'}
        </button>
        <button
          type="button"
          className={`pill ${mapPitch3d ? 'active' : ''}`}
          data-testid="toggle-3d"
          onClick={() => setMapPitch3d(!mapPitch3d)}
        >
          3D orbit
        </button>
        <button
          type="button"
          className={`pill ${showStreetLights ? 'active' : ''}`}
          data-testid="toggle-lights"
          aria-pressed={showStreetLights}
          onClick={() => setShowStreetLights(!showStreetLights)}
        >
          Street lights {showStreetLights ? 'ON' : 'OFF'}
        </button>
        <button type="button" className="pill" onClick={() => resetDemoData()}>
          Reset seed
        </button>
        <span className="pill">{user.callSign}</span>
      </div>
    </header>
  );
}
