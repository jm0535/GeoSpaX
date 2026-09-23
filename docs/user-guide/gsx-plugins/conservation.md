# GSX Conservation

The full conservation-planning workbench: overlay, prioritisation, species
models, suitability, protection gaps, landscape structure and change —
using audit-fixed methods with provenance attached to every output.

## Before you start

- Vector layers: features of interest (species sites, habitat patches),
  protected areas, planning-region boundaries.
- Optional rasters for extent/threshold work.

## Overlay

Intersect, difference, union, dissolve, clip or spatially join polygons —
e.g. clip habitat by planning units. Geometry and attribute provenance are
kept with the result.

## Prioritization

- **Weighted hotspot grid** — square/hex counts, density or presence.
- **Priority sites** — rank planning units by weighted criteria.
- **Minimum-cost representation (SCP)** — bounded exact branch-and-bound
  with an explicit greedy fallback when browser safety limits prevent
  proof; the solver used is always reported.

## Species models

BIOCLIM, Mahalanobis and presence-background logistic SDM **with
prediction** — see [GSX Biodiversity](biodiversity.md) for the method
notes; here they feed prioritisation directly.

## Suitability

Graded-criteria WLC with user cell size (metres), distance decay,
cost/benefit direction and hard-constraint masks.

## Protection gap

Overlay species/habitat features with protected areas to quantify the
gap — what fraction is unprotected, where the unprotected priorities are.

## Landscape

- **Fragmentation** — NP, CA, LPI, TE, ED, MSI, CAI, ENN and core-area
  metrics per patch class.
- **Connectivity** — inter-patch connectivity components.

## Raster extent

Threshold a raster (Otsu-assisted) and polygonize it for vector workflows.

## Provenance & citation

The FR422-ready run ledger exports every tool, input, output and parameter.
Cite GeoSpaX and your data providers in any assignment or paper.
