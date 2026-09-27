# AXON — Historical Replay + Safest Route Upgrade

## Added to the main judge-facing dashboard

### 1. REPLAY NILGIRIS 2009
This opens a historical-event evidence drawer and can start an AXON counterfactual replay.

Verified historical context used in the UI:
- 7–10 November 2009 Nilgiris landslide event
- 44 recorded fatalities
- 3,715 huts damaged
- 899 landslides on State Highways

Important: the UI DOES NOT claim AXON would have "saved 44 lives".
It states that 44 people died in the observed historical event and that AXON could have provided earlier local warning and reduced exposure. Exact counterfactual lives saved cannot be scientifically established from the available evidence.

### 2. FIND SAFEST ROUTE
A judge-facing button now:
- requests route evaluation using the existing Routing module
- prefers authoritative backend safe_route when available
- otherwise uses Google safe-route backend results
- falls back to AXON local/offline route when appropriate
- focuses the selected route on the map
- opens the Routing Inspector so the judge can see why routes were accepted/rejected

## Install
Replace your main frontend files with this package:
- frontend/index.html
- frontend/styles.css
- frontend/js/*

Keep your existing backend, ML models, Digital Twin, Google Routes integration and hardware simulator.

Run:
uvicorn backend.main:app --reload

Open:
http://127.0.0.1:8000/dashboard
