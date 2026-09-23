// GeoSpaX Biodiversity workbench: citation-carrying occurrence data,
// community indices, point patterns, priority surfaces, SDM and protection gaps.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { createPanelShell } from "../shared/ui";
import { mountDiversityTool, mountOccurrenceTool } from "../shared/data-tools";
import {
  mountDbscanTool,
  mountGapTool,
  mountHotspotTool,
  mountPointPatternTool,
  mountPriorityTool,
  mountProvenanceTool,
  mountSdmTool,
} from "../shared/vector-tools";

export function mountBiodiversityPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-biodiversity",
    eyebrow: "GeoSpaX domain workbench",
    title: "Biodiversity",
    intro:
      "Bring in citable species records, quantify taxonomic diversity and spatial pattern, model environmental suitability, and test priorities against protected-area coverage.",
    accent: "#7b4e9d",
  });

  const data = shell.addSection({
    id: "data",
    title: "Occurrence data",
    badge: "Live APIs",
    open: true,
    description:
      "Query GBIF, OBIS and iNaturalist coordinate records or resolve a name through WoRMS; source URLs and access dates travel with the result.",
  });
  mountOccurrenceTool(shell, data, {
    sources: ["gbif", "obis", "inat", "worms"],
    defaultSource: "gbif",
    defaultTaxon: "Paradisaea apoda",
  });

  const community = shell.addSection({
    id: "community",
    title: "Diversity",
    badge: "S / H′ / 1−D",
    description:
      "Compute richness, Shannon, Simpson and evenness from a real category-frequency distribution in one sample layer.",
  });
  mountDiversityTool(shell, community, "taxon");

  const pattern = shell.addSection({
    id: "pattern",
    title: "Spatial pattern",
    badge: "NNI / DBSCAN / Grid",
    description:
      "Screen occurrence clustering and construct transparent weighted density/count surfaces for survey or conservation targeting.",
  });
  mountPointPatternTool(shell, pattern, "species occurrences");
  mountDbscanTool(shell, pattern, "species occurrences");
  mountHotspotTool(shell, pattern);

  const sdm = shell.addSection({
    id: "sdm",
    title: "Distribution models",
    badge: "BIOCLIM / D² / Logistic",
    description:
      "Fit and predict audit-fixed environmental-space models, including an explicitly labelled presence-background logistic fallback, from complete occurrence attributes.",
  });
  mountSdmTool(shell, sdm, "species");

  const priorities = shell.addSection({
    id: "priorities",
    title: "Priorities & gaps",
    badge: "Protection",
    description:
      "Identify unprotected high-score occurrence/habitat sites and quantify polygon range protection.",
  });
  mountPriorityTool(shell, priorities);
  mountGapTool(shell, priorities, {
    habitat: "Species range / habitat extent",
    network: "Protected-area network",
  });

  const provenance = shell.addSection({
    id: "provenance",
    title: "Provenance",
    badge: "Export",
  });
  mountProvenanceTool(shell, provenance);

  return () => shell.destroy();
}
