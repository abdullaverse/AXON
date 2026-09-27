// AXON — config.js
// Single source of truth for endpoint paths, map geometry, and scenario data.
// Anything marked NEEDS BACKEND is a placeholder: the frontend will show
// "LIVE DATA UNAVAILABLE" / "ADAPTER REQUIRED" until it is implemented.

export const ENDPOINTS = {
  // ---- CONFIRMED EXISTING BACKEND ENDPOINTS ----
  root:              '/',
  latest:            '/latest',
  risk:              '/risk',
  sensorData:        '/sensor-data',      // POST
  fusion:            '/fusion',           // POST — real trained-model inference (landslide confirmed)
  simScenario:       '/simulation/scenario',       // POST
  simNetworkToggle:  '/simulation/network-toggle', // legacy POST
  simStart:          '/simulation/start',
  simPause:          '/simulation/pause',
  simReset:          '/simulation/reset',
  simState:          '/simulation/state',
  simIntelligence:   '/simulation/intelligence',
  simNetworkFailure: '/simulation/network-failure',
  dashboard:         '/dashboard',

  // ---- NOT CONFIRMED — placeholders only, DO NOT assume they exist ----
  systemStatus:      { path: '/api/system/status', needsBackend: true },
  community:         { path: '/api/community',      needsBackend: true },
  events:            { path: '/api/events',         needsBackend: true },
  routingInspector:  { path: '/api/routing',         needsBackend: true },
  googleSafeRoute:   { path: '/routing/google-safe-route', needsBackend: false },
};

// ---------------------------------------------------------------------------
// MAP GEOMETRY — Aravenu Resilience Sector (Kotagiri, Nilgiris, TN, India)
// All node positions, corridors, and hazard polygons below are PROTOTYPE /
// DEMONSTRATION geometry only. No real road names are used. Nothing here is
// an officially designated shelter or verified survey data.
// ---------------------------------------------------------------------------

export const MAP_CENTER = { lat: 11.4160, lng: 76.8670 };
export const MAP_DEFAULT_ZOOM = 14;
export const MAP_MIN_ZOOM = 10;
export const MAP_MAX_ZOOM = 18;

// Broad operational sector bound (keeps default view wide, per Section 9 —
// judges can still zoom/pan freely beyond this, it's just the initial fit).
export const MAP_SECTOR_BOUNDS = [
  [11.395, 76.840],
  [11.437, 76.894],
];

// PROTOTYPE field node coordinates
export const NODES = {
  H01: { id: 'H01', label: 'Landslide Node',  type: 'landslide', lat: 11.4210, lng: 76.8615, provenance: 'PROTOTYPE' },
  R01: { id: 'R01', label: 'Flood Node',      type: 'flood',     lat: 11.4105, lng: 76.8590, provenance: 'PROTOTYPE' },
  F01: { id: 'F01', label: 'Forest Fire Node',type: 'fire',      lat: 11.4245, lng: 76.8710, provenance: 'PROTOTYPE' },
  A01: { id: 'A01', label: 'Air Quality Node',type: 'pollution', lat: 11.4130, lng: 76.8730, provenance: 'PROTOTYPE' },
  T01: { id: 'T01', label: 'LoRa Relay Tower',type: 'relay',     lat: 11.4172, lng: 76.8660, provenance: 'PROTOTYPE' },
  C01: { id: 'C01', label: 'Community Safety Unit', type: 'community', lat: 11.4155, lng: 76.8645, provenance: 'PROTOTYPE' },
};

// LoRa mesh topology — field nodes relay through T01 to the community unit
export const LORA_LINKS = [
  ['H01', 'T01'], ['R01', 'T01'], ['F01', 'T01'], ['A01', 'T01'], ['T01', 'C01'],
];

// PROTOTYPE safe points
export const SAFE_POINTS = {
  SP_01: { id: 'SP_01', lat: 11.4185, lng: 76.8625, label: 'Prototype Safe Point 01' },
  SP_02: { id: 'SP_02', lat: 11.4148, lng: 76.8608, label: 'Prototype Safe Point 02' },
  SP_03: { id: 'SP_03', lat: 11.4120, lng: 76.8665, label: 'Prototype Safe Point 03' },
};

// PROTOTYPE offline local-graph edges (village internal grid — mirrors the
// tested calculate_safe_route() example: VILLAGE -> J3 -> SP_02)
export const OFFLINE_GRAPH = {
  nodes: {
    VILLAGE: { lat: 11.4160, lng: 76.8650 },
    J1:      { lat: 11.4172, lng: 76.8635 },
    J2:      { lat: 11.4180, lng: 76.8622 },
    J3:      { lat: 11.4150, lng: 76.8618 },
    SP_01:   SAFE_POINTS.SP_01,
    SP_02:   SAFE_POINTS.SP_02,
    SP_03:   SAFE_POINTS.SP_03,
  },
  edges: [
    ['VILLAGE', 'J1', 0.31], ['J1', 'J2', 0.22], ['J2', 'SP_01', 0.18],
    ['VILLAGE', 'J3', 0.29], ['J3', 'SP_02', 0.20], ['VILLAGE', 'SP_03', 0.65],
  ],
};

// PROTOTYPE hazard polygon anchors (grown/shrunk by simulation score 0-100)
export const HAZARD_ANCHORS = {
  landslide: { center: { lat: 11.4205, lng: 76.8625 }, baseRadius_m: 120, maxRadius_m: 620 },
  flood:     { center: { lat: 11.4108, lng: 76.8598 }, baseRadius_m: 100, maxRadius_m: 540 },
  fire:      { center: { lat: 11.4250, lng: 76.8720 }, baseRadius_m: 90,  maxRadius_m: 700 },
  pollution: { center: { lat: 11.4132, lng: 76.8735 }, baseRadius_m: 150, maxRadius_m: 800 },
};

// ---------------------------------------------------------------------------
// TIMING / UI CONSTANTS
// ---------------------------------------------------------------------------
export const TICK_MS = 200;              // simulation engine tick resolution
export const LORA_PULSE_MS = 1400;       // travel time of an animated LoRa packet dot
export const EVENT_LOG_MAX = 200;

// ---------------------------------------------------------------------------
// REAL MODEL METRICS (exact — never round upward, never inflate)
// ---------------------------------------------------------------------------
export const MODEL_METRICS = {
  landslide: {
    algorithm: 'XGBoost', winner: true,
    accuracy: 0.7353, precision: 0.8077, recall: 0.8400, f1: 0.8235, rocAuc: 0.6889,
    inputs: ['rain_1day', 'rain_3day', 'rain_7day', 'elevation_m', 'slope_deg'],
    note: 'Prototype model — trained on 136 samples (100 positive / 36 control).',
  },
  flood: {
    algorithm: 'XGBoost Regression', forecastHorizon: '+3 hours',
    mae: 0.6500, rmse: 3.8212, r2: 0.9883, baselineMae: 0.4843, baselineGainPct: -34.21,
    inputs: ['level_now', 'level_1h', 'level_3h', 'level_6h', 'level_12h', 'level_24h',
              'rise_1h', 'rise_3h', 'rise_6h', 'rolling_mean_6h', 'rolling_std_6h', 'hour', 'month'],
    note: 'Persistence baseline currently outperforms the model on MAE — shown honestly, not hidden.',
  },
  fire: {
    algorithm: 'Random Forest', winner: true,
    accuracy: 0.6462, precision: 0.6618, recall: 0.6618, f1: 0.6618, rocAuc: 0.6548,
    inputs: ['FFMC', 'DMC', 'DC', 'ISI', 'temp', 'RH', 'wind', 'rain'],
    note: 'Prototype model — trained on 517 records (270 fire / 247 no-fire).',
  },
  pollution: {
    algorithm: 'XGBoost Regression', forecastHorizon: '+3 hours',
    mae: 20.0293, rmse: 36.1604, r2: 0.8164, baselineMae: 21.5249, baselineGainPct: 6.95,
    inputs: ['PM2.5', 'PM10', 'SO2', 'NO2', 'CO', 'O3', 'TEMP', 'PRES', 'DEWP', 'RAIN', 'WSPM',
              'pm25_1h', 'pm25_3h', 'pm25_6h', 'pm25_24h', 'pm25_change_1h', 'hour', 'month'],
    note: 'Trained on 394,389 rows across 12 monitoring stations.',
  },
};

// ---------------------------------------------------------------------------
// DIGITAL TWIN SCENARIOS — deterministic seeded keyframes.
// Values are RAW sensor readings; simulator.js interpolates between them and
// derives engineered features before calling the backend.
// ---------------------------------------------------------------------------
export const SCENARIOS = {
  NORMAL: {
    id: 'NORMAL', label: 'Normal', duration_s: 30, seed: 1,
    keyframes: [
      { t: 0,  stage: 'SYSTEM NORMAL', rainfall: 4, soil: 38, vibration: 0.03, river: 2.60, temp: 27, humidity: 68, smoke: 2, pm25: 22 },
      { t: 30, stage: 'SYSTEM NORMAL', rainfall: 5, soil: 39, vibration: 0.03, river: 2.64, temp: 28, humidity: 67, smoke: 2, pm25: 24 },
    ],
  },
  HEAVY_RAIN: {
    id: 'HEAVY_RAIN', label: 'Heavy Rain', duration_s: 40, seed: 2,
    keyframes: [
      { t: 0,  stage: 'NORMAL',     rainfall: 12, soil: 40, vibration: 0.04, river: 2.68, temp: 27, humidity: 66, smoke: 2, pm25: 24 },
      { t: 10, stage: 'HEAVY RAIN', rainfall: 28, soil: 48, vibration: 0.05, river: 2.80, temp: 26, humidity: 70, smoke: 3, pm25: 26 },
      { t: 20, stage: 'HEAVY RAIN', rainfall: 44, soil: 57, vibration: 0.06, river: 3.04, temp: 25, humidity: 75, smoke: 3, pm25: 27 },
      { t: 30, stage: 'HEAVY RAIN', rainfall: 61, soil: 69, vibration: 0.08, river: 3.32, temp: 24, humidity: 81, smoke: 4, pm25: 28 },
      { t: 40, stage: 'HEAVY RAIN', rainfall: 78, soil: 78, vibration: 0.10, river: 3.56, temp: 23, humidity: 86, smoke: 4, pm25: 29 },
    ],
  },
  LANDSLIDE: {
    id: 'LANDSLIDE', label: 'Landslide', duration_s: 20, seed: 3,
    keyframes: [
      { t: 0,  stage: 'NORMAL',              rainfall: 10, soil: 42, vibration: 0.04, river: 2.64, temp: 27, humidity: 65, smoke: 2, pm25: 24 },
      { t: 5,  stage: 'SOIL SATURATION',      rainfall: 34, soil: 55, vibration: 0.06, river: 2.72, temp: 26, humidity: 72, smoke: 2, pm25: 25 },
      { t: 10, stage: 'SLOPE INSTABILITY',    rainfall: 52, soil: 68, vibration: 0.14, river: 2.84, temp: 25, humidity: 78, smoke: 3, pm25: 26 },
      { t: 15, stage: 'LANDSLIDE WARNING',    rainfall: 66, soil: 78, vibration: 0.31, river: 2.96, temp: 24, humidity: 84, smoke: 3, pm25: 27 },
      { t: 20, stage: 'LANDSLIDE WARNING',    rainfall: 74, soil: 86, vibration: 0.52, river: 3.08, temp: 23, humidity: 88, smoke: 4, pm25: 29 },
    ],
  },
  FLOOD: {
    id: 'FLOOD', label: 'Flood', duration_s: 25, seed: 4,
    keyframes: [
      { t: 0,  stage: 'NORMAL',        rainfall: 20, soil: 50, vibration: 0.04, river: 2.68, temp: 26, humidity: 70, smoke: 2, pm25: 24 },
      { t: 5,  stage: 'WATER RISING',  rainfall: 30, soil: 55, vibration: 0.04, river: 3.04, temp: 26, humidity: 74, smoke: 2, pm25: 24 },
      { t: 10, stage: 'WATER RISING',  rainfall: 38, soil: 60, vibration: 0.05, river: 3.48, temp: 25, humidity: 78, smoke: 2, pm25: 25 },
      { t: 15, stage: 'FLOOD WARNING', rainfall: 45, soil: 63, vibration: 0.05, river: 3.92, temp: 25, humidity: 82, smoke: 2, pm25: 25 },
      { t: 20, stage: 'FLOOD WARNING', rainfall: 50, soil: 65, vibration: 0.05, river: 4.36, temp: 24, humidity: 85, smoke: 2, pm25: 26 },
      { t: 25, stage: 'FLOOD WARNING', rainfall: 52, soil: 66, vibration: 0.05, river: 4.72, temp: 24, humidity: 86, smoke: 2, pm25: 26 },
    ],
  },
  FIRE: {
    id: 'FIRE', label: 'Forest Fire', duration_s: 25, seed: 5,
    keyframes: [
      { t: 0,  stage: 'NORMAL',        rainfall: 1, soil: 30, vibration: 0.03, river: 2.52, temp: 29, humidity: 65, smoke: 4,  pm25: 26 },
      { t: 5,  stage: 'HEAT RISING',   rainfall: 0, soil: 27, vibration: 0.03, river: 2.48, temp: 34, humidity: 52, smoke: 18, pm25: 40 },
      { t: 10, stage: 'DRY CONDITIONS',rainfall: 0, soil: 24, vibration: 0.03, river: 2.44, temp: 39, humidity: 39, smoke: 42, pm25: 65 },
      { t: 15, stage: 'FIRE WARNING',  rainfall: 0, soil: 21, vibration: 0.03, river: 2.40, temp: 45, humidity: 27, smoke: 71, pm25: 110 },
      { t: 20, stage: 'FIRE WARNING',  rainfall: 0, soil: 19, vibration: 0.03, river: 2.36, temp: 50, humidity: 17, smoke: 90, pm25: 165 },
    ],
  },
  POLLUTION: {
    id: 'POLLUTION', label: 'Pollution', duration_s: 30, seed: 6,
    keyframes: [
      { t: 0,  stage: 'NORMAL',            rainfall: 3, soil: 40, vibration: 0.03, river: 2.60, temp: 28, humidity: 60, smoke: 5,  pm25: 25 },
      { t: 6,  stage: 'AIR QUALITY DROP',  rainfall: 2, soil: 40, vibration: 0.03, river: 2.60, temp: 29, humidity: 55, smoke: 12, pm25: 48 },
      { t: 12, stage: 'EXPOSURE RISING',   rainfall: 1, soil: 39, vibration: 0.03, river: 2.60, temp: 30, humidity: 50, smoke: 20, pm25: 81 },
      { t: 18, stage: 'EXPOSURE WARNING',  rainfall: 1, soil: 39, vibration: 0.03, river: 2.60, temp: 31, humidity: 46, smoke: 30, pm25: 132 },
      { t: 24, stage: 'EXPOSURE CRITICAL', rainfall: 0, soil: 38, vibration: 0.03, river: 2.60, temp: 32, humidity: 41, smoke: 45, pm25: 210 },
      { t: 30, stage: 'EXPOSURE CRITICAL', rainfall: 0, soil: 38, vibration: 0.03, river: 2.60, temp: 33, humidity: 38, smoke: 60, pm25: 310 },
    ],
  },
  CASCADE_DISASTER: {
    id: 'CASCADE_DISASTER', label: 'Cascade Disaster', duration_s: 60, seed: 42,
    keyframes: [
      { t: 0,  stage: 'NORMAL',                    rainfall: 8,  soil: 40, vibration: 0.04, river: 2.64, temp: 27, humidity: 64, smoke: 2,  pm25: 23 },
      { t: 5,  stage: 'HEAVY RAIN',                 rainfall: 24, soil: 46, vibration: 0.05, river: 2.76, temp: 26, humidity: 70, smoke: 2,  pm25: 24 },
      { t: 10, stage: 'SOIL SATURATION',            rainfall: 41, soil: 57, vibration: 0.07, river: 2.88, temp: 25, humidity: 76, smoke: 3,  pm25: 25 },
      { t: 15, stage: 'SLOPE INSTABILITY',          rainfall: 55, soil: 69, vibration: 0.16, river: 3.00, temp: 24, humidity: 81, smoke: 3,  pm25: 26 },
      { t: 20, stage: 'LANDSLIDE WARNING',          rainfall: 66, soil: 79, vibration: 0.34, river: 3.12, temp: 24, humidity: 85, smoke: 3,  pm25: 27 },
      { t: 25, stage: 'ROAD FAILURE',               rainfall: 70, soil: 84, vibration: 0.44, river: 3.28, temp: 23, humidity: 87, smoke: 3,  pm25: 28 },
      { t: 30, stage: 'WATER LEVEL RISING',         rainfall: 72, soil: 85, vibration: 0.46, river: 3.72, temp: 23, humidity: 88, smoke: 3,  pm25: 28 },
      { t: 35, stage: 'FLOOD WARNING',               rainfall: 74, soil: 86, vibration: 0.47, river: 4.16, temp: 23, humidity: 89, smoke: 3,  pm25: 29 },
      { t: 40, stage: 'ROUTE INVALIDATED',           rainfall: 74, soil: 86, vibration: 0.47, river: 4.44, temp: 22, humidity: 90, smoke: 3,  pm25: 29 },
      { t: 45, stage: 'SAFE ROUTE RECALCULATED',     rainfall: 73, soil: 86, vibration: 0.46, river: 4.56, temp: 22, humidity: 90, smoke: 3,  pm25: 30 },
      { t: 50, stage: 'LORA ALERT TRANSMITTED',      rainfall: 72, soil: 85, vibration: 0.45, river: 4.60, temp: 22, humidity: 90, smoke: 3,  pm25: 30 },
      { t: 55, stage: 'COMMUNITY ALERT',             rainfall: 70, soil: 85, vibration: 0.44, river: 4.64, temp: 22, humidity: 90, smoke: 3,  pm25: 30 },
      { t: 60, stage: 'COMMUNITY ALERT',             rainfall: 68, soil: 84, vibration: 0.43, river: 4.68, temp: 22, humidity: 90, smoke: 3,  pm25: 30 },
    ],
  },
};

export const SIMULATION_STAGE_SEQUENCE = [
  'NORMAL', 'HEAVY RAIN', 'SOIL SATURATION', 'SLOPE INSTABILITY', 'LANDSLIDE WARNING',
  'ROAD FAILURE', 'WATER LEVEL RISING', 'FLOOD WARNING', 'ROUTE INVALIDATED',
  'SAFE ROUTE RECALCULATED', 'LORA ALERT TRANSMITTED', 'COMMUNITY ALERT',
];

// Elevation/slope constants for the H01 prototype site — used to derive
// engineered landslide features (rain_1day/3day/7day come from rolling history).
export const LANDSLIDE_SITE = { elevation_m: 1500, slope_deg: 35 };

// PROTOTYPE flood station thresholds — used to derive warning/danger flags
export const FLOOD_SITE = { warning_level: 3.5, danger_level: 4.5 };
