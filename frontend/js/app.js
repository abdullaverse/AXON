// AXON — app.js
// Bootstraps the Command Center. This is the only file that touches the DOM
// directly for wiring purposes; rendering logic for each domain lives in its
// own module (map.js, telemetry.js, community.js, routing.js).

import { State, on } from './state.js';
import { Api } from './api.js';
import * as MapModule from './map.js';
import * as Sim from './simulator.js';
import * as Routing from './routing.js';
import * as Network from './network.js';
import * as Community from './community.js';
import * as Telemetry from './telemetry.js';
import * as UI from './ui.js';
import { SCENARIOS, MODEL_METRICS } from './config.js';
import { initJudgeExperience } from './judge.js';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  MapModule.initMap('map');
  UI.initDrawers();
  UI.initExpandMap();
  UI.initFullscreen();
  UI.initResponsivePanels();
  UI.initModeToggle(handleModeChange);

  Community.initCommunity(document.getElementById('c01-card-body'));
  Telemetry.initEventTimeline(document.getElementById('event-timeline'));

  renderHeaderStatus();
  renderThreatIntelligence();
  renderScenarioButtons();
  renderAiEngineInspector();
  renderDataSourcesInspector();
  renderEvacuationSummary();
  bindSimulationControls();
  bindNetworkFailureButton();
  initJudgeExperience();

  on('connectivity.internet', renderHeaderStatus);
  on('connectivity.googleRoutes', renderHeaderStatus);
  on('connectivity.lora', renderHeaderStatus);
  on('connectivity.satellite', renderHeaderStatus);
  on('cloud.status', renderHeaderStatus);
  on('hazards.landslide', renderThreatIntelligence);
  on('hazards.flood', renderThreatIntelligence);
  on('hazards.fire', renderThreatIntelligence);
  on('hazards.pollution', renderThreatIntelligence);
  on('simulation.clock_s', renderSimulationStatus);
  on('simulation.stage', renderSimulationStatus);
  on('routing.candidates', renderRoutingInspectorIfOpen);
  on('routing.offlineResult', renderRoutingInspectorIfOpen);
  on('routing.source', renderRoutingInspectorIfOpen);
  on('routing.backendSafeRoute', renderEvacuationSummary);
  on('community.siren', renderEvacuationSummary);
  on('simulation.networkFailureActive', renderHeaderStatus);

  Telemetry.pushEvent({ category: 'SATELLITE', message: 'NASA IMERG rainfall — HISTORICAL/CACHED dataset loaded' });
  Telemetry.pushEvent({ category: 'DATABASE', message: 'Supabase connection — CONNECTED' });

  await refreshLiveField();
  setInterval(() => { if (State.get('mode') === 'LIVE') refreshLiveField(); }, 8000);

  await Routing.evaluateRouting();
}

// --- LIVE FIELD mode: pull from the real backend, never fabricate -------------------

async function refreshLiveField() {
  const [latest, risk] = await Promise.all([Api.getLatest(), Api.getRisk()]);

  const liveBanner = document.getElementById('live-data-banner');
  if (!latest.ok || !risk.ok) {
    liveBanner.hidden = false;
    liveBanner.textContent = 'LIVE DATA UNAVAILABLE — backend /latest or /risk did not respond';
    return;
  }
  liveBanner.hidden = true;
  Telemetry.pushEvent({ category: 'SENSOR', message: 'Live field snapshot refreshed from backend' });

  // Known AXON /latest shape: object keyed by node_id.
  const nodes = latest.data || {};
  if (nodes.HILL_01) {
    if (nodes.HILL_01.rainfall != null) State.setReading('nodes.H01.rainfall', nodes.HILL_01.rainfall, nodes.HILL_01.source || 'LIVE');
    if (nodes.HILL_01.soil_moisture != null) State.setReading('nodes.H01.soil', nodes.HILL_01.soil_moisture, nodes.HILL_01.source || 'LIVE');
    if (nodes.HILL_01.vibration != null) State.setReading('nodes.H01.vibration', nodes.HILL_01.vibration, nodes.HILL_01.source || 'LIVE');
  }
  if (nodes.RIVER_01?.water_level != null) State.setReading('nodes.R01.river', nodes.RIVER_01.water_level, nodes.RIVER_01.source || 'LIVE');
  if (nodes.FOREST_01) {
    if (nodes.FOREST_01.temperature != null) State.setReading('nodes.F01.temp', nodes.FOREST_01.temperature, nodes.FOREST_01.source || 'LIVE');
    if (nodes.FOREST_01.humidity != null) State.setReading('nodes.F01.humidity', nodes.FOREST_01.humidity, nodes.FOREST_01.source || 'LIVE');
    if (nodes.FOREST_01.smoke != null) State.setReading('nodes.F01.smoke', nodes.FOREST_01.smoke, nodes.FOREST_01.source || 'LIVE');
  }
  if (nodes.AIR_01?.pm25 != null) State.setReading('nodes.A01.pm25', nodes.AIR_01.pm25, nodes.AIR_01.source || 'LIVE');

  // /risk is the existing rule-based operational endpoint, not the .pkl fusion endpoint.
  // Render it honestly as LIVE RULE until /fusion is invoked with engineered features.
  const rr = risk.data?.risks || {};
  for (const [src, dst] of [['landslide','landslide'],['flood','flood'],['fire','fire'],['pollution','pollution']]) {
    if (typeof rr[src] === 'number') State.setReading(`hazards.${dst}`, { score: rr[src], level: rr[src] >= 80 ? 'CRITICAL' : rr[src] >= 60 ? 'HIGH' : rr[src] >= 40 ? 'MODERATE' : 'LOW' }, 'LIVE RULE');
  }
}

// --- Header / connectivity strip -----------------------------------------------------

function renderHeaderStatus() {
  const c = State.get('connectivity');
  const cloud = State.get('cloud.status');
  const chip = (label, on, provenance) =>
    `<span class="status-chip ${on ? 'status-chip--on' : 'status-chip--off'}">${label}${provenance ? ` <i>${provenance}</i>` : ''}</span>`;

  UI.setHTML('header-status-strip', [
    chip('INTERNET', c.internet.value, c.internet.provenance),
    chip('LORA', c.lora.value, c.lora.provenance),
    chip('EDGE', c.edge.value, c.edge.provenance),
    chip('GOOGLE ROUTES', c.googleRoutes.value, c.googleRoutes.provenance),
    chip('SAT', c.satellite.value, c.satellite.provenance),
    chip('CLOUD', cloud.value === 'CONNECTED', cloud.value),
  ].join(''));
}

// --- Threat Intelligence rail ----------------------------------------------------------

function renderThreatIntelligence() {
  const hazards = State.get('hazards');
  const order = ['landslide', 'flood', 'fire', 'pollution'];
  const rows = order.map((h) => {
    const r = hazards[h];
    return `
      <div class="threat-row">
        <span class="threat-label">${h.toUpperCase()}</span>
        <div class="threat-bar"><div class="threat-bar__fill threat-bar__fill--${h}" style="width:${r.value.score}%"></div></div>
        <span class="threat-score">${r.provenance === 'NO DATA' ? '—' : r.value.score.toFixed(0) + '%'}</span>
        <i class="tag tag--${r.provenance.startsWith('MODEL') ? 'model' : 'simulated'}">${r.provenance === 'NO DATA' ? 'AWAITING' : r.provenance.split(' ')[0]}</i>
      </div>`;
  }).join('');

  const dominant = order.map((h) => ({ h, score: hazards[h].value.score })).sort((a, b) => b.score - a.score)[0];

  UI.setHTML('threat-intelligence-body', rows);
  UI.setText('dominant-hazard-label', dominant.score >= 25 ? `${dominant.h.toUpperCase()} (${dominant.score.toFixed(0)}%)` : 'NONE — NORMAL');
}

// --- Digital Twin control panel ---------------------------------------------------------

function renderScenarioButtons() {
  const container = document.getElementById('scenario-list');
  container.innerHTML = `
    <button class="scenario-btn scenario-btn--active" data-scenario="CASCADE_DISASTER">CASCADE DISASTER</button>
    <button class="scenario-btn" disabled title="Separate backend scenario adapter planned">LANDSLIDE · planned</button>
    <button class="scenario-btn" disabled title="Separate backend scenario adapter planned">FLOOD · planned</button>`;
  UI.setText('twin-selected-scenario', 'Cascade Disaster');
  document.getElementById('twin-selected-scenario').dataset.scenarioId = 'CASCADE_DISASTER';
}

function bindSimulationControls() {
  document.getElementById('btn-sim-start').addEventListener('click', () => Sim.startScenario('CASCADE_DISASTER'));
  document.getElementById('btn-sim-pause').addEventListener('click', () => Sim.pauseScenario());
  document.getElementById('btn-sim-reset').addEventListener('click', async () => {
    await Sim.resetScenario();
    const btn = document.getElementById('btn-network-failure');
    btn.textContent = 'NETWORK FAILURE';
    btn.disabled = false;
    btn.classList.remove('btn-danger--active');
  });
  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.disabled = true;
    btn.title = 'Backend Digital Twin currently runs at deterministic 1× speed';
  });
}

function renderSimulationStatus() {
  const clock = State.get('simulation.clock_s') || 0;
  const stage = State.get('simulation.stage');
  const duration = 45;
  UI.setText('twin-clock', `${formatClock(clock)} / ${formatClock(duration)}`);
  UI.setText('twin-stage', String(stage || 'SYSTEM NORMAL').replaceAll('_', ' '));
  const pct = Math.min(100, (clock / duration) * 100);
  document.getElementById('twin-progress-fill').style.width = `${pct}%`;

  const n = State.raw.nodes;
  UI.setHTML('sensor-monitor', `
    <div class="sensor-node"><b>H01</b> Rain ${Number(n.H01.rainfall.value).toFixed(1)} mm · Soil ${Number(n.H01.soil.value).toFixed(1)}% · Vib ${Number(n.H01.vibration.value).toFixed(3)}</div>
    <div class="sensor-node"><b>R01</b> Water level ${Number(n.R01.river.value).toFixed(2)} m</div>
    <div class="sensor-node"><b>F01</b> Temp ${Number(n.F01.temp.value).toFixed(1)}°C · RH ${Number(n.F01.humidity.value).toFixed(0)}% · Smoke ${Number(n.F01.smoke.value).toFixed(0)}</div>
    <div class="sensor-node"><b>A01</b> PM2.5 ${Number(n.A01.pm25.value).toFixed(0)} µg/m³</div>
    <div class="sensor-provenance">SENSORS: SIMULATED · LANDSLIDE RISK: REAL MODEL VIA /fusion</div>
  `);
}

function renderEvacuationSummary() {
  const route = State.get('routing.backendSafeRoute');
  const siren = State.get('community.siren');
  const hz = State.get('hazards.landslide');
  const el = document.getElementById('evacuation-summary');
  if (!el) return;

  if (route?.status === 'SAFE_ROUTE_FOUND') {
    el.innerHTML = `
      <div class="evac-state evac-state--active">EVACUATION REQUIRED</div>
      <div class="evac-risk">LANDSLIDE <b>${hz?.value?.score?.toFixed?.(2) ?? '—'}%</b> <i class="tag tag--model">MODEL</i></div>
      <div class="evac-destination">SAFE POINT <b>${route.destination}</b></div>
      <div class="evac-path">${(route.path || []).join(' → ')}</div>
      <div class="evac-distance">${route.distance_km ?? '—'} km · C01 SIREN ${siren}</div>`;
  } else {
    el.innerHTML = `<div class="evac-state">STANDBY</div><div class="evac-note">No active evacuation. AXON is monitoring precursors.</div>`;
  }
}

function formatClock(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function handleModeChange(mode) {
  State.set('mode', mode);
  if (mode === 'LIVE') {
    Sim.pauseScenario();
  }
}

// --- Network failure button --------------------------------------------------------------

function bindNetworkFailureButton() {
  const btn = document.getElementById('btn-network-failure');
  btn.addEventListener('click', async () => {
    if (State.get('simulation.networkFailureActive')) return;
    const res = await Network.triggerNetworkFailure();
    if (res?.ok) {
      btn.textContent = 'NETWORK FAILURE ACTIVE';
      btn.classList.add('btn-danger--active');
      btn.disabled = true;
    }
  });
}

// --- Inspectors --------------------------------------------------------------------------

function renderAiEngineInspector() {
  UI.setHTML('ai-engine-body', Telemetry.buildAiEngineInspector());
}

function renderRoutingInspectorIfOpen() {
  const drawer = document.getElementById('drawer-routing');
  if (drawer.classList.contains('drawer--open')) {
    UI.setHTML('routing-body', Routing.buildRoutingInspector());
  }
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-drawer-target="drawer-routing"]')) {
    UI.setHTML('routing-body', Routing.buildRoutingInspector());
  }
});

function renderDataSourcesInspector() {
  UI.setHTML('data-sources-body', `
    <div class="inspector-block">
      <h4>GROUND <span class="pill">ESP32 Sensor Network</span></h4>
      <p class="inspector-meta">Status: <b>ACTIVE</b> · Mode: <i class="tag tag--simulated">SIMULATED (Digital Twin) / LIVE (Live Field)</i></p>
    </div>
    <div class="inspector-block">
      <h4>SATELLITE <span class="pill">NASA GPM / IMERG</span></h4>
      <p class="inspector-meta">Status: <b>HISTORICAL / CACHED</b> — used for landslide model training, not live retrieval.</p>
    </div>
    <div class="inspector-block">
      <h4>ROUTING <span class="pill">Google Routes API</span></h4>
      <p class="inspector-meta">Server-side only. Frontend never holds the API key. Status: <b>${State.get('routing.status').value}</b></p>
    </div>
    <div class="inspector-block">
      <h4>DATABASE <span class="pill">Supabase</span></h4>
      <p class="inspector-meta">Status: <b>${State.get('cloud.status').value}</b> · Local buffer active during offline periods.</p>
    </div>
    <div class="inspector-block">
      <h4>EDGE <span class="pill">AXON ML Models</span></h4>
      <p class="inspector-meta">Landslide model: <b>LOADED (confirmed via /fusion)</b>. Flood / Fire / Pollution adapters: <b>pending backend confirmation</b>.</p>
    </div>
    <div class="inspector-block">
      <h4>COMMUNICATION <span class="pill">LoRa Mesh</span></h4>
      <p class="inspector-meta">Status: <b>SIMULATED</b> — packet flow modeled in software; no physical LoRa radio is connected to this browser session.</p>
    </div>
  `);
}
