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

### 5 — Georegistered storm volume
Pin procedural ray-marched volumes at cell lat/lon on Cesium with schematic cues.

### 6 — Track-following volume animation
Follow track / Chase walk pinned volumes along derived paths with observation time.

### 7 — Multi-cell volume compare
Up to four accent-coloured georegistered volumes with compare table metrics.

### 8 — Tracking quality proxies (current)
- Heuristic **skill-style scores** per derived track: coverage, continuity, speed steadiness, path smoothness
- Composite grade (`weak` / `fair` / `solid`) in the info panel, track list, compare table, and globe labels
- Catalogue mean + grade counts
- Explicit provenance: **not** formal verification against BoM/truth cells — self-consistency of the derived heuristic only

## Scientific integrity

| Visual | Interpretation |
| --- | --- |
| Radar mosaic | Processed RainViewer imagery |
| Cell tracks | Derived heuristic (low confidence) |
| Tracking quality / “skill” | **Derived** self-consistency proxy — not verified skill |
| CAPE / CIN | Model (Open-Meteo) |
| Cross-section | Schematic reconstruction aid |
| Globe volume / compare set | **Procedural**, georegistered |
| Immersive 3D storm | **Procedural** local scene |
| Globe lightning | Direct only if you supply a licensed GeoJSON feed |
| Prototype storm / demo bolts | Synthetic |

## Known limitations

- No bundled live lightning network (configure your own licensed URL)
- Track “skill” scores have no ground-truth reference
- Compare volumes are visualisation aids, not measured radar volumes
- Tracks empty when Australia mosaics lack precip

## Next ideas

1. Licensed commercial/BoM lightning with quality metadata
2. Radar volume / RHI products under proper licensing
3. Export compare snapshots / shareable scene state
4. Optional verification hooks when a licensed truth cell product is available

Do not scrape restricted services. Respect provider terms and licensing.

## Stack

Vite · React · TypeScript · CesiumJS · Three.js · RainViewer · Open-Meteo · optional GeoJSON lightning
