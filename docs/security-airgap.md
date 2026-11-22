# Preserve — air-gap & network assumptions

## Boundary

Preserve is designed for the Queensland Police secure network and approved mobile network. It must run online (within that boundary) and offline.

## What never leaves the boundary

- Incident records (CAD jobs, locations, briefings, resource plans)
- Local heuristic / “AI” engine inputs and outputs
- Device tracks and SERT positions
- Map annotations tied to incidents

`src/security/airGap.ts` evaluates egress. Categories `incident_data`, `ai_inference`, and `analytics` are **always denied**.

## What may be fetched when online

Only allow-listed asset hosts (demo tiles/fonts, or production `*.qps.internal` tile mirrors). Production should replace public demotiles with an internal MapLibre style + tile cache.

## Offline

External asset fetches are suspended. The UI remains usable against local state (IndexedDB/localStorage via Zustand persist) and cached tiles.

## Local engines

Cordon, land SAR, marine SAR, public order, and road-block planners run entirely in-process. They call `assertLocalOnlyInference` and never contact public AI APIs.
