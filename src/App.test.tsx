import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { usePreserveStore } from './store/preserveStore';

vi.mock('./components/MapView', () => ({
  MapView: () => <div data-testid="map-root">map</div>,
}));

describe('App gate and new-incident UX', () => {
  beforeEach(() => {
    localStorage.clear();
    usePreserveStore.setState({
      trackingConsent: null,
      currentUserId: 'u-comms',
      incidents: [],
      activeIncidentId: null,
      markings: [],
      structureLabels: [],
      mapPitch3d: false,
      showStreetLights: false,
      online: true,
      airGapEnforced: true,
      egressBlockedCount: 0,
    });
  });

  it('requires tracking consent before shell', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('tracking-gate')).toBeInTheDocument();
    await user.click(screen.getByTestId('deny-tracking'));
    expect(screen.getByTestId('tracking-gate')).toBeInTheDocument();
    await user.click(screen.getByTestId('accept-tracking'));
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
  });

  it('new cordon button creates a new job each click', async () => {
    const user = userEvent.setup();
    usePreserveStore.setState({ trackingConsent: true });
    render(<App />);

    await user.click(screen.getByTestId('new-cordon'));
    const firstId = usePreserveStore.getState().activeIncidentId;
    await user.click(screen.getByTestId('new-cordon'));
    const secondId = usePreserveStore.getState().activeIncidentId;
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
    expect(usePreserveStore.getState().incidents.filter((i) => i.type === 'cordon').length).toBe(2);
  });
});
