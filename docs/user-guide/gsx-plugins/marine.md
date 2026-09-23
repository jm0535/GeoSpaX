# GSX Marine

Retrieve marine occurrences and taxonomy, quantify diversity and pattern,
model habitat and assess MPA priorities and gaps.

## Before you start

- Internet access for OBIS and WoRMS.
- Optional MPA polygons for gap analysis.

## Marine data

**GEBCO** bathymetry adds seafloor context as a visual layer for the
study region.

## Marine occurrences & taxonomy

1. Expand and enter a taxon (species or higher).
2. **OBIS** returns georeferenced marine occurrences; **WoRMS** resolves
   or validates the taxonomy (accepted name, authority).
3. Records arrive as a layer with source citations attached.

## Diversity & pattern

- Taxon-frequency **richness/diversity** over a grid.
- **Nearest-neighbour** pattern test (clustered / random / dispersed).
- **DBSCAN** clustering with retained noise.

## Habitat modelling

BIOCLIM, Mahalanobis and presence-background logistic SDMs using
environmental rasters (e.g. bathymetry, temperature) — each predicts a
suitability surface with its exact settings reported.

## Priorities & MPAs

- **Weighted grid / priority sites** for candidate areas.
- **MPA gap analysis** — overlay priorities with existing MPAs to find
  unprotected areas of importance.

## Provenance & citation

Cite GeoSpaX, and OBIS/WoRMS/GEBCO for the data — their citations travel
with every layer you download.
