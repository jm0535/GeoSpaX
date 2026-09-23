// GSX Soil workbench: soil moisture and salinity proxies, capability-class
// mapping, land-capability WLC and management-access decay. Outputs always
// use GeoLibre store APIs.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { createPanelShell, GSX_GUIDE_BASE } from "../shared/ui";
import {
  mountDistanceDecayTool,
  mountOverlayTool,
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

export function mountSoilPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-soil",
    eyebrow: "GeoSpaX domain workbench",
    title: "GSX Soil",
    intro:
      "Map soil condition from satellite wetness and salinity proxies, delineate capability classes, model land capability with weighted criteria and track soil-extent change through time.",
    accent: "#8a5a2e",
    guideUrl: `${GSX_GUIDE_BASE}/soil/`,
  });

  const condition = shell.addSection({
    id: "soil-condition",
    title: "Moisture & salinity proxies",
    badge: "NDWI / custom",
    open: true,
    description:
      "Compute NDWI for soil-wetness patterns, or a custom (SWIR−NIR)/(SWIR+NIR)-style ratio as a salinity / bare-soil proxy, and extract the extent beyond a threshold.",
  });
  mountIndexTool(shell, condition, { preset: "NDWI", threshold: 0.0, subject: "soil wetness" });

  const classes = shell.addSection({
    id: "capability-classes",
    title: "Capability classes",
    badge: "Reclass",
    description:
      "Reclassify a soil-property raster (pH, organic carbon, conductivity, wetness index) into discrete capability or constraint classes with explicit break values.",
  });
  mountRasterReclassTool(shell, classes, "soil capability class");

  const capability = shell.addSection({
    id: "land-capability",
    title: "Land capability",
    badge: "WLC",
    description:
      "Combine soil, slope, drainage and climate attributes with explicit weights and benefit/cost directions into a transparent land-capability surface.",
  });
  mountSuitabilityTool(shell, capability, "soil-based land capability");
  mountDistanceDecayTool(shell, capability, "management / amendment access");

  const surveys = shell.addSection({
    id: "survey-overlays",
    title: "Survey overlays",
    badge: "Clip / Join",
    description:
      "Clip or spatially join soil-survey polygons and sample points against mapped classes to assemble a coherent soil picture for the study area.",
  });
  mountOverlayTool(shell, surveys);

  const change = shell.addSection({
    id: "change",
    title: "Soil-extent change",
    badge: "T1 / T2",
    description:
      "Compare two aligned soil-property rasters or polygon survey boundaries between sampling campaigns, with the sign convention and area method reported.",
  });
  mountRasterChangeTool(shell, change, "soil property / condition");
  mountVectorChangeTool(shell, change, "survey extent");

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
  mountCitationTool(shell, citation, { pluginLabel: "GSX Soil", version: PLUGIN_VERSION });

  return () => shell.destroy();
}
