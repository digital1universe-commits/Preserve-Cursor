# Preserve — QLD Police

Operational situational-awareness demo for Queensland Police: CAD-like incidents, cordons, land/marine SAR, public order, road blocks, device tracking, map markings, and street-light overlay.

Local heuristic engines only — **no incident data is sent to public internet AI APIs**.

## Quick start

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173

1. Accept the tracking consent gate.
2. Use **New Cordon / New MP Land SAR / …** — each opens an **entry form** (CAD number, security level, type-specific fields). Submit always creates a **new** job (never opens an existing one).
3. Select seed jobs in the left list; edit details on the right (Save & replan); map overlays update in the centre.
4. Toggle **Online / Offline**, **Air-gap**, **Map dark/light**, **3D orbit**, **Street lights** in the top bar.
5. Switch users (including SERT) to see location privacy rules.
6. Public order routes snap to Brisbane streets and cross only via bridges (Victoria / Goodwill / Story).

```bash
npm test        # automated tests
npm run build   # production build
```

## Demo accounts

| Call sign | Role |
| --- | --- |
| COMMS-12 | Comms (default) |
| ADMIN-1 | Super Admin |
| SC-41 | Scene Commander |
| VKR-221 | General Duties |
| SERT-3 / SERT-7 | SERT |
| TCS-2 | Tactical Crime Scene |
| DOG-1 | Dog Squad |

## Air-gap assumptions

- Incident payloads and local AI/heuristic outputs never leave the secure police / approved mobile network.
- Public AI hosts are always blocked by `src/security/airGap.ts`.
- When online, only an allow-listed asset host set (demo map tiles / fonts, or `*.qps.internal`) may be fetched.
- Offline mode suspends external asset fetches; use cached tiles in production.

## Map tips

- **Alt-click**: add incident annotation
- **Shift-click**: place structure side label (white front / black back / red right / green left)
- **3D orbit**: pitches the MapLibre view for approach awareness (demo; production would add local DEM/3D buildings)

## Stack

Vite · React 19 · TypeScript · MapLibre GL · Zustand · Vitest
