// Change detection helpers — complements the 10 Whitebox change tools.
//
// Lightweight differencing and Otsu-on-difference for two-date rasters
// sampled via `readRasterWindow`. No server required.

import { histogramND, otsuThreshold, type Histogram } from "./raster";

export interface ChangeGrid {
  diff: Float32Array; // A - B
  width: number;
  height: number;
  validCells: number;
  nodataCells: number;
}

export function differenceGrid(
  aValues: number[],
  bValues: number[],
  width: number,
  height: number,
  nodataA: number | null,
  nodataB: number | null,
): ChangeGrid {
  const n = width * height;
  const diff = new Float32Array(n);
  let valid = 0, nodata = 0;
  if (aValues.length !== n || bValues.length !== n) {
    diff.fill(Number.NaN);
    return { diff, width, height, validCells: 0, nodataCells: n };
  }
  for (let i = 0; i < n; i++) {
    const a = aValues[i], b = bValues[i];
    const bad = !Number.isFinite(a) || !Number.isFinite(b) ||
      (nodataA !== null && a === nodataA) || (nodataB !== null && b === nodataB);
    if (bad) { diff[i] = Number.NaN; nodata++; } else { diff[i] = a - b; valid++; }
  }
  return { diff, width, height, validCells: valid, nodataCells: nodata };
}

export interface ChangeOtsu {
  histogram: Histogram;
  otsuGain: number | null;
  otsuLoss: number | null;
}

/** Otsu on the difference histogram: gain > threshold, loss < -threshold. */
export function changeOtsu(diff: Float32Array): ChangeOtsu {
  // Histogram over diff range expanded to cover typical forest loss values.
  // Estimate range from data to keep bins useful.
  const vals = Array.from(diff).filter((v) => Number.isFinite(v)) as number[];
  if (vals.length === 0) {
    const h = { counts: new Array(64).fill(0), edges: Array.from({length:65}, (_,i)=> -1 + i* (2/64)), binCount:64, range: [-1,1] as [number,number], totalValid:0 };
    return { histogram: h, otsuGain: null, otsuLoss: null };
  }
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo -= 1; hi += 1; }
  // Build histogram
  const binCount = 64;
  const counts = new Array(binCount).fill(0);
  const edges: number[] = [];
  const binW = (hi - lo) / binCount;
  for (let i=0;i<=binCount;i++) edges.push(lo + i*binW);
  for (const v of vals) {
    let b = Math.floor((v - lo)/binW);
    if (b<0) b=0; if (b>=binCount) b=binCount-1;
    counts[b]++;
  }
  const hist = { counts, edges, binCount, range: [lo,hi] as [number,number], totalValid: vals.length };
  const otsu = otsuThreshold(hist);
  // Single Otsu on diff is signed; split into gain/loss by sign.
  return { histogram: hist, otsuGain: otsu.threshold && otsu.threshold>0 ? otsu.threshold : null, otsuLoss: otsu.threshold && otsu.threshold<0 ? otsu.threshold : null };
}
