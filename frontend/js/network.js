// AXON — network.js
// Judge demo network-failure overlay. The backend Digital Twin remains running;
// only cloud-dependent services flip offline. LoRa/Edge/local routing remain active.

import { State } from './state.js';
import { Api } from './api.js';
import { pushEvent } from './telemetry.js';
import { evaluateRouting } from './routing.js';

export async function triggerNetworkFailure() {
  if (State.get('simulation.networkFailureActive')) return { ok: true, alreadyActive: true };

  const res = await Api.triggerDigitalTwinNetworkFailure();
  if (!res.ok) {
    pushEvent({ category: 'NETWORK', message: `Network-failure trigger failed: ${res.error}` });
    return res;
  }

  State.set('simulation.networkFailureActive', true);
  State.setReading('connectivity.internet', false, 'OFFLINE');
  State.setReading('connectivity.googleRoutes', false, 'OFFLINE');
  State.setReading('connectivity.satellite', false, 'STALE');
  State.setReading('cloud.status', 'BUFFERING', 'BUFFERING');
  State.setReading('connectivity.lora', true, 'SIMULATED');
  State.setReading('connectivity.edge', true, 'ACTIVE');

  pushEvent({ category: 'NETWORK', message: 'NETWORK FAILURE DETECTED — switching to AXON resilient mode' });
  await evaluateRouting();
  pushEvent({ category: 'NETWORK', message: 'OFFLINE EMERGENCY MODE ACTIVE — LoRa, Edge AI, cached routing and C01 continue' });
  return res;
}

export async function restoreNetwork() {
  // The backend Digital Twin deliberately keeps network failure latched for the
  // disaster demonstration. RESET is the authoritative way to restore normal state.
  pushEvent({ category: 'NETWORK', message: 'Use RESET to restore the complete Digital Twin to normal network state' });
  return { ok: false, resetRequired: true };
}
