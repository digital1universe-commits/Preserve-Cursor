import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { usePreserveStore } from './store/preserveStore';

vi.mock('./components/MapView', () => ({
  MapView: () => <div data-testid="map-root">map</div>,
}));

describe('Preserve night-ops shell', () => {
  beforeEach(() => {
    localStorage.clear();
    usePreserveStore.setState({
      trackingConsent: null,
      currentUserId: 'u-comms',
      incidents: [],
      activeIncidentId: null,
      draftType: null,
      markings: [],
      structureLabels: [],
      mapPitch3d: true,
      mapDarkMode: true,
      showStreetLights: false,
      online: true,
      airGapEnforced: true,
      egressBlockedCount: 0,
    });
  });

  it('requires tracking consent', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('tracking-gate')).toBeInTheDocument();
    await user.click(screen.getByTestId('accept-tracking'));
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
  });

  it('CAD wizard creates distinct new jobs', async () => {
    const user = userEvent.setup();
    usePreserveStore.setState({ trackingConsent: true });
    render(<App />);

    await user.click(screen.getByTestId('new-cordon'));
    expect(screen.getByTestId('new-incident-form')).toBeInTheDocument();
    await user.type(screen.getByTestId('form-title'), 'Wizard Cordon A');
    await user.click(screen.getByTestId('form-next'));
    expect(screen.getByTestId('form-cordon-resources')).toBeInTheDocument();
    await user.click(screen.getByTestId('form-next'));
    await user.click(screen.getByTestId('form-submit-create'));

    const firstId = usePreserveStore.getState().activeIncidentId;
    expect(firstId).toBeTruthy();
    expect(usePreserveStore.getState().incidents[0].title).toContain('Wizard Cordon A');

    await user.click(screen.getByTestId('new-cordon'));
    await user.type(screen.getByTestId('form-title'), 'Wizard Cordon B');
    await user.click(screen.getByTestId('form-next'));
    await user.click(screen.getByTestId('form-next'));
    await user.click(screen.getByTestId('form-submit-create'));
    expect(usePreserveStore.getState().activeIncidentId).not.toBe(firstId);
    expect(usePreserveStore.getState().incidents.filter((i) => i.type === 'cordon')).toHaveLength(2);
  });
});
