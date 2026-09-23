# GSX Hydrology

Map surface water and wetness, derive runoff-relevant terrain constraints,
weight catchment characteristics and quantify water-extent change.

## Before you start

- Multispectral imagery for water mapping (NDWI needs Green+NIR or
  NIR+SWIR depending on the variant).
- A DEM for runoff terrain.
- Catchment/waterbody polygons and stream networks for overlays.

## Water & wetness (NDWI)

Compute NDWI — McFeeters open-water or Gao canopy wetness — or a custom
ratio, and polygonize the open-water extent beyond a threshold.
**Reclassify** grades the result into inundation/wetness zones.

## Runoff terrain (slope)

Horn slope from a DEM — the dominant control on overland-flow velocity —
with the exact pixel ground size reported and borders excluded.

## Catchment characteristics (WLC)

Weight rainfall, slope, soil infiltration, land cover and proximity to
streams into a runoff-generation or recharge-potential surface. Every
weight and direction is exported with the output.

## Riparian & drainage (decay)

Exponential distance decay from streams, wetlands or monitoring points —
for riparian-buffer design (which land falls within the effective buffer)
or drainage-proximity hazard.

## Catchment overlays

Clip or dissolve gauge, catchment and waterbody polygons to assemble
study-area summaries.

## Water-extent change (T1 / T2)

Compare two aligned water-index rasters — flood or drought mapping — or
polygon waterbody boundaries between dates, with the sign convention and
area method reported.

## Provenance & citation

See [How to cite](index.md#citing-geospax).
