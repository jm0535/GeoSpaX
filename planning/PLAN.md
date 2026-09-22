# GeoSpaX Product Plan — v2 (researched & validated)

**Date:** 2026-09-22
**Product:** GeoSpaX — specialised natural-resources & environmental-science web GIS
**Platform:** GeoLibre (full stack, unmodified internals) — `opengeos/GeoLibre`
**Lineage:** GeoSpaX v1.4.2 (`jm0535/map-kit`, Leaflet/vanilla-JS) → GeoSpaX v2 (this plan)
**Target repo:** `jm0535/geospax` (to be seeded per §4.2)
**Constraint honoured:** nothing is ever written to `jm0535/map-kit`; it stays live until parity, then is archived.

---

## 1. Mission & positioning

> **GeoSpaX: the zero-install GIS workstation for natural-resource science — everything
> GeoLibre does, plus a validated conservation, ecology, forestry, marine, agricultural and
> environmental toolbox, with an Oceania data specialisation no other web GIS offers.**

Three positioning pillars, each researched (evidence in §2 and `DOMAIN_TOOLBOX.md`):

1. **Best-of-both, no compromise.** Keep *all* of GeoLibre (4 renderers, DuckDB-WASM spatial
   SQL, 775 Whitebox WASM tools, deck.gl/Cesium, STAC/Planetary Computer/Earth Engine,
   Pyodide GeoPandas, collab/share workers, i18n, desktop/mobile/Jupyter delivery) and add
   *all* of GeoSpaX v1's domain tools (SDM, WLC, protection gap, fragmentation,
   connectivity, change detection, equal-area reporting, provenance, citations) ported from
   its fixed, tested algorithm cores.
2. **Domain packs for eight fields.** Agriculture, marine ecology, terrestrial ecology,
   environmental science, geography, forestry, biology, conservation — each a curated pack
   (data catalogue + tools + guided workflows + sample projects + docs) over shared
   analysis primitives, not eight separate apps.
3. **Genuine firsts.** Browser-native systematic conservation planning (MARXAN/prioritizr-class
   MILP via HiGHS-WASM — today only exists in R/desktop or invitation-only pilots), IUCN
   Red List assessment support (EOO/AOO/Criterion B grids), one-click academic assessment
   reports with provenance and citations, and a Pacific/Oceania data hub (SPREP Pacific Data
   Hub, Coral Triangle, PNG national datasets) — nationally relevant to Papua New Guinea and
   regionally unique.

Audience: university teaching (FR422 and beyond at Unitech), Pacific regional agencies
(SPREP, CTI-CFF, FAO Pacific, national environment/forestry/fisheries authorities),
conservation NGOs, and researchers at institutions that cannot afford desktop GIS licences.

---

## 2. Validation verdict: is this plan appropriate and good?

**Verdict: YES — validated, with four conditions (§2.5).** Research findings:

### 2.1 Platform fit — every proposed capability has a verified GeoLibre host surface

| Capability class | Verified GeoLibre mechanism (checked in code, v1 plan Appendix B) |
|---|---|
| Domain UI (panels, menus, controls) | Plugin API: right panels, floating panels, toolbar menus, map controls; `getProjectState`/`applyProjectState` persists pack state inside project files |
| Species/environmental raster sampling for SDM & WLC | `app.readRasterWindow(layerId, {bounds, width, height, band})` — correct grid sampling, replacing v1's buggy first-vertex/nearest-neighbour extraction |
| Vector geoprocessing (overlay, buffers, joins, grids) | `@geolibre/processing` vector tools (clip/intersect/difference/union/dissolve/spatial join/grid/voronoi/hex) + optional projection-aware GeoPandas engine via sidecar **or Pyodide in-browser** |
| Spatial statistics (Gi*, LISA, Moran's, NNI, KDE) | `statistics-tools.ts` — already present; DBSCAN is the one small gap |
| Terrain, hydrology, LiDAR, remote sensing, ML classification, change detection | 775-tool Whitebox WASM catalogue: 10 change-detection tools, 25 classification tools (incl. Random Forest/SVM/OBIA), 41+ hydrology tools, 54+ LiDAR tools, cost-distance for connectivity |
| Global environmental raster data | STAC + Microsoft Planetary Computer + Google Earth Engine + NASA Earthdata plugins already ship — Sentinel-2/Landsat (NDVI family), Hansen tree cover/loss, ESA WorldCover, GEBCO bathymetry, canopy height, HydroBASINS are catalogue entries, not new infrastructure |
| Token-gated data (WDPA, IUCN, FIRMS, Mapbox…) | Runtime environment variables (`window.__GEOLIBRE_RUNTIME_ENV__`, Settings → Environment Variables, masked fields) — a first-class mechanism |
| Server-side models (MaxEnt/elapid) | FastAPI sidecar pattern with optional extras + `/status` capability probes + graceful client fallback (the documented `vector` extra pattern) |
| Classroom/lab lockdown & UI curation | `admin-profile.json` (lockable UI profiles) + deployment capabilities (fail-closed grants) |
| Academic reporting | Print Layout Designer + export pipeline + project sharing workers |
| Animation of change/time series | Time Slider plugin (COG/XYZ/WMS-Time/GeoJSON) |

Conclusion: the plan adds **no new infrastructure class**. Every domain tool lands on an
existing, documented surface. That is the strongest possible signal that the approach is
"appropriate" for this platform.

### 2.2 Ecosystem gap — the specialisation is genuinely novel

- Systematic conservation planning (SCP): **prioritizr** solves min-set/max-coverage MILPs
  in R via HiGHS/CBC/Gurobi (https://prioritizr.net, Hanson et al. 2024); **Marxan** uses
  simulated annealing on desktop; **Zonation** ranks on desktop; **Marxan Web** (TNC + EC
  JRC BIOPAMA) remains a piloted, closed platform (https://marxansolutions.org/software/).
  HiGHS is proven in the browser via WASM (`highs-js`, `highs-wasm` — LP/MILP/QP entirely
  client-side, https://github.com/lovasoa/highs-js, https://github.com/fuglede/highs-wasm).
  ⇒ **Open, browser-native SCP with exact MILP solvers does not exist. GeoSpaX can be the
  first**, with greedy heuristics (v1's `GSX.priorityAreas` scoring already exists) as the
  fallback for very large planning-unit sets.
- No general web GIS (ArcGIS Online, QGIS-web stacks, MapLibre apps) offers Red List
  EOO/AOO workflow tools, GBIF/OBIS connectors + SDM + gap analysis as one integrated,
  zero-install pipeline.
- Pacific/Oceania data specialisation: SPREP's **Pacific Data Hub** (pacificdata.org /
  pacific-data.sprep.org, CKAN-based, open licence) hosts PNG & Coral Triangle coastal/marine
  datasets; no web GIS curates them. PNG is a Coral Triangle nation with world-class
  biodiversity — a defensible, mission-aligned niche.

### 2.3 Data-source feasibility — verified access patterns

Open, keyless, browser-reachable APIs (Tier 1): GBIF (already used by GeoSpaX v1), OBIS
(`api.obis.org`), iNaturalist, WoRMS, Movebank, World Bank (already used), FAOSTAT, ISRIC
**SoilGrids** (`rest.isric.org`, CC-BY 4.0), **NASA POWER** (public domain climate),
Overpass (already used), CKAN endpoints (Pacific Data Hub, Natural Earth raw).
Token/key-gated (Tier 3, handled by GeoLibre's runtime-env mechanism): **WDPA**
(`api.protectedplanet.net`, free personal token, citation terms —
https://github.com/FRBCesab/worldpa), **IUCN Red List API**, **NASA FIRMS** (free NASA key).
Heavy/licensed rasters (Tier 2/1 via existing plugins): Hansen, ESA WorldCover, Sentinel-2,
GEBCO, canopy height, HydroBASINS through Planetary Computer/STAC/Earth Engine; NOAA Coral
Reef Watch via tiles/ERDDAP. Full table in `DOMAIN_TOOLBOX.md` §10.

### 2.4 GeoSpaX v1 assets are portable by construction

The conservation roadmap's own audit left v1's domain logic as dependency-free, tested
modules (`geospax-conservation*.js`, `geospax-sdm-fix.js`, `geospax-raster.js`,
`geospax-project.js` — ~3.8k lines, 302 unit assertions, turf+proj4 only). They port to
TypeScript cleanly; only UI wrappers are rewritten as plugin panels. The 677 Playwright
regressions map onto GeoLibre's existing `e2e/` harness.

### 2.5 The four conditions (what makes the plan *good* rather than merely possible)

1. **Thin-diff rule.** All GeoSpaX content lives in *new additive files* (workspace packages,
   bundled plugin drop-ins, `admin-profile.json`, sample data, planning docs). Upstream files
   are touched only by a small, scripted branding patch-set. This keeps `opengeos/GeoLibre`
   syncs mechanical — non-negotiable, because upstream pushes daily (PR #2544 merged on
   2026-09-22; 7.5k stars, 805 forks).
2. **Pack discipline.** Eight fields share one primitive library (`packages/geospax-analysis`);
   packs are data catalogues + workflow UX + docs, sequenced by the roadmap (§5), never
   built all at once. Scope creep is the plan's biggest risk; packs are its containment.
3. **Rigour as a feature.** Carry v1's audit culture forward structurally: no silent method
   fallbacks (results declare the method actually run), equal-area units for every area
   figure, model evaluation (AUC/TSS/k-fold) on every SDM, and provenance + citation metadata
   on every layer and report. This is what makes GeoSpaX defensible in coursework and
   publications — its real differentiator vs. "another map app".
4. **Licence hygiene.** GeoLibre is MIT (retain LICENSE/copyright, add NOTICE, cite both
   works, no endorsement claims). Data licences differ per source (WDPA terms & citation,
   Hansen/ESA attribution, SPREP open licence, GBIF CC by dataset) — the provenance system
   records per-layer licence strings so exports and reports stay compliant automatically.

---

## 3. Product definition — "everything GeoLibre plus all GeoSpaX plus more"

```
GeoSpaX v2 =
    GeoLibre platform (100%, unmodified internals; curation via profiles, never deletion)
  + GeoSpaX v1 domain suite (ported: SDM, WLC, gap, fragmentation, connectivity,
    change-detect UX, reclassify/Otsu/polygonize, equal-area, provenance, citations,
    GBIF/ecoregion/World Bank connectors, .gspx projects, sample datasets)
  + Domain packs (§6, DOMAIN_TOOLBOX.md): conservation & SCP, terrestrial ecology,
    marine ecology, forestry, agriculture, environmental science, biology, geography
  + Oceania specialisation: Pacific Data Hub / SPREP / Coral Triangle / PNG catalogues,
    regional basemap & sample projects
  + Academic & classroom layer: assessment reports, citation engine, starter project
    templates, admin profiles, deployment-capability presets
```

Nothing is removed from GeoLibre. Irrelevant-to-domain surface (flight simulator, CCTV feeds,
street view…) stays in the platform but is hidden by the shipped GeoSpaX `admin-profile.json`
preset — reversible per deployment, exactly as upstream designed it.

---

## 4. Architecture & repository strategy

### 4.1 Validated architecture (Option C from v1 — confirmed by your direction)

```
jm0535/geospax                       # product repo, seeded from GeoLibre (full history)
│   upstream remote → opengeos/GeoLibre (sync by merge; branding re-applied by script)
│
├── apps/geolibre-desktop/           # shell, untouched except branding patch-set
│   ├── public/admin-profile.json    # GeoSpaX curated UI preset (new file)
│   ├── public/samples/geospax/…     # v1 PNG/Oceania datasets + new pack samples (new files)
│   ├── public/projects/geospax/…    # starter project templates per pack/course (new files)
│   └── public/plugins/              # built plugin drop-ins, activeByDefault (new files)
│       ├── geospax-conservation/    #   SCP, gap, WLC, fragmentation, connectivity
│       ├── geospax-sdm/             #   BIOCLIM, Mahalanobis, MaxEnt(+eval)
│       ├── geospax-biodiversity/    #   GBIF, OBIS, iNat, indices, Red List metrics
│       ├── geospax-marine/          #   MEOW, bathymetry, SST/CRW, mangroves, MPA
│       ├── geospax-forestry/        #   Hansen/GLAD workflows, LiDAR curation, inventory, FIRMS
│       ├── geospax-agriculture/     #   indices, soils, ET₀/GDD, land evaluation
│       ├── geospax-environment/     #   air/water quality, hydro basins, carbon, EIA
│       └── geospax-academic/        #   citations, provenance table, one-click reports
│
├── packages/geospax-analysis/       # pure-TS algorithm core (no UI): sdm, wlc, gap,
│                                    #   fragmetry, connectivity graphs, equal-area,
│                                    #   reclassify/Otsu/polygonize, biodiversity indices,
│                                    #   EOO/AOO, SCP (greedy + HiGHS-WASM MILP), DBSCAN
│                                    #   — golden-value tests ported from v1's 302 assertions
├── packages/geospax-data/           # connector core: tiered fetchers (CORS-direct, static
│                                    #   assets, token via runtime-env, sidecar proxy),
│                                    #   catalogue metadata incl. licence & citation strings
├── packages/geospax-plugins/        # GeoLibrePlugin definitions + panels; vite lib build
│                                    #   emits the public/plugins/* drop-ins (npm script)
└── backend/geolibre_server/…/sdm.py # OPTIONAL Phase 5: elapid MaxEnt behind [sdm] extra
                                     #   (port of map-kit api/sdm.py), /sdm/status probe,
                                     #   client-side logistic GLM fallback (Pyodide or TS)
```

Rules: plugins never mutate MapLibre directly (store-driven flow per `CLAUDE.md`); heavy
numerics run in workers inside plugin bundles; every result layer carries provenance
(source, licence, date, method, parameters); plugin state persists in projects so a
coursework submission is one file that reopens complete.

### 4.2 Repository seed & GitHub access — RESOLVED (2026-09-22)

The product repo is **[`jm0535/GeoSpaX`](https://github.com/jm0535/GeoSpaX)**: the fork of
`opengeos/GeoLibre` (previously named `jm0535/GeoLibre`), renamed by the owner. Verified:
`fork: true`, `parent: opengeos/GeoLibre`, default branch `main`, and the work session's
GitHub installation now resolves to `jm0535/GeoSpaX`. Because GitHub renames keep the
repository identity, the session branch (`arena/01a0c905-geolibre`) and its pushed commits
live on the renamed repo unchanged.

Working setup (already applied in the working tree):

```
origin    https://github.com/jm0535/GeoSpaX.git      (fetch + push)
upstream  https://github.com/opengeos/GeoLibre.git   (fetch only; push DISABLED)
```

Sync ritual: `git fetch upstream && git merge upstream/main` → resolve (branding files:
take upstream, re-run `python3 scripts/geospax/rebrand.py`) → `npm run ci` → push.
`jm0535/map-kit` is untouched and remains live at `geospax.in4metrix.dev` until the
Phase 7 parity cutover.

---

## 5. Phased roadmap

Effort: one experienced developer + AI assistance. XS ≤ 1 day · S ≤ 3 days · M ≤ 2 weeks · L ≤ 4 weeks.
Phases 0–2 are the critical path to a usable product; packs 3+ sequence by national/teaching value.

| Phase | Deliverable | Effort | Exit criterion |
|---|---|---|---|
| **0. Seed & hygiene** | `jm0535/geospax` seeded (§4.2); upstream remote; sync ritual documented; branding patch script; CI green baseline (`npm run ci`, `lite:build` for Vercel/GH Pages) | XS–S | Repo builds and deploys a preview identical to GeoLibre |
| **1. Identity & curation** | Branding patch-set (title/PWA/i18n app-name/About/CITATION dual-attribution/logo); GeoSpaX `admin-profile.json` preset; `.gspx` extension alias; v1 sample datasets + 2–3 FR422 starter projects; staging deploy | S–M | A stranger sees "GeoSpaX — natural-resources & environmental-science GIS", not GeoLibre; starter projects open complete |
| **2. Analysis core + conservation pack** | `packages/geospax-analysis` (equal-area first, then ported SDM/WLC/gap/fragmetry/connectivity/reclassify/DBSCAN with golden tests); `geospax-conservation` + `geospax-sdm` drop-ins; change-detection UX over Whitebox + Time Slider; provenance on every result | M–L | **FR422 Part A (A1–A5) fully reproducible in GeoSpaX v2**; method declarations honest (no silent fallbacks) |
| **3. Biodiversity & data pack** | `geospax-data` tiered connectors; `geospax-biodiversity` plugin: GBIF (v1 parity: common+scientific name, pagination), OBIS, iNaturalist, WoRMS, WWF/MEOW ecoregions, World Bank; biodiversity indices (richness/Shannon/Simpson/Chao1/rarefaction over DuckDB tables); Red List EOO/AOO/Criterion-B grid tools | M | Occurrence→indices→range-metrics→gap workflow runs keyless in-browser |
| **4. Forestry + marine packs (Oceania priority)** | Forestry: Hansen loss/GLAD-alert recipes via EE/PC plugins, LiDAR curation (Whitebox 54+), inventory/plot tools (basal area, stratified sampling design), FIRMS fires (token tier), NBR band-math recipes. Marine: GEBCO bathymetry, NOAA CRW SST/bleaching, mangrove extent (Global Mangrove Watch), coastal transect/shoreline change, CTI/SPREP Pacific Data Hub catalogue | M–L | A PNG forestry and a Coral Triangle marine demo project each ship as starter templates |
| **5. Agriculture, environment & SCP flagship** | Agriculture: NDVI/EVI/SAVI/NDWI band-math on Sentinel-2/Landsat (PC/EE), SoilGrids point+layer queries, NASA POWER ET₀ (Hargreaves/FAO-56) & GDD, FAO-style land evaluation reusing the WLC engine, FAOSTAT choropleths. Environment: OpenAQ/WAQI, Sentinel-5P NO₂/CH₄ recipes, HydroBASINS + Whitebox watershed delineation, carbon-stock estimation, EIA overlay workflow. **SCP flagship:** HiGHS-WASM min-set/max-coverage with representation targets + boundary-length penalty; greedy fallback; Marxan-compatible CSV import/export | L | SCP solves a 10k-planning-unit min-set problem in-browser in seconds; agri & environment demos ship |
| **6. Academic layer & reports** | `geospax-academic`: How-to-Cite panel (APA/Chicago/Harvard/BibTeX), provenance table view, **one-click assessment report** (methods+params+figures+licences+citations → HTML/PDF via print-layout path); AI-assistant system prompt re-skinned as conservation copilot; MCP authoring recipes for lab notebooks | M | A student produces the FR422 Part B conservation-plan document from the app in one click |
| **7. Parity, migration, retirement** | Port critical Playwright paths to `e2e/`; rewrite user guides against new UI; `geospax.in4metrix.dev` cutover (v1 kept at `/classic` one semester); archive `map-kit` with pointer README; optional: desktop/mobile branding builds, marketplace publication of packs so upstream GeoLibre users can install GeoSpaX tools | M | Parity checklist (v1 §2.2 crown jewels) all green in production |

Parallel threads: upstream sync weekly (merge `opengeos/GeoLibre` → product; re-apply
branding script; run CI); contribute genuinely generic wins upstream (DBSCAN tool,
equal-area reporting mode, GBIF connector) to shrink fork surface.

---

## 6. Domain-pack model

A **pack** = catalogue + tools + workflows + samples + docs over shared primitives:

1. **Data catalogue** — curated, licence-annotated sources per field (tiered access §2.3),
   surfaced in Add Data and a per-pack browser panel.
2. **Tools** — mostly *compositions*: existing GeoLibre/Whitebox/processing capabilities
   wired into domain UX (e.g., "Forest change report" = Whitebox change detection +
   equal-area + provenance + report template), plus new algorithms only where nothing
   exists (SCP solver, EOO/AOO, occupancy).
3. **Guided workflows** — Processing-Modeler graphs saved as templates (GeoLibre has
   `model-graph.ts`) so multi-step methods are one click and fully citable.
4. **Sample projects** — real datasets as `.geolibre`/`.gspx` files with pack plugin state,
   doubling as teaching artefacts and regression fixtures.
5. **Docs & citations** — per-pack method notes (the v1 audit culture: what the tool
   actually computes, assumptions, references) rendered in-app.

Pack sequencing rationale: conservation/terrestrial first (v1 algorithms exist and are
tested — fastest path to parity and teaching value); forestry & marine next (PNG national
priorities: tropical forests + Coral Triangle seas); agriculture & environment after
(reuse WLC/indices primitives); geography/biology are largely curation of what GeoLibre
already has (spatial stats, terrain, DGGS, occurrence data) plus education templates.

Full per-field tool and data catalogues: **`DOMAIN_TOOLBOX.md`**.

---

## 7. Flagship differentiators (marketing-defensible claims)

1. **First open browser-native systematic conservation planning** — exact MILP
   (HiGHS-WASM, prioritizr-class objectives) plus heuristic ranking, no server, no R, no
   licence. Marxan Web is a closed pilot; Zonation/Marxan/prioritizr are desktop/R.
2. **Red List assessment support in a web GIS** — EOO (convex hull), AOO (2 km grid),
   Criterion B sub-metrics, occurrence cleaning — from GBIF/iNat/OBIS pull to assessment
   figures without leaving the browser.
3. **One-click, citation-grade assessment reports** — methods, parameters, figures,
   data licences, dual citations; provenance travels with every layer and export.
4. **Oceania data hub** — Pacific Data Hub/SPREP, Coral Triangle MPA context, PNG national
   samples, regional basemaps — the only web GIS curating Pacific natural-resource data.
5. **Zero-install rigour** — equal-area hectares, honest method declarations, AUC/TSS on
   every SDM: the audit culture of v1's roadmap, enforced by architecture.
6. **Classroom-ready by design** — lockable admin profiles, deployment capabilities,
   starter projects, sharing links for submission; one URL replaces a computer lab.

---

## 8. Licensing & attribution

- **Code:** GeoLibre MIT — retain LICENSE & copyright headers; add `NOTICE` ("GeoSpaX is
  built on GeoLibre (MIT), © Qiusheng Wu & contributors"); never imply endorsement.
- **Citation:** `CITATION.cff` cites both Moses (2026) GeoSpaX and the GeoLibre DOI
  (10.5281/zenodo.20785400); the in-app How-to-Cite panel ships both, per v1's format set.
- **Data:** per-layer licence strings captured at fetch time (GBIF dataset licences,
  WDPA terms + mandatory citation, Hansen/ESA/ISRIC attribution, SPREP open licence,
  NOAA/FAO/World Bank terms) and printed on exports/reports. WDPA requires a personal API
  token — a Settings-gated Tier 3 source with the citation auto-attached.

---

## 9. Risks & mitigations

| Risk | L | I | Mitigation |
|---|---|---|---|
| Scope explosion across 8 fields | High | High | Pack discipline (§6); sequenced phases; shared primitives; each pack independently shippable/deferrable |
| Upstream churn breaks branding/assumptions | High | Med | Thin-diff rule; branding as re-appliable script/patch; weekly sync + CI; plugin API is versioned (`minGeoLibreVersion`) |
| HiGHS-WASM performance on large SCP problems | Med | Med | Greedy/heuristic tier first (v1 `priorityAreas` seed); planning-unit aggregation; chunked solve in worker; document honest limits (prioritizr benchmarks show HiGHS scales well) |
| Data licence non-compliance | Med | High | Provenance-by-construction (§8); Tier 3 tokens keep WDPA/IUCN terms user-accepted; licence strings printed on exports |
| Numeric parity v1 JS → v2 TS | Med | High | Port the *fixed* `geospax-sdm-fix.js` semantics; 302 assertions as golden-value tests; method declarations in results |
| Single maintainer | Med | High | Additive-file architecture; packs publishable to the GeoLibre marketplace (community can adopt); upstream contributions reduce fork surface |
| CORS/token friction on connectors | Med | Low | Tiered model (§2.3): direct-fetch where open, static/pre-tiled assets where heavy, runtime-env tokens where gated, sidecar proxy as last resort |
| Migration confuses v1 users/students | Low | Med | map-kit stays live; in-app "classic" link; rewritten FR422 guides before cutover |
| Heavy web build on static hosts | Low | Low | `npm run lite:build` exists for per-asset-cap hosts (Vercel/GH Pages); Docker/nginx for self-host |

---

## 10. Success metrics

- **Teaching:** FR422 Part A+B completed end-to-end by a student in GeoSpaX v2 only (parity gate for cutover); ≤ 5 min from URL to first analysis.
- **Rigour:** 100% of analysis layers carry provenance + method declaration; every SDM reports evaluation metrics; zero silent method fallbacks (assertion-tested).
- **Platform:** upstream sync merges land weekly with conflicts confined to the branding patch-set; `npm run ci` green.
- **Reach (12 months):** packs installable by upstream GeoLibre users via marketplace; ≥ 3 external institutions using classroom profiles; SCP tool used in ≥ 1 real planning exercise.

---

## 11. Decisions

### Decision log (confirmed 2026-09-22)

| # | Decision | Outcome |
|---|---|---|
| 1 | Proceed to implementation | **Confirmed** — Phase 0–1 started immediately |
| 2 | Repo seed style | **Fork-and-rename** — `jm0535/GeoSpaX` (fork of `opengeos/GeoLibre`, renamed; §4.2 resolved) |
| 3 | Product spelling | **GeoSpaX** (capital X, v1 brand) |
| 4 | Pack sequencing | **As planned** — conservation → biodiversity → forestry + marine → agriculture + environment → academic/reports |

### Still open (defaults apply until decided)

5. **MaxEnt path:** default = client-side logistic GLM first → optional sidecar elapid
   (`[sdm]` extra) later; v1's Vercel function available as interim hosted endpoint.
6. **`.gspx` extension:** default = alias alongside `.geolibre` in Phase 2+ (additive patch
   to save dialogs; both readable).
7. **Upstream contributions:** default = yes for generic wins (DBSCAN, equal-area reporting,
   GBIF connector) to shrink fork surface.
