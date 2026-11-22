import { TrackingGate } from './components/TrackingGate';
import { OpsTopBar } from './components/OpsTopBar';
import { JobsRail } from './components/JobsRail';
import { MapView } from './components/MapView';
import { IncidentDrawer } from './components/IncidentDrawer';
import { CadWizard } from './components/CadWizard';
import { DutyPanel } from './components/DutyPanel';
import { usePreserveStore } from './store/preserveStore';

export default function App() {
  const consent = usePreserveStore((s) => s.trackingConsent);
  const workspaceMode = usePreserveStore((s) => s.workspaceMode);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  if (consent !== true) return <TrackingGate />;

  const home = workspaceMode === 'home';

  return (
    <div
      className={`ops-shell ${home ? 'mode-home' : 'mode-incident'}`}
      data-testid="app-shell"
      data-workspace={workspaceMode}
    >
      <OpsTopBar />
      <JobsRail />
      {home ? (
        <div className="home-right-stack" data-testid="home-right-stack">
          <MapView />
          <DutyPanel />
        </div>
      ) : (
        <>
          <MapView />
          <IncidentDrawer open={Boolean(activeIncidentId)} />
        </>
      )}
      <CadWizard />
    </div>
  );
}
