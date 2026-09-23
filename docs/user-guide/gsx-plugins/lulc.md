# GSX LULC

Land-Use and Land-Cover mapping: derive cover indices from satellite
bands, reclassify them into class maps, quantify transitions between two
dates and validate against field polygons.

## Before you start

- A multispectral raster with NIR, Red, SWIR bands (Sentinel-2 or
  Landsat class sensors).
- Optional field-survey or reference polygons for validation.
- Two dates of imagery if you want transitions.

## Cover indices

1. Expand **Cover indices**, pick the raster and bands.
2. Choose **NDVI** (vegetation), **NDWI** (water), **NDBI** (built/bare)
   or a **custom** (A−B)/(A+B) pair.
3. Threshold and run — cells beyond the threshold become a first-pass
   cover-class polygon layer.

## Class mapping (reclassify)

Turn an index — or a coded classification raster — into a discrete
land-use/land-cover map (forest, cropland, settlement, water…) with
explicit break values. Otsu assistance is offered when the histogram
supports it.

## Transition analysis (T1 / T2)

- **Raster change** — two aligned cover rasters compared class-by-class;
  gain/loss per class in hectares, sign convention stated.
- **Vector change** — polygon class boundaries diffed between dates.

This is the standard two-date land-change matrix workflow.

## Field validation (overlay)

Clip, intersect or spatially join mapped classes against field-survey
polygons to check agreement before you report the map.

## Suitability & allocation (WLC)

Weight biophysical and accessibility criteria to model where a land use
could expand or should be restricted — all weights and directions export
with the surface.

## Provenance & citation

Every mapping decision (bands, thresholds, breaks) is recorded in the run
ledger. See [How to cite](index.md#citing-geospax).
