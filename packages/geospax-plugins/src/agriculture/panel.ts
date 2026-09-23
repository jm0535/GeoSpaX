// GeoSpaX Agriculture workbench: crop indices, terrain, transparent WLC,
// proximity decay and two-date change. Outputs always use GeoLibre store APIs.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { createPanelShell, GSX_GUIDE_BASE } from "../shared/ui";
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
  mountSlopeTool,
} from "../shared/raster-tools";
import { mountCitationTool } from "../shared/citation";
import { PLUGIN_VERSION } from "./index";

export function mountAgriculturePanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-agriculture",
    eyebrow: "GeoSpaX domain workbench",
    title: "GSX Agriculture",
    intro:
      "Assess crop condition, terrain constraints and multi-criteria suitability; convert distance costs transparently and compare cover or index surfaces through time.",
    accent: "#b47724",
    guideUrl: `${GSX_GUIDE_BASE}/agriculture/`,
  });

  const condition = shell.addSection({
    id: "crop-condition",
    title: "Crop condition",
    badge: "NDVI",
    open: true,
    description:
      "Compute an actual normalized-difference crop index from raster bands—rather than merely describing an NDVI-style workflow—and return its threshold extent.",
  });
  mountIndexTool(shell, condition, { preset: "NDVI", threshold: 0.3, subject: "crop vigour" });
  mountRasterReclassTool(shell, condition, "crop-condition zone");

  const suitability = shell.addSection({
    id: "suitability",
    title: "Land suitability",
    badge: "WLC",
    description:
      "Combine soil, climate, terrain, access or management attributes with explicit weights and benefit/cost directions.",
  });
  mountSuitabilityTool(shell, suitability, "agricultural suitability");
  mountDistanceDecayTool(shell, suitability, "market / infrastructure access");

  const terrain = shell.addSection({
    id: "terrain",
    title: "Terrain",
    badge: "Slope",
    description:
      "Derive sampled slope constraints from a DEM while reporting the exact pixel ground size and excluded borders.",
  });
  mountSlopeTool(shell, terrain, "agricultural capability");

  const change = shell.addSection({
    id: "change",
    title: "Change",
    badge: "T1 / T2",
    description:
      "Compare aligned index/cover rasters or polygon crop extents without hiding the sign convention or area method.",
  });
  mountRasterChangeTool(shell, change, "crop condition / cover");
  mountVectorChangeTool(shell, change, "cropped extent");

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
  mountCitationTool(shell, citation, { pluginLabel: "GSX Agriculture", version: PLUGIN_VERSION });

  return () => shell.destroy();
}
