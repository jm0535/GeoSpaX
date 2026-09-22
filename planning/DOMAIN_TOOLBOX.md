# GeoSpaX Domain Toolbox — field-by-field catalogue

Companion to [`PLAN.md`](PLAN.md). Legend: ✅ already in GeoLibre (curate/wire only) ·
🔁 ported from GeoSpaX v1 (`jm0535/map-kit`, tested algorithms) · 🆕 new build.
Data tiers per PLAN.md §2.3: **T1** keyless CORS-direct · **T2** pre-processed/hosted assets ·
**T3** token via Settings/runtime-env · **T4** sidecar/serverless proxy.

Cross-field primitives shared by all packs (`packages/geospax-analysis`): equal-area units,
graded WLC/MCDA engine, SDM family, biodiversity indices, EOO/AOO, patch/fragmentation
metrics, connectivity graphs, reclassify/Otsu/polygonize, SCP solvers, DBSCAN, provenance
record. Pack tools below are compositions of these + GeoLibre/Whitebox capabilities.

---

## 1. Natural resource management (cross-cutting core)

| Tool | Status | Implementation notes |
|---|---|---|
| Land suitability / capability evaluation (FAO land-evaluation style: requirements × criteria × constraints) | 🔁🆕 | v1 WLC engine (graded scoring, distance decay, cost/benefit direction, hard constraint mask, metre cell size) + land-quality framework templates |
| MCDA with AHP weight elicitation | 🆕 | Pairwise-comparison matrix → weights feeding the WLC engine; consistency ratio reported |
| Resource accounting: area statistics by land cover / admin unit / tenure | 🔁✅ | Equal-area hectares (v1) over intersection/spatial-join (✅); tabulate + export |
| Scenario comparison (before/after, plan A/B) | ✅ | Swipe plugin, split panes, multi-engine sync — curate into a "Compare scenarios" workflow |
| Participatory mapping & field sketching | ✅ | GeoEditor digitizing, annotation markers, GPX import, mobile-responsive PWA |
| Multi-stakeholder zone allocation (conservation/agriculture/extractive zones) | 🆕 | SCP management-zones extension (Phase 5) — Marxan-with-Zones-class objective in HiGHS-WASM |
| Provenance & data-licence register | 🔁🆕 | v1 provenance metadata + per-layer licence strings; register view in academic pack |
| One-click resource-assessment report | 🆕 | Academic pack report engine with NRM templates |

Data: Pacific Data Hub / SPREP (T1 CKAN), World Bank indicators 🔁(T1), FAOSTAT (T1),
admin boundaries via Natural Earth ✅ + PNG provinces 🔁(T2 sample).

---

## 2. Conservation (flagship pack — Phase 2/5)

| Tool | Status | Implementation notes |
|---|---|---|
| Protected-area gap analysis (species/habitat vs PA network, quantified gap report) | 🔁 | v1 `protectionGap`; consumes WDPA/national PA layers; equal-area outputs |
| **Systematic conservation planning — min-set & max-coverage with representation targets + boundary-length penalty** | 🆕 | **Browser first.** HiGHS-WASM MILP (prioritizr-class; `lovasoa/highs-js`, `fuglede/highs-wasm` validated); greedy heuristic fallback seeded from v1 `GSX.priorityAreas`; Marxan-compatible CSV in/out |
| Zonation-style iterative priority ranking | 🆕 | Deterministic removal ranking over planning-unit grid; complements MILP; large-grid friendly |
| Priority area identification (unprotected, scored) | 🔁 | v1 P0-5 |
| Conservation hotspot grid (hex/square, count/density/presence) | ✅🔁 | H3/DGGS tools (✅, stronger than v1 hexGrid) + v1 presence/density modes |
| IUCN Red List metrics: EOO (convex hull), AOO (2 km grid), Criterion B sub-metrics, extent-of-habitat | 🆕 | Convex hull ✅ + v1 hull workflow; AOO grid via gridTool; automated assessment figures |
| KBA / OECM screening support | 🆕 | Composition: richness/threat/threshold tables over EOO/AOO outputs |
| 30×30 / GBF target reporting (national & regional coverage stats) | 🆕 | Gap-analysis engine over WDPA + admin units; report template |
| SMART / EarthRanger patrol-data import & effort mapping | 🆕 | CSV/GeoJSON import ✅ + patrol-line effort statistics; niche but high-impact for PA managers |
| Threat mapping (roads, fires, logging, fishing pressure) | ✅🆕 | FIRMS fires (T3), Hansen loss ✅ recipes, Global Fishing Watch (T3), road density via line tools |

Data: WDPA/OECM (T3 token, `api.protectedplanet.net`, citation mandatory — worldpa docs),
IUCN Red List API (T3), protected-planet stats (T1), v1 PNG protected areas sample (T2),
CTI-CFF / SPREP MPA datasets (T1/T2), GBIF 🔁.

---

## 3. Terrestrial ecology (Phase 2–3)

| Tool | Status | Implementation notes |
|---|---|---|
| SDM: BIOCLIM (limiting-factor, percentile envelope), Mahalanobis (χ² D², covariance guards) | 🔁 | v1 `geospax-sdm-fix.js` semantics (fallback guards, correct env extraction via `readRasterWindow`) |
| SDM: MaxEnt-class GLM + model evaluation (AUC, TSS, k-fold CV) | 🔁🆕 | Client logistic GLM first; elapid via sidecar `[sdm]` extra (T4) later; **evaluation metrics are new and mandatory on output** |
| Habitat suitability (WLC) & land-cover constraint masking | 🔁 | v1 WLC engine |
| Biodiversity indices: richness, Shannon, Simpson, Chao1, rarefaction, evenness | 🆕 | Over occurrence/survey tables via DuckDB SQL + TS statistics; plot panels |
| Occupancy modelling (single-season, detection/nondetection) | 🆕 | Client-side MLE; survey CSV import ✅ |
| Habitat fragmentation & patch metrics (patch ID, core area, edge density, shape indices) | 🔁✅ | v1 M2 fragmetry + Whitebox Patch Orientation / Edge Proportion / Clump |
| Structural & functional connectivity (resistance surfaces, cost-distance, corridor identification, graph metrics) | 🔁✅ | Whitebox cost-distance ✅ + v1 connectivity graph; circuitscape-class resistance composites via raster math |
| Vegetation indices (NDVI, EVI, SAVI, NDWI, NBR) on Sentinel-2/Landsat | ✅ | Band math over COGs from Planetary Computer/Earth Engine plugins; recipe templates |
| Land-cover classification (RF/SVM/rules, OBIA) | ✅ | Whitebox 25 classification tools incl. Classify Objects Random Forest/SVM |
| Land-cover change & two-date forest-change detection (hectares) | ✅🔁 | Whitebox 10 change-detection tools + v1 change workflow + Time Slider animation |
| Phenology / time-series exploration | ✅ | Time Slider on COG/XYZ/WMS-Time series |
| Ecoregion context (WWF terrestrial 846, ONE biome classification) | 🔁✅ | v1 connector (T2 static) + Natural Earth ✅ |
| Camera-trap / transect survey import & effort standardisation | 🆕 | CSV import ✅ + detection tables feeding occupancy/indices |

Data: GBIF 🔁 (T1), iNaturalist (T1), ESA WorldCover 10 m (T1 via PC STAC ✅), Hansen
tree cover/loss ✅ (T1 via EE/PC), WorldClim/CHIRPS bioclimate (T2 — v1 BIO1/BIO12 samples;
EE catalogue), WWF ecoregions 🔁 (T2), Movebank tracking (T1; deck.gl TripLayer viz).

---

## 4. Marine ecology & coastal (Phase 4)

| Tool | Status | Implementation notes |
|---|---|---|
| Marine occurrence connector: OBIS | 🆕 | `api.obis.org` (T1, keyless); depth/temperature fields preserved |
| Marine taxonomy: WoRMS lookup | 🆕 | T1; name-match service like GBIF species match 🔁 |
| MEOW marine ecoregions (232) | 🔁 | v1 fetches via VLIZ GeoServer WFS (geo.vliz.be) — keep WFS path (✅ WFS support) or pre-tile (T2) |
| Bathymetry: GEBCO tiles/COG, depth profiles | ✅🆕 | GEBCO via PC/STAC or WMS tiles (T1); v1 elevation-profile engine ✅ extended to depth transects |
| Sea-surface temperature & coral-bleaching alerting (NOAA Coral Reef Watch) | 🆕 | CRW tiles/ERDDAP (T1/T2); Degree Heating Weeks layer + alert thresholds; Time Slider for anomalies |
| Mangrove & seagrass extent (Global Mangrove Watch, WCMC seagrass) | ✅🆕 | GMW on PC/STAC (T1) + change recipes; national blue-carbon context |
| MPA network analysis (coverage, gap, spacing, representation by ecoregion) | 🔁🆕 | Gap engine over WDPA-marine/SPREP MPA data; CTI-CFF Coral Triangle MPA system context |
| Shoreline change & coastal transects (DSAS-style) | 🆕 | Historic coastline snapshots (T2) + transect engine over vector tools; erosion/accretion rates |
| Marine SDM (depth, SST, salinity, chlorophyll predictors) | 🔁🆕 | Same SDM core; predictors from Copernicus Marine/PC (T1) |
| Fisheries context: Global Fishing Watch effort, Sea Around Us catches | 🆕 | GFW API (T3 token), SAU (T1); effort heatmaps via deck.gl |
| Ocean currents / upwelling context layers | ✅ | Copernicus Marine / PC catalogue layers |

Data: OBIS (T1), WoRMS (T1), GEBCO (T1 PC/WMS), NOAA CRW (T1/T2), GMW (T1 PC), SPREP/Pacific
Data Hub coastal & marine (T1 CKAN), Coral Triangle MPA compilations (T2), WDPA marine (T3).

---

## 5. Forestry (Phase 4 — PNG national priority)

| Tool | Status | Implementation notes |
|---|---|---|
| Forest extent & loss/gain workflows (Hansen 30 m; annual loss, GLAD/RADD alerts) | ✅🆕 | EE/PC plugins ✅ + guided "deforestation alert" recipe (alert cluster → area in equal-area ha → report) |
| Canopy height & structure (global canopy-height models; LiDAR CHM) | ✅ | Meta/global canopy height on PC (T1); Whitebox 54+ LiDAR tools for local LiDAR |
| Forest inventory: plot import, stand metrics (basal area, mean DBH, stocking), stratification | 🆕✅ | CSV ✅ + calculate-field ✅ + stratified sample design via grid/random tools ✅; stand-metric formulas as field templates |
| Sample-plot & survey design (random, stratified, systematic, transects) | ✅🆕 | randomExtract/grid/points-along-line ✅ + design-report wrapper |
| Timber-volume & biomass/carbon estimation (allometric equations, IPCC coefficients) | 🆕 | Calculate-field expressions + ecozone coefficient tables; carbon report template |
| Fire: active-fire monitoring (NASA FIRMS), burn severity (NBR/dNBR), fire history | ✅🆕 | FIRMS (T3 free NASA key, CSV/WMS) + Sentinel-2/Landsat NBR band-math recipes ✅ |
| Forest-health anomaly (NDVI/EVI time-series deviation) | ✅🆕 | Time Slider + band-math deviation recipes |
| Logging-road & concession driver analysis | ✅🆕 | Road density via line tools; concession polygons (T2, e.g., PNG Forest Authority / Open Development) |
| Watershed & erosion context for forest landscapes | ✅ | Whitebox hydrology (41+ tools) + terrain derivatives |
| FRA / national forest-statistics context | 🆕 | FAO FRA figures via FAOSTAT API (T1) choropleths |

Data: Hansen ✅, GLAD/RADD ✅ (EE/PC), canopy height (PC), FIRMS (T3), Sentinel-2/Landsat ✅,
PNG Forest Authority / PNGRIS-derived samples (T2), FAOSTAT/FRA (T1).

---

## 6. Agriculture (Phase 5)

| Tool | Status | Implementation notes |
|---|---|---|
| Crop/vigor indices on field polygons (NDVI, EVI, SAVI, NDWI) + zonal statistics | ✅🆕 | Band math ✅ + zonal stats over Sentinel-2 (10 m — field-scale) via PC/EE; anomaly detection vs seasonal median |
| Soils: SoilGrids point queries & layer maps (ISRIC, 250 m; texture, pH, SOC, depth) | 🆕 | `rest.isric.org` (T1, CC-BY 4.0); WMS/COG layers + click-to-value |
| Climate for crops: NASA POWER (solar, temp, precip), ET₀ (Hargreaves & FAO-56 Penman-Monteith), growing degree days, crop calendars | 🆕 | POWER (T1, public domain); ET₀/GDD computed client-side over POWER grids; FAO-56 Kc curves as templates |
| Crop land suitability & land evaluation (FAO framework: requirements × limitations) | 🔁🆕 | WLC/MCDA engine + soil/climate criteria presets |
| Water & irrigation context: watersheds, stream networks, distance-to-water criteria | ✅ | Whitebox hydrology ✅ + WLC distance-decay criteria 🔁 |
| Field boundary delineation & management zones | ✅🆕 | Whitebox OBIA/segmentation ✅ + clustering (DBSCAN/k-means 🆕) on indices/soils |
| Agricultural statistics choropleths (production, yield, food security) | 🆕 | FAOSTAT API (T1) joined to admin units ✅ (attribute-join tool) |
| Drought & rainfall anomaly monitoring (CHIRPS/SMAP context) | ✅🆕 | CHIRPS via EE/PC + Time Slider anomaly recipes |

Data: Sentinel-2/Landsat ✅ (T1 PC/EE), SoilGrids (T1), NASA POWER (T1), FAOSTAT (T1),
CHIRPS (T1 EE), World Bank ✅🔁 (T1).

---

## 7. Environmental science (Phase 5)

| Tool | Status | Implementation notes |
|---|---|---|
| Air quality: OpenAQ / WAQI ground stations; Sentinel-5P NO₂/CH₄/SO₂ columns | 🆕✅ | OpenAQ/WAQI (T1/T3) point layers + charts; S5P via PC/EE recipes ✅ |
| Water resources: USGS NLDI ✅, HydroSHEDS/HydroBASINS, watershed delineation, stream ordering | ✅🆕 | NLDI plugin ✅; HydroBASINS on PC (T1); Whitebox hydrology ✅ |
| Water-quality sample mapping & interpolation (IDW/kriging-class) | 🆕✅ | CSV import ✅ + Whitebox interpolation / IDW 🆕 client tool |
| EIA workflow: baseline → receptor sensitivity → impact overlay → mitigation mapping | 🆕✅ | Composition pack over overlay ✅, WLC 🔁, buffers ✅; guided template + report |
| Carbon & greenhouse gases: biomass carbon 🔁(forestry), peatland/soil-carbon context, emissions choropleths | 🆕 | SoilGrids SOC (T1) + ecozone coefficients; FAOSTAT emissions (T1) |
| Climate analysis: bioclimatic variables, climate-analog mapping, envelope-shift under scenarios | 🔁🆕 | v1 BIO1/BIO12 samples 🔁 + SDM envelope engine applied to scenario rasters (CMIP6 via PC/EE T1) |
| Pollution/plume & spill context (Sentinel-5P, incident data) | ✅ | EE/PC recipes |
| Environmental compliance grids & monitoring-site design | ✅🆕 | Sample-design tools (forestry pack) reused |

Data: OpenAQ (T1), WAQI (T3), Sentinel-5P ✅ (T1 PC/EE), HydroBASINS (T1 PC), NASA POWER
(T1), SoilGrids (T1), CMIP6 downscaled ✅ (PC), FAOSTAT (T1).

---

## 8. Biology (Phase 3, cross-cuts ecology packs)

| Tool | Status | Implementation notes |
|---|---|---|
| Occurrence aggregation: GBIF 🔁, OBIS 🆕, iNaturalist 🆕 with taxon backbone matching | 🔁🆕 | GBIF species-match 🔁 pattern extended; WoRMS for marine 🔁 |
| Occurrence cleaning: duplicates, coordinate errors, sea/land swaps, flagging | 🆕✅ | DuckDB SQL ✅ + rule templates; cleaning report feeds provenance |
| Range metrics: EOO, AOO, extent-of-habitat, altitudinal range | 🆕 | Red List toolset (conservation pack) |
| Population & community: indices 🔁, rarefaction 🆕, species-accumulation curves 🆕 | 🆕 | Statistics over survey tables (DuckDB) + chart panels ✅ |
| Movement & migration: Movebank tracks, trip/trajectory visualisation, home-range (MCP/kde) | 🆕✅ | Movebank (T1); deck.gl TripLayer ✅; v1 convex-hull 🔁 → MCP home-range |
| Trait/environment joins: attach env values to occurrences (bioclim, land cover, distance-to-forest) | 🔁✅ | v1 environmental-fields pattern (Emperor bird-of-paradise sample) via `readRasterWindow` + spatial join ✅ |
| Survey & experimental design (random/stratified/systematic points, transects) | ✅🆕 | Design tools (forestry pack) |
| Phylo-biogeography context (endemism grids, range-size rarity) | 🆕 | Richness/rarity grids over cleaned occurrences; H3 ✅ |

Data: GBIF (T1), OBIS (T1), iNaturalist (T1), WoRMS (T1), Movebank (T1), IUCN Red List (T3).

---

## 9. Geography & education (curation pack — mostly ✅)

| Tool | Status | Implementation notes |
|---|---|---|
| Spatial statistics suite (Moran's I global/local, Gi*, ANN, KDE, emerging hot spots) | ✅ | Curate into a teaching menu with plain-language method notes; **DBSCAN 🆕** completes v1 parity |
| Terrain & geomorphology (slope, aspect, curvature, TPI, landforms, viewsheds) | ✅ | Whitebox terrain 59+ tools |
| Hydrology & catchments (flow accumulation, delineation, Strahler, topographic wetness) | ✅ | Whitebox 41+ |
| Geodesy & projections: equal-area reporting 🔁, UTM auto-detect 🔁, on-the-fly CRS, graticules | 🔁✅ | v1 units/UTM logic; graticule plugin ✅; ellipsoid catalogue ✅ |
| Discrete global grids (H3, S2, A5, DGGRID) | ✅ | DGGS tools ✅ — modern spatial-indexing teaching angle |
| Cartography: classification methods (equal interval, quantile, **Jenks** 🔁 verify parity, manual), 21–22 ramps, graduated/categorized symbology, auto legends, print layouts | ✅🔁 | Style stack ✅; port any missing classifier (Jenks) into symbology presets |
| Spatial SQL literacy (DuckDB over GeoParquet/FlatGeobuf) | ✅ | SQL Workspace ✅ + geography teaching templates |
| Fieldwork & GPS: GPX ✅, mobile PWA ✅, offline tiles (PMTiles ✅) | ✅ | Curate field-course workflow |
| Human geography: World Bank 🔁, FAOSTAT 🆕, census/SDG indicator choropleths, geodemographics | 🔁🆕 | Indicator connectors + admin joins |
| Classroom infrastructure: starter projects, admin-profile presets, capability lockdowns, share links for submission | ✅🆕 | GeoLibre mechanisms ✅ + GeoSpaX course templates 🆕 |
| Guided tutorials per pack (FR422 first) | 🆕 | Docs site (mkdocs ✅) + in-app templates |

---

## 10. Data-source access matrix (consolidated)

| Source | Domain(s) | Tier | Access notes |
|---|---|---|---|
| GBIF `api.gbif.org/v1` | bio/terr/cons | T1 | Keyless, CORS-friendly; v1 connector ports directly |
| OBIS `api.obis.org` | marine/bio | T1 | Keyless REST |
| iNaturalist API | bio/terr | T1 | Keyless |
| WoRMS | marine/bio | T1 | Keyless REST |
| Movebank | bio | T1 | Keyless for public studies |
| World Bank API | geog/NRM | T1 | v1 connector ports directly |
| FAOSTAT API | agri/for/geog | T1 | Keyless bulk API |
| SoilGrids `rest.isric.org` | agri/env | T1 | CC-BY 4.0; point + WMS |
| NASA POWER | agri/env | T1 | Public domain; point + subset |
| Overpass API | all | T1 | v1 + GeoLibre OSM downloader ✅ |
| CKAN: Pacific Data Hub / SPREP | NRM/marine/Oceania | T1 | pacificdata.org API; SPREP open licence |
| STAC / MS Planetary Computer | for/agri/env/marine | T1 | GeoLibre plugin ✅; Sentinel, Landsat, WorldCover, Hansen, GMW, GEBCO, HydroBASINS, canopy height, CMIP6 |
| Google Earth Engine | for/env | T1 | GeoLibre plugin ✅ (OAuth client configured via runtime-env) |
| NASA Earthdata | for/env | T1/T3 | GeoLibre plugin ✅ (token) |
| Natural Earth | geog | T1/T2 | v1 raw-GitHub pattern or GeoLibre plugin ✅ |
| WWF terrestrial ecoregions | terr | T2 | v1 static bundle |
| MEOW (VLIZ GeoServer WFS) | marine | T1 | v1 WFS endpoint; GeoLibre WFS ✅ |
| NOAA Coral Reef Watch | marine | T1/T2 | Tiles/ERDDAP |
| WDPA / Protected Planet `api.protectedplanet.net` | cons | **T3** | Free personal token; mandatory citation; cache per project |
| IUCN Red List API | cons/bio | **T3** | Token; status/range metadata |
| NASA FIRMS | for/env | **T3** | Free NASA key; CSV/WMS |
| Global Fishing Watch | marine | **T3** | Registered API token |
| WAQI | env | T3 | Free token |
| MaxEnt/elapid endpoint | terr/cons | **T4** | Sidecar `[sdm]` extra or interim Vercel function (v1 `api/sdm.py`); client GLM fallback always |

CORS verification is a Phase 3 task per connector (v1 proved GBIF/World Bank/Overpass in
production; others get a fetch-probe test before wiring, with T2/T4 fallback where blocked).

---

## 11. Pack → phase mapping (summary)

| Pack | Phases | Depends on |
|---|---|---|
| geospax-conservation (incl. SCP flagship) | 2, 5 | analysis core |
| geospax-sdm | 2 | analysis core, readRasterWindow |
| geospax-biodiversity | 3 | data core, DuckDB |
| geospax-forestry | 4 | EE/PC recipes, Whitebox LiDAR |
| geospax-marine | 4 | data core, MEOW/OBIS |
| geospax-agriculture | 5 | WLC engine, band math, SoilGrids/POWER |
| geospax-environment | 5 | hydro/Whitebox, S5P recipes |
| geospax-academic | 6 | provenance, print-layout export |
| geography/education | 1–7 (continuous curation) | admin profiles, templates |
