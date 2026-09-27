// AXON — community.js
// C01 uses the authoritative backend safe_route when available.
// Physical actuation is SIMULATED until real hardware is connected.

import { State, on } from './state.js';
import { pushEvent } from './telemetry.js';
import { animateLoraPacket } from './map.js';

let lastRouteSignature = null;

function routeToDirection(path = []) {
  const joined = path.join('>').toUpperCase();
  if (joined.includes('J3')) return 'SOUTH-WEST';
  if (joined.includes('J4')) return 'SOUTH-EAST';
  if (joined.includes('J1') || joined.includes('J2')) return 'NORTH-WEST';
  return 'FOLLOW SAFE ROUTE';
}

export function applyBackendEvacuation(fusionResponse) {
  const evac = fusionResponse?.evacuation;
  const route = fusionResponse?.safe_route;
  if (!evac?.required) return;

  if (!route || route.status !== 'SAFE_ROUTE_FOUND') {
    State.set('community.siren', 'ACTIVE');
    State.set('community.display', `${evac.dominant_hazard || 'HAZARD'} WARNING\nROUTE DECISION UNAVAILABLE`);
    State.set('community.directionLeds', 'AWAIT ROUTE');
    pushEvent({ category: 'COMMUNITY', message: 'C01 alert active — route decision unavailable' });
    return;
  }

  const sig = `${route.destination}:${(route.path || []).join('>')}`;
  if (sig === lastRouteSignature) return;
  lastRouteSignature = sig;

  const hazard = (evac.dominant_hazard || 'MULTI-HAZARD').toUpperCase();
  const direction = routeToDirection(route.path || []);
  State.set('routing.backendSafeRoute', route);
  State.set('community.siren', 'ACTIVE');
  State.set('community.display', `${hazard} WARNING\nMOVE ${direction}\nSAFE POINT ${route.destination}`);
  State.set('community.directionLeds', `${direction} — ON`);
  State.set('community.lastPacket', new Date());

  logPacket('SOURCE', 'RISK_UPDATE');
  animateLoraPacket('H01', 'T01');
  setTimeout(() => { logPacket('T01', 'LORA_RELAY'); animateLoraPacket('T01', 'C01'); }, 500);
  setTimeout(() => { logPacket('C01', 'ROUTE_RECEIVED'); logPacket('C01', 'SIREN_ACTIVE'); }, 1050);
  pushEvent({ category: 'COMMUNITY', message: `C01 SIMULATED siren — ${hazard}, ${route.destination}, ${route.distance_km ?? '—'} km` });
}

export function evaluateCommunityState() {
  const hazards = State.get('hazards');
  const maxScore = Math.max(...Object.values(hazards).map((v) => Number(v?.value?.score || 0)));
  if (maxScore < 30 && State.get('community.siren') === 'ACTIVE') standDown();
}

function standDown() {
  lastRouteSignature = null;
  State.set('community.siren', 'READY');
  State.set('community.display', 'SYSTEM NORMAL');
  State.set('community.directionLeds', 'READY');
  pushEvent({ category: 'COMMUNITY', message: 'C01 SIMULATED stand-down' });
}

function logPacket(node, type) {
  const entry = { time: new Date(), node, type };
  const log = State.get('community.log');
  log.unshift(entry);
  if (log.length > 40) log.length = 40;
  State.set('community.log', log);
  pushEvent({ category: 'LORA', message: `${node} ${type} · SIMULATED` });
}

export function renderCommunityCard(container) {
  const c = State.get('community');
  container.innerHTML = `
    <div class="c01-row"><span>LoRa Receiver</span><b class="tag tag--active">${c.loraReceiver} · SIMULATED</b></div>
    <div class="c01-row"><span>Wi-Fi Local AP</span><b class="tag tag--active">${c.wifiAp} · LOCAL</b></div>
    <div class="c01-row"><span>Siren</span><b class="tag ${c.siren === 'ACTIVE' ? 'tag--critical' : 'tag--safe'}">${c.siren} · SIMULATED</b></div>
    <div class="c01-row c01-row--display"><span>Display</span><pre>${c.display}</pre></div>
    <div class="c01-row"><span>Direction LEDs</span><b>${c.directionLeds}</b></div>
    <div class="c01-row"><span>Battery</span><b>${c.battery}% · PROTOTYPE</b></div>
    <div class="c01-row"><span>Last Packet</span><b>${c.lastPacket ? c.lastPacket.toTimeString().slice(0,8) : '—'}</b></div>`;
}

export function initCommunity(container) {
  renderCommunityCard(container);
  for (const key of ['community.siren','community.display','community.directionLeds','community.log']) {
    on(key, () => renderCommunityCard(container));
  }
  for (const h of ['landslide','flood','fire','pollution']) on(`hazards.${h}`, evaluateCommunityState);
}
