# GSX Biodiversity

Retrieve and analyse species occurrence records, quantify richness and
diversity, model distributions and identify conservation priorities.

## Before you start

- Internet access for the data connectors (GBIF, OBIS, iNaturalist, WoRMS).
- Optional: your own occurrence points (CSV/GeoJSON) and boundary polygons.

## Occurrence data

1. Expand **Occurrence data** and enter a scientific name (e.g.
   *Paradisaea apoda*).
2. Choose a provider — GBIF (with common-name search and pagination past
   the 300-record cap), OBIS, or iNaturalist.
3. Set a boundary (current view or a polygon layer) and run.
4. Records arrive as a map layer; source citations travel with the layer.

Use **WoRMS** to resolve or validate taxonomic names before downloading.

## Diversity

Summarises occurrences into equal-area **richness / diversity** surfaces
(taxon-frequency based) over a grid you size. The method — counts,
Shannon-style diversity — is stated in the run summary.

## Spatial pattern

- **Nearest-neighbour pattern** — tests whether occurrences are clustered,
  random or dispersed, with the index and interpretation printed.
- **DBSCAN** — haversine-based clustering with retained noise points, so
  unclustered records are never silently dropped.
- **Weighted grid** — hotspot grid of counts/density/presence.

## Distribution models

Species-distribution modelling from presence records plus environmental
rasters:

- **BIOCLIM** — percentile-trimmed envelope with limiting-factor output.
- **Mahalanobis** — chi-square D² with singular-covariance guards.
- **Presence-background logistic** — explicit environmental rows,
  labelled as a linear logistic fallback (not true MaxEnt).

Each model predicts a suitability surface and reports its exact settings.

## Priorities & gaps

Combine the model or occurrence layer with protected-area polygons to find
**unprotected priority sites** and quantify the protection gap.

## Provenance & citation

The run ledger exports every retrieval and analysis. Cite GeoSpaX **and**
the data provider (GBIF, OBIS, iNaturalist, WoRMS) — their citations are
carried on the layers you downloaded.
