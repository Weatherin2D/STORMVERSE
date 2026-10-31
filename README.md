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

Optional Cesium Ion token: copy `.env.example` → `.env` and set `VITE_CESIUM_ION_TOKEN`.

## Milestone status

### Milestone 1 — Visual prototype
Interactive Cesium Earth, ray-marched synthetic thunderstorm, lighting, lightning FX, timeline, typed weather interfaces.

### Milestone 2 — Live observation overlays
RainViewer radar mosaics on the globe, observation-time timeline, optional IR satellite, Open-Meteo site context. 3D storm remains synthetic.

### Milestone 3 — Derived tracks + scientific context (current)
- **Heuristic cell tracks** derived in-browser from RainViewer Australia tiles (colour sampling + nearest-neighbour linking)
- Tracks drawn on the globe with confidence labels; selectable in the info panel
- **CAPE / CIN** from Open-Meteo hourly model fields
- **Schematic vertical cross-section** shaped by model CAPE/CIN and selected track confidence — clearly labelled as reconstruction, not radar RHI
- Provenance updated for derived vs processed vs model vs synthetic products

## Scientific integrity

| Visual | Interpretation |
| --- | --- |
| Globe radar mosaic | Processed composite imagery via RainViewer |
| Cell tracks | **Derived** heuristic from mosaic colours — low confidence |
| CAPE / CIN / site weather | Numerical model (Open-Meteo) |
| Cross-section diagram | Schematic reconstruction aid |
| 3D clouds / bolts / shafts | Synthetic demonstration |
| Prototype storm marker | Demonstration target |

## Known limitations

- No licensed lightning network; no official BoM cell product
- Tracks can be empty when mosaics show little precip over Australia
- Colour-based intensity is not calibrated dBZ
- Cross-section is not a measured vertical radar slice
- 3D storm is not georegistered to a derived cell

## Next milestone ideas

1. Licensed Australian lightning events on globe + storm illumination
2. Optional licensed radar volume / RHI products
3. Improve cell tracking (multi-scale, optical flow) with documented skill scores
4. Drive 3D reconstruction parameters from a selected derived cell when justified

Do not scrape restricted services. Respect provider terms and licensing.

## Stack

Vite · React · TypeScript · CesiumJS · Three.js · RainViewer · Open-Meteo
