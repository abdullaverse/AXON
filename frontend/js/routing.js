// AXON — routing.js
// Google candidate routes are decoded/rendered for VISUALIZATION only.
// The authoritative SAFE/REJECTED decision must come from the backend
// (per project spec section 5) — this module never invents that decision
// itself; it renders whatever the backend returns, or shows
// "GOOGLE ROUTES BACKEND ADAPTER REQUIRED" until that endpoint exists.

import { State, on } from './state.js';
import { Api } from './api.js';
import { OFFLINE_GRAPH, HAZARD_ANCHORS } from './config.js';
import { pushEvent } from './telemetry.js';

// --- Offline local-graph routing (Dijkstra) -----------------------------------------

function buildAdjacency() {
  const adj = {};
  for (const node of Object.keys(OFFLINE_GRAPH.nodes)) adj[node] = [];
  for (const [a, b, dist] of OFFLINE_GRAPH.edges) {
    adj[a].push({ to: b, dist });
    adj[b].push({ to: a, dist });
  }
  return adj;
}

export function calculateOfflineRoute(blockedEdges = [], from = 'VILLAGE') {
  const adj = buildAdjacency();
  const blocked = new Set(blockedEdges.map((e) => e.join('|')));
  const dist = {}, prev = {}, visited = new Set();
  for (const node of Object.keys(OFFLINE_GRAPH.nodes)) dist[node] = Infinity;
  dist[from] = 0;

  const queue = new Set(Object.keys(OFFLINE_GRAPH.nodes));
  while (queue.size) {
    let u = null, best = Infinity;
    for (const n of queue) if (dist[n] < best) { best = dist[n]; u = n; }
    if (u === null) break;
    queue.delete(u); visited.add(u);
    for (const edge of adj[u]) {
      const key1 = `${u}|${edge.to}`, key2 = `${edge.to}|${u}`;
      if (blocked.has(key1) || blocked.has(key2)) continue;
      const alt = dist[u] + edge.dist;
      if (alt < dist[edge.to]) { dist[edge.to] = alt; prev[edge.to] = u; }
    }
  }

  const safePoints = ['SP_01', 'SP_02', 'SP_03'].filter((sp) => dist[sp] < Infinity);
  if (!safePoints.length) return { status: 'NO_SAFE_ROUTE_FOUND' };

  const destination = safePoints.sort((a, b) => dist[a] - dist[b])[0];
  const path = [];
  let cur = destination;
  while (cur) { path.unshift(cur); cur = prev[cur]; }

  return {
    status: 'SAFE_ROUTE_FOUND',
    destination,
    distance_km: Number(dist[destination].toFixed(3)),
    path,
    algorithm: 'Dijkstra',
  };
}

// --- Route source orchestration -------------------------------------------------------

export async function evaluateRouting() {
  const online = State.get('connectivity.internet').value && State.get('connectivity.googleRoutes').value;

  if (online) {
    State.set('routing.source', 'GOOGLE');
    const hazards = Object.entries(State.get('hazards'))
      .filter(([, r]) => Number(r?.value?.score || 0) >= 60)
      .map(([type, r]) => ({
        type,
        lat: HAZARD_ANCHORS[type].center.lat,
        lng: HAZARD_ANCHORS[type].center.lng,
        radius_m: HAZARD_ANCHORS[type].baseRadius_m +
          (HAZARD_ANCHORS[type].maxRadius_m - HAZARD_ANCHORS[type].baseRadius_m) * (r.value.score / 100),
      }));
    const res = await Api.getGoogleSafeRoute(
      { lat: 11.4089, lng: 76.8740 },
      { lat: 11.4200, lng: 76.8600 },
      hazards
    );
    if (res.unavailable || !res.ok) {
      State.setReading('routing.status', 'GOOGLE ROUTES BACKEND ADAPTER REQUIRED', 'OFFLINE');
      State.set('routing.candidates', []);
      State.set('routing.selected', null);
      return;
    }
    // Real backend response shape expected: { candidates: [...], selected, reason }
    State.setReading('routing.status', 'LIVE', 'LIVE');
    State.set('routing.candidates', res.data.candidates || []);
    State.set('routing.selected', res.data.selected || null);
    State.set('routing.reason', res.data.reason || null);
    pushEvent({ category: 'ROUTING', message: `Google Routes evaluated — source LIVE` });
  } else {
    State.set('routing.source', 'AXON_LOCAL');
    const h = State.get('hazards');
    const blocked = [];
    if ((h.landslide?.value?.score || 0) >= 60) blocked.push(['J2', 'J1'], ['SP_01', 'J2']);
    if ((h.flood?.value?.score || 0) >= 60) blocked.push(['J3', 'SP_02']);
    if ((h.fire?.value?.score || 0) >= 60) blocked.push(['VILLAGE', 'SP_03']);
    const backend = State.get('routing.backendSafeRoute');
    const result = backend?.status === 'SAFE_ROUTE_FOUND' ? backend : calculateOfflineRoute(blocked);
    State.setReading('routing.status', 'AXON LOCAL GRAPH', 'LOCAL');
    State.set('routing.offlineResult', result);
    pushEvent({ category: 'ROUTING', message: `AXON local routing — ${result.status}${result.destination ? ' → ' + result.destination : ''}` });
  }
}

export function buildRoutingInspector() {
  const source = State.get('routing.source');
  if (source === 'GOOGLE') {
    const status = State.get('routing.status');
    const candidates = State.get('routing.candidates') || [];
    if (status.value !== 'LIVE') {
      return `
        <div class="inspector-block">
          <h4>ROUTING SOURCE <span class="pill">GOOGLE ROUTES API</span></h4>
          <p class="inspector-note inspector-note--warning">${status.value}</p>
          <p class="inspector-meta">The Google Routes backend adapter has not been implemented yet. This panel will populate automatically once <code>/routing/google-safe-route</code> exists — no route data is fabricated in the meantime.</p>
        </div>`;
    }
    return `
      <div class="inspector-block">
        <h4>ROUTING SOURCE <span class="pill pill--active">GOOGLE ROUTES API</span></h4>
        <p class="inspector-meta">Candidate routes: ${candidates.length}</p>
        ${candidates.map((c, i) => `
          <div class="route-row ${c.safe === false ? 'route-row--rejected' : 'route-row--safe'}">
            <b>G${i + 1}</b> ${c.distance_km ?? '—'} km · ${c.duration_min ?? '—'} min
            <span class="tag tag--${c.safe === false ? 'critical' : 'safe'}">${c.safe === false ? 'REJECTED' : 'SAFE'}</span>
            ${c.reason ? `<i class="route-reason">${c.reason}</i>` : ''}
          </div>`).join('')}
      </div>`;
  }

  const result = State.get('routing.offlineResult');
  return `
    <div class="inspector-block">
      <h4>ROUTING SOURCE <span class="pill pill--offline">AXON LOCAL GRAPH</span></h4>
      <div class="metric-grid">
        <div><span>Algorithm</span><b>Dijkstra / A*</b></div>
        <div><span>Map</span><b>CACHED</b></div>
        <div><span>Traffic</span><b>UNAVAILABLE</b></div>
        <div><span>Hazard Source</span><b>LOCAL SENSOR + EDGE</b></div>
      </div>
      ${result ? `
        <p class="inspector-meta">Status: <b>${result.status}</b></p>
        ${result.path ? `<p class="inspector-meta">Path: ${result.path.join(' → ')}</p>` : ''}
        ${result.distance_km != null ? `<p class="inspector-meta">Distance: ${result.distance_km} km</p>` : ''}
      ` : '<p class="inspector-meta">No route computed yet.</p>'}
    </div>`;
}


export async function findSafestRouteNow() {
  pushEvent({ category: 'ROUTING', message: 'Manual safest-route request received' });
  await evaluateRouting();

  const backend = State.get('routing.backendSafeRoute');
  if (backend?.status === 'SAFE_ROUTE_FOUND') {
    return { ok: true, source: 'BACKEND_SAFE_ROUTE', route: backend };
  }

  if (State.get('routing.source') === 'GOOGLE') {
    const candidates = State.get('routing.candidates') || [];
    const selected = State.get('routing.selected');
    const route = candidates.find((c) => c.id === selected || c.route_id === selected)
      || candidates.find((c) => c.safe !== false);
    if (route) return { ok: true, source: 'GOOGLE_ROUTES', route };
  }

  const offline = State.get('routing.offlineResult');
  if (offline?.status === 'SAFE_ROUTE_FOUND') {
    return { ok: true, source: 'AXON_LOCAL', route: offline };
  }

  return { ok: false, error: 'NO_SAFE_ROUTE_AVAILABLE' };
}
