# @geospax/plugins

<p align="center">
  <img src="../../docs/assets/geospax_logo_final.svg" width="120" alt="GeoSpaX logo — a teal X with a globe at its center" />
</p>

Six GeoSpaX domain workbenches built as **bundled GeoLibre drop-ins**. They are
auto-discovered from `public/plugins/`; every vector result is returned through
`app.addGeoJsonLayer`, raster/catalogue layers use the corresponding host API,
and no plugin mutates MapLibre directly.

## Domain workbenches (v2.0.0)

All six panels share the same host-token-based UI system: sticky section
navigation, accessible disclosure sections, labelled controls, validation,
busy/success/warning/error states, result tables, empty states, method notes,
provenance history and exports.

| Plugin | Exposed workflows |
|---|---|
| `geospax-conservation` | Vector intersect/erase/union; descriptive weighted hotspot grid; haversine DBSCAN; unprotected priority sites; bounded minimum-cost representation (exact branch-and-bound where proved, labelled greedy otherwise); BIOCLIM, Mahalanobis and explicit presence-background logistic fit **and prediction**; feature WLC; protection gap; complete fragmentation/core report; connectivity components; vector change; raster reclass/polygonize; provenance/project export |
| `geospax-agriculture` | NDVI-family crop-condition extents; raster reclassification; feature WLC; exponential distance decay; Horn slope zones; aligned raster and polygon crop-change workflows; provenance export |
| `geospax-biodiversity` | Citation-carrying GBIF/OBIS/iNaturalist occurrence and WoRMS taxonomy queries; taxon-frequency richness/Shannon/Simpson/evenness; Clark–Evans point pattern and haversine DBSCAN; weighted grid; BIOCLIM/Mahalanobis/presence-background logistic prediction; priority sites and protection gaps |
| `geospax-environment` | Horn slope zones; NDVI/NDWI/NDBI/NBR/custom normalized-difference extents; Otsu-assisted raster reclassification; aligned raster change; vector overlay; provenance export |
| `geospax-forestry` | Forest/NBR extent derivation; raster reclassification; NP/CA/LPI/TE/ED/MSI/core/CAI/ENN metrics; connectivity components; raster and polygon loss/gain change; forest protection gap |
| `geospax-marine` | Citation-carrying OBIS/WoRMS queries; GEBCO visual-context layer; richness/diversity, nearest-neighbour pattern and haversine DBSCAN; BIOCLIM/Mahalanobis/presence-background logistic prediction; NDWI/custom habitat extent; weighted priorities and MPA gap |

## Original GeoSpaX parity baseline

The implementation was checked against `jm0535/map-kit`, not against the old
parity statement alone.

| Original bundle/workflow | Current implementation |
|---|---|
| `geospax-conservation.js`: overlay, protection gap, priority areas, WLC | `planning.ts`, `gap.ts`, `suitability.ts` + Conservation sections Overlay, Prioritization, Suitability and Gap |
| Multi-criteria hotspot grid | `spatial.ts` + Conservation/Biodiversity/Marine weighted-grid tools; explicitly labelled descriptive, not Getis-Ord Gi* |
| Point-pattern DBSCAN | `spatial.ts` + Conservation/Biodiversity/Marine DBSCAN tools; haversine metres, standard minimum-points-includes-self semantics, automatic or explicit epsilon, retained noise |
| `geospax-conservation-m2.js`: fragmentation, connectivity, polygon change | complete `fragmentation.ts`, `connectivity.ts`, `change.ts` workflows + Conservation/Forestry panels |
| `geospax-sdm-fix.js`: BIOCLIM and Mahalanobis | `sdm.ts` performs prediction, general p-variable covariance inversion and disclosed ridge regularisation; Conservation/Biodiversity/Marine SDM tools |
| Original MaxEnt API fallback | bounded client-side presence-background logistic model with explicit environmental background, equal class weighting and L2 regularisation; honestly labelled a linear fallback, **not** elapid/true MaxEnt |
| `geospax-raster.js`: histogram/Otsu, threshold and polygonize | `raster.ts`/`terrain.ts` + Conservation/Environment/Agriculture/Forestry/Marine raster tools |
| Provenance/project tools | shared run ledger, `_geospax` feature stamps and host project-snapshot export |

### Honest method limits

- Weighted hotspot grids are descriptive counts/densities, **not** inferential
  Getis-Ord Gi* and not p-values.
- Connectivity uses centroid-distance thresholds, **not** resistance or
  least-cost corridors.
- SDM environmental variables must be numeric attributes already present on
  both the presence and prediction feature layers; missing rows are excluded,
  never filled with zero or coordinates. The presence-background option is a
  class-balanced, L2-regularised **linear logistic fallback**, not elapid or
  true MaxEnt; scores are relative to the explicitly selected background.
- DBSCAN uses pairwise haversine distances and is bounded to 2,000 points in
  the browser. Its automatic epsilon is median nearest-neighbour distance ×
  1.5 by default (with a disclosed 1 m floor for coincident-only inputs);
  outputs retain noise (`cluster = -1`) and report all settings.
- The SCP exact path is an in-browser deterministic branch-and-bound solver for
  at most 28 planning units with a two-million-node safety bound. Larger or
  interrupted searches return a result labelled `greedy`, `optimal: false`.
  GeoSpaX does **not** claim that HiGHS-WASM ran.
- Raster workflows sample the current viewport through `readRasterWindow`.
  Results report sample dimensions/pixel size and inherit that resolution.
- Index presets do not detect sensor bands. Every index result prints
  `BAND_ASSIGNMENT_CAVEAT`.

## Build

```bash
npm run build -w @geospax/plugins
```

For each plugin this emits:

```text
apps/geolibre-desktop/public/plugins/<id>/
  plugin.json
  dist/index.js
  dist/style.css
```

The generated directories are ignored build artefacts. Bundled-plugin discovery
runs when the dev server starts, so restart the server after rebuilding.

## Verification

Focused algorithm/panel contract tests:

```bash
node --import tsx --test \
  tests/geospax-analysis.test.ts \
  tests/geospax-environment.test.ts \
  tests/geospax-v04.test.ts \
  tests/geospax-domain-workflows.test.ts \
  tests/geospax-plugin-panel-rail.test.ts
```

Package typechecking follows imports into upstream `@geolibre/*` source and
currently reports one unrelated existing `WorkerGlobalScope` error from
`packages/plugins/src/plugins/local-netcdf.ts`. The six bundles are therefore
also compiled directly with the package build above.
