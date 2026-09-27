// AXON — judge.js
// Presentation layer for the final prototype showcase. It does not calculate
// ML risk. It turns existing State values into an easy-to-follow operational
// story: DETECT → PREDICT → AVOID → ROUTE → ALERT.

import { State, on } from './state.js';
import * as Routing from './routing.js';
import * as MapModule from './map.js';
import * as Telemetry from './telemetry.js';

const STAGES = {
  'SYSTEM NORMAL': {
    phase: 'MONITORING', step: 0, state: 'MONITOR',
    now: 'Environmental baseline stable',
    next: 'Continue precursor monitoring',
    why: 'No critical model trigger',
    action: 'Standby · no evacuation required',
  },
  'NORMAL': {
    phase: 'MONITORING', step: 0, state: 'MONITOR',
    now: 'Environmental baseline stable', next: 'Watch rainfall and river trend',
    why: 'Ground-node telemetry within baseline', action: 'Maintain readiness',
  },
  'HEAVY RAIN': {
    phase: 'PRECURSOR DETECTION', step: 1, state: 'WATCH',
    now: 'Heavy rainfall precursor detected', next: 'Soil saturation and river rise',
    why: 'Rainfall intensity is increasing across the demo sector', action: 'Raise watch · prepare vulnerable corridors',
  },
  'SOIL SATURATION': {
    phase: 'HAZARD FORECASTING', step: 1, state: 'WATCH',
    now: 'Slope moisture is increasing', next: 'Slope instability',
    why: 'Accumulated rain + saturated slope context', action: 'Prepare route validation and community alert path',
  },
  'SLOPE INSTABILITY': {
    phase: 'RISK PREDICTION', step: 2, state: 'ALERT',
    now: 'Slope instability precursor detected', next: 'Landslide warning',
    why: 'Rainfall history + terrain context are driving model risk', action: 'Mark exposed corridor for safety check',
  },
  'LANDSLIDE WARNING': {
    phase: 'HAZARD CONFIRMED', step: 2, state: 'WARNING',
    now: 'Landslide risk is HIGH', next: 'Road exposure / evacuation decision',
    why: 'Real landslide model crossed the evacuation trigger', action: 'Reject exposed corridor · calculate safer route',
  },
  'ROAD FAILURE': {
    phase: 'CORRIDOR AVOIDANCE', step: 3, state: 'EVACUATE',
    now: 'Hazard-exposed corridor is unsafe', next: 'Safe corridor selection',
    why: 'Backend hazard + route engine marked affected edges', action: 'Evacuate using AXON safe route',
  },
  'FLOOD RISING': {
    phase: 'CASCADE MONITORING', step: 3, state: 'EVACUATE',
    now: 'River level continues rising', next: 'Multi-hazard route conflict',
    why: 'Flood conditions are developing after heavy rain', action: 'Continuously revalidate evacuation corridor',
  },
  'ROUTE INVALIDATED': {
    phase: 'ROUTE RECALCULATION', step: 4, state: 'EVACUATE',
    now: 'Current route no longer meets safety constraints', next: 'Alternate safe route',
    why: 'Hazard exposure changed during the event', action: 'Discard unsafe route · recalculate locally',
  },
  'SAFE ROUTE RECALCULATED': {
    phase: 'SAFE CORRIDOR SELECTED', step: 4, state: 'EVACUATE',
    now: 'Safer evacuation corridor selected', next: 'Community notification',
    why: 'AXON selected a reachable route outside blocked edges', action: 'Transmit route to C01 over LoRa',
  },
  'COMMUNITY ALERT': {
    phase: 'COMMUNITY RESPONSE', step: 5, state: 'EVACUATE',
    now: 'Community warning has been issued', next: 'Maintain guidance during the emergency',
    why: 'Evacuation required + safe destination available', action: 'C01 siren, display and direction guidance active',
  },
};

function el(id) { return document.getElementById(id); }
function text(id, value) { const n = el(id); if (n) n.textContent = value; }

function normalizedStage() {
  return String(State.get('simulation.stage') || 'SYSTEM NORMAL').replaceAll('_', ' ').toUpperCase();
}

function dominantRisk() {
  const hazards = State.get('hazards') || {};
  return Object.entries(hazards)
    .map(([name, r]) => ({ name, score: Number(r?.value?.score || 0), provenance: r?.provenance || 'NO DATA' }))
    .sort((a, b) => b.score - a.score)[0] || { name: 'none', score: 0, provenance: 'NO DATA' };
}

function renderChain(step) {
  const keys = ['detect', 'predict', 'avoid', 'route', 'alert'];
  keys.forEach((key, i) => {
    const node = document.querySelector(`[data-step="${key}"]`);
    if (!node) return;
    node.classList.toggle('response-chain__active', i < Math.max(1, step));
    node.classList.toggle('response-chain__current', i === Math.max(0, step - 1));
  });
}

function renderDecision() {
  const stage = normalizedStage();
  const spec = STAGES[stage] || STAGES['SYSTEM NORMAL'];
  const risk = dominantRisk();
  const route = State.get('routing.backendSafeRoute');
  const networkFailed = Boolean(State.get('simulation.networkFailureActive'));
  const siren = State.get('community.siren');

  text('mission-headline', networkFailed
    ? 'Connectivity failed. AXON continues local warning and evacuation guidance.'
    : spec.action);
  text('decision-state', spec.state);
  text('decision-now', spec.now);
  text('decision-next', spec.next);
  text('decision-why', risk.score >= 25
    ? `${risk.name.toUpperCase()} ${risk.score.toFixed(0)}% · ${risk.provenance}`
    : spec.why);

  let action = spec.action;
  if (route?.status === 'SAFE_ROUTE_FOUND') {
    action = `${route.destination} via ${route.path?.join(' → ') || 'safe corridor'} · ${route.distance_km ?? '—'} km`;
  }
  text('decision-action', action);
  text('overlay-phase', spec.phase);
  text('overlay-routing', networkFailed ? 'AXON LOCAL / OFFLINE' : (State.get('routing.source') === 'GOOGLE' ? 'GOOGLE + AXON SAFETY' : 'AXON LOCAL'));
  text('overlay-community', siren === 'ACTIVE' ? 'C01 ALERT ACTIVE' : 'C01 READY');

  const card = el('decision-card');
  card?.classList.toggle('decision-card--critical', ['WARNING', 'EVACUATE'].includes(spec.state));
  renderChain(spec.step);

  const resilient = el('resilient-banner');
  if (resilient) resilient.hidden = !networkFailed;
}

function bindJudgeDemo() {
  const btn = el('btn-judge-demo');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    // Reuse the application's own public controls to avoid duplicating domain logic.
    el('mode-twin')?.click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    el('btn-sim-reset')?.click();
    await new Promise((resolve) => setTimeout(resolve, 260));
    el('btn-sim-start')?.click();
    btn.textContent = 'DEMO RUNNING';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = 'RESTART JUDGE DEMO'; btn.disabled = false; }, 47000);
  });
}

export function initJudgeExperience() {
  bindJudgeDemo();
  bindHistoricalReplay();
  renderDecision();
  for (const path of [
    'simulation.stage', 'simulation.clock_s', 'simulation.networkFailureActive',
    'hazards.landslide', 'hazards.flood', 'hazards.fire', 'hazards.pollution',
    'routing.backendSafeRoute', 'routing.source', 'community.siren',
    'connectivity.internet', 'connectivity.googleRoutes',
  ]) on(path, renderDecision);
}


async function runHistoricalReplay() {
  // This is a counterfactual replay: historical impact facts are real,
  // while the sensor progression is the AXON Digital Twin.
  el('mode-twin')?.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  el('btn-sim-reset')?.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  el('btn-sim-start')?.click();

  Telemetry.pushEvent({
    category: 'HISTORICAL',
    message: 'Nilgiris 2009 counterfactual replay started · observed impact: 44 fatalities, 3,715 huts damaged, 899 highway landslides'
  });
}

async function findSafestRouteJudge(event) {
  const button = event?.currentTarget || el('btn-find-safe-route-map') || el('btn-find-safe-route');
  const old = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'CALCULATING…'; }

  const result = await Routing.findSafestRouteNow();
  MapModule.focusBestRoute();

  const route = result?.route;
  if (result?.ok) {
    const destination = route?.destination || route?.id || route?.route_id || 'SELECTED ROUTE';
    const distance = route?.distance_km != null ? ` · ${route.distance_km} km` : '';
    text('decision-state', 'SAFE ROUTE');
    text('decision-action', `${destination}${distance}`);
    Telemetry.pushEvent({
      category: 'ROUTING',
      message: `Safest route selected · source ${result.source} · ${destination}${distance}`
    });

    // Open routing inspector so the judge can see WHY a route was accepted/rejected.
    el('btn-drawer-routing')?.click();
  } else {
    text('decision-state', 'NO SAFE ROUTE');
    text('decision-action', 'No viable route available under current hazard constraints');
    Telemetry.pushEvent({ category: 'ROUTING', message: 'No safe route available', level: 'critical' });
  }

  if (button) {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = old || 'FIND SAFEST ROUTE';
    }, 900);
  }
}

function bindHistoricalReplay() {
  el('btn-historical-replay')?.addEventListener('click', () => {
    document.getElementById('drawer-backdrop')?.classList.add('drawer-backdrop--visible');
    document.getElementById('drawer-historical')?.classList.add('drawer--open');
  });
  el('btn-run-historical-now')?.addEventListener('click', runHistoricalReplay);
  el('btn-historical-safe-route')?.addEventListener('click', findSafestRouteJudge);
  el('btn-find-safe-route')?.addEventListener('click', findSafestRouteJudge);
  el('btn-find-safe-route-map')?.addEventListener('click', findSafestRouteJudge);
}
