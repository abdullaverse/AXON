// AXON — state.js
// Single source of truth. Every other module reads via State.get() and only
// this module (plus the modules explicitly listed) writes via State.set().
// Every value that can be LIVE/MODEL/SIMULATED/CACHED/etc. is stored as
// { value, provenance, updatedAt } so the UI can render honest labels
// everywhere, not just in inspectors.

const listeners = new Map(); // key -> Set<fn>
const wildcardListeners = new Set();

function makeReading(value, provenance = 'UNKNOWN') {
  return { value, provenance, updatedAt: Date.now() };
}

const AppState = {
  mode: 'LIVE', // 'LIVE' | 'TWIN'

  connectivity: {
    internet:     makeReading(true, 'LIVE'),
    googleRoutes: makeReading(true, 'LIVE'),
    cloud:        makeReading(true, 'LIVE'),
    satellite:    makeReading(true, 'CACHED'),
    lora:         makeReading(true, 'SIMULATED'),
    edge:         makeReading(true, 'ACTIVE'),
  },

  nodes: {
    H01: { status: 'ACTIVE', battery: 88, lastPacket: null, dataSource: 'SIMULATED',
           rainfall: makeReading(4, 'SIMULATED'), soil: makeReading(38, 'SIMULATED'), vibration: makeReading(0.03, 'SIMULATED') },
    R01: { status: 'ACTIVE', battery: 91, lastPacket: null, dataSource: 'SIMULATED',
           river: makeReading(40, 'SIMULATED'), riseRate: makeReading(0, 'SIMULATED') },
    F01: { status: 'ACTIVE', battery: 82, lastPacket: null, dataSource: 'SIMULATED',
           temp: makeReading(27, 'SIMULATED'), humidity: makeReading(68, 'SIMULATED'), smoke: makeReading(2, 'SIMULATED') },
    A01: { status: 'ACTIVE', battery: 95, lastPacket: null, dataSource: 'SIMULATED',
           pm25: makeReading(22, 'SIMULATED'), gas: makeReading(1, 'SIMULATED') },
    T01: { status: 'ACTIVE', battery: 100, lastPacket: null, dataSource: 'SIMULATED', role: 'LoRa Relay' },
    C01: { status: 'ACTIVE', battery: 97, lastPacket: null, dataSource: 'SIMULATED', role: 'Community Safety Unit' },
  },

  hazards: {
    landslide: makeReading({ score: 0, level: 'AWAITING' }, 'NO DATA'),
    flood:     makeReading({ score: 0, level: 'AWAITING' }, 'NO DATA'),
    fire:      makeReading({ score: 0, level: 'AWAITING' }, 'NO DATA'),
    pollution: makeReading({ score: 0, level: 'AWAITING' }, 'NO DATA'),
  },

  routing: {
    source: 'GOOGLE', // 'GOOGLE' | 'AXON_LOCAL'
    candidates: [],
    selected: null,
    rejected: [],
    reason: null,
    backendSafeRoute: null,
    status: makeReading('ADAPTER REQUIRED', 'OFFLINE'), // becomes LIVE once backend exists
  },

  community: {
    loraReceiver: 'ACTIVE',
    wifiAp: 'ACTIVE',
    siren: 'READY',
    display: 'SYSTEM NORMAL',
    directionLeds: 'READY',
    battery: 97,
    lastPacket: null,
    log: [],
  },

  simulation: {
    scenario: null,
    clock_s: 0,
    speed: 1,
    running: false,
    stage: 'SYSTEM NORMAL',
    networkFailureActive: false,
  },

  cloud: {
    status: makeReading('CONNECTED', 'LIVE'), // CONNECTED | BUFFERING | OFFLINE
    bufferedRecords: 0,
  },

  events: [],
};

export const State = {
  get(path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), AppState);
  },

  set(path, value) {
    const keys = path.split('.');
    let obj = AppState;
    for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
    obj[keys[keys.length - 1]] = value;
    emit(path, value);
    emit('*', { path, value });
  },

  setReading(path, value, provenance) {
    State.set(path, makeReading(value, provenance));
  },

  pushEvent(evt) {
    const entry = { timestamp: new Date(), ...evt };
    AppState.events.unshift(entry);
    if (AppState.events.length > 200) AppState.events.length = 200;
    emit('events', AppState.events);
    emit('*', { path: 'events', value: entry });
    return entry;
  },

  snapshot() {
    return JSON.parse(JSON.stringify(AppState));
  },

  raw: AppState, // escape hatch for modules that need direct structural access (map.js, simulator.js)
};

export function on(path, fn) {
  if (path === '*') { wildcardListeners.add(fn); return () => wildcardListeners.delete(fn); }
  if (!listeners.has(path)) listeners.set(path, new Set());
  listeners.get(path).add(fn);
  return () => listeners.get(path).delete(fn);
}

function emit(path, value) {
  if (listeners.has(path)) listeners.get(path).forEach((fn) => fn(value));
  wildcardListeners.forEach((fn) => fn({ path, value }));
}

export function makeProvenance(value, provenance) {
  return makeReading(value, provenance);
}
