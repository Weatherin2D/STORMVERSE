# STORMVERSE

Immersive browser-based 3D thunderstorm exploration platform.

Milestone 1 delivers an interactive Cesium Earth, a prototype Three.js thunderstorm environment with volumetric cloud rendering, day/sunset/night lighting, synthetic lightning, a simulation timeline, and typed weather-data interfaces prepared for Australian observations.

**This build does not consume or display live weather observations.** Clouds, lightning, precipitation shafts, and timeline playback are synthetic / procedural demonstrations and are labelled as such in the UI.

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

With a token, Cesium World Imagery and world terrain are used. Without one, the globe falls back to OpenStreetMap raster tiles so the app remains usable.

## Stack

- Vite + React 18 + TypeScript
- CesiumJS — interactive Earth, geographic navigation
- Three.js — storm-volume ray marching, lightning, precipitation visuals

Globe and storm run as **separate view modes** with coordinated transitions (full Cesium↔Three depth sync is deferred).

## Milestone 1 features

- Interactive Earth with Australia-centred home view
- Prototype storm marker (inland NSW) clearly marked synthetic
- Enter / return transitions between globe and storm
- Ray-marched cumulonimbus with tower, anvil, base, haze
- Day, sunset, and night lighting (night is genuinely dark)
- Lightning with local cloud illumination + reduced-flash option
- Visual rain shafts (not measured precipitation)
- Camera presets: overview, cloud top, side, ground, radar-oriented
- Layer toggles and cloud parameter tuning panel
- Prototype simulation timeline (play / pause / seek / speed)
- Weather provider interfaces + Prototype adapter + Australian stub

## Known limitations

- No live radar, satellite, or lightning feeds
- Storm scene is a local Three.js environment, not georegistered on the Cesium globe
- Cloud ray marching quality adapts on low-power devices but is still GPU-heavy
- OSM fallback imagery is not photorealistic globe imagery
- Synthetic storm track is illustrative only (confidence intentionally unset)

## Next milestone — Australian observations

Architecture is ready for replaceable providers under `src/weather/`:

1. Implement a licensed Australian radar adapter (`radar_reflectivity` / `radar_volume`) with observation time, coverage, and provenance.
2. Add satellite IR/visible products with the same `WeatherObservationMeta` contract.
3. Wire detected lightning events into `LightningSystem` (renderer already accepts `LightningObservation`).
4. Drive storm marker position from `StormTrack` points on the globe timeline.
5. Keep procedural clouds labelled **reconstruction** unless density is derived from a documented product.

Do not scrape restricted services. Respect provider terms and licensing.

## Project layout

```text
src/
  components/     # UI: globe, storm, controls, panels, timeline
  rendering/      # Cesium globe, cloud volume, lightning, precip, atmosphere
  weather/        # Typed observations + provider adapters
  config/         # App + prototype storm configuration
  lib/            # App state helpers
```
