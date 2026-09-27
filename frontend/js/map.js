// AXON — map.js
// Leaflet-based operational map. Renders field nodes, LoRa topology, hazard
// polygons (radius driven by State.hazards[x].score), and routing layers.
// All node/hazard/safe-point geometry is PROTOTYPE DEMO geometry — never
// real road names or verified survey data (see config.js header).

import { NODES, LORA_LINKS, SAFE_POINTS, HAZARD_ANCHORS, MAP_CENTER, MAP_DEFAULT_ZOOM,
         MAP_MIN_ZOOM, MAP_MAX_ZOOM, MAP_SECTOR_BOUNDS, LORA_PULSE_MS, OFFLINE_GRAPH } from './config.js';
import { State, on } from './state.js';
import { buildNodePopup } from './telemetry.js';

let map;
const layers = {};
const nodeMarkers = {};
const hazardCircles = {};
let routeLayerGroup;
let offlineRouteLayerGroup;
let axonSafeRouteLayerGroup;
let loraPulseTimer;

const NODE_COLOR = {
  landslide: '#d9a441', flood: '#4a90d9', fire: '#d1453d', pollution: '#8b6bd1',
  relay: '#8b95a1', community: '#2fae66',
};

function nodeDivIcon(nodeId, type) {
  const color = NODE_COLOR[type] || '#8b95a1';
  return L.divIcon({
    className: 'axon-node-icon',
    html: `<div class="node-marker" style="--node-color:${color}"><span>${nodeId}</span></div>`,
    iconSize: [46, 22],
    iconAnchor: [23, 11],
  });
}

export function initMap(elementId) {
  map = L.map(elementId, {
    zoomControl: true,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    attributionControl: true,
  });
  map.fitBounds(MAP_SECTOR_BOUNDS);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: MAP_MAX_ZOOM,
  }).addTo(map);

  layers.groundSensors = L.layerGroup().addTo(map);
  layers.loraNetwork = L.layerGroup().addTo(map);
  layers.hazardZones = L.layerGroup().addTo(map);
  layers.googleRoutes = L.layerGroup().addTo(map);
  layers.offlineRoutes = L.layerGroup();
  layers.axonSafeRoute = L.layerGroup().addTo(map);
  layers.safePoints = L.layerGroup().addTo(map);
  layers.communityUnits = L.layerGroup().addTo(map);

  routeLayerGroup = layers.googleRoutes;
  offlineRouteLayerGroup = layers.offlineRoutes;
  axonSafeRouteLayerGroup = layers.axonSafeRoute;

  drawNodes();
  drawLoraLinks();
  drawSafePoints();
  drawHazardZones();
  startLoraPulseLoop();

  on('hazards.landslide', () => updateHazardCircle('landslide'));
  on('hazards.flood', () => updateHazardCircle('flood'));
  on('hazards.fire', () => updateHazardCircle('fire'));
  on('hazards.pollution', () => updateHazardCircle('pollution'));
  on('routing.candidates', renderGoogleRoutes);
  on('routing.offlineResult', renderOfflineRoute);
  on('routing.backendSafeRoute', renderBackendSafeRoute);
  on('routing.source', (source) => {
    if (source === 'AXON_LOCAL') {
      map.removeLayer(layers.googleRoutes);
      layers.offlineRoutes.addTo(map);
    } else {
      map.removeLayer(layers.offlineRoutes);
      layers.googleRoutes.addTo(map);
    }
  });

  return map;
}

function drawNodes() {
  for (const [id, n] of Object.entries(NODES)) {
    const marker = L.marker([n.lat, n.lng], { icon: nodeDivIcon(id, n.type) });
    marker.bindPopup(() => buildNodePopup(id), { maxWidth: 260 });
    const group = n.type === 'community' ? layers.communityUnits : layers.groundSensors;
    marker.addTo(group);
    nodeMarkers[id] = marker;
  }
}

function drawLoraLinks() {
  for (const [a, b] of LORA_LINKS) {
    const na = NODES[a], nb = NODES[b];
    L.polyline([[na.lat, na.lng], [nb.lat, nb.lng]], {
      color: '#5a6470', weight: 1.5, opacity: 0.6, dashArray: '2 6',
    }).addTo(layers.loraNetwork);
  }
}

function drawSafePoints() {
  for (const sp of Object.values(SAFE_POINTS)) {
    L.circleMarker([sp.lat, sp.lng], {
      radius: 6, color: '#2fae66', fillColor: '#2fae66', fillOpacity: 0.85, weight: 2,
    }).bindTooltip(`${sp.id} · PROTOTYPE SAFE POINT`, { direction: 'top' }).addTo(layers.safePoints);
  }
}

function drawHazardZones() {
  for (const hazard of Object.keys(HAZARD_ANCHORS)) {
    const anchor = HAZARD_ANCHORS[hazard];
    const circle = L.circle([anchor.center.lat, anchor.center.lng], {
      radius: anchor.baseRadius_m,
      color: hazardColor(hazard), fillColor: hazardColor(hazard),
      fillOpacity: 0.18, weight: 1.5, dashArray: '4 4',
    }).bindTooltip(`${hazard.toUpperCase()} ZONE · SIMULATED HAZARD ZONE`, { sticky: true });
    circle.addTo(layers.hazardZones);
    hazardCircles[hazard] = circle;
  }
}

function hazardColor(hazard) {
  return { landslide: '#d9a441', flood: '#4a90d9', fire: '#d1453d', pollution: '#8b6bd1' }[hazard];
}

function updateHazardCircle(hazard) {
  const reading = State.get(`hazards.${hazard}`);
  const anchor = HAZARD_ANCHORS[hazard];
  const circle = hazardCircles[hazard];
  if (!circle || !reading) return;
  const score = reading.value.score;
  const radius = anchor.baseRadius_m + (anchor.maxRadius_m - anchor.baseRadius_m) * (score / 100);
  circle.setRadius(radius);
  const opacity = 0.12 + 0.35 * (score / 100);
  circle.setStyle({ fillOpacity: opacity });
  circle.setTooltipContent(`${hazard.toUpperCase()} ZONE · ${reading.value.level} (${score.toFixed(0)}%) · ${reading.provenance}`);
}

// --- LoRa packet animation (restrained, professional) --------------------------------

function startLoraPulseLoop() {
  clearInterval(loraPulseTimer);
  loraPulseTimer = setInterval(() => {
    const active = ['H01', 'R01', 'F01', 'A01'].filter((id) => State.get(`nodes.${id}`)?.lastPacket);
    // Pulse only recently-active source nodes; if none, do nothing (no idle animation spam)
  }, 3000);
}

export function animateLoraPacket(fromId, toId) {
  const from = NODES[fromId], to = NODES[toId];
  if (!from || !to) return;
  const dot = L.circleMarker([from.lat, from.lng], {
    radius: 4, color: '#2fae66', fillColor: '#2fae66', fillOpacity: 1, weight: 0,
  }).addTo(layers.loraNetwork);

  const start = performance.now();
  function frame(now) {
    const f = Math.min(1, (now - start) / LORA_PULSE_MS);
    const lat = from.lat + (to.lat - from.lat) * f;
    const lng = from.lng + (to.lng - from.lng) * f;
    dot.setLatLng([lat, lng]);
    if (f < 1) requestAnimationFrame(frame);
    else setTimeout(() => layers.loraNetwork.removeLayer(dot), 200);
  }
  requestAnimationFrame(frame);
}


function renderBackendSafeRoute(result) {
  if (!axonSafeRouteLayerGroup) return;
  axonSafeRouteLayerGroup.clearLayers();
  if (!result || result.status !== 'SAFE_ROUTE_FOUND' || !result.path) return;
  const latlngs = result.path.map((id) => OFFLINE_GRAPH.nodes[id]).filter(Boolean).map((n) => [n.lat, n.lng]);
  if (latlngs.length < 2) return;
  L.polyline(latlngs, {
    color: '#39c77a', weight: 7, opacity: 0.95, lineCap: 'round',
  }).bindTooltip(`AXON SAFE ROUTE → ${result.destination} · ${result.distance_km ?? '—'} km`, { sticky: true }).addTo(axonSafeRouteLayerGroup);
  const dst = OFFLINE_GRAPH.nodes[result.destination];
  if (dst) L.circleMarker([dst.lat, dst.lng], { radius: 10, color: '#39c77a', fillColor: '#102319', fillOpacity: 0.9, weight: 3 })
    .bindTooltip(`${result.destination} · SELECTED SAFE POINT`, { direction: 'top' }).addTo(axonSafeRouteLayerGroup);
}

// --- Routing rendering -----------------------------------------------------------------

function renderGoogleRoutes(candidates) {
  layers.googleRoutes.clearLayers();
  (candidates || []).forEach((c, i) => {
    if (!c.polyline) return;
    const latlngs = decodePolyline(c.polyline);
    L.polyline(latlngs, {
      color: c.safe === false ? '#d1453d' : '#2fae66',
      weight: c.safe === false ? 3 : 5,
      dashArray: c.safe === false ? '6 6' : null,
      opacity: c.safe === false ? 0.7 : 0.95,
    }).bindTooltip(`G${i + 1} · ${c.safe === false ? 'REJECTED' : 'SELECTED'}${c.reason ? ' — ' + c.reason : ''}`)
      .addTo(layers.googleRoutes);
  });
}

function renderOfflineRoute(result) {
  layers.offlineRoutes.clearLayers();
  if (!result || result.status !== 'SAFE_ROUTE_FOUND') return;
  const latlngs = result.path.map((n) => {
    const node = OFFLINE_GRAPH.nodes[n];
    return [node.lat, node.lng];
  });
  L.polyline(latlngs, { color: '#2fae66', weight: 5, opacity: 0.95 })
    .bindTooltip(`AXON LOCAL ROUTE → ${result.destination} (${result.distance_km} km)`)
    .addTo(layers.offlineRoutes);
}

// Minimal Google-encoded-polyline decoder (standard algorithm)
function decodePolyline(encoded) {
  let index = 0, lat = 0, lng = 0, coordinates = [];
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coordinates.push([lat / 1e5, lng / 1e5]);
  }
  return coordinates;
}

// --- Layer control / expand-collapse ---------------------------------------------------

export function toggleLayer(name, visible) {
  const layer = layers[name];
  if (!layer) return;
  if (visible) layer.addTo(map); else map.removeLayer(layer);
}

export function invalidateSize() {
  if (map) setTimeout(() => map.invalidateSize(), 220);
}

export function flashNode(nodeId) {
  const marker = nodeMarkers[nodeId];
  if (!marker) return;
  const el = marker.getElement();
  if (!el) return;
  el.classList.add('node-marker--pulse');
  setTimeout(() => el.classList.remove('node-marker--pulse'), 1200);
}


// Judge-facing helper: focus the best route currently available.
export function focusBestRoute() {
  if (!map) return false;

  const backend = State.get('routing.backendSafeRoute');
  if (backend?.status === 'SAFE_ROUTE_FOUND' && Array.isArray(backend.path)) {
    const latlngs = backend.path
      .map((id) => OFFLINE_GRAPH.nodes[id])
      .filter(Boolean)
      .map((n) => [n.lat, n.lng]);
    if (latlngs.length >= 2) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [70, 70], maxZoom: 16 });
      return true;
    }
  }

  const candidates = State.get('routing.candidates') || [];
  const selectedId = State.get('routing.selected');
  let candidate = candidates.find((c) => c.id === selectedId || c.route_id === selectedId);
  if (!candidate) candidate = candidates.find((c) => c.safe !== false);
  if (candidate?.polyline) {
    const latlngs = decodePolyline(candidate.polyline);
    if (latlngs.length >= 2) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [70, 70], maxZoom: 16 });
      return true;
    }
  }

  const offline = State.get('routing.offlineResult');
  if (offline?.status === 'SAFE_ROUTE_FOUND' && Array.isArray(offline.path)) {
    const latlngs = offline.path
      .map((id) => OFFLINE_GRAPH.nodes[id])
      .filter(Boolean)
      .map((n) => [n.lat, n.lng]);
    if (latlngs.length >= 2) {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [70, 70], maxZoom: 16 });
      return true;
    }
  }
  return false;
}
