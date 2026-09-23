// GSX Geoscience workbench: terrain and slope-class analysis, spectral
// ratio mapping for lithology and alteration, geological overlay operations
// and surface change. Outputs always use GeoLibre store APIs.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { createPanelShell, GSX_GUIDE_BASE } from "../shared/ui";
import {
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

export function mountGeosciencePanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-geoscience",
    eyebrow: "GeoSpaX domain workbench",
    title: "GSX Geoscience",
    intro:
      "Analyse terrain form, map lithological and alteration indicators from spectral ratios, run geological overlays and prospectivity surfaces, and quantify surface change.",
    accent: "#6b5b95",
    guideUrl: `${GSX_GUIDE_BASE}/geoscience.md`,
  });

  const terrain = shell.addSection({
    id: "terrain",
    title: "Terrain & slope classes",
    badge: "Horn slope",
    open: true,
    description:
      "Derive slope from a DEM with Horn's method, classify into standard slope-class bands for geotechnical or geomorphological interpretation, and report the pixel ground size.",
  });
  mountSlopeTool(shell, terrain, "terrain stability");
  mountRasterReclassTool(shell, terrain, "slope-class zone");

  const spectral = shell.addSection({
    id: "spectral-ratios",
    title: "Spectral ratios",
    badge: "NDBI / custom",
    description:
      "Map bare-rock and alteration proxies with NDBI, or any custom (A−B)/(A+B) band ratio — e.g. iron-oxide or clay-mineral ratios from multispectral scenes.",
  });
  mountIndexTool(shell, spectral, { preset: "NDBI", threshold: 0.0, subject: "lithological proxy" });

  const prospectivity = shell.addSection({
    id: "prospectivity",
    title: "Prospectivity & stability",
    badge: "WLC",
    description:
      "Combine geological, geophysical, geochemical and terrain evidence with explicit weights and directions into a transparent prospectivity or stability surface.",
  });
  mountSuitabilityTool(shell, prospectivity, "geological prospectivity");

  const overlay = shell.addSection({
    id: "overlay",
    title: "Geological overlay",
    badge: "Clip / Union",
    description:
      "Intersect, clip, union or spatially join geological polygons — e.g. clip sample catchments to lithology — with full geometry and attribute provenance.",
  });
  mountOverlayTool(shell, overlay);

  const change = shell.addSection({
    id: "change",
    title: "Surface change",
    badge: "T1 / T2",
    description:
      "Compare two aligned rasters (e.g. mine-face progression) or polygon boundaries, with the sign convention and area method reported.",
  });
  mountRasterChangeTool(shell, change, "surface / extraction change");
  mountVectorChangeTool(shell, change, "tenement or boundary extent");

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
  mountCitationTool(shell, citation, { pluginLabel: "GSX Geoscience", version: PLUGIN_VERSION });

  return () => shell.destroy();
}
