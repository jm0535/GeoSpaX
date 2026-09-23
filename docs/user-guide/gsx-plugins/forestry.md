# GSX Forestry

Derive forest extent, quantify landscape structure, detect forest change
and assess protection gaps.

## Before you start

- A forest/non-forest raster or canopy-cover raster (or derive one below).
- Protected-area polygons for gap analysis.

## Forest extent

Derive a forest mask from a canopy or index raster by thresholding —
Otsu-assisted when possible — and polygonize it into patch polygons.

## Landscape structure

- **Fragmentation** — patch ID, NP, CA, LPI, TE, ED, MSI, core area (CAI),
  ENN — the full per-class patch-metric report.
- **Connectivity** — inter-patch connectivity components, so you can see
  which stands are linked and which are isolated.

## Forest change

- **Raster change** — two-date forest rasters; loss/gain in hectares with
  the sign convention stated.
- **Vector change** — diff patch polygons between inventory dates.

## Forest protection

Overlay the forest mask or patches with protected areas for a protection
gap assessment — how much forest, and which priority patches, lie outside
the reserve network.

## Provenance & citation

Every run is recorded with its exact parameters. Cite GeoSpaX and the
imagery/inventory providers in any report.
