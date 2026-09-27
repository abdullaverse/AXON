// AXON — simulator.js
// Judge-facing Digital Twin adapter.
// The browser DOES NOT invent the headline landslide risk. It starts the
// FastAPI Digital Twin and polls /simulation/intelligence, which already
// contains the server simulation + real /fusion landslide-model result +
// backend safe_route.

import { State } from './state.js';
import { Api } from './api.js';
import { pushEvent } from './telemetry.js';
import { applyBackendEvacuation } from './community.js';
import { evaluateRouting } from './routing.js';

let pollHandle = null;
let lastStage = null;
let lastRiskBand = null;
let lastRouteSig = null;
let lastNetworkFailed = false;

function riskLevel(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'MODERATE';
  if (score >= 20) return 'LOW';
  return 'NORMAL';
}

function floodDemoScore(levelM) {
  // Visualization only: river progression indicator, NOT flood_model.pkl output.
  // 1.2 m baseline -> 0; 3.5 m -> ~75.
  return Math.max(0, Math.min(75, ((Number(levelM) - 1.2) / 2.3) * 75));
}

function applyConnectivity(networkFailed) {
  State.set('simulation.networkFailureActive', !!networkFailed);
  if (networkFailed) {
    State.setReading('connectivity.internet', false, 'OFFLINE');
    State.setReading('connectivity.googleRoutes', false, 'OFFLINE');
    State.setReading('connectivity.satellite', false, 'STALE');
    State.setReading('cloud.status', 'BUFFERING', 'BUFFERING');
    State.setReading('connectivity.lora', true, 'SIMULATED');
    State.setReading('connectivity.edge', true, 'ACTIVE');
  } else {
    State.setReading('connectivity.internet', true, 'LIVE');
    State.setReading('connectivity.googleRoutes', true, 'LIVE');
    State.setReading('connectivity.satellite', true, 'CACHED');
    State.setReading('cloud.status', 'CONNECTED', 'LIVE');
  }
}

async function applyResponse(payload) {
  const sim = payload?.simulation || {};
  const sensors = sim.sensors || {};
  const intelligence = payload?.intelligence || {};
  const hazards = intelligence.hazards || {};

  State.set('mode', 'TWIN');
  State.set('simulation.scenario', 'CASCADE_DISASTER');
  State.set('simulation.running', !!sim.running && !sim.paused);
  State.set('simulation.clock_s', Number(sim.elapsed || 0));
  State.set('simulation.stage', sim.stage || 'SYSTEM NORMAL');

  // Raw Digital Twin sensor readings — clearly SIMULATED.
  if (sensors.rainfall != null) State.setReading('nodes.H01.rainfall', Number(sensors.rainfall), 'SIMULATED');
  if (sensors.soil_moisture != null) State.setReading('nodes.H01.soil', Number(sensors.soil_moisture), 'SIMULATED');
  if (sensors.vibration != null) State.setReading('nodes.H01.vibration', Number(sensors.vibration), 'SIMULATED');
  if (sensors.water_level_m != null) State.setReading('nodes.R01.river', Number(sensors.water_level_m), 'SIMULATED');
  if (sensors.temperature != null) State.setReading('nodes.F01.temp', Number(sensors.temperature), 'SIMULATED');
  if (sensors.humidity != null) State.setReading('nodes.F01.humidity', Number(sensors.humidity), 'SIMULATED');
  if (sensors.smoke != null) State.setReading('nodes.F01.smoke', Number(sensors.smoke), 'SIMULATED');
  if (sensors.pm25 != null) State.setReading('nodes.A01.pm25', Number(sensors.pm25), 'SIMULATED');

  // Real trained landslide model result coming from backend /fusion.
  if (hazards.landslide && typeof hazards.landslide.risk === 'number') {
    const risk = Number(hazards.landslide.risk);
    State.setReading('hazards.landslide', {
      score: risk,
      level: hazards.landslide.level || riskLevel(risk),
      probability: hazards.landslide.probability,
    }, 'MODEL');

    const band = risk >= 70 ? 'EVACUATE' : risk >= 60 ? 'HIGH' : risk >= 40 ? 'WATCH' : 'NORMAL';
    if (band !== lastRiskBand) {
      lastRiskBand = band;
      pushEvent({ category: 'AI', message: `Real landslide model → ${risk.toFixed(2)}% · ${hazards.landslide.level || riskLevel(risk)}` });
    }
  }

  // Flood is currently a visual Digital Twin progression, explicitly not model output.
  if (sensors.water_level_m != null) {
    const score = floodDemoScore(sensors.water_level_m);
    State.setReading('hazards.flood', { score, level: riskLevel(score) }, 'SIMULATED');
  }
  State.setReading('hazards.fire', { score: 4, level: 'NORMAL' }, 'SIMULATED');
  State.setReading('hazards.pollution', { score: 8, level: 'NORMAL' }, 'SIMULATED');

  if (sim.stage && sim.stage !== lastStage) {
    lastStage = sim.stage;
    pushEvent({ category: 'SIMULATION', message: `Digital Twin stage → ${String(sim.stage).replaceAll('_', ' ')}` });
  }

  if (intelligence.safe_route?.status === 'SAFE_ROUTE_FOUND') {
    const route = intelligence.safe_route;
    State.set('routing.backendSafeRoute', route);
    State.set('routing.offlineResult', route); // render the authoritative AXON safe route on the map
    const sig = `${route.destination}:${(route.path || []).join('>')}`;
    if (sig !== lastRouteSig) {
      lastRouteSig = sig;
      pushEvent({ category: 'ROUTING', message: `AXON safe route → ${route.destination} · ${(route.path || []).join(' → ')} · ${route.distance_km} km` });
    }
  }

  if (intelligence.evacuation?.required) {
    applyBackendEvacuation(intelligence);
  }

  applyConnectivity(!!sim.network_failed);
  if (!!sim.network_failed !== lastNetworkFailed) {
    lastNetworkFailed = !!sim.network_failed;
    pushEvent({
      category: 'NETWORK',
      message: sim.network_failed
        ? 'NETWORK FAILURE DETECTED — Google/cloud unavailable; Edge + LoRa + local route continue'
        : 'Network state normal',
    });
    await evaluateRouting();
  }
}

async function poll() {
  const res = await Api.getDigitalTwinIntelligence();
  if (!res.ok) {
    pushEvent({ category: 'SYSTEM', message: `Digital Twin intelligence unavailable (${res.error || 'request failed'})` });
    return;
  }
  await applyResponse(res.data);
}

function startPolling() {
  stopPolling();
  pollHandle = setInterval(poll, 1000);
  poll();
}

function stopPolling() {
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = null;
}

export async function startScenario() {
  const res = await Api.startDigitalTwin();
  if (!res.ok) {
    pushEvent({ category: 'SYSTEM', message: `Cannot start backend Digital Twin: ${res.error}` });
    return;
  }
  lastStage = null;
  lastRiskBand = null;
  lastRouteSig = null;
  State.set('mode', 'TWIN');
  State.set('simulation.scenario', 'CASCADE_DISASTER');
  State.set('simulation.running', true);
  pushEvent({ category: 'SIMULATION', message: 'CASCADE DISASTER started — backend Digital Twin' });
  startPolling();
}

export async function pauseScenario() {
  const res = await Api.pauseDigitalTwin();
  if (res.ok) {
    State.set('simulation.running', false);
    await poll();
    pushEvent({ category: 'SIMULATION', message: 'Digital Twin paused' });
  }
}

// Backend currently has no resume-without-reset endpoint. START restarts a deterministic demo.
export async function resumeScenario() {
  return startScenario();
}

export async function resetScenario() {
  await Api.resetDigitalTwin();
  stopPolling();
  lastStage = null;
  lastRiskBand = null;
  lastRouteSig = null;
  lastNetworkFailed = false;
  State.set('simulation.scenario', 'CASCADE_DISASTER');
  State.set('simulation.clock_s', 0);
  State.set('simulation.running', false);
  State.set('simulation.stage', 'SYSTEM NORMAL');
  State.set('simulation.networkFailureActive', false);
  for (const h of ['landslide', 'flood', 'fire', 'pollution']) {
    State.setReading(`hazards.${h}`, { score: 0, level: 'AWAITING' }, 'NO DATA');
  }
  State.set('routing.backendSafeRoute', null);
  State.set('routing.offlineResult', null);
  State.set('community.siren', 'READY');
  State.set('community.display', 'SYSTEM NORMAL');
  State.set('community.directionLeds', 'READY');
  applyConnectivity(false);
  pushEvent({ category: 'SIMULATION', message: 'Digital Twin reset — system normal' });
}

export function setSpeed() {
  // Server Digital Twin currently runs deterministic 1× real time.
}

export function isRunning() {
  return !!State.get('simulation.running');
}

export async function triggerNetworkFailure() {
  const res = await Api.triggerDigitalTwinNetworkFailure();
  if (res.ok) await poll();
  return res;
}

export async function syncOnce() {
  return poll();
}
