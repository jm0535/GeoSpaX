# GeoSpaX on GeoLibre — Research & Transformation Plan

**Date:** 2026-09-23 (implementation audit; original research drafted 2026-09-22)
**Scope:** Turn the `jm0535/GeoLibre` fork into **GeoSpaX** — a specialised conservation-science & ecology web GIS — by combining the GeoLibre platform with the domain capabilities of GeoSpaX (`jm0535/map-kit`).
**Status:** Active implementation plan. The original `map-kit` remains unchanged; additive `packages/geospax-*` analysis/data/plugin code now implements the Phase-2 conservation workbench and six domain panels described below.

---

## 1. Executive summary

You have built two things that fit together almost perfectly:

- **GeoSpaX (map-kit)** — a ~22k-line Leaflet/vanilla-JS web GIS with a genuinely unique domain focus: **conservation planning and species ecology**, built for the FR422 habitat-assessment workflow at PNG University of Technology. It has SDM (BIOCLIM, Mahalanobis, MaxEnt), weighted-linear-combination suitability, protection-gap analysis, fragmentation/connectivity, forest change detection, GBIF/ecoregion connectors, equal-area reporting, provenance, and academic citation tooling. Its ceiling is its platform: one 16,363-line `index.html`, Leaflet rendering, vendored libraries, no plugin system, no desktop/mobile story, no spatial database.

- **GeoLibre** — a 2,200-file React/TypeScript/MapLibre/Tauri monorepo: a general-purpose cloud-native GIS *platform* with a store-driven architecture, four rendering engines, DuckDB-WASM spatial SQL, 775+ Whitebox geoprocessing tools, deck.gl/Cesium, a plugin API (right panels, floating panels, toolbar menus, project-state persistence), a Python sidecar, Pyodide-in-browser GeoPandas, i18n in 19 languages, an AI assistant, an MCP authoring server, and web/desktop/mobile/Jupyter delivery. Its weakness, for you, is that it is **generalist**: it has no conservation biology domain layer, no GBIF, no SDM, no protection-gap workflow, no academic/citation features.

**The strategic finding:** GeoLibre already contains equivalents of roughly **70% of GeoSpaX's feature list** — often in more powerful form — and, critically, it was *designed* to be specialised without forking its internals: bundled plugin drop-ins (`public/plugins/<id>/`, `activeByDefault: true`), `admin-profile.json` UI curation, and deployment capabilities for classroom lockdown are all first-class, documented mechanisms. Upstream (`opengeos/GeoLibre`) is extremely active (pushed today; 7.5k stars), so the fork must stay **thin**: concentrate all GeoSpaX identity in *new, additive files* and touch upstream files only for branding.

**Recommended approach (Option C, §4):** *GeoLibre as platform, GeoSpaX as a specialisation layer.*

1. Rebrand at the app-shell level (title, i18n strings, About, citation, `.gspx` project extension alias) — a small, contained diff.
2. Ship the GeoSpaX domain suite as **bundled plugin drop-ins** built from new in-repo workspace packages (`packages/geospax-*`) — zero upstream merge conflicts.
3. Port the *fixed* conservation algorithms (`js/geospax-conservation*.js`, `geospax-sdm-fix.js`, `geospax-raster.js` — ~3.8k lines, dependency-free, 302 tested assertions) to TypeScript modules; rewrite only the UI wrappers as GeoLibre plugin panels.
4. Curate the UI with `admin-profile.json` + deployment capabilities so students see a conservation workstation, not 100+ generalist plugins.
5. Optionally extend the Python sidecar with the MaxEnt/elapid endpoint (port of `api/sdm.py`) — or run a logistic MaxEnt-style model client-side via the existing Pyodide worker.
6. Retire `map-kit` only after feature parity for the FR422 workflow; keep it live during migration.

The payoff is not a lateral move: GeoSpaX would gain Earth Engine / Planetary Computer / STAC data access (a step-change for conservation monitoring), the full Whitebox toolbox (terrain, hydrology, LiDAR, ML classification, 10 change-detection tools), time-slider animation of forest change, spatial SQL on GeoParquet, 3D globe, desktop/mobile builds, project sharing for assignment submission, and an AI assistant that can be re-skinned as a conservation copilot — while keeping its unique Oceania/ecology identity that no other web GIS has.

---

## 1.1 Implementation audit (2026-09-23)

The parity baseline was re-checked directly against `jm0535/map-kit` rather
than inferred from the earlier README claim. The six bundled workbenches now
share one accessible, host-token-based panel system and expose the following
implemented workflows:

- **Conservation:** overlay; descriptive weighted hotspot grid; haversine
  DBSCAN with retained noise; unprotected priority sites; bounded
  exact/explicit-greedy minimum-cost representation; BIOCLIM, Mahalanobis and
  explicit presence-background logistic fit **and prediction**; WLC;
  protection gap; NP/CA/LPI/TE/ED/MSI/core/CAI/ENN fragmentation report;
  connectivity components; vector change; raster threshold/polygonize;
  run-ledger/project provenance export.
- **Agriculture:** real NDVI-family raster workflow, reclassification, WLC,
  exponential distance decay, slope constraints, raster/vector change.
- **Biodiversity:** GBIF/OBIS/iNaturalist/WoRMS, actual taxon-frequency
  richness/diversity, nearest-neighbour pattern, DBSCAN, weighted grid, SDM
  and gap/priority tools.
- **Environment:** slope, normalized-difference indices, Otsu-assisted
  reclassification, aligned raster change and vector overlay.
- **Forestry:** extent derivation, complete fragmentation/connectivity,
  raster/vector forest change and protection gaps.
- **Marine:** OBIS/WoRMS, GEBCO visual context, diversity/nearest-neighbour
  pattern/DBSCAN, SDM, NDWI/custom extents, weighted priorities and MPA gaps.

Correctness claims were narrowed where the prior implementation overstated
capability: SDM no longer stops at model fitting or silently loses covariance
inversion above two variables; the client-side presence-background method uses
explicit environmental rows and is labelled a linear logistic fallback—not
elapid/true MaxEnt; SCP does not claim HiGHS-WASM. Exact SCP uses a bounded
deterministic branch-and-bound solver and returns an explicitly non-optimal
greedy result when its browser safety limits prevent proof.

Still outside this completed panel audit are the optional true-MaxEnt/elapid
sidecar portion of G5, generic How-to-Cite formats (G12), one-click assessment
report (G13), starter-project catalogue/templates (the remaining G14 work),
and `.gspx` shell alias (G16). Those remain roadmap items rather than being
represented as implemented parity.

---

## 2. Review: GeoSpaX (map-kit) as it stands

### 2.1 Stack & structure

| Aspect | Detail |
|---|---|
| Rendering | Leaflet (+ leaflet-heat, leaflet-measure, leaflet-fullscreen), GeoRaster/GeoRasterLayer for GeoTIFF |
| App | Single `index.html` (16,363 lines, ~446 functions) + 9 JS modules in `js/` (~5,300 lines) |
| Analysis engine | Full Turf 6.5 bundle (189 exports, only ~20 used historically; conservation roadmap exploited this), proj4, sql.js, xlsx, shpjs, togeojson, chart.js, geotiff.js — all vendored, "no CDN" policy |
| Server | `api/sdm.py` — Vercel Python serverless MaxEnt (elapid, logistic-regression fallback) |
| Python pkg | `src/geospax/` — matplotlib static/interactive maps + elevation profiles CLI (`geospax` command) |
| Deployment | Vercel (`geospax.in4metrix.dev`) + GitHub Pages mirror; `vercel.json` with full CSP/security headers |
| Tests | 677 Playwright regression tests + 302 unit assertions (jsdom) across the conservation suites |
| Docs | `BLUEPRINT.md` (changelog to v1.4.2), `userguide.html` (34 sections, FAQ, 27 references), `changelog.html`, FR422 assignment guides |
| Data | 9 bundled PNG/Oceania samples: paradisea occurrences, butterfly presences, PNG provinces, protected areas, forest patches, habitat grid, BIO1/BIO12/tree-cover rasters |

### 2.2 The domain crown jewels (what makes GeoSpaX unique)

From the Analysis drawer and the (fully implemented) conservation roadmap:

1. **Vector overlay toolkit** — intersect, difference, union, dissolve, clip, spatial join
2. **Protection gap analysis** — species/habitat vs protected areas, quantified gap report
3. **Equal-area reporting** — hectares first-class, projection-aware area figures (a rigour feature most web GIS lack)
4. **WLC suitability mapping** — graded criteria scoring, user cell size (metres), distance decay, cost/benefit direction, hard constraint mask
5. **SDM suite** — BIOCLIM (limiting-factor, percentile-trimmed envelope), Mahalanobis (chi-square D², singular-covariance guards), MaxEnt (server-side elapid); post-audit fixes removed the *silent fallback* failure class (`geospax-sdm-fix.js`)
6. **Fragmentation & patch metrics** — patch ID, core area, edge metrics
7. **Connectivity graph** — inter-patch connectivity assessment
8. **Two-date forest change detection** — hectares of change
9. **Raster reclassify / Otsu threshold / polygonize** (raster → vector)
10. **Conservation hotspot grid** — hex/square, count/density/presence
11. **Data provenance table** — per-layer source/licence/date
12. **`.gspx` project save/load** — with File System Access API
13. **Academic layer** — How-to-Cite panel (APA/Chicago/Harvard/BibTeX), provenance, assignment-ready workflow
14. **Ecology data connectors** — GBIF (scientific + common name, pagination past the 300-record cap), WWF Terrestrial Ecoregions (846), MEOW marine ecoregions (232), Natural Earth, World Bank indicators, Overpass/OSM

### 2.3 Platform limitations (why migrating onto GeoLibre is right)

- Monolithic `index.html`; every feature competes in one global namespace; UI wiring is the cost centre (the roadmap itself notes the algorithms were "almost entirely UI wiring" against already-vendored Turf).
- Leaflet raster story (GeoRasterLayer) is display-grade; no COG streaming, no Zarr, no STAC, no spatial SQL.
- No plugin architecture, no project state model beyond `.gspx` JSON, no collaboration/sharing, no desktop/mobile.
- Vendored library drift (turf 6.5 frozen; Leaflet ecosystem) is a maintenance treadmill.
- Single-developer surface area: 22k lines is fine, but each new capability (3D, terrain, LiDAR, ML) would cost months.

The conservation roadmap's own audit culture (silent-fallback hunting, chi-square correctness, equal-area rigour) should be **carried over as a design principle** — GeoLibre's plugin API makes this easy because tools return store-visible layers with metadata rather than ad-hoc globals.

---

## 3. Review: GeoLibre as the platform

### 3.1 Architecture in one paragraph

npm-workspaces monorepo (`apps/*`, `packages/*`, `workers/*`) + FastAPI sidecar (`backend/geolibre_server`) + Python anywidget (`python/`). One React app ships as web (nginx/Docker or any static host), Tauri v2 desktop, iOS/Android, and Jupyter embed. State lives in a Zustand store (`@geolibre/core`); data flows one way (store → engine sync); MapLibre is the default renderer with Mapbox/Cesium/ArcGIS as alternates; deck.gl for advanced overlays; DuckDB-WASM Spatial converts local files (Shapefile/GeoParquet/KMZ/GPKG/FlatGeobuf/Iceberg) in-browser; 775+ Whitebox tools run on WASM (`geolibre-wasm`), with an optional Python sidecar for rasterio/GeoPandas/elapid-class work and a Pyodide path that runs GeoPandas **in the browser**.

### 3.2 Specialisation mechanisms already built (this is the key finding)

| Mechanism | What it does | GeoSpaX use |
|---|---|---|
| **Bundled plugin drop-ins** — `apps/geolibre-desktop/public/plugins/<id>/{plugin.json,dist/index.js,dist/style.css}` | Auto-loaded, no Settings trip; `activeByDefault: true` honoured; same folder serves web + desktop; *documented as git-ignorable private payload copied in at build time* | Ship the entire GeoSpaX suite without touching a single upstream source file |
| **Plugin API surface** | Right-sidebar panels (dockable), floating panels, toolbar menus/submenus, map controls, `addGeoJsonLayer`, `addCogLayer`, `readRasterWindow` (raster sampling!), `getLayerFeatures`, selection events, **`getProjectState`/`applyProjectState`** (persists inside `.geolibre.json` projects), i18n hooks, deck.gl access | Everything the conservation panels need; raster sampling powers SDM/WLC without a server |
| **`admin-profile.json`** (`docs/ui-profiles.md`) | Pre-configure & **lock** hidden data sources/plugins/menus/menu items per deployment; served from app root (web) or config dir (desktop) | A "GeoSpaX Student" profile: conservation menus front-and-centre, 100+ generalist plugins hidden |
| **Deployment capabilities** (`packages/core/src/deployment-capabilities.ts`) | Coarse server-declared grants (`project:edit`, `data:add`, `processing:run`, `export:data`, `plugins:install`, `settings:manage`), fail-closed, never re-grantable in UI | Classroom/lab lockdown; kiosk mode for outreach events |
| **`@geolibre/processing` registry** | Vector tools (buffer, clip, intersect, difference, union, dissolve, spatial/attribute join, grid, voronoi, convex hull…), statistics tools (Global/Local Moran's I, Getis-Ord, ANN, KDE, emerging hot spots), topology tools, network tools, **model graph** (QGIS-style Processing Modeler), DGGS tools (H3/S2/A5/DGGRID) | Overlay + hotspot statistics already exist; the model graph is the chassis for one-click guided workflows |
| **Plugin marketplace/registry** | JSON registry at `VITE_GEOLIBRE_PLUGIN_REGISTRY_URL`; install/update/uninstall | A GeoSpaX registry lets you ship domain plugins (e.g., a Pacific-data pack) as updatable content |
| **MCP server + AI assistant** | Headless project authoring (`python/src/geolibre/mcp/`), in-app assistant with `system-prompt.ts` | "Conservation copilot": re-skin the system prompt; author assignment starter projects programmatically |
| **External plugin template** | `opengeos/geolibre-plugin-template` (Vite lib build → zip/manifest) | The build recipe for `packages/geospax-*` plugin bundles |

### 3.3 Feature-overlap matrix (verified against the code, not the docs)

**✅ Already in GeoLibre — no port needed, only curation/UX wiring:**

| GeoSpaX feature | GeoLibre equivalent (verified location) |
|---|---|
| Vector overlay toolkit (P0-1) | `packages/processing/src/vector-tools.ts`: `clipTool`, `intersectionTool`, `differenceTool`, `unionTool`, `dissolveTool`, `spatialJoinTool`, `attributeJoinTool`, `bufferTool` (+ optional GeoPandas engine via sidecar/Pyodide for projection-aware results) |
| Inferential hotspots: Gi*, LISA, Global Moran's, Moran scatterplot | `packages/processing/src/statistics-tools.ts`: `getisOrdTool`, `localMoransITool`, `globalMoransITool`, `emergingHotSpotTool` |
| Point pattern: NNI, KDE, Voronoi | `averageNearestNeighborTool`, `kernelDensityTool`, `voronoiTool` |
| Conservation hotspot grid (hex/square) | `gridTool` + first-class DGGS: `h3-tools.ts`, `dggs-tools.ts` (H3/S2/A5/DGGRID/DGAL), `maplibre-h3` plugin — a *stronger* version of the hex grid |
| Two-date change detection (P1-7) | Whitebox catalog: **10 tools** — Change Vector Analysis, Image Difference Change Detection, PCA Based Change Detection, Post Classification Change, Remote Sensing Change Detection (+ Time Slider plugin to animate the result) |
| Raster classification/reclassify | Whitebox: **25 classification tools** incl. Classify Objects Random Forest/SVM/Ensemble, rules-based hierarchical classification |
| Elevation profile | `maplibreElevationProfilePlugin` (full plugin: `elevation-profile/{core,chart,elevation,export,cesium}`) |
| GeoTIFF display + raster symbology (bands, ramps, stretch, continuous/classified) | `raster-symbology.ts`, `raster-palette.ts`, `colormap-colors.ts`, COG support via `maplibre-gl-raster`, `addCogLayer` plugin API |
| Natural Earth connector | `maplibreNaturalEarthPlugin` |
| Overpass/OSM connector | `maplibre-osm-downloader.ts` (+ `osm-downloader-api.ts`) |
| Import: GeoJSON/KML/KMZ/GPX/Shapefile/CSV/GeoTIFF/GPKG | DuckDB-WASM `ST_Read` (Shapefile, GPKG, GeoParquet, FlatGeobuf, GML), in-house KML parser w/ simplestyle, GPX dialog, delimited-text dialog, COG/GeoTIFF dialog |
| Digitizing/editing/undo-redo/snap | `maplibre-geo-editor.ts` plugin, `useUndoRedoShortcuts`, `useProjectHistory` |
| Attribute table, calculate field, charts | attribute-table stack + `expressions.ts`, `attribute-expression.ts`, `attribute-charts.ts` (≈ `gsx-calcfield.js`) |
| Labels, measure, minimap-ish overview, bookmarks | text-marker labels; `terrain-measure`/`maplibre-dimensions`; viewport history & project camera state |
| Map composer/print, map image export | Print Layout Designer + screenshot/standalone-HTML export (`export:data` capability) |
| Project save/load (`.gspx` → here `.geolibre`) | `.geolibre` project format incl. **plugin state** (`getProjectState`/`applyProjectState`), recent projects, URL-loaded projects, share workers |
| Basemaps (10 free) | Larger catalog: basemap control plugin, regional basemaps (`regional-basemaps.ts`), planetary basemaps (`ellipsoids.ts`), Esri Wayback plugin, OpenFreeMap/CARTO |
| Keyboard shortcuts, i18n, RTL | `useGlobalShortcuts`, react-i18next with 19 locales |

**Original GeoLibre gap register (plan-inception baseline):**

Several entries below are now implemented by the six domain workbenches; use
§1.1 as the current status record. The table is retained to preserve the
source-to-target migration rationale, not as a claim that every row remains
missing.

| # | Capability | GeoSpaX source to port | Build vehicle |
|---|---|---|---|
| G1 | **GBIF occurrence connector** (scientific + common name, pagination, environmental fields) | `js/geospax-opendata.js` | Bundled plugin `geospax-gbif` (right panel + toolbar menu; `addGeoJsonLayer`) |
| G2 | **WWF Terrestrial Ecoregions (846) + MEOW marine (232)** | `js/geospax-opendata.js` | Bundled plugin `geospax-ecoregions` (static GeoJSON assets or hosted tiles; layer-library entries) |
| G3 | **World Bank indicators** | `js/geospax-opendata.js` | Small plugin or fold into G1's "Open Data" panel |
| G4 | **SDM: BIOCLIM (limiting-factor), Mahalanobis (chi-square D²)** — the *fixed* versions with fallback guards | `js/geospax-sdm-fix.js` (655 lines, dep-free) | TS module in `packages/geospax-analysis` + plugin panel; env extraction via `readRasterWindow`/COG sampling |
| G5 | **MaxEnt** (elapid server-side; logistic fallback) | `api/sdm.py` (208 lines) | **Phase A implemented:** deterministic client-side class-balanced, L2-regularised presence-background logistic model over explicit environmental rows, labelled as a fallback rather than MaxEnt. Phase B remains an optional elapid sidecar route behind a dependency extra. |
| G6 | **WLC suitability** (graded scoring, metre cell size, distance decay, cost/benefit, constraint mask) | `js/geospax-conservation.js` (WLC engine) | Plugin panel + TS algorithm; raster math on client grids, or Whitebox weighted-overlay composition |
| G7 | **Protection gap analysis + quantified gap report** | `js/geospax-conservation.js` | Plugin panel; composes existing `intersectionTool`/`spatialJoinTool` + equal-area (G9) |
| G8 | **Fragmentation/patch metrics + connectivity graph** | `js/geospax-conservation-m2.js` | TS algorithms in `packages/geospax-analysis`; Whitebox Patch Orientation/Edge Proportion as complements |
| G9 | **Equal-area reporting (hectares first-class)** | `js/geospax-conservation.js` units + `geospax-conservation-m2.js` | Statistics tool in the analysis package; used by G6–G8 reports |
| G10 | **Raster reclassify / Otsu / polygonize** | `js/geospax-raster.js` (429 lines) | TS module + panel; complements Whitebox Classify/Convert tools |
| G11 | **Data provenance metadata + provenance table** | `js/geospax-project.js` | Extend layer metadata in the plugin; provenance panel; flows into reports |
| G12 | **How-to-Cite panel** (APA/Chicago/Harvard/BibTeX, copy-to-clipboard) | `index.html` citation tab | Small plugin panel or shell About-section addition |
| G13 | **One-click assessment report** (roadmap P3-11: methods + figures + provenance + citations → PDF/HTML) | Not yet built in GeoSpaX either | New plugin composing G7/G9/G11 + Print Layout; *the flagship differentiator* |
| G14 | **Sample dataset catalog** (PNG provinces, protected areas, paradisea occurrences, BIO1/BIO12/tree-cover, forest patches, habitat grid) | `samples/` (9 files) | Copy into `public/samples/geospax/`; register in layer-library / a "GeoSpaX Data" panel; ship FR422 starter **project templates** (`.geolibre.json` with preloaded layers + plugin state) |
| G15 | **DBSCAN clustering** (GeoSpaX point-pattern section) | `index.html` analysis switch | **Implemented** in `spatial.ts` and Conservation/Biodiversity/Marine: haversine metres, explicit/automatic epsilon, standard minimum-points semantics, deterministic IDs, retained noise, provenance and 2,000-point bound. |
| G16 | **`.gspx` extension branding** for saved projects | `.gspx` in `geospax-project.js` | Additive patch: accept `.gspx` alongside `.geolibre` in file dialogs/associations (or keep `.geolibre` internally and alias the display name) |

**🎁 GeoSpaX gains for free (new capabilities the current app could never build alone):**

- **Earth Engine + Microsoft Planetary Computer + STAC catalogs + Source Cooperative + Overture** plugins → continental-scale forest/land-cover monitoring (Hansen tree cover as COG, Sentinel imagery) instead of three bundled PNG rasters
- **775 Whitebox tools**: full hydrology (23 flow-routing, 18 depression tools), terrain derivatives (36+23), LiDAR suite (54+, canopy/forestry-relevant), remote-sensing filters/enhancements, ML object classification
- **DuckDB-WASM spatial SQL** over GeoParquet/FlatGeobuf/Iceberg → GBIF-scale occurrence analytics in-browser
- **Time Slider** → animate two-date change detection, Hansen annual loss, NDVI time series
- **Cesium 3D globe + terrain**, deck.gl point clouds/hex layers
- **Collab workers + share infrastructure** (`workers/collab`, `workers/viewer`) → assignment submission as shareable links
- **Desktop (Tauri), iOS/Android, Jupyter/R embedding** of the *same* specialised app, later, with no extra work
- **AI assistant + MCP server** → conservation copilot; programmatic project authoring for lab notebooks
- **Pyodide GeoPandas in-browser** → projection-aware overlay without any server

---

## 4. Strategic options

### Option A — Rebrand-in-place ("hard fork")
Rename everything (`@geolibre/*` → `@geospax/*`), rewrite the shell, strip unwanted features by deletion.
**Verdict: reject.** 460 files in `apps/geolibre-desktop/src` alone reference "geolibre"; upstream pushes daily (PR #2544 merged today). A hard fork turns every upstream sync into a conflict-resolution marathon and forfeits the engine, plugin ecosystem, and marketplace. You would spend your life merging instead of building conservation science.

### Option B — New app shell (`apps/geospax`) reusing `@geolibre/*` packages
A second Vite app composing the packages with its own branding.
**Verdict: partial merit, not now.** Cleaner identity boundary, but `geolibre-desktop`'s shell is ~70 hooks + command bridge + capability gates; re-composing it duplicates thousands of lines that upstream keeps changing. Revisit only if GeoSpaX's UI must diverge structurally (e.g., a wizard-first student experience) — and even then, fork the shell *later*, from a position of working plugins.

### Option C — Platform + specialisation layer (**recommended**)
Keep `apps/geolibre-desktop` as the single shell. All GeoSpaX identity flows through mechanisms upstream *designed for customisation*:

1. **Bundled plugin drop-ins** (`public/plugins/geospax-*/`) built from new workspace packages — loaded automatically, `activeByDefault`, zero upstream-file edits.
2. **`admin-profile.json`** (new file at app root) — curated, lockable GeoSpaX interface.
3. **Branding patch-set** — the only upstream-file edits: HTML title/meta, i18n app-name strings, About/help entries, `CITATION.cff`, README, favicon/logo assets, `.gspx` alias. Small enough to re-apply after any upstream merge in minutes (or express as a build-time flavour where possible).
4. **New additive packages** (`packages/geospax-analysis`, `packages/geospax-plugins`) — new directories never conflict with upstream.
5. **Optional sidecar module** (`sdm.py` + router line) for server-side MaxEnt.

**Why C wins:** merge-conflict surface ≈ branding files only; every domain feature is independently versionable and testable; the same fork can still build "plain GeoLibre" (flip the flavour) so you can contribute fixes upstream; the plugin bundles can double as **marketplace entries** other GeoLibre users install — growing GeoSpaX's reach without forcing anyone onto the fork.

### Option D — Keep both apps, integrate loosely
Leave map-kit as-is; add a GeoLibre-powered module to it.
**Verdict: reject.** Splits effort across two platforms forever; the roadmap's own conclusion was that GeoSpaX's cost centre is UI wiring on an ageing base.

---

## 5. Target architecture (Option C in detail)

```
jm0535/GeoLibre  (fork; upstream = opengeos/GeoLibre)
│
├── apps/geolibre-desktop/                 # unchanged shell (upstream merges cleanly)
│   ├── index.html                         # BRANDING: title/meta → GeoSpaX      ┐
│   ├── src/i18n/locales/en.json (+18)     # BRANDING: app-name strings          │ the only
│   ├── src/lib/…(About, citation)         # BRANDING: attribution               │ upstream
│   ├── public/admin-profile.json          # NEW FILE: curated GeoSpaX UI        │ edits
│   ├── public/samples/geospax/…           # NEW FILES: PNG/Oceania datasets     │
│   ├── public/projects/geospax/…          # NEW FILES: FR422 starter projects   │
│   └── public/plugins/                    # NEW FILES: built plugin drop-ins    ┘
│       ├── geospax-conservation/{plugin.json,dist/…}   # WLC, gap, fragmentation,
│       │                                               # connectivity, change-detect UX
│       ├── geospax-sdm/{plugin.json,dist/…}            # BIOCLIM, Mahalanobis, MaxEnt
│       ├── geospax-opendata/{plugin.json,dist/…}       # GBIF, ecoregions, World Bank
│       ├── geospax-raster/{plugin.json,dist/…}         # reclassify, Otsu, polygonize
│       └── geospax-academic/{plugin.json,dist/…}       # citations, provenance, report
│
├── packages/geospax-analysis/             # NEW: pure-TS algorithm core (no UI)
│   └── src/{sdm.ts,wlc.ts,gap.ts,fragmetry.ts,equal-area.ts,reclassify.ts,…}
│       └── tests via repo's node --test harness (port the 302 assertions)
│
├── packages/geospax-plugins/              # NEW: GeoLibrePlugin definitions + panels
│   └── src/{conservation/,sdm/,opendata/,raster/,academic/}
│       └── vite lib builds → apps/.../public/plugins/*/dist (npm script)
│
└── backend/geolibre_server/…/sdm.py       # OPTIONAL (Phase 4): elapid MaxEnt
                                            # behind extra `[sdm]`, mirrors api/sdm.py
```

**Data-flow rules (inherit GeoLibre's discipline, per `CLAUDE.md`):**
- Plugins never mutate MapLibre directly; they change store state (`addGeoJsonLayer`, `addCogLayer`) and let sync apply it.
- Heavy numeric work (SDM grids, WLC over rasters) runs in a Web Worker inside the plugin bundle; progress via toasts; yield above ~2,000 features (the roadmap's own rule).
- Raster environmental extraction uses `app.readRasterWindow(layerId, {bounds, width, height, band})` — the plugin API already provides exactly what `extractEnvAtPoints` needed, and correctly (no first-vertex polygon bug, no nearest-neighbour mislabel): sample the grid, bilinear-interpolate in the worker.
- Every tool result carries **provenance in layer metadata** (source, licence, date, method, parameters) — the roadmap's silent-fallback lesson becomes a structural guarantee: results declare the method actually run (e.g., "Mahalanobis, χ²(D²) p-threshold", never a quiet KDE).
- Plugin state (selected criteria, weights, cell size) persists in the project via `getProjectState`/`applyProjectState` → an FR422 submission is one `.geolibre`/`.gspx` file that reopens with everything intact.

**Branding-as-flavour (recommended refinement):** gate the branding patch-set behind a `GEOSPAX_FLAVOR=1` build env where feasible (Vite `define`/env var for app name; i18n override bundle merged at build). Goal: `npm run build` → GeoLibre; `npm run build:geospax` → GeoSpaX. This keeps upstream syncs trivial and lets you A/B features. Where runtime flavouring isn't possible (HTML title), keep the edit minimal and re-apply via a tiny script or patch file.

---

## 6. Phased roadmap

Effort is one experienced dev + AI assistance; T-shirt sizes: XS ≤ 1 day, S ≤ 3 days, M ≤ 2 weeks, L ≤ 4 weeks.

### Phase 0 — Fork hygiene & decisions (XS–S)
- [ ] Add `upstream` remote (`opengeos/GeoLibre`); document sync ritual (merge `upstream/main` → `main` → `geospax` branch; weekly cadence; run `npm run ci` after each merge).
- [ ] Decide naming: **GeoSpaX** (current spelling) everywhere; domain strategy (`geospax.in4metrix.dev` stays; add a project subdomain later?).
- [ ] Decide licence/attribution posture: MIT retained; add NOTICE ("GeoSpaX is built on GeoLibre (MIT, opengeos)"); update `CITATION.cff` to cite both Moses (2026) *and* the GeoLibre DOI (10.5281/zenodo.20785400). Never imply upstream endorsement.
- [ ] Decide repo layout: in-fork `packages/geospax-*` (recommended) vs separate `jm0535/geospax-plugins` repo copied in by CI (maximum upstream agility; the docs explicitly bless git-ignored drop-ins).
- [ ] Verify build baseline: `npm install && npm run dev && npm run lite:build` on the fork.

### Phase 1 — Identity & curation (S–M) → *"GeoSpaX v2.0-preview"*
- [ ] Branding patch-set: HTML title/meta/PWA name, favicons/logo, i18n app-name strings (en first; machine-prepare the other 18 catalogs), About dialog with dual attribution.
- [ ] `admin-profile.json`: hide generalist plugins/data sources (flight sim, gods-eye-view CCTV, street view, ArcGIS Hub, …); keep Layer Control, Components, Elevation Profile, Natural Earth, OSM Downloader, Time Slider, Earth Engine/Planetary Computer (they *are* the conservation stack); optionally `lock: true` for lab deployments.
- [ ] Deployment-capability presets documented for classroom/kiosk use.
- [x] Copy the map-kit teaching datasets into `public/samples/geospax/` with a source/licence manifest (including an explicit correction that `forest_patches.geojson` contains point centroids, not patch polygons).
- [ ] Author 2–3 FR422 starter projects (paradisea workflow: GBIF points → hull → graduated symbology → Gi* → gap analysis) as `.geolibre.json` templates.
- [ ] `.gspx` alias decision & (if wanted) additive patch to save dialogs.
- [ ] Deploy the preview to a staging URL (Vercel with `lite:build` — designed for per-asset caps — or GH Pages; Docker/nginx later for the sidecar era).
- **Exit criterion:** a stranger opens the URL and sees "GeoSpaX — multi-domain geospatial analysis GIS", not GeoLibre.

### Phase 2 — Analysis core port (M–L) → *the substance*
- [x] Stand up `packages/geospax-analysis` (pure TS) and `packages/geospax-plugins` (Vite library builds to six drop-in folders).
- [x] Port and test the bounded browser methods delivered in this audit:
  - equal-area units/reporting (G9), protection gap (G7), complete polygon fragmentation and structural connectivity (G8);
  - BIOCLIM and general Mahalanobis fitting **plus prediction** with explicit missing-row and covariance-regularisation handling (G4);
  - per-feature WLC, exponential distance decay, descriptive weighted hotspot grids, unprotected priorities, and bounded exact/greedy minimum-cost representation;
  - vector overlay/change and sampled-raster slope, normalized difference, reclassification/Otsu/polygonization, and aligned raster change (G10).
- [x] Replace the single gap-only conservation panel with an eight-section workbench and add consistent Agriculture, Biodiversity, Environment, Forestry, and Marine workbenches.
- [x] Route output layers through `addGeoJsonLayer`, mirror bounded native GeoJSON imports for `getLayerFeatures`, and stamp method parameters/provenance on analysis outputs and the run ledger.
- [x] Add bounded, provenance-rich DBSCAN (G15) and the honest client-side presence-background logistic phase of G5.
- [ ] Add optional true-MaxEnt/elapid execution (Phase 4) and any higher-scale worker-backed raster WLC required beyond the current bounded browser methods.
- [ ] Wire change-detection outputs to the Time Slider for the animation story.
- **Current verification:** focused GeoSpaX/store suites pass; all six drop-ins build; representative vector/raster workflows and all six mounted panels pass browser smoke validation. Full FR422 guide reproduction and rewritten screenshots remain Phase 5.

### Phase 3 — Data & academic layer (M)
- [x] Add citation-carrying GBIF, OBIS, iNaturalist and WoRMS queries to the Biodiversity/Marine workbenches; georeferenced results use `addGeoJsonLayer`.
- [x] Add per-run method/provenance views and JSON run-ledger/project-state export (implemented G11 scope).
- [ ] Add WWF/MEOW catalogue delivery (G2), World Bank indicators (G3), and any desired large-result pagination/cache UX.
- [ ] Add generic How-to-Cite formats (G12) and the **one-click assessment report** (G13) through the print-layout export path.
- [ ] Complete string-catalog i18n beyond the shared host translation hook.
- **Exit criterion:** a student produces the Part B conservation plan document from the app in one click.

### Phase 4 — Server-side SDM & scale (S–M, optional)
- [ ] True MaxEnt: add `sdm.py` to `backend/geolibre_server` behind an optional `[sdm]` extra (elapid), mirroring `/vector`'s status-endpoint pattern so the plugin degrades gracefully to the now-implemented client-side presence-background logistic model; alternatively keep the Vercel function as a hosted endpoint. Never relabel the linear fallback as elapid MaxEnt.
- [ ] Model evaluation everywhere: AUC/TSS/k-fold on all SDMs (the roadmap flagged its absence; make it a headline rigour feature).
- [ ] Docker compose for self-hosted GeoSpaX (web + sidecar), documented in `docs/self-hosting` style.
- **Exit criterion:** MaxEnt-class models available with honest evaluation metrics, server or no server.

### Phase 5 — Migration, parity, retirement of map-kit (ongoing)
- [x] Re-audit exposed `map-kit` workflows directly and record implemented/remaining parity honestly in §1.1 (without relying on old README parity claims).
- [ ] Run the FR422 guide end-to-end on the new app and rewrite the step-by-step guides/screenshots.
- [ ] Port the critical Playwright paths from map-kit's 677 tests into GeoLibre's `e2e/` harness (build + `vite preview` + Playwright already wired).
- [ ] `geospax.in4metrix.dev` cutover (keep map-kit at a `/classic` path or the GH Pages mirror for one semester).
- [ ] Keep `src/geospax/` Python static-map package in map-kit as a separate artefact (or later fold into GeoLibre's `python/` package) — it serves a different audience (publication figures).
- [ ] Archive map-kit with a README pointer once parity holds.
- [ ] Optional stretch: desktop build (`tauri:build` with GeoSpaX branding — `productName`/`identifier` in a flavour config), Chrome-extension rename, marketplace publication of the GeoSpaX plugin bundle so *upstream GeoLibre users* can install conservation tools.

---

## 7. Upstream sync & maintenance strategy

1. **Branches:** keep `main` as the stable integration line and land the specialisation through reviewed topic branches. This Arena implementation lives on `arena/01a0cc13-geospax`; it now contains the analysis/plugin work as well as this plan, so it is not a planning-only branch. Reconcile any future upstream-remote ritual with the repository owner's actual branch policy before automating it.
2. **Conflict budget:** with Option C the expected conflict surface per upstream merge is the branding patch-set only (HTML title, i18n name strings, About, CITATION, README). Everything else is new files. Re-apply branding via a `scripts/geospax-brand.sh` or committed `.patch` to make merges mechanical.
3. **Guardrails from `CLAUDE.md`/`docs/maintenance.md`:** run `npm run ci` after each sync; never edit `node_modules`; maplibre bumps need the mirrored-manuals check; regenerate generated files (Whitebox catalog, `npm run i18n:tools`) when upstream says so; coverage floors are a ratchet — the new `packages/geospax-*` tests should *raise* the frontend floor, not trip it.
4. **Contribute back where sensible:** genuinely generic fixes (e.g., DBSCAN statistics tool, equal-area reporting mode, GBIF connector) can go to `opengeos/GeoLibre` as PRs — reducing your fork surface and building standing in the community. Keep conservation-*workflow* UX in the fork.
5. **Version identity:** GeoSpaX-on-GeoLibre starts at **v2.0.0** ("the platform rewrite"), tracking map-kit's v1.4.2 lineage in the changelog. Publish `packages/geospax-analysis` semantics independently of the fork's version.

---

## 8. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Upstream churn breaks branding/plugin assumptions | High (daily pushes) | Medium | Thin-diff Option C; weekly sync ritual; plugin API is documented & versioned (`minGeoLibreVersion`); CI runs `npm run ci` post-merge |
| Plugin bundle limitations (self-contained ESM, no shared node_modules at runtime) surprise you | Medium | Medium | The template's vite lib build inlines deps; import deck.gl/MapLibre via `app.getDeckGL()`/host instances; keep algorithms in a separate workspace package the plugin bundles at build time |
| SDM/WLC numeric parity between JS original and TS port | Medium | High (academic trust) | Port the *fixed* `geospax-sdm-fix.js` semantics; carry over the 302 assertions as golden-value tests; publish method notes in-app (the audit culture becomes a feature) |
| Scope creep into Option B (shell rewrite) | Medium | High | Phase-gated roadmap; shell changes only via flavour config; revisit only after Phase 5 |
| Heavy web build on current hosts (DuckDB-WASM assets) | Medium | Low | `npm run lite:build` exists precisely for per-asset-cap hosts (Vercel/GH Pages); Docker/nginx for self-hosting |
| Students/users confused during migration | Low | Medium | Keep map-kit live; in-app "classic version" link; rewritten FR422 guides before cutover |
| Licence/attribution misstep | Low | High (reputational) | MIT is permissive: retain LICENSE + copyright, add NOTICE, cite both works, no endorsement claims |
| MaxEnt dependency weight (elapid) on serverless | Medium | Low | Client-side logistic GLM first; elapid via sidecar/Docker second; Vercel function as interim |

---

## 9. Decisions needed from you

1. **Product spelling & tagline:** "GeoSpaX" (as in map-kit) vs "GeoSpax"? Suggested tagline: *"Conservation & ecology GIS — built on GeoLibre."*
2. **Repo layout:** in-fork `packages/geospax-*` (recommended; single repo) vs separate `geospax-plugins` repo + CI copy-in (max upstream agility)?
3. **Web-only first?** (recommended) — desktop/mobile builds come almost free later, but branding them (Tauri `productName`, store listings) is extra Phase-5 work.
4. **MaxEnt path:** client-side GLM → sidecar elapid (recommended) vs keep the Vercel serverless function as the hosted endpoint?
5. **`.gspx` extension:** alias it over `.geolibre` (distinct identity, tiny patch) vs keep `.geolibre` (zero patch, weaker identity)?
6. **Contribute generic tools upstream** (DBSCAN, GBIF, equal-area) vs keep everything in the fork?
7. **Migration deadline:** is the next FR422 semester the cutover target? That fixes Phase 1–3 as the critical path.

---

## 10. What happens to each map-kit asset

| Asset | Fate |
|---|---|
| `index.html` (16.4k lines) | Retired — UI re-expressed as GeoLibre plugin panels; algorithms extracted first |
| `js/geospax-conservation*.js`, `geospax-sdm-fix.js`, `geospax-raster.js`, `geospax-project.js` | **Ported** to `packages/geospax-analysis` (TS) — these are the crown jewels, already dependency-free and tested |
| `js/geospax-opendata.js` | Ported to `geospax-opendata` plugin (GBIF/ecoregions/World Bank); Overpass/NaturalEarth dropped (GeoLibre has them) |
| `js/gsx-calcfield.js`, `gsx-select.js`, `geospax-gpkg.js` | Dropped — GeoLibre equivalents exist (expressions/attribute table, UI kit, DuckDB GPKG) |
| `api/sdm.py` | Ported to sidecar module or kept as hosted endpoint (decision #4) |
| `src/geospax/` Python package | Stays in map-kit as a separate publication-figures tool; possible later merge into GeoLibre's `python/` package |
| `vendor/*` (Leaflet, turf, georaster…) | Retired — platform provides all of it |
| `samples/` | Copied into `public/samples/geospax/` + starter project templates |
| Tests (677 Playwright + 302 unit) | Unit assertions ported as golden-value tests; key Playwright flows rewritten in GeoLibre's `e2e/` |
| Docs (BLUEPRINT, userguide, FR422 guides, changelog) | Rewritten against the new UI in Phase 5; roadmap's audit findings preserved as method notes |
| Deployment (`vercel.json`, domains) | Reused for the new build (`lite:build` output); CSP headers re-derived from GeoLibre's needs (tile hosts, `blob:` for plugins) |

---

## Appendix A — Plugin skeleton (representative, for Phase 2)

```typescript
// packages/geospax-plugins/src/conservation/plugin.ts
import type { GeoLibreAppAPI, GeoLibrePlugin } from "@geolibre/plugins";
import { runProtectionGap, runWLC } from "@geospax-analysis";

export const geospaxConservationPlugin: GeoLibrePlugin = {
  id: "geospax-conservation",
  name: "GeoSpaX Conservation Planning",
  version: "2.0.0",
  engines: ["maplibre"], // store-driven; mapbox/cesium later
  activate(app: GeoLibreAppAPI) {
    const unregister = app.registerRightPanel?.({
      id: "geospax-conservation",
      title: () => app.translate?.("geospax.conservation.title", "Conservation Planning") ?? "Conservation Planning",
      dock: "right-of-layers",
      render: (el) => mountConservationPanel(el, app), // returns cleanup
    });
    return () => unregister?.();
  },
  deactivate() { /* panel + toolbar menu removed via returned cleanups */ },
  getProjectState: () => currentCriteriaState(),      // persists in .geolibre/.gspx
  applyProjectState: (app, state) => restoreCriteriaState(app, state),
};
```

Build → `apps/geolibre-desktop/public/plugins/geospax-conservation/{plugin.json,dist/index.js}` with `"activeByDefault": true`. No upstream file is edited.

## Appendix B — Verified evidence index

- GeoLibre overlap claims: `packages/processing/src/{vector-tools.ts,statistics-tools.ts,h3-tools.ts,dggs-tools.ts,model-graph.ts}`; Whitebox catalog snapshot (`apps/geolibre-desktop/public/whitebox-catalog-snapshot.json`, 775 tools; change-detection 10, classification 25, hydrology/terrain/LiDAR counts as listed in §3.3); `packages/plugins/src/plugins/elevation-profile/`; `maplibreNaturalEarthPlugin` & `maplibre-osm-downloader` in `usePlugins.ts` imports; plugin drop-in mechanics & marketplace in `docs/plugin-api.md` (§External plugins); `admin-profile.json` in `docs/ui-profiles.md` + `src/lib/admin-profile.ts`; capabilities in `packages/core/src/deployment-capabilities.ts`; project format & plugin-state persistence in `docs/architecture.md`/`docs/project-format.md`; `lite:build` for asset-capped hosts in `CLAUDE.md`; Pyodide GeoPandas worker in `docs/architecture.md`.
- GeoSpaX claims: `map-kit/README.md`, `BLUEPRINT.md` (v1.4.2), `geospax_conservation_roadmap/{GEOSPAX_CONSERVATION_ROADMAP.md,INTEGRATION.md,MANIFEST.md}` (all P0–P2 items implemented, 302 assertions), `js/*` line counts, `api/sdm.py`, `samples/`, `practical_assignment/` (FR422 briefs & guides), `vercel.json`.
- Upstream activity: `opengeos/GeoLibre` — pushed 2026-09-22, 7,570 stars, 805 forks; fork tip `4506003` (PR #2544).
