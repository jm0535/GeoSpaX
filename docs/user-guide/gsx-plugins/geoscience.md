# GSX Geoscience

Analyse terrain form, map lithological and alteration indicators from
spectral ratios, run geological overlays and prospectivity surfaces, and
quantify surface change.

## Before you start

- A DEM for slope classes.
- Multispectral imagery for ratios (NDBI uses SWIR + NIR; custom ratios can
  target iron-oxide or clay absorption features).
- Geological polygons, geophysical/geochemical grids as available.

## Terrain & slope classes

Horn slope from a DEM, then **reclassify** into standard geotechnical
slope bands. The pixel ground size is reported so the classes can be
quoted with a resolution caveat.

## Spectral ratios

- **NDBI** — bare-rock / altered-surface proxy.
- **Custom** — any (A−B)/(A+B) pair; e.g. band ratios commonly used for
  iron-oxide or clay-mineral mapping from multispectral scenes.

Cells beyond a threshold polygonize into a lithological-proxy extent.

## Prospectivity & stability (WLC)

Combine geological, geophysical, geochemical and terrain evidence layers
with explicit weights and benefit/cost directions into a prospectivity
(or slope-stability) surface. All weights export with the result.

## Geological overlay

Clip, intersect, union or spatially join geological polygons — e.g. clip
sample catchments to lithology, or join formation attributes to points.

## Surface change (T1 / T2)

Compare two aligned rasters (mine-face progression, tailings growth) or
polygon boundaries (tenements), with the sign convention and area method
reported.

## Provenance & citation

Every analysis is recorded. See [How to cite](index.md#citing-geospax).
