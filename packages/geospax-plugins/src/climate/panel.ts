// GSX Climate workbench: moisture/thermal indices, exposure mapping,
// vulnerability WLC and two-date climate signal change. Outputs always use
// GeoLibre store APIs.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { createPanelShell } from "../shared/ui";
import {
  mountDistanceDecayTool,
  mountProvenanceTool,
  mountSuitabilityTool,
  mountVectorChangeTool,
} from "../shared/vector-tools";
import {
  mountIndexTool,
  mountRasterChangeTool,
  mountRasterReclassTool,
} from "../shared/raster-tools";
import { mountCitationTool } from "../shared/citation";
import { PLUGIN_VERSION } from "./index";

export function mountClimatePanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-climate",
    eyebrow: "GeoSpaX domain workbench",
    title: "GSX Climate",
    intro:
      "Map moisture and thermal stress from satellite bands, build transparent climate-exposure and vulnerability surfaces, and quantify change between two dates.",
    accent: "#2e6f95",
  });

  const stress = shell.addSection({
    id: "stress-indices",
    title: "Moisture & thermal stress",
    badge: "NDWI / NBR",
    open: true,
    description:
      "Compute NDWI (canopy wetness, Gao 1996), NBR (moisture ratio) or a custom band ratio from a loaded raster and extract the extent above a threshold.",
  });
  mountIndexTool(shell, stress, { preset: "NDWI", threshold: 0.0, subject: "moisture stress" });
  mountRasterReclassTool(shell, stress, "stress zone");

  const exposure = shell.addSection({
    id: "exposure",
    title: "Exposure & vulnerability",
    badge: "WLC",
    description:
      "Combine rainfall, temperature, elevation, exposure and adaptive-capacity attributes with explicit weights and benefit/cost directions into a climate-vulnerability surface.",
  });
  mountSuitabilityTool(shell, exposure, "climate vulnerability");
  mountDistanceDecayTool(shell, exposure, "distance to cooling / relief infrastructure");

  const change = shell.addSection({
    id: "change",
    title: "Signal change",
    badge: "T1 / T2",
    description:
      "Compare aligned index rasters between two dates — for example dNBR-style severity — or polygon climate-extent boundaries, with the sign convention and area method reported.",
  });
  mountRasterChangeTool(shell, change, "moisture / stress signal");
  mountVectorChangeTool(shell, change, "exposure extent");

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
  mountCitationTool(shell, citation, { pluginLabel: "GSX Climate", version: PLUGIN_VERSION });

  return () => shell.destroy();
}
