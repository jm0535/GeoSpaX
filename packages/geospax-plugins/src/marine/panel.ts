// GeoSpaX Marine workbench: OBIS/WoRMS data, GEBCO context, diversity and
// occurrence patterns, marine SDM, weighted priorities and MPA gap reporting.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { createPanelShell } from "../shared/ui";
import { mountDiversityTool, mountGebcoTool, mountOccurrenceTool } from "../shared/data-tools";
import {
  mountDbscanTool,
  mountGapTool,
  mountHotspotTool,
  mountPointPatternTool,
  mountProvenanceTool,
  mountSdmTool,
} from "../shared/vector-tools";
import { mountIndexTool, mountRasterReclassTool } from "../shared/raster-tools";

export function mountMarinePanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-marine",
    eyebrow: "GeoSpaX domain workbench",
    title: "Marine",
    intro:
      "Query citable marine records, add bathymetric context, quantify diversity and spatial pattern, model habitat suitability, and compare priority habitat with MPA coverage.",
    accent: "#217c91",
  });

  const data = shell.addSection({
    id: "data",
    title: "Marine data",
    badge: "OBIS / WoRMS",
    open: true,
    description:
      "Retrieve georeferenced OBIS occurrences or resolve marine taxonomy through WoRMS with preserved source citations.",
  });
  mountOccurrenceTool(shell, data, {
    sources: ["obis", "worms"],
    defaultSource: "obis",
    defaultTaxon: "Thunnus albacares",
    title: "Marine occurrences & taxonomy",
  });
  mountGebcoTool(shell, data);

  const observation = shell.addSection({
    id: "observation",
    title: "Diversity & pattern",
    badge: "S / H′ / NNI / DBSCAN",
    description:
      "Summarise taxa in occurrence records and screen nearest-neighbour spacing and density-connected clusters before interpreting survey concentrations.",
  });
  mountDiversityTool(shell, observation, "marine taxon");
  mountPointPatternTool(shell, observation, "marine occurrences");
  mountDbscanTool(shell, observation, "marine occurrences");

  const habitat = shell.addSection({
    id: "habitat",
    title: "Habitat modelling",
    badge: "BIOCLIM / D² / Logistic / Index",
    description:
      "Score environmental-space suitability and derive water/wetness or custom raster extents for habitat screening.",
  });
  mountSdmTool(shell, habitat, "marine species");
  mountIndexTool(shell, habitat, {
    preset: "NDWI",
    threshold: 0,
    subject: "marine/coastal habitat",
  });
  mountRasterReclassTool(shell, habitat, "marine habitat zone");

  const protection = shell.addSection({
    id: "protection",
    title: "Priorities & MPAs",
    badge: "Grid / Gap",
    description:
      "Combine survey/habitat evidence in a descriptive priority grid and quantify mapped habitat outside marine protected areas.",
  });
  mountHotspotTool(shell, protection);
  mountGapTool(shell, protection, {
    habitat: "Marine habitat extent",
    network: "Marine protected areas",
  });

  const provenance = shell.addSection({
    id: "provenance",
    title: "Provenance",
    badge: "Export",
  });
  mountProvenanceTool(shell, provenance);

  return () => shell.destroy();
}
