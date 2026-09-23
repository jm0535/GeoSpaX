# GSX Climate

Map moisture and thermal stress from satellite bands, build transparent
climate-exposure and vulnerability surfaces, and quantify change between
two dates.

## Before you start

- A multispectral raster with the bands for your index (NIR + SWIR for
  NDWI; NIR + SWIR2 for NBR).
- Polygon attributes (rainfall, temperature, elevation class, adaptive
  capacity…) for vulnerability scoring.

## Moisture & thermal stress

1. Expand **Moisture & thermal stress** and pick a raster.
2. Choose an index: **NDWI** (canopy wetness, Gao 1996), **NBR** (moisture
   ratio — low values flag moisture stress), or a **custom** (A−B)/(A+B)
   pair.
3. Set the threshold (0.0 is the usual wet/dry split) and run.

The tool computes the ratio over the current map view and polygonizes
cells beyond the threshold as a stress-extent layer.

## Stress zones

**Reclassify** converts the continuous index into named zones (mild /
moderate / severe) with explicit break values.

## Exposure & vulnerability (WLC)

Weighted linear combination for climate vulnerability:

1. Choose a polygon layer and criterion fields (rainfall, temperature,
   exposure, adaptive capacity).
2. Set each criterion's weight and benefit/cost direction.
3. Run — the vulnerability surface, weights and directions are exported
   together.

Add **distance decay** from relief or cooling infrastructure (shelters,
water points) as an access criterion.

## Signal change (T1 / T2)

- **Raster change** — compare the same index at two dates (dNBR-style
  severity); sign convention and areas are reported.
- **Vector change** — diff exposure-extent polygons between assessments.

## Provenance & citation

Every run is recorded and exportable. See
[How to cite](index.md#citing-geospax).
