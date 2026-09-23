// GeoSpaX Environment workbench: terrain, normalized-difference indices,
// raster reclassification/change and vector overlay, all via GeoLibre APIs.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import { INDEX_PRESETS, type IndexPresetId } from "@geospax/analysis";
import { createPanelShell } from "../shared/ui";
import { mountOverlayTool, mountProvenanceTool } from "../shared/vector-tools";
import {
  mountIndexTool,
  mountRasterChangeTool,
  mountRasterReclassTool,
  mountSlopeTool,
} from "../shared/raster-tools";
import { mountCitationTool } from "../shared/citation";
import { PLUGIN_VERSION } from "./index";

export interface EnvironmentPanelState {
  slopeLayerName?: string | null;
  slopeBand?: number;
  slopeBreak1?: number;
  slopeBreak2?: number;
  indexLayerName?: string | null;
  indexPreset?: IndexPresetId;
  indexBandA?: number;
  indexBandB?: number;
  indexThreshold?: number;
}

const state: EnvironmentPanelState = {
  slopeBand: 1,
  slopeBreak1: 15,
  slopeBreak2: 30,
  indexPreset: "NDVI",
  indexBandA: 4,
  indexBandB: 3,
  indexThreshold: 0.2,
};

export function getPanelState(): EnvironmentPanelState {
  return { ...state };
}

export function applyPanelState(next: EnvironmentPanelState): void {
  if (typeof next.slopeLayerName === "string" || next.slopeLayerName === null)
    state.slopeLayerName = next.slopeLayerName;
  if (typeof next.slopeBand === "number" && Number.isFinite(next.slopeBand))
    state.slopeBand = Math.max(1, Math.round(next.slopeBand));
  if (typeof next.slopeBreak1 === "number" && Number.isFinite(next.slopeBreak1))
    state.slopeBreak1 = next.slopeBreak1;
  if (typeof next.slopeBreak2 === "number" && Number.isFinite(next.slopeBreak2))
    state.slopeBreak2 = next.slopeBreak2;
  if (typeof next.indexLayerName === "string" || next.indexLayerName === null)
    state.indexLayerName = next.indexLayerName;
  if (next.indexPreset && INDEX_PRESETS[next.indexPreset]) state.indexPreset = next.indexPreset;
  if (typeof next.indexBandA === "number" && Number.isFinite(next.indexBandA))
    state.indexBandA = Math.max(1, Math.round(next.indexBandA));
  if (typeof next.indexBandB === "number" && Number.isFinite(next.indexBandB))
    state.indexBandB = Math.max(1, Math.round(next.indexBandB));
  if (typeof next.indexThreshold === "number" && Number.isFinite(next.indexThreshold))
    state.indexThreshold = next.indexThreshold;
}

export function mountEnvironmentPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  const shell = createPanelShell(container, app, {
    id: "geospax-environment",
    eyebrow: "GeoSpaX domain workbench",
    title: "GSX Environment",
    intro:
      "Analyse terrain and raster indicators over the current map view, derive threshold extents, compare dates, and overlay environmental zones—with sampled resolution and methods stated on every result.",
    accent: "#4c7893",
  });

  const terrain = shell.addSection({
    id: "terrain",
    title: "Terrain",
    badge: "Horn slope",
    open: true,
    description:
      "Classify a sampled DEM into slope zones while excluding invalid 3×3 neighbourhoods and reporting ground pixel size.",
  });
  mountSlopeTool(shell, terrain, {
    subject: "environmental",
    rasterLayerName: state.slopeLayerName,
    band: state.slopeBand,
    break1: state.slopeBreak1,
    break2: state.slopeBreak2,
    onStateChange: (next) => {
      state.slopeLayerName = next.rasterLayerName;
      state.slopeBand = next.band;
      state.slopeBreak1 = next.break1;
      state.slopeBreak2 = next.break2;
    },
  });

  const indices = shell.addSection({
    id: "indices",
    title: "Spectral indices",
    badge: "NDVI / NDWI / NBR",
    description:
      "Compute a real normalized-difference grid, inspect an Otsu suggestion, and return a dissolved threshold extent.",
  });
  mountIndexTool(shell, indices, {
    preset: state.indexPreset,
    threshold: state.indexThreshold,
    rasterLayerName: state.indexLayerName,
    bandA: state.indexBandA,
    bandB: state.indexBandB,
    onStateChange: (next) => {
      state.indexLayerName = next.rasterLayerName;
      state.indexPreset = next.preset;
      state.indexBandA = next.bandA;
      state.indexBandB = next.bandB;
      state.indexThreshold = next.threshold;
    },
  });

  const raster = shell.addSection({
    id: "raster",
    title: "Raster analysis",
    badge: "Reclass / Change",
    description:
      "Threshold any sampled raster band or derive signed, aligned T1−T2 loss/gain classes.",
  });
  mountRasterReclassTool(shell, raster, "environmental zone");
  mountRasterChangeTool(shell, raster, "environmental indicator");

  const overlay = shell.addSection({
    id: "overlay",
    title: "Vector overlay",
    badge: "Intersect / Erase",
    description:
      "Combine environmental zones, administrative boundaries or derived extents without direct map mutation.",
  });
  mountOverlayTool(shell, overlay);

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
  mountCitationTool(shell, citation, { pluginLabel: "GSX Environment", version: PLUGIN_VERSION });

  return () => shell.destroy();
}
