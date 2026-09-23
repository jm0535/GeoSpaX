// GSX LULC workbench (Land-Use and Land-Cover mapping): cover-index
// derivation, class reclassification, transition analysis between two dates
// and field/validation overlays. Outputs always use GeoLibre store APIs.

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
} from "../shared/raster-tools";
import { mountCitationTool } from "../shared/citation";
import { PLUGIN_VERSION } from "./index";

export function mountLulcPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-lulc",
    eyebrow: "GeoSpaX domain workbench",
    title: "GSX LULC",
    intro:
      "Derive land-use and land-cover maps: extract cover indices from satellite bands, reclassify them into class maps, quantify transitions between two dates and validate against field polygons.",
    accent: "#8a7a2e",
    guideUrl: `${GSX_GUIDE_BASE}/lulc/`,
  });

  const cover = shell.addSection({
    id: "cover-indices",
    title: "Cover indices",
    badge: "NDVI / NDBI",
    open: true,
    description:
      "Derive continuous cover indicators — vegetation (NDVI), water (NDWI), built/bare (NDBI) or a custom ratio — and polygonize the extent beyond a threshold as a first-pass cover class.",
  });
  mountIndexTool(shell, cover, { preset: "NDVI", threshold: 0.3, subject: "vegetation cover" });

  const classes = shell.addSection({
    id: "class-mapping",
    title: "Class mapping",
    badge: "Reclass",
    description:
      "Reclassify an index or coded raster into a discrete land-use / land-cover map (forest, cropland, settlement, water…) with explicit break values.",
  });
  mountRasterReclassTool(shell, classes, "land-cover class");

  const transitions = shell.addSection({
    id: "transitions",
    title: "Transition analysis",
    badge: "T1 / T2",
    description:
      "Compare two aligned cover rasters to map change — gains and losses per class with hectares — or diff polygon class boundaries between dates.",
  });
  mountRasterChangeTool(shell, transitions, "land-cover class");
  mountVectorChangeTool(shell, transitions, "mapped class extent");

  const validation = shell.addSection({
    id: "validation",
    title: "Field validation",
    badge: "Overlay",
    description:
      "Clip, intersect or spatially join mapped classes against field-survey or reference polygons to assess agreement before reporting the map.",
  });
  mountOverlayTool(shell, validation);

  const allocation = shell.addSection({
    id: "allocation",
    title: "Suitability & allocation",
    badge: "WLC",
    description:
      "Weight biophysical and accessibility criteria to model where a land use could expand or should be restricted, with every weight and direction stated.",
  });
  mountSuitabilityTool(shell, allocation, "land-use allocation");

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
  mountCitationTool(shell, citation, { pluginLabel: "GSX LULC", version: PLUGIN_VERSION });

  return () => shell.destroy();
}
