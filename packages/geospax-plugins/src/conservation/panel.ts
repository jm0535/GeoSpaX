// Conservation Planning workbench — the full original GeoSpaX conservation
// workflow restored as one consistent GeoLibre panel. Heavy methods remain in
// @geospax/analysis; every spatial output re-enters through addGeoJsonLayer.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import type { AreaMethod } from "@geospax/analysis";
import { createPanelShell, GSX_GUIDE_BASE } from "../shared/ui";
import {
  mountConnectivityTool,
  mountDbscanTool,
  mountFragmentationTool,
  mountGapTool,
  mountHotspotTool,
  mountOverlayTool,
  mountPriorityTool,
  mountProvenanceTool,
  mountScpTool,
  mountSdmTool,
  mountSuitabilityTool,
  mountVectorChangeTool,
} from "../shared/vector-tools";
import { mountRasterReclassTool } from "../shared/raster-tools";
import { mountCitationTool } from "../shared/citation";
import { PLUGIN_VERSION } from "./index";

export interface ConservationPanelState {
  habitatLayerName?: string | null;
  paLayerName?: string | null;
  areaMode?: AreaMethod;
}

const state: ConservationPanelState = { areaMode: "equalarea" };

export function getPanelState(): ConservationPanelState {
  return { ...state };
}

export function applyPanelState(next: ConservationPanelState): void {
  if (typeof next.habitatLayerName === "string" || next.habitatLayerName === null) {
    state.habitatLayerName = next.habitatLayerName;
  }
  if (typeof next.paLayerName === "string" || next.paLayerName === null) {
    state.paLayerName = next.paLayerName;
  }
  if (next.areaMode === "equalarea" || next.areaMode === "spherical") {
    state.areaMode = next.areaMode;
  }
}

export function mountConservationPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-conservation",
    eyebrow: "GeoSpaX domain workbench",
    title: "GSX Conservation",
    intro:
      "Overlay, prioritise, model suitability, quantify protection gaps, measure landscape structure and derive change—using audit-fixed methods with provenance attached to every output.",
    accent: "#5b8c51",
    guideUrl: `${GSX_GUIDE_BASE}/conservation/`,
  });

  const overlay = shell.addSection({
    id: "overlay",
    title: "Overlay",
    badge: "Vector",
    open: true,
    description:
      "Construct analysis-ready polygon intersections, erasures and unions before planning or reporting.",
  });
  mountOverlayTool(shell, overlay);

  const prioritization = shell.addSection({
    id: "prioritization",
    title: "Prioritization",
    badge: "MCE / DBSCAN / SCP",
    description:
      "Build descriptive priority surfaces, screen density-connected occurrence/candidate-site clusters, identify unprotected high-quality sites, and solve bounded minimum-cost representation problems.",
  });
  mountHotspotTool(shell, prioritization);
  mountDbscanTool(shell, prioritization, "occurrence / candidate-site points");
  mountPriorityTool(shell, prioritization);
  mountScpTool(shell, prioritization);

  const sdm = shell.addSection({
    id: "sdm",
    title: "Species models",
    badge: "BIOCLIM / D² / Logistic",
    description:
      "Fit corrected environmental-space models, including an explicitly labelled presence-background logistic fallback, without substituting coordinates or zero-filled predictors.",
  });
  mountSdmTool(shell, sdm, "species");

  const suitability = shell.addSection({
    id: "suitability",
    title: "Suitability",
    badge: "WLC",
    description:
      "Combine graded benefit/cost criteria into transparent feature-level suitability scores.",
  });
  mountSuitabilityTool(shell, suitability, "conservation suitability");

  const gap = shell.addSection({
    id: "gap",
    title: "Protection gap",
    badge: "Area",
    description:
      "Report protected and unprotected mapped habitat with equal-area hectares and a geometry closure check.",
  });
  mountGapTool(shell, gap, {
    habitat: "Habitat / range extent",
    network: "Protected-area network",
    habitatLayerName: state.habitatLayerName,
    networkLayerName: state.paLayerName,
    areaMode: state.areaMode,
    onStateChange: (next) => {
      state.habitatLayerName = next.habitatLayerName;
      state.paLayerName = next.networkLayerName;
      state.areaMode = next.areaMode;
    },
  });

  const landscape = shell.addSection({
    id: "landscape",
    title: "Landscape",
    badge: "Patches",
    description:
      "Measure fragmentation, structural connectivity, and two-date polygon change using declared distance and area assumptions.",
  });
  mountFragmentationTool(shell, landscape, "habitat");
  mountConnectivityTool(shell, landscape, "habitat patches");
  mountVectorChangeTool(shell, landscape, "habitat / forest extent");

  const raster = shell.addSection({
    id: "raster",
    title: "Raster extent",
    badge: "Threshold",
    description:
      "Reclassify a sampled raster band and return the selected class as analysis-ready polygons.",
  });
  mountRasterReclassTool(shell, raster, "conservation extent");

  const provenance = shell.addSection({
    id: "provenance",
    title: "Provenance",
    badge: "Export",
    description: "Review methods and export the run ledger or host project snapshot.",
  });
  mountProvenanceTool(shell, provenance);

  const citation = shell.addSection({
    id: "citation",
    title: "How to cite",
    badge: "Citation",
    description: "Academic and institutional use requires an appropriate citation.",
  });
  mountCitationTool(shell, citation, { pluginLabel: "GSX Conservation", version: PLUGIN_VERSION });

  return () => shell.destroy();
}
