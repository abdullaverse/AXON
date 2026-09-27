/* ==========================================================================
   AXON — Multi-Hazard Environmental Intelligence & Adaptive Evacuation System
   Frontend application logic.

   Demo area: Aravenu resilience sector, Kotagiri, Nilgiris, Tamil Nadu (representative Western
   Ghats terrain — hill slope to the south-east, a stream corridor to the
   west, forest cover to the south-west, safe ground to the north).

   Architecture note: this file is written so ONLINE routing (Google Routes
   candidate paths) and OFFLINE routing (local graph + Dijkstra) both feed
   into the same AXON Hazard/Routing Engine below. Swapping the OSM tile
   layer for Google Maps Platform later only touches CONFIG + initMap().
   ========================================================================== */

const CONFIG = {
  backendBase: "",              // same-origin FastAPI backend ("" = relative)
  center: [11.4090, 76.8740],   // Aravenu demo deployment
  zoom: 13,
  minZoom: 11,
  maxZoom: 19,
  emergencyWindowMin: 10
};

/* --------------------------------------------------------------------
   1. GEOGRAPHY — nodes, safe points, roads (local offline graph)
   -------------------------------------------------------------------- */

const NODES = [
  { id: "H01", type: "landslide", label: "H01", coords: [11.4048, 76.8794],
    title: "HILL / LANDSLIDE NODE", sensors: ["Rainfall", "Soil moisture", "Ground vibration", "Temperature", "LoRa"] },
  { id: "R01", type: "flood", label: "R01", coords: [11.4116, 76.8688],
    title: "RIVER / FLOOD NODE", sensors: ["Water level", "Rainfall", "Rate of rise", "LoRa"] },
  { id: "F01", type: "fire", label: "F01", coords: [11.4168, 76.8662],
    title: "FOREST FIRE NODE", sensors: ["Temperature", "Humidity", "Smoke", "Gas", "LoRa"] },
  { id: "A01", type: "air", label: "A01", coords: [11.4104, 76.8761],
    title: "AIR QUALITY NODE", sensors: ["PM2.5", "PM10", "Gas", "LoRa"] },
  { id: "C01", type: "community", label: "C01", coords: [11.4090, 76.8740],
    title: "COMMUNITY SAFETY UNIT — ARAVENU", sensors: ["LoRa receiver", "Wi-Fi hotspot", "Siren", "Display", "Direction LEDs"] },
  { id: "T01", type: "relay", label: "T01", coords: [11.4134, 76.8738],
    title: "TOWER / RELAY NODE", sensors: ["LoRa relay", "Solar power", "Battery", "GPS", "Edge cache"] },
]

const SAFE_POINTS = [
  { id: "SP-01", coords: [11.4148, 76.8788], capacity: 180, base: "east-high-ground" },
  { id: "SP-02", coords: [11.4168, 76.8724], capacity: 260, base: "northwest-high-ground" },
  { id: "SP-03", coords: [11.4204, 76.8768], capacity: 420, base: "north-high-ground" },
]

// Local road graph (used for BOTH the online demo-mode overlay and the
// offline Dijkstra router). Distances in km.
const GRAPH_NODES = {
  VILLAGE: [11.4090, 76.8740],
  JCT_A:   [11.4066, 76.8771],   // hill / landslide corridor
  JCT_B:   [11.4110, 76.8704],   // river / flood corridor
  JCT_C:   [11.4150, 76.8740],   // northern high-ground corridor
  "SP-01": SAFE_POINTS[0].coords,
  "SP-02": SAFE_POINTS[1].coords,
  "SP-03": SAFE_POINTS[2].coords,
}

function makeEdge(distance, hazardExposure = 0) {
  return { distance, hazardExposure, status: "OPEN" };
}

const GRAPH_EDGES = [
  { id: "R1", a: "VILLAGE", b: "JCT_A", ...makeEdge(0.55) },
  { id: "R2", a: "JCT_A",   b: "SP-01", ...makeEdge(0.65) },
  { id: "R4", a: "VILLAGE", b: "JCT_B", ...makeEdge(0.60) },
  { id: "R5", a: "JCT_B",   b: "SP-02", ...makeEdge(0.55) },
  { id: "R6", a: "VILLAGE", b: "JCT_C", ...makeEdge(0.75) },
  { id: "R3", a: "JCT_C",   b: "SP-03", ...makeEdge(0.95) },
  { id: "R7", a: "JCT_A",   b: "JCT_C", ...makeEdge(0.45) },
  { id: "R8", a: "JCT_B",   b: "JCT_C", ...makeEdge(0.50) },
];

/* --------------------------------------------------------------------
   2. STATE
   -------------------------------------------------------------------- */

const state = {
  online: true,
  risk: { landslide: 8, flood: 11, fire: 4, pollution: 15 },
  incident: "NORMAL",
  activeScenario: "normal",
  mode: "digital",
  communitySiren: false,
  currentRouteEdgeIds: ["R1", "R2"],
  currentDestination: "SP-01",
  loraTimer: null,
  cascadeTimers: [],
};

/* --------------------------------------------------------------------
   3. MAP INITIALISATION
   -------------------------------------------------------------------- */

let map, roadsLayer, nodesLayer, safeLayer, hazardLayer, routeLayer,
    gpmLayer, firmsLayer, trafficLayer;
const roadLines = {};   // edgeId -> polyline
const nodeMarkers = {}; // nodeId -> marker (for LoRa pulses)

function initMap() {
  map = L.map("map", {
    center: CONFIG.center,
    zoom: CONFIG.zoom,
    minZoom: CONFIG.minZoom,
    maxZoom: CONFIG.maxZoom,
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  roadsLayer   = L.layerGroup().addTo(map);
  hazardLayer  = L.layerGroup().addTo(map);
  routeLayer   = L.layerGroup().addTo(map);
  safeLayer    = L.layerGroup().addTo(map);
  nodesLayer   = L.layerGroup().addTo(map);
  gpmLayer     = L.layerGroup();     // NASA GPM — off by default
  firmsLayer   = L.layerGroup();     // NASA FIRMS — off by default
  trafficLayer = L.layerGroup();     // Google traffic demo — off by default

  drawRoads();
  drawNodes();
  drawSafePoints();
  drawSimulatedSatelliteLayers();
  renderRoute();
}

function edgeStyle(edge) {
  if (edge.status === "BLOCKED") return { color: "#ff5266", weight: 4, opacity: 0.9, dashArray: "2 6" };
  if (edge.hazardExposure >= 0.5) return { color: "#f0a83c", weight: 3.5, opacity: 0.85 };
  return { color: "#3a4a5c", weight: 3, opacity: 0.7 };
}

function drawRoads() {
  roadsLayer.clearLayers();
  GRAPH_EDGES.forEach((edge) => {
    const line = L.polyline([GRAPH_NODES[edge.a], GRAPH_NODES[edge.b]], edgeStyle(edge));
    line.bindTooltip(`${edge.id} · ${edge.distance} km · ${edge.status}`, { sticky: true, className: "axon-tooltip" });
    line.addTo(roadsLayer);
    roadLines[edge.id] = line;
  });
}

function refreshRoadStyles() {
  GRAPH_EDGES.forEach((edge) => {
    const line = roadLines[edge.id];
    if (line) {
      line.setStyle(edgeStyle(edge));
      line.setTooltipContent(`${edge.id} · ${edge.distance} km · ${edge.status}`);
    }
  });
}

function nodeDivIcon(label, cssClass) {
  return L.divIcon({
    className: "",
    html: `<div class="axon-node-icon ${cssClass}">${label}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const NODE_CLASS = {
  landslide: "node-warn",
  flood: "",
  fire: "node-crit",
  air: "",
  community: "node-community",
  relay: "node-relay",
};

function drawNodes() {
  NODES.forEach((n) => {
    const marker = L.marker(n.coords, { icon: nodeDivIcon(n.label, NODE_CLASS[n.type] || "") });
    const sensorRows = n.sensors.map((s) => `<div class="axon-popup-row"><span>${s}</span></div>`).join("");
    marker.bindPopup(
      `<div class="axon-popup-title">${n.id} — ${n.title}</div>${sensorRows}`
    );
    marker.addTo(nodesLayer);
    nodeMarkers[n.id] = marker;
  });
}

function drawSafePoints() {
  SAFE_POINTS.forEach((sp) => {
    const icon = L.divIcon({
      className: "",
      html: `<div class="axon-safepoint-icon">&#9678;</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    const marker = L.marker(sp.coords, { icon });
    marker.bindPopup(() => buildSafePointPopup(sp));
    marker.addTo(safeLayer);
    sp._marker = marker;
  });
}

function buildSafePointPopup(sp) {
  const distanceKm = computeRoute("VILLAGE", sp.id).distance;
  const etaMin = Math.max(2, Math.round(distanceKm * 12));
  const isTarget = state.currentDestination === sp.id;
  return `
    <div class="axon-popup-title">${sp.id} — EVACUATION SHELTER</div>
    <div class="axon-popup-row"><span>Capacity</span><b>${sp.capacity} people</b></div>
    <div class="axon-popup-row"><span>Distance</span><b>${distanceKm.toFixed(1)} km</b></div>
    <div class="axon-popup-row"><span>Est. evac time</span><b>${etaMin} min</b></div>
    <div class="axon-popup-row"><span>Availability</span><b>Open</b></div>
    <div class="axon-popup-row"><span>Risk status</span><b style="color:${isTarget ? "#33d488" : "#8695a8"}">${isTarget ? "RECOMMENDED" : "STANDBY"}</b></div>
  `;
}

// SIMULATED / MOCK satellite context layers — clearly labelled per spec.
function drawSimulatedSatelliteLayers() {
  const gpmPatch = L.rectangle(
    [[11.401, 76.862], [11.422, 76.885]],
    { color: "#4fd6e8", weight: 1, fillOpacity: 0.06, dashArray: "4 4" }
  ).bindTooltip("SIMULATED SATELLITE LAYER — NASA GPM Rainfall (mock)", { className: "axon-tooltip" });
  gpmPatch.addTo(gpmLayer);

  const firmsPatch = L.rectangle(
    [[11.411, 76.860], [11.423, 76.871]],
    { color: "#ff5266", weight: 1, fillOpacity: 0.06, dashArray: "4 4" }
  ).bindTooltip("SIMULATED SATELLITE LAYER — NASA FIRMS Fire Detections (mock)", { className: "axon-tooltip" });
  firmsPatch.addTo(firmsLayer);

  const trafficLine = L.polyline(
    [GRAPH_NODES.VILLAGE, GRAPH_NODES.JCT_C, GRAPH_NODES["SP-03"]],
    { color: "#b98cf0", weight: 2, opacity: 0.4, dashArray: "1 6" }
  ).bindTooltip("TRAFFIC ROUTING — DEMO MODE (Google Routes not configured)", { className: "axon-tooltip" });
  trafficLine.addTo(trafficLayer);
}

/* --------------------------------------------------------------------
   4. HAZARD ZONES (animated polygons)
   -------------------------------------------------------------------- */

let landslidePolygon = null;
let floodPolygon = null;
let firePolygon = null;
let smokePolygon = null;

function setLandslideZone(intensity) {
  // intensity 0..1 controls opacity / extent
  hazardLayer.eachLayer((l) => { if (l === landslidePolygon) hazardLayer.removeLayer(l); });
  if (intensity <= 0) { landslidePolygon = null; return; }
  const grow = 0.0025 + intensity * 0.0022;
  const c = GRAPH_NODES.JCT_A;
  landslidePolygon = L.polygon([
    [c[0] + grow, c[1] - grow * 0.6],
    [c[0] + grow * 1.4, c[1] + grow * 0.9],
    [c[0] - grow * 0.4, c[1] + grow * 1.3],
    [c[0] - grow * 1.1, c[1] - grow * 0.2],
  ], {
    color: "#f0a83c", weight: 1.5, fillColor: "#f0a83c",
    fillOpacity: 0.10 + intensity * 0.22,
  }).bindTooltip(`SLOPE HAZARD ZONE — landslide probability ${Math.round(intensity * 100)}%`, { className: "axon-tooltip" });
  landslidePolygon.addTo(hazardLayer);
}

function setFloodZone(intensity) {
  hazardLayer.eachLayer((l) => { if (l === floodPolygon) hazardLayer.removeLayer(l); });
  if (intensity <= 0) { floodPolygon = null; return; }
  const grow = 0.0015 + intensity * 0.0032;
  const c = GRAPH_NODES.JCT_B; // flood polygon grows outward from the river junction
  floodPolygon = L.polygon([
    [c[0] + grow * 1.6, c[1] - grow * 0.5],
    [c[0] + grow * 0.6, c[1] + grow * 1.6],
    [c[0] - grow * 1.3, c[1] + grow * 1.1],
    [c[0] - grow * 1.6, c[1] - grow * 0.8],
    [c[0] - grow * 0.2, c[1] - grow * 1.5],
  ], {
    color: "#4fd6e8", weight: 1.5, fillColor: "#4fd6e8",
    fillOpacity: 0.12 + intensity * 0.26,
  }).bindTooltip(`FLOOD INUNDATION ZONE — level ${Math.round(intensity * 100)}%`, { className: "axon-tooltip" });
  floodPolygon.addTo(hazardLayer);

  // once the flood zone is large enough, it reaches/crosses JCT_B — used
  // by the cascade timeline to flag road R5 as flood-exposed.
}

function setFireZone(intensity) {
  hazardLayer.eachLayer((l) => { if (l === firePolygon) hazardLayer.removeLayer(l); });
  if (intensity <= 0) { firePolygon = null; return; }
  const grow = 0.0018 + intensity * 0.0034;
  const c = [11.4168, 76.8662];
  firePolygon = L.polygon([
    [c[0] + grow, c[1] - grow],
    [c[0] + grow * 1.3, c[1] + grow * 0.7],
    [c[0] - grow * 0.5, c[1] + grow * 1.4],
    [c[0] - grow * 1.2, c[1] + grow * 0.1],
    [c[0] - grow * 0.6, c[1] - grow * 1.2],
  ], {
    color: "#ff5266", weight: 1.5, fillColor: "#ff5266",
    fillOpacity: 0.12 + intensity * 0.28,
  }).bindTooltip(`FOREST FIRE ZONE — spread ${Math.round(intensity * 100)}%`, { className: "axon-tooltip" });
  firePolygon.addTo(hazardLayer);
}

function setSmokePlume(intensity) {
  hazardLayer.eachLayer((l) => { if (l === smokePolygon) hazardLayer.removeLayer(l); });
  if (intensity <= 0) { smokePolygon = null; return; }
  const grow = 0.0016 + intensity * 0.003;
  const c = [11.4120, 76.8710]; // drifting between fire node and air node
  smokePolygon = L.polygon([
    [c[0] + grow, c[1] - grow * 0.4],
    [c[0] + grow * 1.5, c[1] + grow * 0.8],
    [c[0] - grow * 0.3, c[1] + grow * 1.2],
    [c[0] - grow, c[1] - grow * 0.5],
  ], {
    color: "#b98cf0", weight: 1, fillColor: "#b98cf0",
    fillOpacity: 0.08 + intensity * 0.16, dashArray: "3 5",
  }).bindTooltip("SMOKE DISPERSION PLUME (simulated)", { className: "axon-tooltip" });
  smokePolygon.addTo(hazardLayer);
}

/* --------------------------------------------------------------------
   5. OFFLINE ROUTING ENGINE (Dijkstra over GRAPH_EDGES)
   -------------------------------------------------------------------- */

function buildAdjacency() {
  const adj = {};
  Object.keys(GRAPH_NODES).forEach((n) => (adj[n] = []));
  GRAPH_EDGES.forEach((e) => {
    const cost = e.status === "BLOCKED" ? Infinity : e.distance * (1 + e.hazardExposure * 8);
    adj[e.a].push({ to: e.b, cost, edge: e });
    adj[e.b].push({ to: e.a, cost, edge: e });
  });
  return adj;
}

function computeRoute(startId, endId) {
  const adj = buildAdjacency();
  const dist = {}, prevEdge = {}, prevNode = {}, visited = new Set();
  Object.keys(GRAPH_NODES).forEach((n) => (dist[n] = Infinity));
  dist[startId] = 0;
  const queue = new Set(Object.keys(GRAPH_NODES));

  while (queue.size) {
    let u = null, best = Infinity;
    queue.forEach((n) => { if (dist[n] < best) { best = dist[n]; u = n; } });
    if (u === null) break;
    queue.delete(u);
    if (u === endId) break;
    (adj[u] || []).forEach(({ to, cost, edge }) => {
      if (queue.has(to) && dist[u] + cost < dist[to]) {
        dist[to] = dist[u] + cost;
        prevNode[to] = u;
        prevEdge[to] = edge.id;
      }
    });
  }

  const edgeIds = [];
  let cur = endId;
  let realDistance = 0;
  while (prevNode[cur]) {
    edgeIds.unshift(prevEdge[cur]);
    const e = GRAPH_EDGES.find((x) => x.id === prevEdge[cur]);
    realDistance += e.distance;
    cur = prevNode[cur];
  }

  return {
    reachable: dist[endId] < Infinity,
    edgeIds,
    distance: realDistance,
    cost: dist[endId],
  };
}

function bestSafePoint() {
  let best = null;
  SAFE_POINTS.forEach((sp) => {
    const r = computeRoute("VILLAGE", sp.id);
    if (r.reachable && (!best || r.cost < best.route.cost)) best = { sp, route: r };
  });
  return best;
}

function directionLabel(spId) {
  const map = { "SP-01": "&#8593; NORTHEAST", "SP-02": "&#8593; NORTHWEST", "SP-03": "&#8593; NORTH" };
  return map[spId] || "&#8593; NORTH";
}

function renderRoute(customReasonHtml) {
  routeLayer.clearLayers();
  const best = bestSafePoint();
  if (!best) {
    setEvacStatus("NO SAFE ROUTE", "status-unsafe");
    return;
  }
  const { sp, route } = best;
  state.currentDestination = sp.id;
  state.currentRouteEdgeIds = route.edgeIds;

  const latlngs = [GRAPH_NODES.VILLAGE];
  let cur = "VILLAGE";
  route.edgeIds.forEach((eid) => {
    const e = GRAPH_EDGES.find((x) => x.id === eid);
    const next = e.a === cur ? e.b : e.a;
    latlngs.push(GRAPH_NODES[next]);
    cur = next;
  });

  const anyHazard = route.edgeIds.some((eid) => {
    const e = GRAPH_EDGES.find((x) => x.id === eid);
    return e.hazardExposure >= 0.5;
  });

  L.polyline(latlngs, {
    color: anyHazard ? "#f0a83c" : "#33d488",
    weight: 5, opacity: 0.9, lineCap: "round",
  }).addTo(routeLayer);

  const etaMin = Math.max(2, Math.round(route.distance * 3));
  document.getElementById("evacDirection").innerHTML = directionLabel(sp.id);
  document.getElementById("evacDestination").textContent = sp.id;
  document.getElementById("evacDistance").textContent = `${route.distance.toFixed(1)} km`;
  document.getElementById("evacETA").textContent = `${etaMin} min`;
  document.getElementById("evacWindow").textContent = `${CONFIG.emergencyWindowMin} min`;
  setEvacStatus(anyHazard ? "CAUTION" : "SAFE", anyHazard ? "status-calc" : "status-safe");
  if (customReasonHtml) document.getElementById("evacReason").innerHTML = customReasonHtml;
}

function setEvacStatus(text, cls) {
  const el = document.getElementById("evacRouteStatus");
  el.textContent = text;
  el.className = "evac-v " + cls;
}


function setCommunityUnit({siren=false, order="MONITOR / HOLD", packet="Waiting for route packet…", display="STANDBY"} = {}) {
  state.communitySiren = !!siren;
  const sirenEl = document.getElementById("cSiren");
  const orderEl = document.getElementById("communityOrder");
  const packetEl = document.getElementById("communityPacket");
  const displayEl = document.getElementById("cDisplay");
  if (sirenEl) { sirenEl.textContent = siren ? "ACTIVE" : "READY"; sirenEl.className = siren ? "community-alarm" : ""; }
  if (orderEl) orderEl.innerHTML = order;
  if (packetEl) packetEl.textContent = packet;
  if (displayEl) displayEl.textContent = display;
}

function dispatchCommunityAlert(reason="EVAC_ROUTE_UPDATE") {
  const dest = state.currentDestination || "SP-03";
  const direction = document.getElementById("evacDirection")?.textContent?.trim() || "MOVE NORTH";
  firePulse("T01", "C01", reason);
  setCommunityUnit({
    siren: true,
    order: `${direction}<br>${dest}`,
    packet: `LoRa packet received: ${reason} → ${dest}`,
    display: "EVACUATE"
  });
  pushLog(`C01 SIREN ACTIVE — ${direction} — ${dest}`, "crit");
}

function setAppMode(mode) {
  state.mode = mode === "live" ? "live" : "digital";
  document.querySelectorAll(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === state.mode));
  const digital = state.mode === "digital";
  document.getElementById("scenario-strip")?.classList.toggle("disabled-strip", !digital);
  document.querySelectorAll(".scn-btn").forEach(b => b.disabled = !digital);
  setSimHud(digital ? "DIGITAL TWIN" : "LIVE FIELD", 0, digital ? "Select a disaster trigger" : "Awaiting live sensor packets");
  pushLog(digital ? "DIGITAL TWIN MODE ENABLED" : "LIVE FIELD NETWORK MODE ENABLED", "net");
}

/* --------------------------------------------------------------------
   6. UI HELPERS — risk bars, incident block, event log, header
   -------------------------------------------------------------------- */

function setRisk(key, value) {
  state.risk[key] = value;
  const map = { landslide: "Landslide", flood: "Flood", fire: "Fire", pollution: "Pollution" };
  const idMap = { landslide: "Landslide", flood: "Flood", fire: "Fire", pollution: "Pollution" };
  document.getElementById(`fill${idMap[key]}`).style.width = `${value}%`;
  document.getElementById(`pct${idMap[key]}`).textContent = `${Math.round(value)}%`;
}

function setIncident(name, desc, level) {
  const el = document.getElementById("incidentName");
  el.textContent = name;
  el.className = "incident-name " + (level || "");
  document.getElementById("incidentDesc").textContent = desc;
}

function pad(n) { return n.toString().padStart(2, "0"); }
function simClock() {
  const t = new Date();
  return `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
}

function pushLog(msg, tag) {
  const log = document.getElementById("eventLog");
  const row = document.createElement("div");
  row.className = "log-row" + (tag ? ` tag-${tag}` : "");
  row.innerHTML = `<span class="log-time">${simClock()}</span><span class="log-msg">${msg}</span>`;
  log.prepend(row);
  while (log.children.length > 60) log.removeChild(log.lastChild);
}

function setIndicator(key, cls) {
  const ind = document.querySelector(`.ind[data-key="${key}"] .dot`);
  if (ind) ind.className = "dot " + cls;
}

function setOperationalMode(online) {
  state.online = online;
  const label = document.getElementById("opStatusLabel");
  const routingValue = document.getElementById("routingSourceValue");
  const routingComm = document.getElementById("routingCommValue");
  if (online) {
    label.textContent = "ONLINE INTELLIGENCE";
    label.classList.remove("offline");
    routingValue.textContent = "GOOGLE ROUTES · DEMO MODE";
    routingComm.textContent = "COMMS: CELLULAR / IP";
    setIndicator("internet", "ok");
    setIndicator("sat", "ok");
    setIndicator("lora", "idle");
  } else {
    label.textContent = "OFFLINE EMERGENCY MODE";
    label.classList.add("offline");
    routingValue.textContent = "LOCAL ROAD GRAPH";
    routingComm.textContent = "COMMS: LoRa MESH";
    setIndicator("internet", "bad");
    setIndicator("sat", "bad");
    setIndicator("lora", "active");
  }
}

/* --------------------------------------------------------------------
   7. LoRa MESH PULSE ANIMATION
   -------------------------------------------------------------------- */

const LORA_LINKS = [
  ["H01", "T01"], ["R01", "T01"], ["F01", "T01"], ["A01", "T01"], ["T01", "C01"],
];

function firePulse(fromId, toId, label) {
  const from = nodeMarkers[fromId], to = nodeMarkers[toId];
  if (!from || !to) return;
  const p1 = map.latLngToContainerPoint(from.getLatLng());
  const mapEl = document.getElementById("map");
  const ring = document.createElement("div");
  ring.className = "lora-pulse";
  ring.style.position = "absolute";
  ring.style.left = `${p1.x - 12}px`;
  ring.style.top = `${p1.y - 12}px`;
  ring.style.width = "24px";
  ring.style.height = "24px";
  mapEl.appendChild(ring);
  setTimeout(() => ring.remove(), 1200);
  if (label) pushLog(`${fromId} &rarr; ${toId} &nbsp;<span style="color:#4fd6e8">${label}</span>`, "net");
}

function startLoraMesh() {
  stopLoraMesh();
  state.loraTimer = setInterval(() => {
    const [a, b] = LORA_LINKS[Math.floor(Math.random() * LORA_LINKS.length)];
    firePulse(a, b);
  }, 2600);
}
function stopLoraMesh() {
  if (state.loraTimer) clearInterval(state.loraTimer);
  state.loraTimer = null;
}

/* --------------------------------------------------------------------
   8. BACKEND CALLS (best-effort — dashboard remains fully demo-capable
      even if the local FastAPI process is not reachable)
   -------------------------------------------------------------------- */

async function postBackend(path, body) {
  try {
    const res = await fetch(CONFIG.backendBase + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    setIndicator("db", "ok");
    return await res.json();
  } catch (err) {
    setIndicator("db", "warn");
    return null;
  }
}

async function pollRisk() {
  try {
    const res = await fetch(CONFIG.backendBase + "/risk");
    if (res.ok) { setIndicator("db", "ok"); return await res.json(); }
  } catch (err) { /* backend not reachable — dashboard stays fully demo-capable */ }
  setIndicator("db", "warn");
  return null;
}


/* --------------------------------------------------------------------
   8B. LARGE-MAP + SIMULATION HUD
   -------------------------------------------------------------------- */
function setSimHud(stage, pct, text) {
  const stageEl = document.getElementById("simStage");
  const progressEl = document.getElementById("simProgress");
  const textEl = document.getElementById("simText");
  if (stageEl) stageEl.textContent = stage || "LIVE SECTOR";
  if (progressEl) progressEl.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
  if (textEl) textEl.textContent = text || "Monitoring";
}

function fitOperationalArea() {
  const pts = [
    ...NODES.map(n => n.coords),
    ...SAFE_POINTS.map(s => s.coords),
    ...Object.values(GRAPH_NODES),
  ];
  if (map && pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.35), { padding:[30,30] });
}

function initMapFocusControl() {
  const btn = document.getElementById("mapFocusBtn");
  const body = document.getElementById("axon-body");
  if (!btn || !body) return;
  btn.addEventListener("click", () => {
    const expanded = body.classList.toggle("map-focus");
    btn.textContent = expanded ? "SHOW INTEL" : "EXPAND MAP";
    setTimeout(() => { if (map) map.invalidateSize(); }, 320);
  });
}

/* --------------------------------------------------------------------
   9. SCENARIO ENGINE
   -------------------------------------------------------------------- */

function clearCascadeTimers() {
  state.cascadeTimers.forEach((t) => clearTimeout(t));
  state.cascadeTimers = [];
}

function resetToBaseline() {
  clearCascadeTimers();
  setRisk("landslide", 8); setRisk("flood", 11); setRisk("fire", 4); setRisk("pollution", 15);
  setLandslideZone(0); setFloodZone(0); setFireZone(0); setSmokePlume(0);
  GRAPH_EDGES.forEach((e) => { e.status = "OPEN"; e.hazardExposure = e.hazardExposure > 0 ? 0.1 : 0; });
  GRAPH_EDGES.find(e => e.id === "R2").hazardExposure = 0;
  refreshRoadStyles();
  setIncident("NORMAL OPERATIONS", "All monitored parameters within baseline range.");
  document.getElementById("evacReason").textContent = "All corridors nominal. No evacuation currently required.";
  renderRoute();
  setOperationalMode(true);
  setCommunityUnit();
  document.getElementById("stripStatus").textContent = "SYSTEM NOMINAL";
  setSimHud("LIVE SECTOR", 0, "All systems monitoring");
  setTimeout(fitOperationalArea, 120);
}

function activateButton(scn) {
  document.querySelectorAll(".scn-btn").forEach((b) => b.classList.toggle("active", b.dataset.scn === scn));
}

const SCENARIOS = {
  normal() {
    resetToBaseline();
  },

  rain() {
    clearCascadeTimers();
    setIncident("HEAVY RAINFALL ADVISORY", "Rainfall intensity rising across the sector.", "warn");
    setRisk("landslide", 32); setRisk("flood", 28); setRisk("fire", 3); setRisk("pollution", 18);
    pushLog("Heavy rainfall detected — H01 &amp; R01 reporting elevated intake", "warn");
    document.getElementById("stripStatus").textContent = "ADVISORY · HEAVY RAIN";
    setSimHud("HEAVY RAIN", 28, "Rainfall intensifying across H01 / R01");
    renderRoute();
  },

  landslide() {
    clearCascadeTimers();
    setIncident("LANDSLIDE RISK — SECTOR H01", "Slope instability building on the eastern hill face.", "warn");
    let step = 0;
    const levels = [35, 55, 72, 88];
    const tick = () => {
      const v = levels[step];
      setRisk("landslide", v);
      setLandslideZone(v / 100);
      setSimHud("LANDSLIDE", v, `Slope instability ${v}%`);
      pushLog(`Landslide probability ${v}%`, v > 70 ? "crit" : "warn");
      step++;
      if (step < levels.length) {
        state.cascadeTimers.push(setTimeout(tick, 1100));
      } else {
        const r2 = GRAPH_EDGES.find((e) => e.id === "R2");
        const r1 = GRAPH_EDGES.find((e) => e.id === "R1");
        r1.status = "BLOCKED"; r1.hazardExposure = 1;
        refreshRoadStyles();
        pushLog("SLOPE INSTABILITY DETECTED — Road R1 BLOCKED", "crit");
        renderRoute("Village access road (R1) closed due to slope instability near H01. Rerouting via northern corridor.");
        dispatchCommunityAlert("LANDSLIDE_ROUTE_UPDATE");
      }
    };
    tick();
    document.getElementById("stripStatus").textContent = "ACTIVE · LANDSLIDE";
  },

  flood() {
    clearCascadeTimers();
    setIncident("FLOOD WARNING — R01 CORRIDOR", "Water level rising along the western stream corridor.", "warn");
    let step = 0;
    const levels = [42, 55, 68, 81, 94];
    const tick = () => {
      const v = levels[step];
      setRisk("flood", v);
      setFloodZone(v / 100);
      setSimHud("FLOOD", v, `Flood progression ${v}%`);
      pushLog(`Water level index ${v}%`, v > 75 ? "crit" : "warn");
      step++;
      if (step < levels.length) {
        state.cascadeTimers.push(setTimeout(tick, 1000));
      } else {
        const r4 = GRAPH_EDGES.find((e) => e.id === "R4");
        const r5 = GRAPH_EDGES.find((e) => e.id === "R5");
        r4.status = "BLOCKED"; r4.hazardExposure = 1;
        r5.hazardExposure = 0.9;
        refreshRoadStyles();
        pushLog("ROAD CLOSED — R4 inundated by flood zone", "crit");
        renderRoute("Western corridor (R4) closed — flood inundation confirmed by R01. Northern corridor selected.");
        dispatchCommunityAlert("FLOOD_ROUTE_UPDATE");
      }
    };
    tick();
    document.getElementById("stripStatus").textContent = "ACTIVE · FLOOD";
  },

  fire() {
    clearCascadeTimers();
    setIncident("FOREST FIRE — SECTOR F01", "Temperature rising, humidity falling in forest block.", "crit");
    let step = 0;
    const levels = [22, 41, 63, 85];
    const tick = () => {
      const v = levels[step];
      setRisk("fire", v);
      setFireZone(v / 100);
      setSimHud("FOREST FIRE", v, `Fire spread index ${v}%`);
      pushLog(`Fire spread index ${v}% — temp &uarr; humidity &darr;`, v > 60 ? "crit" : "warn");
      step++;
      if (step < levels.length) {
        state.cascadeTimers.push(setTimeout(tick, 1000));
      } else {
        pushLog("FOREST FIRE &rarr; SMOKE DISPERSION &rarr; AIR QUALITY DETERIORATION", "crit");
        let smokeStep = 0;
        const smokeLevels = [20, 45, 70];
        const smokeTick = () => {
          const sv = smokeLevels[smokeStep];
          setSmokePlume(sv / 100);
          setRisk("pollution", 20 + sv * 0.6);
          pushLog(`A01 PM2.5 rising — plume index ${sv}%`, "warn");
          smokeStep++;
          if (smokeStep < smokeLevels.length) state.cascadeTimers.push(setTimeout(smokeTick, 1000));
        };
        smokeTick();
      }
    };
    tick();
    document.getElementById("stripStatus").textContent = "ACTIVE · FOREST FIRE";
  },

  pollution() {
    clearCascadeTimers();
    setIncident("AIR QUALITY DETERIORATION", "PM2.5 / PM10 trending upward at A01.", "warn");
    setRisk("pollution", 64);
    setSimHud("POLLUTION", 64, "PM2.5 / PM10 exposure increasing");
    pushLog("A01 PM2.5 exceeding advisory threshold", "warn");
    document.getElementById("stripStatus").textContent = "ADVISORY · AIR QUALITY";
  },

  cascade() {
    clearCascadeTimers();
    setOperationalMode(true);
    setIncident("CASCADE EVENT — FLOOD + LANDSLIDE", "Multi-hazard interaction in progress.", "crit");
    document.getElementById("stripStatus").textContent = "CASCADE IN PROGRESS";

    const T = [];
    const at = (ms, fn) => T.push(setTimeout(fn, ms));

    at(300, () => {
      pushLog("Heavy rainfall detected across sector", "warn");
      setSimHud("CASCADE 1/6", 12, "Extreme rainfall begins");
      setRisk("pollution", 20);
    });

    at(1500, () => { setRisk("landslide", 35); setLandslideZone(0.35); pushLog("H01 soil saturation increasing — landslide probability 35%", "warn"); });
    at(2700, () => { setRisk("landslide", 55); setLandslideZone(0.55); setSimHud("CASCADE 2/6", 32, "Slope saturation rising"); pushLog("Landslide probability 55%", "warn"); });
    at(3900, () => { setRisk("landslide", 72); setLandslideZone(0.72); pushLog("Landslide probability 72%", "crit"); });
    at(5100, () => {
      setRisk("landslide", 88); setLandslideZone(0.88); setSimHud("CASCADE 3/6", 48, "Landslide detected · road failure");
      pushLog("LANDSLIDE DETECTED at H01", "crit");
      const r1 = GRAPH_EDGES.find((e) => e.id === "R1");
      r1.status = "BLOCKED"; r1.hazardExposure = 1;
      refreshRoadStyles();
      pushLog("Road R1 marked UNSAFE — BLOCKED", "crit");
      firePulse("H01", "T01", "LANDSLIDE_RISK 0.88");
    });

    at(6300, () => { pushLog("Debris flow affecting river corridor", "warn"); });
    at(6900, () => { setRisk("flood", 42); setFloodZone(0.42); pushLog("R01 rapid water rise detected — flood probability 42%", "warn"); });
    at(7900, () => { setRisk("flood", 61); setFloodZone(0.61); setSimHud("CASCADE 4/6", 65, "River corridor destabilizing"); pushLog("Flood probability 61%", "warn"); });
    at(8900, () => { setRisk("flood", 78); setFloodZone(0.78); pushLog("Flood probability 78%", "crit"); });
    at(9900, () => {
      setRisk("flood", 93); setFloodZone(0.93); setSimHud("CASCADE 5/6", 82, "Flood zone expanding · route threatened");
      pushLog("Flood probability 93% — inundation zone expanding", "crit");
    });

    at(10700, () => {
      const r4 = GRAPH_EDGES.find((e) => e.id === "R4");
      r4.hazardExposure = 1;
      refreshRoadStyles();
      setEvacStatus("UNSAFE", "status-unsafe");
      pushLog("Current evacuation route intersects flood zone — ROUTE UNSAFE", "crit");
      document.getElementById("evacReason").textContent = "Route via R4 now crosses expanding flood polygon.";
    });

    at(11900, () => {
      setEvacStatus("RECALCULATING", "status-calc");
      setSimHud("CASCADE 6/6", 92, "AXON recalculating safest corridor");
      pushLog("ROUTE RECALCULATION IN PROGRESS...", "warn");
    });

    at(13200, () => {
      const r4 = GRAPH_EDGES.find((e) => e.id === "R4");
      r4.status = "BLOCKED";
      refreshRoadStyles();
      pushLog("R2 (via flooded corridor) REJECTED — flood exposure", "crit");
      pushLog("Alternative corridor R3 evaluated — clear", "ok");
      firePulse("T01", "C01", "EVAC_ROUTE_UPDATE");
    });

    at(14400, () => {
      renderRoute("West corridor rejected due to flood inundation. East road rejected due to landslide risk. Northern corridor selected.");
      setIncident("CASCADE EVENT — EVACUATION UPDATED", "Flood + Landslide interaction — northern corridor active.", "crit");
      pushLog("EVACUATION UPDATED — MOVE NORTH — SAFE POINT SP-03", "ok");
      dispatchCommunityAlert("CASCADE_ROUTE_UPDATE");
      setSimHud("EVACUATION", 100, "Safe corridor R3 selected · SP-03");
      document.getElementById("stripStatus").textContent = "EVACUATION UPDATED · SP-03";
    });

    state.cascadeTimers = T;
  },

  network() {
    clearCascadeTimers();
    setOperationalMode(false);
    postBackend("/simulation/network-toggle", { online: false });
    pushLog("INTERNET CONNECTION LOST", "crit");
    document.getElementById("stripStatus").textContent = "OFFLINE EMERGENCY MODE";
    setTimeout(() => pushLog("Cloud / Google routing UNAVAILABLE", "warn"), 500);
    setTimeout(() => pushLog("Satellite live services UNAVAILABLE", "warn"), 900);
    setTimeout(() => { pushLog("LoRa Mesh ACTIVE", "ok"); document.getElementById("cLora").textContent="ACTIVE"; }, 1400);
    setTimeout(() => pushLog("Edge AI ACTIVE — local inference continuing", "ok"), 1800);
    setTimeout(() => pushLog("Local Sensors ACTIVE", "ok"), 2100);
    setTimeout(() => pushLog("Offline Map ACTIVE", "ok"), 2400);
    setTimeout(() => {
      pushLog("Local Routing ACTIVE — recomputing via local road graph", "ok");
      renderRoute("Cloud routing unavailable. AXON continues guidance using the cached local road graph over LoRa mesh.");
      pushLog("Evacuation guidance CONTINUES without internet", "ok");
      dispatchCommunityAlert("OFFLINE_ROUTE_UPDATE");
    }, 2900);
  },
};

function runScenario(name) {
  if (state.mode !== "digital") { pushLog("Simulation trigger ignored — switch to DIGITAL TWIN mode", "warn"); return; }
  state.activeScenario = name;
  activateButton(name);
  postBackend("/simulation/scenario", { scenario: name });
  if (name !== "network" && !state.online) setOperationalMode(true);
  (SCENARIOS[name] || SCENARIOS.normal)();
}

/* --------------------------------------------------------------------
   10. WIRING
   -------------------------------------------------------------------- */

function wireControls() {
  document.querySelectorAll(".mode-btn").forEach((btn) => btn.addEventListener("click", () => setAppMode(btn.dataset.mode)));
  document.querySelectorAll(".scn-btn").forEach((btn) => {
    btn.addEventListener("click", () => runScenario(btn.dataset.scn));
  });

  const layerMap = {
    sensors: nodesLayer, gpm: gpmLayer, firms: firmsLayer,
    hazards: hazardLayer, routes: routeLayer, safepoints: safeLayer, traffic: trafficLayer,
  };
  document.querySelectorAll('input[data-layer]').forEach((cb) => {
    cb.addEventListener("change", () => {
      const layer = layerMap[cb.dataset.layer];
      if (!layer) return;
      if (cb.checked) map.addLayer(layer); else map.removeLayer(layer);
    });
  });
}

/* --------------------------------------------------------------------
   11. BOOT
   -------------------------------------------------------------------- */

function boot() {
  initMap();
initMapFocusControl();
setTimeout(fitOperationalArea, 250);
  wireControls();
  startLoraMesh();
  pushLog("AXON system initialised — Aravenu resilience sector online", "ok");
  setAppMode("digital");
  pushLog("H01 &rarr; T01 &nbsp;HEARTBEAT", "net");
  pollRisk();
  setInterval(pollRisk, 15000);
}

document.addEventListener("DOMContentLoaded", boot);
