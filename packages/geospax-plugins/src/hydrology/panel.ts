// GSX Hydrology workbench: wetness mapping, runoff-relevant terrain
// constraints, catchment-characteristic WLC, riparian buffer decay and
// two-date water-extent change. Outputs always use GeoLibre store APIs.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { createPanelShell } from "../shared/ui";
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
  mountSlopeTool,
} from "../shared/raster-tools";
import { mountCitationTool } from "../shared/citation";
import { PLUGIN_VERSION } from "./index";

export function mountHydrologyPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-hydrology",
    eyebrow: "GeoSpaX domain workbench",
    title: "GSX Hydrology",
    intro:
      "Map surface water and wetness, derive runoff-relevant terrain constraints, weight catchment characteristics, and quantify water-extent change between two dates.",
    accent: "#1f7a8c",
  });

  const water = shell.addSection({
    id: "water-mapping",
    title: "Water & wetness",
    badge: "NDWI",
    open: true,
    description:
      "Compute NDWI (McFeeters open-water or Gao canopy wetness) or a custom ratio from multispectral bands and polygonize the open-water extent beyond a threshold.",
  });
  mountIndexTool(shell, water, { preset: "NDWI", threshold: 0.0, subject: "open water" });
  mountRasterReclassTool(shell, water, "inundation / wetness zone");

  const terrain = shell.addSection({
    id: "runoff-terrain",
    title: "Runoff terrain",
    badge: "Slope",
    description:
      "Derive sampled slope from a DEM — the dominant control on overland-flow velocity — reporting the exact pixel ground size and excluded borders.",
  });
  mountSlopeTool(shell, terrain, "runoff potential");

  const catchment = shell.addSection({
    id: "catchment",
    title: "Catchment characteristics",
    badge: "WLC",
    description:
      "Combine rainfall, slope, soil-infiltration, cover and proximity-to-stream attributes with explicit weights and directions into a runoff-generation or recharge-potential surface.",
  });
  mountSuitabilityTool(shell, catchment, "runoff / recharge potential");

  const riparian = shell.addSection({
    id: "riparian",
    title: "Riparian & drainage",
    badge: "Decay",
    description:
      "Model exponential distance decay from streams, wetlands or monitoring points for riparian-buffer design and drainage-proximity hazard.",
  });
  mountDistanceDecayTool(shell, riparian, "stream / wetland proximity");

  const overlays = shell.addSection({
    id: "overlays",
    title: "Catchment overlays",
    badge: "Clip / Union",
    description:
      "Clip or dissolve gauge, catchment and waterbody polygons to assemble study-area summaries with full geometry provenance.",
  });
  mountOverlayTool(shell, overlays);

  const change = shell.addSection({
    id: "change",
    title: "Water-extent change",
    badge: "T1 / T2",
    description:
      "Compare two aligned water-index rasters (flood or drought mapping) or polygon waterbody boundaries between dates, with the sign convention and area method reported.",
  });
  mountRasterChangeTool(shell, change, "water extent");
  mountVectorChangeTool(shell, change, "waterbody extent");

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
  mountCitationTool(shell, citation, { pluginLabel: "GSX Hydrology", version: PLUGIN_VERSION });

  return () => shell.destroy();
}
