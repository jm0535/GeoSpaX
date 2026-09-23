# GSX domain plugins

GeoSpaX ships **twelve GSX domain workbenches** — specialised analysis
panels spanning agriculture, biodiversity, climate, conservation, disaster,
environment, forestry, geoscience, hydrology, land cover, marine and soil.
They are bundled drop-ins: no installation, no account, and every
computation runs locally in your browser (or desktop app).

| Workbench | Use it for |
|---|---|
| [GSX Agriculture](agriculture.md) | Crop condition (NDVI), land suitability, terrain limits, change |
| [GSX Biodiversity](biodiversity.md) | GBIF/OBIS/iNaturalist data, richness, SDM, gap analysis |
| [GSX Climate](climate.md) | Moisture/thermal stress, climate vulnerability, signal change |
| [GSX Conservation](conservation.md) | Overlay, priorities, SCP, protection gaps, fragmentation |
| [GSX Disaster](disaster.md) | Multi-hazard susceptibility, footprints, response access, impact |
| [GSX Environment](environment.md) | Slope, indices, reclassification, change, overlay |
| [GSX Forestry](forestry.md) | Forest extent, fragmentation, connectivity, forest change |
| [GSX Geoscience](geoscience.md) | Slope classes, spectral ratios, prospectivity, overlays |
| [GSX Hydrology](hydrology.md) | Water/wetness mapping, runoff terrain, catchment WLC |
| [GSX LULC](lulc.md) | Land-use / land-cover mapping, classes, transitions |
| [GSX Marine](marine.md) | OBIS/WoRMS, diversity, MPA gaps, marine SDM |
| [GSX Soil](soil.md) | Moisture/salinity proxies, capability classes, land capability |

## Opening a workbench

Workbenches are **opt-in** — none of them activate at startup. Activate a
workbench once and it stays active across sessions:

1. Launch GeoSpaX (web or desktop).
2. Open **Plugins → Manage Plugins**, find the GSX workbench you want, and
   activate it.
3. Click the workbench's icon in the **panel rail** on the right edge of the
   map, or open **View → Panels** and tick it.
4. The panel docks on the **far-right edge** of the map, beside the Style
   rail. Its sections are collapsible — click a section header to expand it.

Closing a workbench's panel (the **×** in its header) also **deactivates the
plugin** — it is unchecked in Plugins → Manage Plugins and its rail icon is
removed. Activate it again whenever you need it back.

## Common concepts

- **Layers first.** Every tool reads from the layers already on your map and
  writes results back as *new* layers — your inputs are never modified.
- **Transparent methods.** Tools report the exact formula, threshold, pixel
  size or weight set they used, both on screen and in the layer's metadata.
- **Provenance.** Each workbench keeps a run ledger; the **Provenance**
  section exports a record of every analysis you ran (tool, inputs, outputs,
  parameters) so a study is reproducible.
- **How to cite.** Every workbench ends with a **How to cite** section
  giving ready-to-copy APA and BibTeX entries. If a workbench contributes
  to a report, thesis or paper, cite GeoSpaX — and also cite the GeoLibre
  platform and every dataset provider (GBIF, OBIS, iNaturalist, WoRMS,
  World Bank, GEBCO and others) whose layers you mapped.

## Citing GeoSpaX

Use the *How to cite* section inside any workbench, or the repository's
**Cite this repository** button (powered by `CITATION.cff`). Cite the
software, the GeoLibre platform it builds on, and the data providers.
