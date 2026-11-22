# Preserve — QLD Police (Night Ops rebuild)

Map-first operational situational-awareness demo. Dark-first night ops UI, CAD multi-step entry, city-scale street lights, night 3D buildings, bridge-snapped public order routes.

Local heuristic engines only — **no incident data to public AI APIs**.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173

1. Accept tracking consent
2. **New *** opens a 3-step CAD wizard (always creates a new job)
3. Toggle **Night map**, **3D buildings**, **Street lights**
4. Open **Public order — CBD march** for bridge-snapped route

```bash
npm test
npm run smoke   # requires dev server
npm run build
```

## Hard rules

- New incident controls always create new jobs
- Air-gap: incident/AI egress blocked
- Tracking consent required
- SERT privacy
- Structure sides: white / black / red / green
