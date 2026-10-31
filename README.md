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

### Scene snapshots

Use **Export scene** / **Copy share link** / **Import scene** in the control dock:

- JSON download captures layers, timeline, compare set, volume pin, follow/chase, and camera
- Share links encode the same payload in the URL hash (`#scene=…`)
- Restore rematches cells by `stormId` against the live derived-track catalogue (radar is always re-fetched)

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

### 8 — Tracking quality proxies
Heuristic coverage / continuity / speed / smoothness scores with non-verification provenance.

### 9 — Shareable scene snapshots (current)
- Export JSON scene state for compare sets and exploration UI
- Copy URL hash share links; open/import to restore
- Live radar and tracks still refresh from providers on restore

## Scientific integrity

| Visual | Interpretation |
| --- | --- |
| Radar mosaic | Processed RainViewer imagery |
| Cell tracks | Derived heuristic (low confidence) |
| Tracking quality / “skill” | **Derived** self-consistency proxy — not verified skill |
| CAPE / CIN | Model (Open-Meteo) |
| Cross-section | Schematic reconstruction aid |
| Globe volume / compare set | **Procedural**, georegistered |
| Scene snapshot | UI/state only — does not freeze live weather fields |
| Immersive 3D storm | **Procedural** local scene |
| Globe lightning | Direct only if you supply a licensed GeoJSON feed |
| Prototype storm / demo bolts | Synthetic |

## Known limitations

- No bundled live lightning network (configure your own licensed URL)
- Snapshots cannot guarantee the same cells exist after catalogue refresh
- Track “skill” scores have no ground-truth reference
- Tracks empty when Australia mosaics lack precip

## Next ideas

1. Licensed commercial/BoM lightning with quality metadata
2. Radar volume / RHI products under proper licensing
3. Optional verification hooks when a licensed truth cell product is available
4. Snapshot galleries / named bookmarks in local storage

Do not scrape restricted services. Respect provider terms and licensing.

## Stack

Vite · React · TypeScript · CesiumJS · Three.js · RainViewer · Open-Meteo · optional GeoJSON lightning
