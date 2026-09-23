# GSX Soil

Map soil condition from wetness and salinity proxies, delineate capability
classes, model land capability and track soil-extent change.

## Before you start

- Multispectral imagery (SWIR + NIR bands enable salinity/bare-soil
  ratios; NDWI needs NIR + SWIR or Green + NIR).
- Soil-property rasters (pH, organic carbon, conductivity) or survey
  polygons as available.

## Moisture & salinity proxies

Compute **NDWI** for soil-wetness patterns, or a **custom**
(SWIR−NIR)/(SWIR+NIR)-style ratio as a salinity / bare-soil proxy, and
extract the extent beyond a threshold.

## Capability classes (reclassify)

Turn a soil-property raster into discrete capability or constraint classes
with explicit break values — the standard soil-capability classification
step. Otsu assistance is offered when the histogram supports it.

## Land capability (WLC)

Combine soil, slope, drainage and climate attributes with explicit weights
and benefit/cost directions into a transparent land-capability surface.
Add **distance decay** from management access (roads, amendments supply)
as a logistics criterion.

## Survey overlays

Clip or spatially join soil-survey polygons and sample points against the
mapped classes to assemble a coherent picture for the study area.

## Soil-extent change (T1 / T2)

- **Raster change** — two campaigns of a soil property compared, with the
  sign convention stated.
- **Vector change** — survey-boundary diffs between campaigns.

## Provenance & citation

Every parameter is recorded in the run ledger. See
[How to cite](index.md#citing-geospax).
