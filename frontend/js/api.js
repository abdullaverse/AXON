// AXON — api.js
// Talks to the real FastAPI backend for every CONFIRMED endpoint.
// For endpoints marked needsBackend in config.js, calls resolve to
// { unavailable: true, endpoint } instead of throwing OR fabricating data.
// This module never invents sensor readings or hazard scores.

import { ENDPOINTS } from './config.js';

async function request(path, { method = 'GET', body } = {}) {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.message || 'NETWORK_ERROR' };
  }
}

function unavailable(endpointDescriptor) {
  const path = typeof endpointDescriptor === 'string' ? endpointDescriptor : endpointDescriptor.path;
  return Promise.resolve({ ok: false, unavailable: true, endpoint: path, error: 'LIVE DATA UNAVAILABLE' });
}

export const Api = {
  // ---- Confirmed live endpoints ----
  getLatest: () => request(ENDPOINTS.latest),
  getRisk: () => request(ENDPOINTS.risk),
  getDashboard: () => request(ENDPOINTS.dashboard),

  postSensorData: (payload) => request(ENDPOINTS.sensorData, { method: 'POST', body: payload }),

  // Primary model-inference endpoint. Confirmed working for landslide inputs.
  // Payload shape is intentionally hazard-tagged so the backend can route to
  // whichever engineered-feature adapter exists; if a given hazard's adapter
  // isn't implemented yet the backend response (or its absence) should be
  // treated as MODEL ADAPTER REQUIRED by the caller — this function does not
  // paper over that.
  postFusion: (payload) => request(ENDPOINTS.fusion, { method: 'POST', body: payload }),

  postSimulationScenario: (payload) => request(ENDPOINTS.simScenario, { method: 'POST', body: payload }),
  postNetworkToggle: (payload) => request(ENDPOINTS.simNetworkToggle, { method: 'POST', body: payload }),

  // Server-side Digital Twin endpoints used by the judge-facing demo.
  startDigitalTwin: () => request(ENDPOINTS.simStart, { method: 'POST' }),
  pauseDigitalTwin: () => request(ENDPOINTS.simPause, { method: 'POST' }),
  resetDigitalTwin: () => request(ENDPOINTS.simReset, { method: 'POST' }),
  getDigitalTwinState: () => request(ENDPOINTS.simState),
  getDigitalTwinIntelligence: () => request(ENDPOINTS.simIntelligence),
  triggerDigitalTwinNetworkFailure: () => request(ENDPOINTS.simNetworkFailure, { method: 'POST' }),

  // ---- Not-yet-confirmed endpoints: explicit placeholders ----
  getSystemStatus: () => unavailable(ENDPOINTS.systemStatus),
  getCommunity: () => unavailable(ENDPOINTS.community),
  getEvents: () => unavailable(ENDPOINTS.events),
  getRoutingInspector: () => unavailable(ENDPOINTS.routingInspector),

  // Google-Routes-backed safe-route lookup. The API key must never reach the
  // browser — this always goes through the backend, and until that backend
  // route exists this simply reports unavailable rather than calling Google
  // directly or fabricating a result.
  getGoogleSafeRoute: (origin, destination, hazards = []) => {
    if (ENDPOINTS.googleSafeRoute.needsBackend) return unavailable(ENDPOINTS.googleSafeRoute);
    return request(ENDPOINTS.googleSafeRoute.path, {
      method: 'POST',
      body: { origin, destination, hazards },
    });
  },
};
