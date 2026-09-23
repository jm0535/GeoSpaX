// Fragmentation & patch metrics — ported from geospax-conservation-m2.js (GYR-8).
//
// Pure functions over simple patch statistics; Whitebox Patch Orientation /
// Edge Proportion remain complements via the Processing toolbox.

import type { Feature, Polygon, MultiPolygon } from "geojson";
import { areaM2, perimeterM } from "./units";

export interface PatchMetric {
  id: string;
  areaM2: number;
  areaHa: number;
  perimeterM: number;
  shapeIndex: number;   // P / (2√(πA)) — 1 = circle
  edgeDensity: number;  // P / A  (m per m²)
  isCore?: boolean;
}

/** Metrics for a single polygonal patch. */
export function patchMetrics(
  feature: Feature<Polygon | MultiPolygon>,
  id = "patch",
): PatchMetric | null {
  if (!feature?.geometry) return null;
  const a = areaM2(feature);
  const p = perimeterM(feature);
  if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(p) || p <= 0) return null;
  const shapeIndex = p / (2 * Math.sqrt(Math.PI * a));
  return {
    id,
    areaM2: a,
    areaHa: a / 10000,
    perimeterM: p,
    shapeIndex,
    edgeDensity: p / a,
  };
}

/** Summary over many patches. */
export interface FragmentationSummary {
  patchCount: number;
  totalAreaM2: number;
  totalAreaHa: number;
  meanAreaHa: number;
  meanShapeIndex: number;
  totalPerimeterM: number;
}

export function summarizeFragmentation(patches: PatchMetric[]): FragmentationSummary {
  if (!patches || patches.length === 0) {
    return { patchCount: 0, totalAreaM2: 0, totalAreaHa: 0, meanAreaHa: 0, meanShapeIndex: 0, totalPerimeterM: 0 };
  }
  const totalAreaM2 = patches.reduce((s, p) => s + p.areaM2, 0);
  const totalPerimeterM = patches.reduce((s, p) => s + p.perimeterM, 0);
  const meanAreaHa = totalAreaM2 / patches.length / 10000;
  const meanShapeIndex = patches.reduce((s, p) => s + p.shapeIndex, 0) / patches.length;
  return { patchCount: patches.length, totalAreaM2, totalAreaHa: totalAreaM2 / 10000, meanAreaHa, meanShapeIndex, totalPerimeterM };
}
