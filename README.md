# PRESERVE

On-premises planning desk for containment and search. It runs in the browser on a computer or a phone, including with the link down. Case text stays on the installation. The planning models are deterministic code in this repository. They do not call an external model, and they do not describe an approach, a field of fire, or how to build a tyre-deflation device.

This build ships evaluation accounts so the desk can be reviewed. Remove them before any operational use. It is a planning aid. The commander remains responsible for the decision.

## What it plans

- **Siege cordon.** Surround the scene on four sides from the structure footprint (or an estimate from structure type). Seal the fewest streets that stop driveable escape from the local sector. List parks, walkways, alleys, and easements to search so a person on foot cannot leave without meeting police. Posts can be locked so a rebuild keeps ground truth. A reported firearm risk only increases standoff. The model does not invent an approach onto the subject.
- **Live units.** GPS starts when the desk opens. Positions update about every 10 seconds while moving, and less often when still. Pins show callsigns (names optional). View this incident or the whole agency. Units marked private stay hidden from the wider organisation and only see each other (they remain visible to colleagues on a shared incident).
- **3D terrain.** Pitch and circle the ground to judge elevation and vantage. Terrain tiles learn the bbox being viewed — same OPSEC rule as flat map tiles.
- **Street lights.** Toggle OSM lamps plus agency-added lights on every module.
- **Area seal.** Draw the area. The desk loads the surrounding driveable roads and places the fewest closure sites that leave no driveable path out to the open network. Footpaths are not sealed. One-way restrictions are ignored. A vehicle can still be on a street inside the closures.
- **Land search.** Last known point, age, mental state, knowledge of the area, mobility, terrain, and time missing. The ring is an original behavioural estimate: people move toward the easier ground, and the search area grows with time and then fatigues. It is not a copy of a published lost-person distance table.
- **Marine search.** Last known position, time adrift, and vessel type. On the link, the desk requests only the coordinates from the weather and marine services, then places a datum from wind leeway and current. The leeway fractions are original to this desk.
- **Public order.** Enter start and end, or draw a foot protest route. The route snaps onto streets, pedestrian malls, alleys, and paths. Available serials, traffic, protection, and mobile units are placed to hold the line of march, block off-route exits, buffer opposing groups, and protect government buildings, schools, police stations, and transport hubs.

## Security model

- Accounts, agencies, incident membership, and cross-agency grants. A field officer sees only incidents they are on, and cannot run a plan. A missing incident and a forbidden incident both answer 404.
- Incident titles, summaries, locations, and plan payloads are encrypted at rest. Session tokens are stored as a hash. Passwords are scrypt hashes.
- The audit log records the action, not the case narrative.
- The server may call only the OpenStreetMap map API and the Open-Meteo forecast, elevation, and marine APIs. The query carries coordinates and a fixed parameter list. Set `PRESERVE_BLOCK_EGRESS=1` to refuse those calls.
- The client will not request a URL that does not start with `/api/`. Map tiles can be switched off (“Grid only”) so the tile host does not learn the area being viewed.
- Plans made on device are queued in the browser and sync into the incident record when the link returns.

## Run

Node 22 or newer.

```bash
npm install
npm run dev
```

The desk is at `http://127.0.0.1:5173`. The API listens on port 8787. `npm test` runs the planning and security tests. `npm run build` then `npm start` serves the built desk.

The master key is created in `data/master.key` on first start. Keep that file with the database. Both stay out of git.

## Evaluation access

Evaluation accounts are **not** seeded from a password in the source tree. Set `PRESERVE_EVAL_PASSWORD` in the installation environment (never commit it), then start the desk on an empty data directory. That password is hashed into the seeded accounts. The unauthenticated bootstrap endpoint never returns passwords or account lists.

Seeded evaluation emails (password = whatever you set in `PRESERVE_EVAL_PASSWORD`):

| Email | Role |
| --- | --- |
| commander@hmp.preserve.test | Incident commander, Harbour Metro Police |
| planner@hmp.preserve.test | Planner |
| field@hmp.preserve.test | Field officer |
| controller@hmp.preserve.test | Agency admin |
| search@crc.preserve.test | Search coordinator, Coastal Rescue Coordination |
| watch@crc.preserve.test | Agency admin, Coastal Rescue Coordination |
| registrar@preserve.test | Superadmin, Joint Operations Registry |

Training incidents around Devonport are seeded with those accounts: warehouse cordon, overdue walker, overdue cabin cruiser, and harbour protest march. Changing a password clears the evaluation flag on that account. Set `PRESERVE_DEMO_BANNER=1` only if you intentionally want the evaluation strip after sign-in.
