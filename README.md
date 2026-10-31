# STORMVERSE

Immersive browser-based 3D thunderstorm exploration platform.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

```bash
npm run build
npm run preview
```

### Optional Cesium Ion token

Copy `.env.example` to `.env` and set:

```bash
VITE_CESIUM_ION_TOKEN=your_token_here
```

Without a token, the globe uses OpenStreetMap tiles.

## Milestone status

### Milestone 1 — Visual prototype

- Interactive Cesium Earth
- Ray-marched prototype thunderstorm (synthetic)
- Day / sunset / night lighting, lightning, precip shafts
- Camera presets, layer toggles, prototype timeline
- Typed weather provider interfaces

### Milestone 2 — Live Australian-focused observations (current)

- **RainViewer public API** radar reflectivity mosaics on the globe (processed imagery)
- Timeline scrubbing of real radar frame times
- Infrared satellite overlay when the RainViewer catalog publishes frames
- **Open-Meteo** model environmental context at the prototype site (labelled as model, not observation)
- Clear provenance for every product; lightning + storm tracks remain unavailable from this feed
- 3D storm scene stays a **synthetic reconstruction** — not derived from the radar tiles

## Scientific integrity

| Visual | Interpretation |
| --- | --- |
| Globe radar mosaic | Processed composite imagery via RainViewer — not a BoM volume product |
| Satellite IR (when available) | Processed mosaic via RainViewer |
| Open-Meteo panel fields | Numerical model / forecast context |
| 3D clouds, bolts, rain shafts | Synthetic / procedural demonstration |
| Prototype storm marker | Demonstration target, not a tracked storm cell |

## Known limitations

- No BoM direct radar volumes, no licensed lightning network, no automated cell tracks
- RainViewer frames are global composites; colour scale is relative, not calibrated dBZ grids
- Satellite IR may be empty depending on catalog contents
- Storm 3D scene is not georegistered onto the Cesium globe
- Dual-renderer depth sync is deferred

## Next milestone ideas

1. Licensed Australian lightning events mapped onto globe + storm illumination
2. Radar-derived storm-cell tracks (documented algorithm + confidence)
3. Optional BoM or commercial radar volume / cross-section products under proper licensing
4. Drive reconstruction parameters from observed products where scientifically justified

Do not scrape restricted services. Respect provider terms and licensing.

## Stack

- Vite + React 18 + TypeScript
- CesiumJS — Earth + observation overlays
- Three.js — storm volume rendering
- RainViewer + Open-Meteo — public weather feeds

## Project layout

```text
src/
  components/     # UI: globe, storm, controls, panels, timeline
  rendering/      # Cesium globe, cloud volume, lightning, precip, atmosphere
  weather/        # Typed observations + RainViewer / Open-Meteo / prototype adapters
  config/         # App + weather endpoint configuration
  hooks/          # Live weather + a11y hooks
  lib/            # App state helpers
```
