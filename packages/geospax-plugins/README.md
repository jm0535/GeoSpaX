# @geospax/plugins

GeoSpaX domain plugins, built as **bundled drop-ins** for the app's
`public/plugins/` directory — the GeoLibre mechanism that auto-loads plugins
with no upstream source edits (see `docs/plugin-api.md` §External plugins →
§Bundled plugins).

## Plugins — six auto-discovered drop-ins (Phase 7)

| id | Version | Contents |
|---|---|---|
| `geospax-conservation` | v0.1.0 | Right-panel “Conservation Planning”: protection gap analysis with equal-area hectares, method declarations, closure checks, provenance-stamped result layers |
| `geospax-biodiversity` | v0.1.0 | **Biodiversity** domain pack — live GBIF/OBIS/iNaturalist fetch (taxon+bbox→GeoJSON, citation + `_geospax` provenance), WoRMS Aphia lookup, plus layer-based richness / Shannon / Simpson indices (counts per community) |
| `geospax-forestry` | v0.1.0 | **Forestry** domain pack — polygon patch fragmentation (`patchMetrics` + `summarizeFragmentation`, equal-area ha) + thresholded connectivity graph (`connectivityGraph` at distance m, components/isolated), centroids + edges added as stamped layers; catalogue citation GFW/Hansen |
| `geospax-marine` | v0.1.0 | **Marine** domain pack — OBIS marine occurrence fetch, GEBCO bathymetry tile-pattern helper + XYZ layer, WWF ecoregion (846/232/62) & Allen Coral / mangrove catalogue, SPREP Pacific — all citation-carried |
| `geospax-agriculture` | v0.1.0 | **Agriculture** domain pack — WLC crop suitability (graded 0–1, benefit/cost, /100 auto-normalise, distance-decay half-life helper) with provenance-stamped suitability point/polygon; optional context polygon ha reporting |
| `geospax-environment` | **v0.1.0 — sixth drop-in** | Right-panel “Environment”: **Slope zones** — any DEM + band + two class breaks → Horn slope/aspect over the current view (pixel metres computed at the window's centre latitude) → steep-class polygons with equal-area area tables, pixel size and excluded-cell counts shown, resolution warning surfaced; **Index extent** — NDVI / NDWI / NDBI / NBR presets or a custom band pair → normalized-difference grid → stats table (range, mean, valid cells), histogram with Otsu-suggested threshold, dissolve-polygonized extent layer stamped `_geospax` — with the band-assignment caveat printed on every result |

## Build

```bash
npm run build -w @geospax/plugins
```

Emits, for each plugin:

```text
apps/geolibre-desktop/public/plugins/<id>/
  plugin.json          (copied from src/<plugin>/plugin.json)
  dist/index.js        (self-contained ESM bundle - analysis core, turf, proj4 inlined)
  dist/style.css
```

Bundled-plugin discovery runs at **dev-server start / app build**, so run this
before `npm run dev` (restart the dev server after rebuilding). The drop-in
folders are git-ignored by upstream convention (`public/plugins/.gitignore`):
bundles are build artefacts, produced in CI before `npm run build`.

`plugin.json` sets `"activeByDefault": true` (honoured for bundled drop-ins),
so the panels are live on first run without visiting the Plugins menu.

## Phase 7: GeoSpaX v1 parity — formally superseded

**Phase 7 reached: the environment drop-in completes the build-out, and GeoSpaX v1 parity is formally superseded.**

| v1 bundle (jm0535/map-kit) | Now lives in | Status |
|---|---|---|
| `geospax-conservation.js` | analysis core + Conservation §1–6 | superseded |
| `geospax-conservation-m2.js` | raster pipeline + Conservation §8 | superseded |
| `geospax-sdm-fix.js` | sdm.ts + Conservation §7 | superseded |
| `geospax-raster.js` | raster.ts + Conservation/Environment panels | superseded |

**Beyond parity:** five domain packs (Biodiversity, Forestry, Marine, Agriculture, Environment), tiered citation-carrying connectors (GBIF/OBIS/iNat/WoRMS/World Bank/SPREP + GEBCO/ecoregion catalogue), and browser-native **exact SCP on HiGHS-WASM** — a capability the v1 site never had.

## Typecheck note

`npm run typecheck -w @geospax/plugins` follows type imports into upstream
`@geolibre/*` sources and currently surfaces one pre-existing upstream error
(`packages/plugins/src/plugins/local-netcdf.ts` — `WorkerGlobalScope` needs the
app's lib config). **Zero errors originate in geospax sources** — verify with:

```bash
npx tsc --noEmit -p packages/geospax-plugins/tsconfig.json 2>&1 | grep geospax
```

## Conventions

- Plugins never mutate MapLibre directly: results go through
  `app.addGeoJsonLayer` / store APIs (GeoLibre's one-way data rule).
- Every result layer carries `_geospax` provenance (tool, method that
  actually ran, CRS, params, timestamp, engine version, lineage).
- UI strings go through `app.translate(key, default)`; scoped CSS only
  (`.gsp-cons-*` / `.gsp-env-*` prefixes).
- Plugin `version` must match `plugin.json` `version` (loader-validated);
  bump both together.
- Slope zones are view-dependent (sampled grid over the current viewport);
  the panel declares the pixel size at the viewport centre, border vs nodata
  excluded counts, and a resolution warning — never silent.
- Index extents always print `BAND_ASSIGNMENT_CAVEAT` (presets label typical
  sensor bands but do not auto-detect them — verify A/B match your raster).
