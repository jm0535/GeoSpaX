# GSX Environment

Slope and terrain analysis, normalized-difference spectral indices,
reclassification and aligned change detection for environmental assessment.

## Before you start

- A DEM for terrain work.
- Multispectral rasters for indices (NDVI, NDWI, NDBI, NBR or custom).

## Terrain

Derive Horn slope from a DEM with the exact pixel ground size reported and
border pixels excluded — for erosion risk, capability assessment or
engineering constraints.

## Spectral indices

Compute NDVI (vegetation), NDWI (water/wetness), NDBI (built/bare) or a
custom (A−B)/(A+B) band pair over the current map view, then polygonize
cells beyond a threshold. The formula and bands are printed with the
result.

## Raster analysis

- **Reclassify** — continuous raster to discrete classes, with Otsu
  assistance when the histogram supports it.
- **Raster change** — two aligned rasters compared; signed difference,
  gains/losses and areas reported with the method stated.

## Vector overlay

Intersect, clip, union or spatially join the extracted extents with your
study-area polygons for reporting.

## Provenance & citation

The run ledger exports every analysis for reproducibility. See
[How to cite](index.md#citing-geospax).
