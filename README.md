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

### Environment

Copy `.env.example` → `.env`:

```bash
VITE_CESIUM_ION_TOKEN=           # optional Cesium imagery/terrain
VITE_LIGHTNING_GEOJSON_URL=      # optional licensed lightning FeatureCollection
```

Lightning example schema: [`public/samples/lightning.example.geojson`](public/samples/lightning.example.geojson).

## Milestone status

### 1 — Visual prototype
Cesium Earth, ray-marched synthetic thunderstorm, lighting, FX, typed weather interfaces.

### 2 — Live observation overlays
RainViewer radar mosaics, observation timeline, optional IR, Open-Meteo site context.

### 3 — Derived tracks + science context
Heuristic cell tracks from mosaics, CAPE/CIN, schematic cross-section with provenance.

### 4 — Cell reconstruction bridge + lightning feed
Selected derived track + CAPE → procedural cloud parameters; pluggable GeoJSON lightning.

### 5 — Georegistered storm volume (current)
- **Pin volume** places a procedural ray-marched cloud volume at the cell’s lat/lon on Cesium
- Schematic core / anvil / precip cues + provenance label on the globe
- **Volume** layer toggle; click volume to enter immersive Three.js scene
- Same drivers as M4 (derived cell + Open-Meteo CAPE) — still labelled **procedural**, not a measured radar volume
- Prototype volume remains pinned at the synthetic NSW focus when no cell is pinned

## Scientific integrity

| Visual | Interpretation |
| --- | --- |
| Radar mosaic | Processed RainViewer imagery |
| Cell tracks | Derived heuristic (low confidence) |
| CAPE / CIN | Model (Open-Meteo) |
| Cross-section | Schematic reconstruction aid |
| Globe volume after “Pin volume” | **Procedural**, georegistered by lat/lon |
| Immersive 3D storm | **Procedural** local scene (same drivers) |
| Globe lightning | Direct only if you supply a licensed GeoJSON feed |
| Prototype storm / demo bolts | Synthetic |

## Known limitations

- No bundled live lightning network (configure your own licensed URL)
- Georegistered volume is visualisation, not a scientific retrieval or BoM RHI product
- Tracks empty when Australia mosaics lack precip
- Immersive scene remains a local Three.js environment (complements the globe volume)

## Next ideas

1. Licensed commercial/BoM lightning with quality metadata
2. Radar volume / RHI products under proper licensing
3. Skill scores for cell tracking
4. Time-animated volume following the track path

Do not scrape restricted services. Respect provider terms and licensing.

## Stack

Vite · React · TypeScript · CesiumJS · Three.js · RainViewer · Open-Meteo · optional GeoJSON lightning
