import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth";
import { canAdmin, canAudit } from "./format";

export function Shell() {
  const auth = useAuth();
  const user = auth.user!;
  return (
    <div className="app">
      <aside className="sidenav">
        <Brand />
        <nav>
          <NavLink to="/" end>
            Incidents
          </NavLink>
          <NavLink to="/security">Security</NavLink>
          {canAudit(user.role) && <NavLink to="/audit">Audit</NavLink>}
          {canAdmin(user.role) && <NavLink to="/admin">Accounts</NavLink>}
        </nav>
        <p className="sidenav-note">Planning stays on this installation. Case text is not sent to a model provider.</p>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-id">
            <Brand compact />
            <div>
              <strong>{user.agencyShort}</strong>
              <span>{user.appointment}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="seg" role="group" aria-label="Connection">
              <button type="button" className={auth.online ? "on" : ""} disabled={!auth.link} onClick={() => auth.setDevice(false)}>
                Link
              </button>
              <button type="button" className={!auth.online ? "on" : ""} onClick={() => auth.setDevice(true)}>
                On device
              </button>
            </div>
            <button type="button" className="text-button" onClick={() => void auth.signOut()}>
              Sign out
            </button>
          </div>
        </header>
        {(auth.evaluationInstall || auth.user?.evaluation) && (
          <div className="strip">Evaluation accounts are active. Records are encrypted, and this build is not cleared for a live operation.</div>
        )}
        {auth.outbox > 0 && (
          <div className="strip quiet">
            {auth.outbox} plan{auth.outbox === 1 ? "" : "s"} held on this device
            {auth.online ? ", syncing to the incident record." : ". They will sync when the link returns."}
          </div>
        )}
        <div className="content">
          <Outlet />
        </div>
      </div>
      <nav className="bottomnav">
        <NavLink to="/" end>
          Incidents
        </NavLink>
        <NavLink to="/security">Security</NavLink>
        {canAudit(user.role) && <NavLink to="/audit">Audit</NavLink>}
        {canAdmin(user.role) && <NavLink to="/admin">Accounts</NavLink>}
      </nav>
    </div>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand compact" : "brand"}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="2" y="2" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="16" cy="16" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 16 H22" stroke="#e2a45a" strokeWidth="2" />
      </svg>
      <span>PRESERVE</span>
    </div>
  );
}
