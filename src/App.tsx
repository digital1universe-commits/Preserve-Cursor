import { TrackingGate } from './components/TrackingGate';
import { TopBar } from './components/TopBar';
import { JobsPanel } from './components/JobsPanel';
import { DetailPanel } from './components/DetailPanel';
import { MapView } from './components/MapView';
import { usePreserveStore } from './store/preserveStore';

export default function App() {
  const consent = usePreserveStore((s) => s.trackingConsent);

  if (consent !== true) {
    return <TrackingGate />;
  }

  return (
    <div className="app-shell" data-testid="app-shell">
      <TopBar />
      <JobsPanel />
      <MapView />
      <DetailPanel />
    </div>
  );
}
