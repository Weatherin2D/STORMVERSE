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

### 4 — Cell reconstruction bridge + lightning feed (current)
- **Reconstruct cell** — selected derived track + Open-Meteo CAPE map into procedural cloud parameters (labelled procedural, not measured volume)
- Fly-to selected cell before opening the 3D scene
- Reconstruction preview (density / anvil / drivers) in the info panel
- **Pluggable lightning GeoJSON feed** via `VITE_LIGHTNING_GEOJSON_URL` (points on globe; unused → unavailable)
- Storm-view flashes prefer feed events when reconstructing a cell with a configured feed

## Scientific integrity

| Visual | Interpretation |
| --- | --- |
| Radar mosaic | Processed RainViewer imagery |
| Cell tracks | Derived heuristic (low confidence) |
| CAPE / CIN | Model (Open-Meteo) |
| Cross-section | Schematic reconstruction aid |
| 3D cloud after “Reconstruct cell” | **Procedural**, informed by derived + model drivers |
| Globe lightning | Direct only if you supply a licensed GeoJSON feed |
| Prototype storm / demo bolts | Synthetic |

## Known limitations

- No bundled live lightning network (configure your own licensed URL)
- Reconstruction mapping is heuristic visualisation, not a scientific retrieval
- Tracks empty when Australia mosaics lack precip
- 3D scene is still a local Three.js environment (not Cesium-georegistered volume)

## Next ideas

1. Licensed commercial/BoM lightning with quality metadata
2. Radar volume / RHI products under proper licensing
3. Skill scores for cell tracking
4. True georegistered storm volume on the globe

Do not scrape restricted services. Respect provider terms and licensing.

## Stack

Vite · React · TypeScript · CesiumJS · Three.js · RainViewer · Open-Meteo · optional GeoJSON lightning
