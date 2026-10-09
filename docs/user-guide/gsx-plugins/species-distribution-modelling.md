# Species distribution modelling (SDM)

A complete, in-browser workflow from raw occurrence records to an evaluated
suitability map. It runs in the **Species models** section of
[GSX Conservation](conservation.md) and [GSX Biodiversity](biodiversity.md),
and the **Habitat modelling** section of [GSX Marine](marine.md).

```text
occurrence points ──► 1. Prepare environmental covariates ──► "+ covariates" layer
                          (CHELSA · Copernicus DEM ·             "background grid" layer
                           your own rasters · land mask)               │
                                                                       ▼
                       2. Species distribution model  ◄────────────────┘
                          (BIOCLIM · Mahalanobis · logistic)
                                   │
                                   ├─► spatially blocked cross-validation (AUC · TSS · Boyce)
                                   ├─► suitability raster layer + GeoTIFF download
                                   └─► scored point layer (inspection)
```

Every step writes a provenance stamp (`_geospax`) recording the method,
data sources, parameters and time, so exports and project files keep the
methodology.

---

## 1. Occurrence records

Load presence points with **Add Data** (CSV with longitude/latitude,
GeoJSON, GeoPackage…) or fetch them with the **GBIF / OBIS / iNaturalist**
connectors in GSX Biodiversity.

!!! tip "Clean first"
    Remove obvious errors (sea points for a terrestrial species, country
    centroids, duplicates), and consider thinning clustered records (e.g. one
    per grid cell or per 10 km). GBIF records cluster near towns and roads;
    that sampling bias weakens or distorts any SDM.

Your occurrence file may already carry environmental fields (for example
`bio1` in °C from WorldClim). **Do not mix them with covariates from a
different source** — see [Troubleshooting](#troubleshooting).

---

## 2. Prepare environmental covariates

**Species models → Prepare environmental covariates** turns occurrence
points into the two layers every SDM needs:

| Output layer | What it is |
|---|---|
| `<occurrences> + covariates` | Your records, each with the covariate values of the grid cell it falls in. Other attributes are kept. |
| `<occurrences> background grid` | One point per grid cell (cell centre) over the records' extent, carrying the same covariates. This is the **background / prediction** layer. |

### Grid

- **Grid cell size** (default 0.05° ≈ 5.5 km at the equator).
- **Buffer around records** (default 0.5°) extends the grid beyond the
  records. Set it to **0** if your own rasters are cropped tightly to the
  study area (see [local rasters](#your-own-rasters)).
- The grid is a regular WGS84 lon/lat grid (not equal-area); at most 1024
  cells per side.

### Restrict background to polygons (recommended)

Choose a land, country, province or study-area polygon layer (e.g. GADM
level-0/1 boundaries). Cells whose centre falls outside the polygons are
dropped; holes and multipolygons are handled. Records outside the mask are
kept as presences and reported.

!!! warning "Why the mask matters"
    CHELSA bioclim rasters contain **real climate values over the ocean**, so
    without a mask the background includes the sea. In the PNG test case,
    50,001 of 65,104 grid cells were ocean. A background that is mostly sea
    makes every model and every evaluation metric meaningless for a
    terrestrial species. The mask also defines the *accessible area* that
    presence-background methods assume.

### Covariate sources

You can combine any of the following; attribute names must be unique.

#### CHELSA v2.1 bioclim (1981–2010, ~1 km)

Tick any of BIO1–BIO19 (BIO1, BIO4, BIO12 and BIO15 are ticked by default).
They are read **directly from CHELSA over your grid only** — a few MB per
variable — using HTTP range requests; no map layer is created. On the web
app the requests go through the site's same-origin proxy (`/chelsa`).

| Variable | Meaning |
|---|---|
| BIO1 | Annual mean temperature |
| BIO2 | Mean diurnal range |
| BIO3 | Isothermality |
| BIO4 | Temperature seasonality |
| BIO5 / BIO6 | Max temperature of warmest month / min of coldest month |
| BIO7 | Temperature annual range |
| BIO8–BIO11 | Mean temperature of wettest / driest / warmest / coldest quarter |
| BIO12 | Annual precipitation |
| BIO13 / BIO14 | Precipitation of wettest / driest month |
| BIO15 | Precipitation seasonality |
| BIO16–BIO19 | Precipitation of wettest / driest / warmest / coldest quarter |

!!! note "CHELSA values are stored integers"
    Values are CHELSA's stored integers, not physical units. For example
    BIO1 = 2998 means 299.8 K (26.7 °C); BIO12 = 31006 means 3100.6 mm.
    Apply the scale/offset in the CHELSA v2.1 technical specification if you
    need physical units. BIOCLIM, Mahalanobis and the (standardised) logistic
    model are unaffected by this linear scaling, but **never mix CHELSA
    values with °C/mm values from another source in one model.**

Technical notes:

- CHELSA files are **striped GeoTIFFs, not tiled COGs**, so they cannot be
  displayed as map layers without downloading the whole file (~1 GB).
  Reading only the needed strips avoids that.
- Some CHELSA files carry no NoData tag. For integer rasters without one,
  the type's sentinel (65535 for unsigned 16-bit) is treated as missing.
  In the PNG test, 574 BIO12 cells held 65535.
- Each grid cell takes the raster pixel at its centre.

#### Elevation — Copernicus DEM GLO-90 (metres)

Tick **Elevation (Copernicus DEM GLO-90)** to add an `elev` attribute. The
tool mosaics the public 1° Cloud-Optimised GeoTIFF tiles, reading only a
small overview of each tile. The bucket's tile list identifies ocean (no
tile), so sea cells stay empty and cost no download. Transient download
errors are retried; any tile that still fails is reported as a warning so
missing elevation is never mistaken for sea. On the web app requests go
through `/copdem`.

> Copernicus DEM GLO-90 © DLR e.V. 2010–2014 and © Airbus Defence and Space
> GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA.

For PNG at 0.05° the build reads ~129 land tiles and skips ~58 ocean tiles
(about 40 s).

#### Your own rasters

Any raster already on the map can be a covariate:

1. **Add Data → open file** (GeoTIFF/COG). If the app warns that a file is
   "striped, not tiled" and offers to convert it, click **OK** — fine for
   small, cropped files. Converting to a COG beforehand avoids the prompt:
   `gdal_translate -of COG in.tif out.tif`.
2. Under **Raster layers on the map**, tick the layer and set its
   **Attribute** name. Names are suggested from the file name:
   `PNG_BIO1_30s.tif` → `bio1`, `wc2.1_30s_bio_15.tif` → `bio15`,
   `PNG_elevation_2.5m.tif` / `SRTM…` / `…dem` → `elev`.
3. Untick any CHELSA/Copernicus variable that would produce the same
   attribute name.

!!! warning "Rasters must cover the whole grid"
    Before sampling, the tool checks that each map raster reaches all four
    corners of the grid. If not it stops with a message such as
    *"does not cover the north-west, south-west corner(s)"*. This happens
    when a raster is cropped to the study area but the buffer extends the
    grid beyond it (e.g. into Indonesia west of 141°E). Fix it by setting
    **Buffer = 0** or by cropping the raster with a margin
    (e.g. `-projwin 140 0 157 -12.5`).

!!! danger "Categorical rasters"
    Do **not** use land-cover class codes (e.g. ESA WorldCover 10, 20 … 95)
    as covariates — the models treat them as quantities ("class 50 > class
    10"). Convert them to continuous layers such as % cover per cell first
    (see [recipes](#recipes-for-extra-covariates)).

### Results

The results table reports the grid size, background cells kept, cells
outside the mask, cells dropped for missing values, and how many records
have complete covariates. Warnings flag records outside the mask and DEM
tiles that failed.

---

## 3. Species distribution model

In **Species distribution model**:

1. **Presence points** → `<occurrences> + covariates`
   (**not** the original occurrence layer).
2. **Prediction layer** → `<occurrences> background grid`.
3. **Model** (below) and **Environmental variables** (only fields present on
   *both* layers are listed; use **Add variable** for more).
4. Optionally tick **Evaluate with spatially blocked cross-validation**.
5. **Fit and predict SDM**.

### Models

| Model | Output | Notes |
|---|---|---|
| **BIOCLIM** (percentile envelope) | *Limiting factor*: 1 inside the 5–95 % envelope on every variable, else 0. *Proportion in envelope*: share of variables inside (non-standard, graded). | Fast and transparent but binary; a wide-ranging species gives an envelope that covers almost everything. Reports `sdm_limiting_variables`. |
| **Mahalanobis D²** | Chi-square survival probability (0–1) or 1/(1+D). | Continuous; accounts for correlation between variables. Singular covariance is ridge-regularised and reported. Needs ≥ variables + 2 records. |
| **Presence-background logistic** | Relative suitability 0–1. | Class-balanced, L2-regularised linear logistic regression of presences against the background grid. A declared linear fallback — **not MaxEnt/elapid** and not a calibrated probability. Uses at most the chosen number of background rows. |

All models exclude records with missing values (never zero-filled) and
never fall back to coordinates.

### Choosing variables

- Use few, ecologically meaningful variables.
- Avoid strongly correlated pairs (|r| > 0.7). In PNG, `elev` and `bio1`
  are almost the same signal (r ≈ −0.9) — use one.
- Compare alternatives using the **cross-validated** metrics, not in-sample
  fit.

---

## 4. Evaluation: spatially blocked cross-validation

With the box ticked, the records and background are split into square
spatial **blocks** (default 1°), blocks are dealt into **k folds** (default
5) with a reproducible **seed** (default 42), and the model is refitted on
k − 1 folds and tested on the held-out fold each time. Holding out whole
blocks avoids the optimism that spatial autocorrelation causes in random
cross-validation (Roberts et al. 2017).

| Metric | Range | Reading |
|---|---|---|
| **ROC AUC** | 0–1 | Probability a held-out presence scores higher than held-out background. 0.5 = random; > 0.7 useful; > 0.8 good. With background (not true absences) it measures presence-vs-background discrimination. |
| **Max TSS** | −1–1 | Sensitivity + specificity − 1 at the best threshold. > 0.3 suggests skill. |
| **Continuous Boyce index** | −1–1 | Whether presences become more frequent than expected as suitability rises (Hirzel et al. 2006). Near 1 = good; ≈ 0 = random; < 0 = worse than random. Suited to presence-only data. |

The table shows mean ± SD across folds and a per-fold breakdown with test
counts. Folds without held-out presences or background are listed as
skipped — try larger blocks or fewer folds.

!!! note "Reading the metrics honestly"
    - **Max TSS is optimistic**: the threshold is chosen on each held-out
      fold. Weigh AUC and Boyce more heavily.
    - **Boyce needs continuous scores**. With binary (limiting-factor
      BIOCLIM) output it is reported as *Not computed*.
    - Small folds (few test presences) are noisy; look at the spread, not
      one fold.
    - Cross-validated scores are deliberately lower than in-sample fit.

---

## 5. Outputs

When the prediction layer is a covariate background grid, the tool adds:

- **`<subject> SDM — <model> (raster)`** — a continuous suitability map
  (viridis, 0 purple → 1 yellow) at the grid resolution, with masked/sea
  cells transparent. It behaves like any layer (visibility, opacity,
  order). Image rows are resampled to Web Mercator so cells stay aligned at
  any latitude.
- **Download suitability GeoTIFF** — single-band Float32, EPSG:4326,
  NoData −9999. Opens in QGIS, ArcGIS or R `terra` for thresholding, zonal
  statistics or overlay with protected areas.
- **Scored point layer** — every background cell with `sdm_suitability`
  (plus `sdm_d2` or `sdm_limiting_variables` depending on the model) for
  inspection with the identify tool.

The raster layer is not saved in the project file — re-run the SDM or keep
the GeoTIFF. On map renderers without a MapLibre map (ArcGIS, Cesium) only
the GeoTIFF is offered.

**Next steps:** load your protected areas (e.g. a GeoPackage) and use the
**Protection gap** section to ask how much suitable habitat is protected.

---

## Recipes for extra covariates

These use GDAL ≥ 3.6 (and QGIS for one step). They produce 0.05° COGs over
140–157°E, 12.5°S–0° — wider than PNG so they cover a buffered grid. Adjust
the extent (`-te xmin ymin xmax ymax`) for other regions.

Distances are computed in a metric projection (**UTM 55S, EPSG:32755**;
< 1 % scale error across PNG — pick the UTM zone for your area) and then
returned to WGS84; distances in EPSG:4326 would be in degrees.

### % of a land-cover class per cell (e.g. ESA WorldCover)

ESA WorldCover 2021 classes: 10 tree cover, 20 shrubland, 30 grassland,
40 cropland, 50 built-up, 60 bare, 70 snow/ice, 80 water, 90 herbaceous
wetland, **95 mangroves**, 100 moss/lichen.

```bash
# % mangrove (class 95) per 0.05° cell
gdal_calc.py -A PNG_WorldCover_2021_10m.tif --outfile=mangrove01.tif \
  --calc="(A==95)*100" --type=Float32
gdalwarp -r average -tr 0.05 0.05 -te 140 -12.5 157 0 -of COG \
  mangrove01.tif PNG_mangrove_pct_005.tif
```

Each 0.05° cell averages roughly 550 × 550 of the 10 m pixels, giving the
percentage of the cell in that class. Use `A==10` for % tree cover.

### Distance to mangrove (from WorldCover)

```bash
# 1. Mangrove mask, coarsened to ~100 m with "max" (any mangrove pixel counts)
gdal_calc.py -A PNG_WorldCover_2021_10m.tif --calc="A==95" --type=Byte \
  --NoDataValue=255 --outfile=mangrove_mask_10m.tif --co COMPRESS=DEFLATE
gdalwarp -t_srs EPSG:32755 -tr 100 100 -r max \
  -te 140 -12.5 157 0 -te_srs EPSG:4326 \
  -co COMPRESS=DEFLATE mangrove_mask_10m.tif mangrove_mask_utm100.tif

# 2. Distance in metres to the nearest mangrove pixel
gdal_proximity.py mangrove_mask_utm100.tif dist_mangrove_utm100.tif \
  -values 1 -distunits GEO -ot Float32 -co COMPRESS=DEFLATE

# 3. Back to WGS84 at 0.05° (cell mean) as a COG
gdalwarp -t_srs EPSG:4326 -tr 0.05 0.05 -te 140 -12.5 157 0 -r average \
  -of COG dist_mangrove_utm100.tif PNG_dist_mangrove_005.tif
```

Coarsening to 100 m before `gdal_proximity` avoids a proximity run over
billions of 10 m pixels.

### Global Mangrove Watch (GMW)

GMW v3.0 (2020 extent; Bunting et al. 2022) is a dedicated ~25 m mangrove
map, distributed as polygons via the Global Mangrove Watch website and its
Zenodo record. Clip it to your study area first. Prefer GMW for mangrove
variables and use WorldCover class 95 as a cross-check.

**% mangrove per cell (area overlap, QGIS):**

1. *Vector → Research Tools → Create Grid* — rectangle, extent
   `140,157,-12.5,0 [EPSG:4326]`, spacing 0.05 × 0.05 → `grid005.gpkg`.
2. *Processing → Overlap analysis* (`native:calculatevectoroverlaps`) —
   input `grid005`, overlay `GMW_2020_PNG`. Adds the **% of each cell's
   area** covered by mangrove (ellipsoidal areas, so degree cells are fine).
3. Rasterise that field (check its exact name, usually `<layer>_pc`):

```bash
gdal_rasterize -a GMW_2020_PNG_pc -tr 0.05 0.05 -te 140 -12.5 157 0 \
  -ot Float32 -a_nodata -9999 -init 0 grid005.gpkg tmp.tif
gdal_translate -of COG tmp.tif PNG_gmw_mangrove_pct_005.tif
```

Rasterising the polygons straight onto 0.05° cells would make each cell
all-or-nothing; the area overlap gives a true percentage.

**Distance to mangrove from GMW:**

```bash
# Reproject polygons, burn at 25 m (all-touched keeps thin fringes)
ogr2ogr -t_srs EPSG:32755 GMW_2020_PNG_utm55.gpkg GMW_2020_PNG.gpkg
gdal_rasterize -burn 1 -at -tr 25 25 -ot Byte -init 0 \
  -te 140 -12.5 157 0 -te_srs EPSG:4326 \
  GMW_2020_PNG_utm55.gpkg gmw_mask_utm25.tif
# Coarsen to 100 m if slow, then distance and back to 0.05°
gdalwarp -tr 100 100 -r max gmw_mask_utm25.tif gmw_mask_utm100.tif
gdal_proximity.py gmw_mask_utm100.tif dist_gmw_utm100.tif \
  -values 1 -distunits GEO -ot Float32
gdalwarp -t_srs EPSG:4326 -tr 0.05 0.05 -te 140 -12.5 157 0 -r average \
  -of COG dist_gmw_utm100.tif PNG_dist_mangrove_gmw_005.tif
```

If `-te_srs` is rejected by your GDAL version, pass the extent in UTM
metres instead.

### Using derived layers

- Add Data → the COG → tick it under *Raster layers on the map*; name the
  attributes e.g. `mangrove_pct`, `dist_mangrove`.
- Distances are highly skewed (0 m at the coast, hundreds of km inland).
  For the logistic model consider `log10(distance + 100)`:
  `gdal_calc.py --calc="log10(A+100)"` in step 3.
- `dist_mangrove` correlates with `elev`; compare runs with each and both
  using the cross-validated metrics.
- Point sampling takes the value at the cell centre (no averaging), so
  pre-aggregate fine rasters to the grid resolution with `-r average` as in
  the recipes.

---

## Worked example: *Varanus indicus* in Papua New Guinea

210 GBIF records; mask `png_provinces`; 0.05° grid (313 × 208 cells):
15,103 land background cells kept, 50,001 sea cells removed; 210/210
records complete.

| Run | Variables | CV AUC | Max TSS | Boyce |
|---|---|---|---|---|
| BIOCLIM, limiting factor | bio1, bio4, bio12, bio15 | 0.47 ± 0.11 | 0.06 ± 0.13 | not computed (binary) |
| Mahalanobis, chi-square | bio1, bio12 | 0.54 ± 0.14 | 0.26 ± 0.17 | −0.04 ± 0.31 |

Interpretation: broad-scale climate barely separates the species from the
available land in PNG, which is uniformly warm and wet across the lowlands —
a valid ecological result for a widespread lowland/coastal generalist.
BIOCLIM's envelope covered nearly the whole country. The next variables to
test are elevation, tree cover, % mangrove and distance to mangrove, judged
by the cross-validated AUC and Boyce index, with occurrence thinning to
reduce town-clustered sampling bias.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Only some variables appear in the SDM dropdown | Only fields on **both** layers are listed. Select `+ covariates` as presence points, not the original occurrence layer. |
| AUC ≈ 0.5 or below after a run that "looked fine" | Check you did not mix presences from one source (e.g. your file's `bio1` in °C) with a CHELSA background (stored integers). Use the `+ covariates` and `background grid` pair. |
| Background covers the sea | No mask chosen — pick a land/study-area polygon layer and rebuild. |
| "does not cover the … corner(s) of the grid" | A map raster is smaller than the grid. Set Buffer = 0 or use a raster with a margin. |
| "Could not read CHELSA …" / "Could not read elevation" | Network or proxy problem; retry. For DEM, failed tiles are listed in the warning. |
| Prompt: GeoTIFF is "striped, not tiled" | Click OK for small local files, or convert to a COG first. Never add CHELSA as a map layer — tick it in the covariate list instead. |
| Boyce shows "Not computed" | Scores are binary or nearly so (limiting-factor BIOCLIM). Use Mahalanobis, logistic, or BIOCLIM "proportion". |
| SDM output looks like one flat colour | That is the point layer; use the `(raster)` layer, or style the points by `sdm_suitability` in the Style panel. |
| Many folds skipped | Too few records per block; increase block size or reduce folds. |

---

## References

- Bunting, P. et al. (2022). Global Mangrove Extent Change 1996–2020: Global
  Mangrove Watch Version 3.0. *Remote Sensing* 14, 3657.
- Hirzel, A. H. et al. (2006). Evaluating the ability of habitat suitability
  models to predict species presences. *Ecological Modelling* 199, 142–152.
- Karger, D. N. et al. (2017). Climatologies at high resolution for the
  earth's land surface areas. *Scientific Data* 4, 170122. (CHELSA)
- Roberts, D. R. et al. (2017). Cross-validation strategies for data with
  temporal, spatial, hierarchical, or phylogenetic structure. *Ecography* 40,
  913–929.
- Zanaga, D. et al. (2022). ESA WorldCover 10 m 2021 v200. Zenodo.
- Copernicus DEM GLO-90 — European Space Agency / Copernicus programme.
