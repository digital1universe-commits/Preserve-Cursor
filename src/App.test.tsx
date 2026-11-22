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
      draftType: null,
      markings: [],
      structureLabels: [],
      mapPitch3d: false,
      mapDarkMode: true,
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

  it('new cordon opens form and creates a distinct job on submit', async () => {
    const user = userEvent.setup();
    usePreserveStore.setState({ trackingConsent: true });
    render(<App />);

    await user.click(screen.getByTestId('new-cordon'));
    expect(screen.getByTestId('new-incident-form')).toBeInTheDocument();
    expect(screen.getByTestId('form-job-number')).toBeInTheDocument();
    expect(screen.getByTestId('form-security-level')).toBeInTheDocument();
    expect(screen.getByTestId('form-cordon-resources')).toBeInTheDocument();

    await user.clear(screen.getByTestId('form-title'));
    await user.type(screen.getByTestId('form-title'), 'Form Cordon A');
    await user.click(screen.getByTestId('form-submit-create'));

    const firstId = usePreserveStore.getState().activeIncidentId;
    expect(firstId).toBeTruthy();
    expect(usePreserveStore.getState().incidents[0].title).toBe('Form Cordon A');
    expect(screen.queryByTestId('new-incident-form')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('new-cordon'));
    await user.clear(screen.getByTestId('form-title'));
    await user.type(screen.getByTestId('form-title'), 'Form Cordon B');
    await user.click(screen.getByTestId('form-submit-create'));

    const secondId = usePreserveStore.getState().activeIncidentId;
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
    expect(usePreserveStore.getState().incidents.filter((i) => i.type === 'cordon').length).toBe(2);
  });

  it('toggles street lights and map dark mode state', async () => {
    const user = userEvent.setup();
    usePreserveStore.setState({ trackingConsent: true });
    render(<App />);

    expect(usePreserveStore.getState().showStreetLights).toBe(false);
    await user.click(screen.getByTestId('toggle-lights'));
    expect(usePreserveStore.getState().showStreetLights).toBe(true);

    expect(usePreserveStore.getState().mapDarkMode).toBe(true);
    await user.click(screen.getByTestId('toggle-map-dark'));
    expect(usePreserveStore.getState().mapDarkMode).toBe(false);
  });
});
