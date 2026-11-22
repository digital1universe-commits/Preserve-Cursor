import { TrackingGate } from './components/TrackingGate';
import { OpsTopBar } from './components/OpsTopBar';
import { JobsRail } from './components/JobsRail';
import { MapView } from './components/MapView';
import { IncidentDrawer } from './components/IncidentDrawer';
import { CadWizard } from './components/CadWizard';
import { usePreserveStore } from './store/preserveStore';

export default function App() {
  const consent = usePreserveStore((s) => s.trackingConsent);
  const activeIncidentId = usePreserveStore((s) => s.activeIncidentId);
  if (consent !== true) return <TrackingGate />;
  return (
    <div className="ops-shell" data-testid="app-shell">
      <OpsTopBar />
      <JobsRail />
      <MapView />
      <IncidentDrawer open={Boolean(activeIncidentId)} />
      <CadWizard />
    </div>
  );
}
