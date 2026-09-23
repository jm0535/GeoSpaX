// GSX Disaster workbench: multi-hazard susceptibility mapping, terrain
// triggers, exposure and access decay, impact change assessment and priority
// siting. Outputs always use GeoLibre store APIs.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { createPanelShell, GSX_GUIDE_BASE } from "../shared/ui";
import {
  mountDistanceDecayTool,
  mountHotspotTool,
  mountPriorityTool,
  mountProvenanceTool,
  mountSuitabilityTool,
  mountVectorChangeTool,
} from "../shared/vector-tools";
import {
  mountIndexTool,
  mountRasterChangeTool,
  mountSlopeTool,
} from "../shared/raster-tools";
import { mountCitationTool } from "../shared/citation";
import { PLUGIN_VERSION } from "./index";

export function mountDisasterPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-disaster",
    eyebrow: "GeoSpaX domain workbench",
    title: "GSX Disaster",
    intro:
      "Build transparent multi-hazard susceptibility surfaces, map burn or inundation footprints from satellite bands, assess access for response planning, and quantify impact between two dates.",
    accent: "#a3402e",
    guideUrl: `${GSX_GUIDE_BASE}/disaster/`,
  });

  const hazard = shell.addSection({
    id: "hazard-susceptibility",
    title: "Hazard susceptibility",
    badge: "WLC",
    open: true,
    description:
      "Weight slope, rainfall, soil, land cover and distance-to-stream attributes into an explicit landslide / flood / fire susceptibility surface with stated criteria directions.",
  });
  mountSuitabilityTool(shell, hazard, "hazard susceptibility");

  const terrain = shell.addSection({
    id: "terrain-triggers",
    title: "Terrain triggers",
    badge: "Slope",
    description:
      "Derive sampled slope constraints from a DEM for landslide-triggering terrain, reporting the exact pixel ground size and excluded borders.",
  });
  mountSlopeTool(shell, terrain, "landslide susceptibility");

  const footprint = shell.addSection({
    id: "footprints",
    title: "Hazard footprints",
    badge: "NBR / NDWI",
    description:
      "Extract burn extents with NBR, inundation with NDWI, or a custom band ratio, and polygonize cells beyond the severity threshold.",
  });
  mountIndexTool(shell, footprint, { preset: "NBR", threshold: 0.1, subject: "hazard footprint" });

  const response = shell.addSection({
    id: "response-access",
    title: "Response & access",
    badge: "Decay",
    description:
      "Model exponential distance decay from shelters, hospitals, evacuation routes or staging areas to prioritise response coverage.",
  });
  mountDistanceDecayTool(shell, response, "shelter / evacuation access");
  mountPriorityTool(shell, response);

  const impact = shell.addSection({
    id: "impact",
    title: "Impact assessment",
    badge: "T1 / T2",
    description:
      "Compare pre-event and post-event rasters or polygon asset footprints, with the sign convention and area method reported.",
  });
  mountRasterChangeTool(shell, impact, "hazard footprint / asset condition");
  mountVectorChangeTool(shell, impact, "affected extent");

  const hotspots = shell.addSection({
    id: "hotspots",
    title: "Impact hotspots",
    badge: "Grid",
    description: "Summarise reported damage points into a square hotspot grid with counts and density.",
  });
  mountHotspotTool(shell, hotspots);

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
  mountCitationTool(shell, citation, { pluginLabel: "GSX Disaster", version: PLUGIN_VERSION });

  return () => shell.destroy();
}
