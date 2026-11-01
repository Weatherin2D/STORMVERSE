# STORMVERSE

Immersive browser-based 3D thunderstorm exploration platform — Cesium globe with an observation-driven atmospheric shell (no synthetic prototype storm).

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

Live site (GitHub Pages): [https://weatherin2d.github.io/STORMVERSE/](https://weatherin2d.github.io/STORMVERSE/).

```bash
npm run build
npm run preview
```

### Environment

Copy `.env.example` → `.env`:

```bash
VITE_CESIUM_ION_TOKEN=           # optional Cesium imagery/terrain
VITE_LIGHTNING_GEOJSON_URL=      # optional licensed lightning FeatureCollection
VITE_TRUTH_CELLS_GEOJSON_URL=    # optional licensed truth-cell FeatureCollection
```

Lightning example schema (with quality metadata): [`public/samples/lightning.example.geojson`](public/samples/lightning.example.geojson).  
Truth-cell example schema: [`public/samples/truth-cells.example.geojson`](public/samples/truth-cells.example.geojson).  
Case study library catalog: [`public/samples/case-studies/catalog.json`](public/samples/case-studies/catalog.json).

### Scene snapshots & bookmarks

Use **Export scene** / **Copy share link** / **Import scene** / **Save bookmark** in the control dock:

- JSON download captures layers, timeline, compare set, volume pin, follow/chase, and camera
- Share links encode the same payload in the URL hash (`#scene=…`)
- Named bookmarks live in this browser’s `localStorage` (`stormverse.sceneBookmarks.v1`, max 24)
- Manage them in the info panel **Saved scenes** gallery (save / restore / rename / delete)

### Case-study import shelf

Attested user imports are auto-saved to `localStorage` (`stormverse.caseStudyShelf.v1`, max 12) and listed under **Local import shelf** in the case study library. Load, export, or remove them without re-uploading. Exports include attestation metadata. Use **Backup shelf** / **Restore backup** to move packs between browsers or profiles (file-based; not cloud sync). Restore requires a fresh rights attestation.
- Restore rematches cells by `stormId` against the live derived-track catalogue (radar is always re-fetched)

## Milestone status

### 1 — Visual foundation
Cesium Earth, typed weather interfaces, early immersive scaffolding (later replaced by global atmosphere).

### 2 — Live observation overlays
RainViewer radar mosaics, live observation clock (current frame only), optional IR, Open-Meteo site context.

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

### 9 — Shareable scene snapshots
- Export JSON scene state for compare sets and exploration UI
- Copy URL hash share links; open/import to restore
- Live radar and tracks still refresh from providers on restore

### 10 — Named scene bookmarks
- Save named exploration scenes to local browser storage
- Gallery in the info panel: restore, rename, delete
- Quick **Save bookmark** in the share control dock (auto-named)

### 11 — Track verification hooks
- Optional GeoJSON truth-cell catalogue (`VITE_TRUTH_CELLS_GEOJSON_URL`)
- Associate derived tracks by `stormId` or gated nearest neighbour
- Load bundled sample / export current tracks as a stand-in template
- Association scores are geometric gates — not published verification skill

### 12 — Lightning quality metadata
- Parse `qualityScore` / network / polarity / multiplicity / location error from GeoJSON
- Local min-quality + classification filters for globe markers
- Load bundled sample feed; markers tint by classification/quality
- Filters never invent detections — licensed URL still required for live networks

### 13 — Cross-product quality dashboard
- Unified radar / tracks / lightning / truth readiness panel
- Exploratory coherence hint from time + distance gates (not verification skill)
- Optional sync of globe lightning to the active radar observation window
- Missing feeds stay gaps — never filled with fabricated observations

### 14 — Time-aligned multi-sensor case study
- Bundled NSW example pack: reference tracks + lightning + truth on one clock
- Load / clear from the info panel; live radar stays independent
- Lightning time sync modes: off / radar clock / case-study clock
- Case-study sensors are fixtures — not licensed BoM/commercial archives

### 15 — Schematic RHI
- Range–height sketch along the selected derived or case-study track
- Tops/intensity from CAPE, precip hint, and cell confidence (not dBZ)
- Optional lightning marks projected into a track corridor
- Explicitly **not** a measured radar volume or BoM RHI product

### 16 — Multi-case study library
- Catalog of example packs (NSW, SE Qld, SW WA) with licence notes per entry
- In-app picker loads packs by id; clear returns to live derived tracks
- `example-fixture` vs `user-licensed` labels — bundled packs are fixtures only
- Ready to point catalog paths at licensed archives when available

### 17 — User case-study import
- Import a local STORMVERSE case-study JSON with required rights attestation
- Licence / rights note stored on the loaded pack provenance
- Download an empty template pack; no scraping or fabricated archives
- Import refused without attestation checkbox + non-empty licence note

### 18 — Local attested-import shelf
- Successful attested imports auto-save to a device-local shelf (`localStorage`)
- Reload shelved packs from the case-study library without re-uploading
- Remove shelf entries; max 12 packs; clearing site data wipes the shelf
- Still requires prior user attestation — no scraping or fabricated archives

### 19 — Attested pack export
- Export shelved or loaded attested packs as STORMVERSE JSON
- `importAttestation` (licence note, timestamp, source filename) preserved in the file
- Catalog/example fixtures without attestation cannot use the attested export path
- Re-import still requires a fresh rights attestation in the UI

### 20 — Portable shelf backup / restore
- Download the whole local import shelf as a STORMVERSE backup JSON
- Restore into another browser/profile (merge by pack id, or replace shelf)
- Restore gated by a fresh rights attestation + licence note
- Still file-based and device-local — not cloud sync; no scraping

### 21 — Global Cesium immersive atmosphere (current)
- Immersive mode stays on the Cesium globe (prototype Three.js storm removed)
- **Volumetric** cloud masses: soft meter-scale billboard puffs + ray-marched cores
- Primary drive: RainViewer **infrared** tile sampling (brightness→height/thickness heuristics)
- If IR catalog empty: RainViewer **radar** mosaic sampling as cloud proxies (labelled)
- Enrichment: Open-Meteo `cloud_cover_low/mid/high` type **proxies**
- Derived rain shafts at cell heads; radar mosaic unchanged
- Lightning only from GeoJSON / samples / attested case packs — never invented strokes
- Astronomical sun from observation UTC (`Follow sun`); day/sunrise/sunset/night are labelled previews

## Scientific integrity

| Visual | Interpretation |
| --- | --- |
| Radar mosaic | Processed RainViewer imagery |
| Rain shafts | **Derived** cues at RainViewer-driven cell heads — not measured volumes |
| Global cloud field | Earth-wide mosaic footprint + MeteoLab-inspired ray-marched volumes (soft bases, billows, ice wisps — visual style only; heights are heuristics, not retrieved CTH/COT); Open-Meteo cover fills gaps / fallback |
| Satellite IR | Processed RainViewer infrared mosaic (preferred cloud-shape source when published) |
| Cell tracks | Derived heuristic (low confidence) |
| Case-study tracks / lightning / truth | Example fixtures or user-attested imports — not scraped |
| Tracking quality / “skill” | **Derived** self-consistency proxy — not verified skill |
| Track–truth association | Optional gated match to user catalogue — not BoM skill |
| Cross-product coherence | Exploratory readiness / co-location hint — not multi-sensor skill |
| CAPE / CIN | Model (Open-Meteo) |
| Cross-section | Schematic reconstruction aid |
| Schematic RHI | **Procedural** range–height sketch — not measured reflectivity |
| Globe volume / compare set | **Procedural**, georegistered |
| Scene snapshot / bookmark | UI/state only — does not freeze live weather fields |
| Immersive atmosphere | Same Cesium globe; fly-through of observation/model-driven layers |
| Globe lightning | Direct only from configured/sample/case GeoJSON — never invented |
| Day / sunrise / sunset / night | Astronomical sun from observation UTC (or labelled preview override) |

## Known limitations

- No bundled live lightning network (configure your own licensed URL)
- Snapshots and bookmarks cannot guarantee the same cells exist after catalogue refresh
- Bookmarks are device-local (not synced); clearing site data removes them
- Track “skill”, truth-association, and cross-product scores are not formal verification products
- Sample lightning / truth / case-study packs are plumbing fixtures — replace with licensed catalogues
- Case-study clock and live radar times are independent by design
- Schematic RHI colour bands are not calibrated dBZ
- User import attestation is self-declared — STORMVERSE cannot verify third-party licences
- Import shelf is device-local (not synced); clearing site data removes shelved packs
- Shelf backups are portable files, not an account sync service
- Tracks empty when Australia mosaics lack precip (unless a case study is loaded)

## Next ideas

1. Wire lightning + truth + case-study catalog entries to licensed commercial/BoM products when available
2. Licensed radar volume / true RHI / retrieved cloud-top height products under proper licensing
3. Denser cloud-field LOD / GPU volumetric shells when licensed CTH/COT feeds exist

Do not scrape restricted services. Respect provider terms and licensing.

## Credits

Volumetric cloud shading (billows, flat bases, ice wisps, two-stream sun-through) is visually inspired by
[MeteoLab / StormLab](https://github.com/Bandananor/MeteoLAB) (MIT). Stormverse does not run their cloud-resolving
model — live density still comes from RainViewer mosaics / Open-Meteo cover heuristics.

## Stack

Vite · React · TypeScript · CesiumJS · RainViewer · Open-Meteo · optional GeoJSON lightning
