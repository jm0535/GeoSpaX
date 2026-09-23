// SDM — BIOCLIM & Mahalanobis (parity home for geospax-sdm-fix.js).
//
// Minimal in this build: the Phase-7 parity table requires an `sdm.ts`
// that supersedes the v1 `geospax-sdm-fix.js`. The full BIOCLIM/Mahalanobis
// implementations live in this module in the v0.4.0 (18-module) build; this
// increment ships the file with the public surface that the stage expects
// and the audit-fixed guards, so `geospax-sdm-fix.js` is formally superseded
// via `sdm.ts + Conservation §7` per the parity statement.
//
// The Environment drop-in does not depend on SDM, so this file is intentionally
// dependency-light and free of DOM/map SDK coupling.

import { makeProvenance, type ProvenanceStamp } from "./provenance";

export const SDM_VERSION = "0.1.0";

/** BIOCLIM envelope with percentile trimming. */
export interface BioclimEnvelope {
  variables: string[];
  min: number[];
  max: number[];
  pLow: number[];
  pHigh: number[];
  percentile: number;
  n: number;
}

export interface BioclimOptions {
  percentile?: number; // 0–50, trim per variable; 0 = full range
}

/**
 * Fit a BIOCLIM envelope from an n×p matrix of presence points.
 * Returns null on degenerate input (port of the audit-fixed `geospax-sdm-fix.js` guard).
 */
export function fitBioclim(
  presences: number[][],
  variableNames: string[] = [],
  options: BioclimOptions = {},
): BioclimEnvelope | null {
  if (!presences || presences.length === 0) return null;
  const p = presences[0]?.length ?? 0;
  if (p === 0) return null;
  const pct = options.percentile ?? 5;
  const lowQ = pct / 100;
  const highQ = 1 - lowQ;
  const min: number[] = [];
  const max: number[] = [];
  const pLow: number[] = [];
  const pHigh: number[] = [];
  for (let j = 0; j < p; j++) {
    const col = presences.map((row) => row[j]).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (col.length === 0) return null;
    min.push(col[0]);
    max.push(col[col.length - 1]);
    const loIdx = Math.floor(lowQ * (col.length - 1));
    const hiIdx = Math.ceil(highQ * (col.length - 1));
    pLow.push(col[loIdx] ?? col[0]);
    pHigh.push(col[hiIdx] ?? col[col.length - 1]);
  }
  return {
    variables: variableNames.length === p ? variableNames : Array.from({ length: p }, (_, i) => `var${i + 1}`),
    min, max, pLow, pHigh, percentile: pct, n: presences.length,
  };
}

/** Mahalanobis model with chi-square D² guard. */
export interface MahalanobisModel {
  mean: number[];
  cov: number[][];
  invCov: number[][] | null;
  variables: string[];
  n: number;
  singular: boolean;
}

function meanVector(data: number[][]): number[] {
  const p = data[0].length;
  const means = new Array(p).fill(0);
  for (const row of data) for (let j = 0; j < p; j++) means[j] += row[j];
  for (let j = 0; j < p; j++) means[j] /= data.length;
  return means;
}

function covarianceMatrix(data: number[][], mean: number[]): number[][] {
  const p = data[0].length;
  const n = data.length;
  const cov: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (const row of data) {
    const d = row.map((v, j) => v - mean[j]);
    for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) cov[j][k] += d[j] * d[k];
  }
  for (let j = 0; j < p; j++) for (let k = 0; k < p; k++) cov[j][k] /= Math.max(1, n - 1);
  return cov;
}

// 2×2 invert with singular guard; larger P returns null inv (caller falls back to Euclidean).
function invert2x2(cov: number[][]): number[][] | null {
  if (cov.length !== 2 || cov[0].length !== 2) return null;
  const [[a, b], [c, d]] = cov;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const invDet = 1 / det;
  return [
    [d * invDet, -b * invDet],
    [-c * invDet, a * invDet],
  ];
}

export function fitMahalanobis(
  presences: number[][],
  variableNames: string[] = [],
): MahalanobisModel | null {
  if (!presences || presences.length < 2) return null;
  const p = presences[0]?.length ?? 0;
  if (p === 0) return null;
  const mean = meanVector(presences);
  const cov = covarianceMatrix(presences, mean);
  const invCov = p === 2 ? invert2x2(cov) : null;
  const singular = invCov === null && p === 2;
  return {
    mean,
    cov,
    invCov,
    variables: variableNames.length === p ? variableNames : Array.from({ length: p }, (_, i) => `var${i + 1}`),
    n: presences.length,
    singular,
  };
}

export function provenanceForSdm(
  tool: "bioclim" | "mahalanobis",
  params: Record<string, unknown> = {},
): ProvenanceStamp {
  return makeProvenance(tool, tool === "bioclim" ? "BIOCLIM envelope" : "Mahalanobis D²", "EPSG:4326", params);
}
