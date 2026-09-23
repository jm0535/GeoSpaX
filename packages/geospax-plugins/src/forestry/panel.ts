// GeoSpaX Forestry workbench: forest extent derivation, full landscape
// metrics/connectivity, explicit two-date change and protection reporting.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { createPanelShell } from "../shared/ui";
import {
  mountConnectivityTool,
  mountFragmentationTool,
  mountGapTool,
  mountProvenanceTool,
  mountVectorChangeTool,
} from "../shared/vector-tools";
import {
  mountIndexTool,
  mountRasterChangeTool,
  mountRasterReclassTool,
} from "../shared/raster-tools";
import { mountCitationTool } from "../shared/citation";
import { PLUGIN_VERSION } from "./index";

export function mountForestryPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-forestry",
    eyebrow: "GeoSpaX domain workbench",
    title: "GSX Forestry",
    intro:
      "Derive forest or disturbance extents, quantify fragmentation and structural connectivity, detect two-date loss/gain, and report overlap with protected areas.",
    accent: "#2f704b",
  });

  const extent = shell.addSection({
    id: "extent",
    title: "Forest extent",
    badge: "Raster → Vector",
    open: true,
    description:
      "Build auditable vegetation/burn indices or threshold a canopy-cover raster into polygons before landscape analysis.",
  });
  mountIndexTool(shell, extent, {
    preset: "NBR",
    threshold: 0.2,
    subject: "forest / disturbance condition",
  });
  mountRasterReclassTool(shell, extent, "forest extent");

  const structure = shell.addSection({
    id: "structure",
    title: "Landscape structure",
    badge: "NP / LPI / CAI",
    description:
      "Run the complete original patch report—including edge/core metrics—and label threshold graph components.",
  });
  mountFragmentationTool(shell, structure, "forest");
  mountConnectivityTool(shell, structure, "forest patches");

  const change = shell.addSection({
    id: "change",
    title: "Forest change",
    badge: "Loss / Gain",
    description:
      "Use aligned raster differences or two polygon dates. Both workflows expose sign conventions, thresholds, closure and area assumptions.",
  });
  mountRasterChangeTool(shell, change, "forest cover / condition");
  mountVectorChangeTool(shell, change, "forest extent");

  const protection = shell.addSection({
    id: "protection",
    title: "Forest protection",
    badge: "Gap",
    description:
      "Quantify the mapped forest extent inside and outside a reserve or protected-area network.",
  });
  mountGapTool(shell, protection, {
    habitat: "Forest extent",
    network: "Protected areas / reserves",
  });

  const provenance = shell.addSection({
    id: "provenance",
    title: "Provenance",
    badge: "Export",
  });
  mountProvenanceTool(shell, provenance);

  const citation = shell.addSection({
    id: "citation",
    title: "How to cite",
    badge: "Citation",
    description: "Academic and institutional use requires an appropriate citation.",
  });
  mountCitationTool(shell, citation, { pluginLabel: "GSX Forestry", version: PLUGIN_VERSION });

  return () => shell.destroy();
}
