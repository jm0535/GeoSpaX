# GSX Agriculture

Assess crop condition, terrain constraints and multi-criteria land
suitability; model access with distance decay and compare cover through
time.

## Before you start

- A **raster with NIR and Red bands** (e.g. Sentinel-2) for crop-condition
  indices.
- A **DEM** for slope constraints.
- Optional polygon layers (field boundaries, cropped extents) for change
  analysis.

## Crop condition (NDVI)

1. Add your satellite raster (drag-and-drop a GeoTIFF/COG works).
2. Open **GSX Agriculture** and expand **Crop condition**.
3. Pick the raster, then the **NIR** and **Red** bands.
4. Set the **threshold** (0.3 is a common green-vegetation floor).
5. Run. The tool computes `(NIR − Red) / (NIR + Red)` over the current map
   view and adds a polygon layer of cells at or above your threshold.

The formula, bands and threshold are printed in the run summary and stored
in the output layer's metadata.

## Crop-condition zones

**Crop condition → reclassify** turns a continuous index into discrete
zones (e.g. poor / fair / good vigour) with explicit break values. Otsu
assistance is offered when the histogram supports it.

## Land suitability (WLC)

Weighted linear combination over polygon attributes:

1. Expand **Land suitability**, choose a layer and the criteria fields.
2. For each criterion set the **weight** and whether higher values are a
   benefit or a cost, plus any hard-constraint mask.
3. Run to get a per-polygon suitability score layer.

All weights and directions are exported with the result — nothing is hidden.

## Market / infrastructure access (distance decay)

Models exponential decay from features (markets, roads, irrigation):
choose the points/lines layer, set the decay rate and maximum distance,
and the tool writes a decay score per polygon.

## Terrain (slope)

Derives **Horn slope** from a DEM with the exact pixel ground size reported
and border pixels excluded — use it to mask steep, non-arable land.

## Change (T1 / T2)

- **Raster change** — compare two aligned rasters (e.g. NDVI at two dates);
  gains/losses and areas are reported with the sign convention stated.
- **Vector change** — diff two polygon extents (cropped area between
  seasons) with hectares gained/lost.

## Provenance & citation

The **Provenance** section exports the run ledger (every tool, input,
output and parameter) as a project record. See
[How to cite](index.md#citing-geospax) — cite GeoSpaX and your data
providers in any publication.
