AXON — JUDGE-FACING FRONTEND INTEGRATION
========================================

PURPOSE
This frontend is intended to be the ONLY screen shown to judges.
It consumes the backend Digital Twin endpoint:
  GET /simulation/intelligence
and displays:
  - progressive simulated sensor conditions
  - REAL landslide model risk from /fusion
  - backend safe_route
  - hazard map growth
  - evacuation destination/path
  - simulated LoRa packet flow and C01 siren/display
  - network-failure transition to resilient/offline mode

REQUIRED BACKEND ENDPOINTS (already built in your current AXON project)
  POST /simulation/start
  POST /simulation/pause
  POST /simulation/reset
  GET  /simulation/state
  POST /simulation/network-failure
  GET  /simulation/intelligence
  POST /fusion

INSTALL
1. Back up your current AXON/frontend folder.
2. Replace the contents of AXON/frontend with the contents of this folder:
     index.html
     styles.css
     js/
3. Keep your current backend, ML models, Supabase and Google API code unchanged.
4. Ensure FastAPI still serves:
     app.mount('/static', StaticFiles(directory='frontend'), name='static')
5. Start from AXON root:
     uvicorn backend.main:app --reload
6. Open ONLY:
     http://127.0.0.1:8000/dashboard
7. Press Ctrl+F5 once.

JUDGE DEMO
1. Dashboard opens in LIVE FIELD mode.
2. Click DIGITAL TWIN.
3. In DIGITAL TWIN · DISASTER TRIGGER, press START.
4. Do not manually change values. Watch rain/water/soil/vibration progress.
5. The frontend polls /simulation/intelligence every second.
6. When the real landslide model reaches HIGH risk, the UI shows MODEL provenance.
7. Backend safe_route is drawn and evacuation summary updates to SP_02/path.
8. C01 siren/display and simulated LoRa packet flow activate.
9. While disaster is active press NETWORK FAILURE.
10. Internet/Google/cloud/satellite change offline/stale, while LoRa/Edge/local route/C01 continue.
11. Press RESET to return the full Digital Twin and network state to normal.

HONEST PROVENANCE
- Digital Twin sensor values: SIMULATED
- Landslide hazard score: MODEL (real .pkl through backend /fusion)
- Flood visual progression: SIMULATED until full flood feature adapter is connected
- Fire/Pollution: SIMULATED until full feature adapters are connected
- LoRa/C01 physical actuation: SIMULATED until hardware is connected
- NASA IMERG: HISTORICAL/CACHED in this prototype

IMPORTANT
Do not show /docs, terminal output, JSON endpoints, training notebooks, or .pkl files during the normal judge demo. They are engineering evidence only if a judge asks.
