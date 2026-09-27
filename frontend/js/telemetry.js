// AXON — telemetry.js
// Owns the unified event timeline and formats node/data-source telemetry for
// popups and inspector drawers. Does not decide hazard scores or routing —
// it only reads and renders State.

import { State, on } from './state.js';
import { NODES, MODEL_METRICS } from './config.js';

const CATEGORY_ICON = {
  SENSOR: '◈', AI: '◆', FUSION: '◆', ROUTING: '➤', LORA: '⟿',
  COMMUNITY: '▣', NETWORK: '⚠', SATELLITE: '◐', DATABASE: '⛁', SIMULATION: '▶',
};

export function pushEvent({ category, message }) {
  return State.pushEvent({ category, message });
}

export function formatTimestamp(date) {
  return date.toTimeString().slice(0, 8);
}

export function renderEventTimeline(container) {
  const events = State.get('events');
  container.innerHTML = events.slice(0, 60).map((e) => `
    <div class="event-row event-row--${e.category.toLowerCase()}">
      <span class="event-time">${formatTimestamp(e.timestamp)}</span>
      <span class="event-cat">${CATEGORY_ICON[e.category] || '•'} ${e.category}</span>
      <span class="event-msg">${e.message}</span>
    </div>
  `).join('');
}

export function initEventTimeline(container) {
  renderEventTimeline(container);
  on('events', () => renderEventTimeline(container));
}

// --- Node popup content -------------------------------------------------------------

function readingLine(label, reading, unit = '') {
  if (!reading) return '';
  return `<div class="popup-line"><span>${label}</span><b>${reading.value}${unit}</b><i class="tag tag--${reading.provenance.split(' ')[0].toLowerCase()}">${reading.provenance}</i></div>`;
}

export function buildNodePopup(nodeId) {
  const meta = NODES[nodeId];
  const n = State.get(`nodes.${nodeId}`);
  if (!meta || !n) return '';

  let body = '';
  if (nodeId === 'H01') {
    body = readingLine('Rainfall', n.rainfall, ' mm/h') + readingLine('Soil Moisture', n.soil, '%') + readingLine('Vibration', n.vibration, ' g');
  } else if (nodeId === 'R01') {
    body = readingLine('Water Level', n.river, ' m') + readingLine('Rate of Rise', n.riseRate, ' m/h');
  } else if (nodeId === 'F01') {
    body = readingLine('Temperature', n.temp, '°C') + readingLine('Humidity', n.humidity, '%') + readingLine('Smoke Index', n.smoke, '');
  } else if (nodeId === 'A01') {
    body = readingLine('PM2.5', n.pm25, ' µg/m³') + readingLine('Gas Index', n.gas, '');
  } else if (nodeId === 'T01') {
    body = `<div class="popup-line"><span>Role</span><b>LoRa Relay</b></div>`;
  } else if (nodeId === 'C01') {
    const c = State.get('community');
    body = `<div class="popup-line"><span>Siren</span><b>${c.siren}</b></div>
            <div class="popup-line"><span>Display</span><b>${c.display}</b></div>
            <div class="popup-line"><span>Wi-Fi AP</span><b>${c.wifiAp}</b></div>`;
  }

  return `
    <div class="node-popup">
      <div class="node-popup__title">${nodeId} <span class="node-popup__subtitle">${meta.label}</span></div>
      ${body}
      <div class="popup-line"><span>LoRa</span><b>${n.status === 'ACTIVE' ? 'ACTIVE' : n.status}</b></div>
      <div class="popup-line"><span>Battery</span><b>${n.battery}%</b></div>
      <div class="popup-line"><span>Last Packet</span><b>${n.lastPacket ? formatTimestamp(n.lastPacket) : '—'}</b></div>
      <div class="popup-line"><span>Data Source</span><i class="tag tag--simulated">${n.dataSource}</i></div>
      <div class="node-popup__footnote">PROTOTYPE DEMO NODE — Aravenu Resilience Sector</div>
    </div>
  `;
}

// --- AI Engine Inspector content ------------------------------------------------------

export function buildAiEngineInspector() {
  const m = MODEL_METRICS;
  return `
    <div class="inspector-block">
      <h4>LANDSLIDE ENGINE <span class="pill">${m.landslide.algorithm}</span></h4>
      <p class="inspector-meta">Inputs: ${m.landslide.inputs.join(', ')}</p>
      <div class="metric-grid">
        <div><span>Accuracy</span><b>${(m.landslide.accuracy * 100).toFixed(2)}%</b></div>
        <div><span>Precision</span><b>${(m.landslide.precision * 100).toFixed(2)}%</b></div>
        <div><span>Recall</span><b>${(m.landslide.recall * 100).toFixed(2)}%</b></div>
        <div><span>ROC-AUC</span><b>${m.landslide.rocAuc.toFixed(4)}</b></div>
      </div>
      <p class="inspector-note">${m.landslide.note}</p>
    </div>
    <div class="inspector-block">
      <h4>FLOOD ENGINE <span class="pill">${m.flood.algorithm}</span></h4>
      <p class="inspector-meta">Forecast horizon: ${m.flood.forecastHorizon}</p>
      <div class="metric-grid">
        <div><span>R²</span><b>${m.flood.r2.toFixed(4)}</b></div>
        <div><span>MAE</span><b>${m.flood.mae.toFixed(4)} m</b></div>
        <div><span>Baseline MAE</span><b>${m.flood.baselineMae.toFixed(4)} m</b></div>
      </div>
      <p class="inspector-note inspector-note--warning">BASELINE CURRENTLY OUTPERFORMS MODEL ON MAE (${m.flood.baselineGainPct}%)</p>
    </div>
    <div class="inspector-block">
      <h4>FOREST FIRE ENGINE <span class="pill">${m.fire.algorithm}</span></h4>
      <p class="inspector-meta">Inputs: ${m.fire.inputs.join(', ')}</p>
      <div class="metric-grid">
        <div><span>Accuracy</span><b>${(m.fire.accuracy * 100).toFixed(2)}%</b></div>
        <div><span>ROC-AUC</span><b>${m.fire.rocAuc.toFixed(4)}</b></div>
      </div>
      <p class="inspector-note">${m.fire.note}</p>
    </div>
    <div class="inspector-block">
      <h4>POLLUTION ENGINE <span class="pill">${m.pollution.algorithm}</span></h4>
      <p class="inspector-meta">Forecast horizon: ${m.pollution.forecastHorizon}</p>
      <div class="metric-grid">
        <div><span>R²</span><b>${m.pollution.r2.toFixed(4)}</b></div>
        <div><span>MAE</span><b>${m.pollution.mae.toFixed(4)} µg/m³</b></div>
        <div><span>Baseline gain</span><b>+${m.pollution.baselineGainPct}%</b></div>
      </div>
      <p class="inspector-note">${m.pollution.note}</p>
    </div>
    <div class="inspector-block inspector-block--fusion">
      <h4>MULTI-HAZARD FUSION <span class="pill pill--active">ACTIVE</span></h4>
      <p class="inspector-meta">Combines all four engines into a single dominant-hazard assessment and evacuation trigger.</p>
    </div>
  `;
}
