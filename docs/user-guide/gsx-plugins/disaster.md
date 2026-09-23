# GSX Disaster

Build multi-hazard susceptibility surfaces, map hazard footprints from
satellite bands, assess response access and quantify impact between two
dates.

## Before you start

- A DEM for slope-trigger analysis.
- Multispectral imagery for footprint mapping (NBR needs NIR + SWIR2).
- Hazard-factor polygon attributes (rainfall, geology, land cover…).
- Optional: damage points, shelters, evacuation routes.

## Hazard susceptibility (WLC)

1. Expand **Hazard susceptibility**, pick a polygon layer.
2. Choose criteria — slope, rainfall, soil, land cover, distance to stream
   — set each weight and whether more is worse (cost) or better.
3. Run. The surface carries every weight and direction so reviewers can
   audit the assumptions.

## Terrain triggers (slope)

Horn slope from a DEM — the standard first-pass landslide trigger — with
the pixel ground size reported and borders excluded.

## Hazard footprints (NBR / NDWI)

- **NBR** — burn severity: low NBR flags burns; differencing two dates
  gives dNBR severity.
- **NDWI** — inundation extent for flood mapping.
- **Custom** — any (A−B)/(A+B) ratio.

Cells beyond the threshold become a polygon footprint layer.

## Response & access (decay)

Exponential distance decay from shelters, hospitals or evacuation routes
identifies poorly covered areas; **priority sites** ranks them.

## Impact assessment (T1 / T2)

Compare pre-/post-event rasters or asset footprints; gains/losses in
hectares with the sign convention stated.

## Impact hotspots

Summarise damage reports into a hotspot grid with counts and density.

## Provenance & citation

Every assessment is recorded. See [How to cite](index.md#citing-geospax).
