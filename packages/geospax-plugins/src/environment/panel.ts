// GeoSpaX Environment panel — Slope zones + Index extent (NDVI family).
//
// Vanilla DOM, no React. All heavy lifting is in @geospax/analysis (terrain.ts
// + raster.ts) so the panel stays a thin orchestrator around the host's
// `readRasterWindow` / `getViewBounds` / `addGeoJsonLayer` APIs.

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import {
  BAND_ASSIGNMENT_CAVEAT,
  INDEX_PRESETS,
  areaM2ForPixelCount,
  extentPolygonsForThreshold,
  histogramND,
  indexStatsRow,
  normalizedDifferenceGrid,
  otsuThreshold,
  rasterResolutionWarning,
} from "@geospax/analysis";
import {
  classifySlope,
  hornSlopeAndAspect,
  maskToPixelPolygons,
  pixelSizeAtCentre,
  steepMask,
  terrainResolutionWarning,
} from "@geospax/analysis";
import { formatArea, measureArea } from "@geospax/analysis";
import { makeProvenance, PROVENANCE_KEY } from "@geospax/analysis";
import { unionAll } from "@geospax/analysis";
import type { IndexPresetId } from "@geospax/analysis";

// ---------------------------------------------------------------------------
// Persistent state (project file round-trips the working context)
// ---------------------------------------------------------------------------

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
  if (typeof next.slopeLayerName === "string" || next.slopeLayerName === null) state.slopeLayerName = next.slopeLayerName;
  if (typeof next.slopeBand === "number" && Number.isFinite(next.slopeBand)) state.slopeBand = Math.max(1, Math.round(next.slopeBand));
  if (typeof next.slopeBreak1 === "number" && Number.isFinite(next.slopeBreak1)) state.slopeBreak1 = next.slopeBreak1;
  if (typeof next.slopeBreak2 === "number" && Number.isFinite(next.slopeBreak2)) state.slopeBreak2 = next.slopeBreak2;
  if (typeof next.indexLayerName === "string" || next.indexLayerName === null) state.indexLayerName = next.indexLayerName;
  if (next.indexPreset && INDEX_PRESETS[next.indexPreset as IndexPresetId]) state.indexPreset = next.indexPreset as IndexPresetId;
  if (typeof next.indexBandA === "number" && Number.isFinite(next.indexBandA)) state.indexBandA = Math.max(1, Math.round(next.indexBandA));
  if (typeof next.indexBandB === "number" && Number.isFinite(next.indexBandB)) state.indexBandB = Math.max(1, Math.round(next.indexBandB));
  if (typeof next.indexThreshold === "number" && Number.isFinite(next.indexThreshold)) state.indexThreshold = next.indexThreshold;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function tr(table: HTMLTableElement, cells: string[], header = false): void {
  const row = table.insertRow();
  for (const c of cells) {
    const cell = row.insertCell();
    cell.textContent = c;
    if (header) cell.style.fontWeight = "600";
  }
}

function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function clampBounds(bounds: [number, number, number, number] | null): [number, number, number, number] | null {
  if (!bounds) return null;
  const [w, s, e, n] = bounds;
  if (![w, s, e, n].every(Number.isFinite)) return null;
  return bounds;
}

// Choose a sampling grid that yields square pixels at the centre latitude.
// Width is the long side (256); height is scaled so pixelWidthM ≈ pixelHeightM.
function chooseGrid(bounds: [number, number, number, number]): { width: number; height: number } {
  const [west, south, eastRaw, north] = bounds;
  let east = eastRaw;
  if (east < west) east += 360;
  const centreLat = (south + north) / 2;
  // Inline haversine (radius 6371008.8) to keep the bundle standalone — matches
  // geometry.haversineM so portal / plugin agree on ground metres.
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const hav = (a: number[], b: number[]) => {
    const dLon = toRad(b[0] - a[0]);
    const dLat = toRad(b[1] - a[1]);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  };
  const centreLonForH = ((west + east) / 2 + 540) % 360 - 180;
  const widthM = hav([west, centreLat], [east, centreLat]);
  const heightM = hav([centreLonForH, south], [centreLonForH, north]);
  if (!Number.isFinite(widthM) || !Number.isFinite(heightM) || widthM <= 0 || heightM <= 0) {
    const dLon = Math.abs(east - west);
    const dLat = Math.abs(north - south);
    const target = 256;
    const w = target;
    const h = Math.max(64, Math.min(512, Math.round(target * (dLat / Math.max(dLon, 1e-6)))));
    return { width: w, height: h };
  }
  const target = 256;
  const w = target;
  const h = Math.max(64, Math.min(512, Math.round(target * (heightM / widthM))));
  return { width: w, height: h };
}

function drawHistogram(
  canvas: HTMLCanvasElement,
  hist: { counts: number[]; edges: number[]; binCount: number; range: [number, number] },
  otsu: number | null,
): void {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(280, Math.floor(rect.width * dpr) || 560);
  const H = Math.floor(84 * dpr);
  canvas.width = W;
  canvas.height = H;
  canvas.style.height = "84px";
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(0, 0, W, H);

  const padL = 10 * dpr, padR = 10 * dpr, padT = 8 * dpr, padB = 18 * dpr;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxC = Math.max(1, ...hist.counts);
  const binW = plotW / hist.binCount;
  ctx.fillStyle = "#7fae3a";
  for (let i = 0; i < hist.binCount; i++) {
    const c = hist.counts[i];
    const h = (c / maxC) * plotH;
    const x = padL + i * binW;
    const y = padT + plotH - h;
    // Slight gap so bars are distinct
    ctx.fillRect(x, y, Math.max(1, binW - 0.5 * dpr), h);
  }
  // axes
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1 * dpr;
  ctx.strokeRect(padL, padT, plotW, plotH);
  // X labels: -1, 0, 1
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.font = `${10 * dpr}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const lo = hist.range[0], hi = hist.range[1];
  for (const v of [lo, 0, hi]) {
    if (!Number.isFinite(v)) continue;
    const x = padL + ((v - lo) / (hi - lo)) * plotW;
    ctx.fillText(v.toFixed(1), x, padT + plotH + 3 * dpr);
    ctx.beginPath();
    ctx.moveTo(x, padT + plotH);
    ctx.lineTo(x, padT + plotH + 4 * dpr);
    ctx.stroke();
  }
  // Otsu line
  if (otsu !== null && Number.isFinite(otsu) && otsu >= lo && otsu <= hi) {
    const x = padL + ((otsu - lo) / (hi - lo)) * plotW;
    ctx.strokeStyle = "#b3541e";
    ctx.setLineDash([4 * dpr, 3 * dpr]);
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    // flag
    ctx.fillStyle = "#b3541e";
    ctx.font = `600 ${10 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "left";
    const label = `Otsu ${otsu.toFixed(3)}`;
    const tx = Math.min(W - padR - 54 * dpr, x + 4 * dpr);
    ctx.fillText(label, tx, padT + 2 * dpr);
  }
}

// ---------------------------------------------------------------------------
// Main mount
// ---------------------------------------------------------------------------

export function mountEnvironmentPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  container.innerHTML = "";
  const t = (k: string, fb: string) => app.translate?.(k, fb) ?? fb;

  const root = el("div", "gsp-env-root");

  const intro = el(
    "p",
    "gsp-env-intro",
    t(
      "geospax.environment.intro",
      "Terrain slope zones and normalized-difference index extents — sampled over the current map view. Every result declares the method that ran, the pixel ground size at the viewport centre, and the area it covers in equal-area hectares; warnings are surfaced, not silenced.",
    ),
  );
  root.appendChild(intro);

  // Global layer list refresh handle
  let layerRefresh = () => {};
  function layerNameById(id: string): string | null {
    return app.listLayers?.().find((l) => l.id === id)?.name ?? null;
  }
  function layerIdByName(name: string | null | undefined): string | null {
    if (!name) return null;
    return app.listLayers?.().find((l) => l.name === name)?.id ?? null;
  }

  // =======================================================================
  // §1 Slope zones
  // =======================================================================
  const slopeSection = el("div", "gsp-env-section");
  slopeSection.appendChild(el("h3", "gsp-env-section-title", t("geospax.environment.slopeTitle", "Terrain — Slope zones")));
  slopeSection.appendChild(
    el(
      "p",
      "gsp-env-hint",
      t(
        "geospax.environment.slopeHint",
        "Any DEM raster + band + two class breaks → Horn slope/aspect over the current view (pixel metres computed at the window's centre latitude) → steep-class polygons with equal-area area tables, pixel size and excluded-cell counts shown, resolution warning surfaced.",
      ),
    ),
  );

  const slopeLayerSelect = el("select", "gsp-env-select") as HTMLSelectElement;
  const slopeBandInput = el("input", "gsp-env-input gsp-env-input-narrow") as HTMLInputElement;
  slopeBandInput.type = "number";
  slopeBandInput.min = "1";
  slopeBandInput.step = "1";
  slopeBandInput.value = String(state.slopeBand ?? 1);

  const slopeBreak1 = el("input", "gsp-env-input gsp-env-input-narrow") as HTMLInputElement;
  slopeBreak1.type = "number";
  slopeBreak1.step = "1";
  slopeBreak1.value = String(state.slopeBreak1 ?? 15);

  const slopeBreak2 = el("input", "gsp-env-input gsp-env-input-narrow") as HTMLInputElement;
  slopeBreak2.type = "number";
  slopeBreak2.step = "1";
  slopeBreak2.value = String(state.slopeBreak2 ?? 30);

  const slopeDemRow = el("div", "gsp-env-row");
  slopeDemRow.appendChild(el("label", "gsp-env-label", t("geospax.environment.demLayer", "DEM layer (any raster)")));
  slopeDemRow.appendChild(slopeLayerSelect);
  slopeSection.appendChild(slopeDemRow);

  const slopeBandRow = el("div", "gsp-env-row-inline");
  const bandWrap = el("div", "gsp-env-row");
  bandWrap.appendChild(el("label", "gsp-env-label", t("geospax.environment.band", "Band")));
  bandWrap.appendChild(slopeBandInput);
  const b1Wrap = el("div", "gsp-env-row");
  b1Wrap.appendChild(el("label", "gsp-env-label", t("geospax.environment.break1", "Break 1 (°)")));
  b1Wrap.appendChild(slopeBreak1);
  const b2Wrap = el("div", "gsp-env-row");
  b2Wrap.appendChild(el("label", "gsp-env-label", t("geospax.environment.break2", "Break 2 (°)")));
  b2Wrap.appendChild(slopeBreak2);
  slopeBandRow.append(bandWrap, b1Wrap, b2Wrap);
  slopeSection.appendChild(slopeBandRow);

  const slopeRun = el("button", "gsp-env-run", t("geospax.environment.runSlope", "Classify slope zones"));
  slopeRun.type = "button";
  slopeSection.appendChild(slopeRun);

  const slopeStatus = el("div", "gsp-env-status");
  slopeSection.appendChild(slopeStatus);
  const slopeResults = el("div", "gsp-env-results");
  slopeSection.appendChild(slopeResults);

  root.appendChild(slopeSection);

  // =======================================================================
  // §2 Index extent (NDVI family)
  // =======================================================================
  const indexSection = el("div", "gsp-env-section");
  indexSection.appendChild(el("h3", "gsp-env-section-title", t("geospax.environment.indexTitle", "Spectral index — Index extent")));
  indexSection.appendChild(
    el(
      "p",
      "gsp-env-hint",
      t(
        "geospax.environment.indexHint",
        "NDVI / NDWI / NDBI / NBR presets or a custom band pair → normalized-difference grid → stats table (range, mean, valid cells), histogram with Otsu-suggested threshold, dissolve-polygonized extent layer stamped _geospax — with the band-assignment caveat printed on every result.",
      ),
    ),
  );

  const indexPresetSelect = el("select", "gsp-env-select") as HTMLSelectElement;
  for (const pid of ["NDVI", "NDWI", "NDBI", "NBR", "CUSTOM"] as const) {
    const p = INDEX_PRESETS[pid];
    const opt = el("option", undefined, `${p.id} — ${p.label}`);
    opt.value = p.id;
    if (pid === (state.indexPreset ?? "NDVI")) opt.selected = true;
    indexPresetSelect.appendChild(opt);
  }

  const indexLayerSelect = el("select", "gsp-env-select") as HTMLSelectElement;
  const indexBandA = el("input", "gsp-env-input gsp-env-input-narrow") as HTMLInputElement;
  indexBandA.type = "number";
  indexBandA.min = "1";
  indexBandA.step = "1";
  indexBandA.value = String(state.indexBandA ?? 4);

  const indexBandB = el("input", "gsp-env-input gsp-env-input-narrow") as HTMLInputElement;
  indexBandB.type = "number";
  indexBandB.min = "1";
  indexBandB.step = "1";
  indexBandB.value = String(state.indexBandB ?? 3);

  const indexThreshold = el("input", "gsp-env-input gsp-env-input-narrow") as HTMLInputElement;
  indexThreshold.type = "number";
  indexThreshold.step = "0.01";
  indexThreshold.value = String(state.indexThreshold ?? 0.2);

  // Preset description line that updates on selection — also the caveat anchor.
  const presetDesc = el("div", "gsp-env-hint");
  function refreshPresetDesc() {
    const pid = (indexPresetSelect.value as IndexPresetId) || "CUSTOM";
    const p = INDEX_PRESETS[pid];
    presetDesc.textContent = `${p.formula} — ${p.description} (A=${p.aLabel}, B=${p.bLabel})`;
    // Hint the expected band numbers as placeholders? Leave inputs as-is.
  }
  refreshPresetDesc();

  const indexPresetRow = el("div", "gsp-env-row");
  indexPresetRow.appendChild(el("label", "gsp-env-label", t("geospax.environment.preset", "Preset")));
  indexPresetRow.appendChild(indexPresetSelect);
  indexPresetRow.appendChild(presetDesc);
  indexSection.appendChild(indexPresetRow);

  const indexLayerRow = el("div", "gsp-env-row");
  indexLayerRow.appendChild(el("label", "gsp-env-label", t("geospax.environment.rasterLayer", "Multispectral raster layer")));
  indexLayerRow.appendChild(indexLayerSelect);
  indexSection.appendChild(indexLayerRow);

  const indexBandsRow = el("div", "gsp-env-row-inline");
  const bARow = el("div", "gsp-env-row");
  bARow.appendChild(el("label", "gsp-env-label", t("geospax.environment.bandA", "Band A (numerator)")));
  bARow.appendChild(indexBandA);
  const bBRow = el("div", "gsp-env-row");
  bBRow.appendChild(el("label", "gsp-env-label", t("geospax.environment.bandB", "Band B")));
  bBRow.appendChild(indexBandB);
  const thRow = el("div", "gsp-env-row");
  thRow.appendChild(el("label", "gsp-env-label", t("geospax.environment.threshold", "Threshold (Otsu suggestion)")));
  thRow.appendChild(indexThreshold);
  indexBandsRow.append(bARow, bBRow, thRow);
  indexSection.appendChild(indexBandsRow);

  // Caveat printed persistently above the run button (also re-printed in results).
  const caveatStatic = el("div", "gsp-env-caveat", BAND_ASSIGNMENT_CAVEAT);
  indexSection.appendChild(caveatStatic);

  const indexRun = el("button", "gsp-env-run", t("geospax.environment.runIndex", "Compute index extent"));
  indexRun.type = "button";
  indexSection.appendChild(indexRun);

  const indexStatus = el("div", "gsp-env-status");
  indexSection.appendChild(indexStatus);
  const indexResults = el("div", "gsp-env-results");
  indexSection.appendChild(indexResults);

  root.appendChild(indexSection);

  // Layer refresh wiring
  function refreshLayers() {
    const layers = app.listLayers?.() ?? [];
    const prevSlope = slopeLayerSelect.value ? layerNameById(slopeLayerSelect.value) : state.slopeLayerName;
    const prevIndex = indexLayerSelect.value ? layerNameById(indexLayerSelect.value) : state.indexLayerName;

    for (const [select, placeholder, selectedName] of [
      [slopeLayerSelect, t("geospax.environment.pickDem", "— select DEM raster layer —"), prevSlope],
      [indexLayerSelect, t("geospax.environment.pickRaster", "— select raster layer —"), prevIndex],
    ] as const) {
      select.innerHTML = "";
      const ph = el("option", undefined, placeholder);
      ph.value = "";
      select.appendChild(ph);
      for (const layer of layers) {
        const opt = el("option", undefined, layer.name);
        opt.value = layer.id;
        if (selectedName && layer.name === selectedName) opt.selected = true;
        select.appendChild(opt);
      }
    }
  }
  layerRefresh = refreshLayers;
  refreshLayers();

  // -----------------------------------------------------------------------
  // Rendering helpers for each tool's results
  // -----------------------------------------------------------------------

  function renderSlopeResult(
    layerName: string,
    band: number,
    breaks: [number, number],
    bounds: [number, number, number, number],
    grid: { width: number; height: number },
    pix: ReturnType<typeof pixelSizeAtCentre>,
    horn: ReturnType<typeof hornSlopeAndAspect>,
    classes: ReturnType<typeof classifySlope>,
  ): void {
    slopeResults.innerHTML = "";
    if (!pix) {
      slopeResults.appendChild(el("div", "gsp-env-warn", t("geospax.environment.pixelFail", "Could not derive pixel ground size for this view — check the viewport bounds.")));
      return;
    }

    // Pixel size + excluded-cell counts shown (spec)
    const pixLine = el(
      "div",
      "gsp-env-pixels",
      `Pixel: ${pix.pixelWidthM.toFixed(1)} m × ${pix.pixelHeightM.toFixed(1)} m at lat ${pix.centreLat.toFixed(3)}° · grid ${grid.width}×${grid.height} · window ${pix.windowWidthM.toFixed(0)} m × ${pix.windowHeightM.toFixed(0)} m · ${pix.pixelAreaM2.toFixed(1)} m²/pixel (${(pix.pixelAreaM2/10000).toFixed(3)} ha/pixel)`,
    );
    slopeResults.appendChild(pixLine);

    const countsLine = el(
      "div",
      "gsp-env-pixels",
      `Cells: valid ${horn.validCells.toLocaleString("en-AU")} · border-excluded ${horn.borderExcluded.toLocaleString("en-AU")} · nodata-excluded ${horn.nodataExcluded.toLocaleString("en-AU")} · total ${horn.totalCells.toLocaleString("en-AU")}`,
    );
    slopeResults.appendChild(countsLine);

    // Resolution warning surfaced
    const warn = terrainResolutionWarning(pix.pixelWidthM, pix.pixelHeightM, grid.width, grid.height);
    if (warn) {
      slopeResults.appendChild(el("div", "gsp-env-warn", `⚠ ${warn}`));
    }

    // Equal-area area table (spec)
    const areaM2 = (c: number) => c * pix.pixelAreaM2;
    const table = el("table", "gsp-env-table") as HTMLTableElement;
    tr(table, [t("geospax.environment.slopeClass", "Slope class"), t("geospax.environment.cells", "Cells"), t("geospax.environment.area", "Area"), t("geospax.environment.share", "% valid")], true);
    const labels = classes.labels;
    const counts = classes.counts as [number, number, number];
    const totalV = Math.max(1, classes.totalValid);
    for (let i = 0; i < 3; i++) {
      const ha = formatArea(areaM2(counts[i]), "ha");
      const pct = ((counts[i] / totalV) * 100).toFixed(1);
      const rowLabel = i === 2 ? `${labels[i]} — steep (polygonized)` : labels[i];
      tr(table, [rowLabel, counts[i].toLocaleString("en-AU"), ha.display, pct]);
    }
    slopeResults.appendChild(table);

    // Method that actually ran — never silent (v1 audit rule)
    const method = el(
      "div",
      "gsp-env-method",
      `${t("geospax.environment.method", "Method")}: Horn slope/aspect (3×3) on DEM band ${band} sampled ${grid.width}×${grid.height} over [${bounds[0].toFixed(3)}, ${bounds[1].toFixed(3)}, ${bounds[2].toFixed(3)}, ${bounds[3].toFixed(3)}] · pixel ${pix.pixelWidthM.toFixed(1)}×${pix.pixelHeightM.toFixed(1)} m at ${pix.centreLat.toFixed(3)}° · breaks ${breaks[0]}°, ${breaks[1]}° · equal-area via pixel count × pixel area`,
    );
    slopeResults.appendChild(method);
    slopeResults.appendChild(el("div", "gsp-env-pixels", `Steep threshold: ≥ ${breaks[1]}° → ${counts[2].toLocaleString("en-AU")} cells (${formatArea(areaM2(counts[2]), "ha").display}) polygonized and dissolved. Source DEM: "${layerName}".`));
  }

  function renderIndexResult(
    layerName: string,
    presetId: IndexPresetId,
    bandA: number,
    bandB: number,
    threshold: number,
    bounds: [number, number, number, number],
    grid: { width: number; height: number },
    pix: ReturnType<typeof pixelSizeAtCentre>,
    g: ReturnType<typeof normalizedDifferenceGrid>,
    hist: ReturnType<typeof histogramND>,
    otsu: ReturnType<typeof otsuThreshold>,
    extentCellCount: number,
    canvas: HTMLCanvasElement,
  ): void {
    indexResults.innerHTML = "";
    if (!pix) {
      indexResults.appendChild(el("div", "gsp-env-warn", t("geospax.environment.pixelFail", "Could not derive pixel ground size for this view.")));
      return;
    }
    // Stats table (range, mean, valid cells)
    const stats = indexStatsRow(g);
    const table = el("table", "gsp-env-table") as HTMLTableElement;
    tr(table, [t("geospax.environment.stat", "Stat"), t("geospax.environment.value", "Value")], true);
    tr(table, [t("geospax.environment.range", "Range (valid ND)"), Number.isFinite(stats.min) ? `${fmtNum(stats.min, 3)} → ${fmtNum(stats.max, 3)}` : "—"]);
    tr(table, [t("geospax.environment.mean", "Mean"), fmtNum(stats.mean, 4)]);
    tr(table, [t("geospax.environment.validCells", "Valid cells"), `${stats.validCells.toLocaleString("en-AU")} / ${stats.totalCells.toLocaleString("en-AU")}`]);
    tr(table, [t("geospax.environment.nodataCells", "Excluded (nodata/0-denom)"), stats.nodataCells.toLocaleString("en-AU")]);
    tr(table, [t("geospax.environment.grid", "Sampled grid"), `${grid.width}×${grid.height} · pixel ${pix.pixelWidthM.toFixed(1)}×${pix.pixelHeightM.toFixed(1)} m`]);
    tr(table, [t("geospax.environment.extentCells", `Extent (ND ≥ ${threshold.toFixed(3)})`), `${extentCellCount.toLocaleString("en-AU")} cells · ${formatArea(areaM2ForPixelCount(extentCellCount, pix.pixelAreaM2), "ha").display}`]);
    indexResults.appendChild(table);

    // Histogram with Otsu-suggested threshold
    const histWrap = el("div", "gsp-env-hist-wrap");
    const otsuText = otsu.threshold !== null ? `Otsu-suggested threshold: ${otsu.threshold.toFixed(3)} (bin ${otsu.binIndex})` : "Otsu: no bimodal split — threshold left at your value";
    histWrap.appendChild(el("div", "gsp-env-hist-title", `Histogram (ND −1 → 1, ${hist.binCount} bins) · ${otsuText}`));
    histWrap.appendChild(canvas);
    const otsuNote = el("div", "gsp-env-pixels", otsu.threshold !== null ? `Histogram Otsu threshold marked at ${otsu.threshold.toFixed(3)} — dissolve-polygonized extent uses ND ≥ ${threshold.toFixed(3)} (you can edit the threshold above and re-run).` : "Otsu could not split this distribution (fewer than two occupied modes) — the threshold above was used.");
    histWrap.appendChild(otsuNote);
    indexResults.appendChild(histWrap);

    // Resolution warning surfaced
    const warn = rasterResolutionWarning(pix.pixelWidthM, pix.pixelHeightM, grid.width, grid.height);
    if (warn) indexResults.appendChild(el("div", "gsp-env-warn", `⚠ ${warn}`));

    // Pixel + excluded counts shown
    indexResults.appendChild(el("div", "gsp-env-pixels", `Pixel: ${pix.pixelWidthM.toFixed(1)}×${pix.pixelHeightM.toFixed(1)} m at ${pix.centreLat.toFixed(3)}° · ${pix.pixelAreaM2.toFixed(1)} m²/pixel · window ${pix.windowWidthM.toFixed(0)}×${pix.windowHeightM.toFixed(0)} m · bounds [${bounds.map((v) => v.toFixed(3)).join(", ")}]`));

    // Method declaration
    const preset = INDEX_PRESETS[presetId];
    indexResults.appendChild(
      el(
        "div",
        "gsp-env-method",
        `${t("geospax.environment.method", "Method")}: ${presetId} ${preset.formula} with Band A=${bandA} (${preset.aLabel}) vs Band B=${bandB} (${preset.bLabel}) sampled ${grid.width}×${grid.height} over current view; Otsu bin ${otsu.binIndex ?? "—"} (variance ${otsu.betweenVariance !== null ? otsu.betweenVariance.toExponential(2) : "—"}); dissolve-polygonized (union of pixel rectangles) extent at ≥ ${threshold.toFixed(3)}; area via pixel count × pixel area; raster "${layerName}".`,
      ),
    );
    // Band-assignment caveat printed on every result (spec — must be verbatim and visible)
    indexResults.appendChild(el("div", "gsp-env-caveat", BAND_ASSIGNMENT_CAVEAT));
  }

  // -----------------------------------------------------------------------
  // Slope run
  // -----------------------------------------------------------------------
  async function runSlope(): Promise<void> {
    slopeStatus.className = "gsp-env-status";
    slopeResults.innerHTML = "";
    const layerId = slopeLayerSelect.value;
    if (!layerId) {
      slopeStatus.className = "gsp-env-status gsp-env-warn";
      slopeStatus.textContent = t("geospax.environment.needDem", "Select a DEM raster layer.");
      return;
    }
    const band = Math.max(1, Math.round(Number(slopeBandInput.value) || 1));
    const b1 = Number(slopeBreak1.value);
    const b2 = Number(slopeBreak2.value);
    if (!Number.isFinite(b1) || !Number.isFinite(b2) || b1 <= 0 || b2 <= 0) {
      slopeStatus.className = "gsp-env-status gsp-env-warn";
      slopeStatus.textContent = t("geospax.environment.needBreaks", "Enter two positive class breaks in degrees (e.g. 15 and 30).");
      return;
    }
    const breaks: [number, number] = [b1, b2];
    // Persist
    const layerName = layerNameById(layerId) ?? layerId;
    state.slopeLayerName = layerName;
    state.slopeBand = band;
    state.slopeBreak1 = Math.min(b1, b2);
    state.slopeBreak2 = Math.max(b1, b2);
    const sortedBreaks: [number, number] = [Math.min(b1, b2), Math.max(b1, b2)];

    const rawBounds = clampBounds(app.getViewBounds?.() ?? null);
    if (!rawBounds) {
      slopeStatus.className = "gsp-env-status gsp-env-warn";
      slopeStatus.textContent = t("geospax.environment.noBounds", "No map viewport bounds — pan or zoom the map so a view is visible, then run again.");
      return;
    }
    const bounds: [number, number, number, number] = rawBounds;
    const grid = chooseGrid(bounds);
    const pix = pixelSizeAtCentre(bounds, grid.width, grid.height);

    if (!app.readRasterWindow) {
      slopeStatus.className = "gsp-env-status gsp-env-warn";
      slopeStatus.textContent = t("geospax.environment.noRasterApi", "This GeoLibre build does not expose readRasterWindow — raster sampling is unavailable.");
      return;
    }

    slopeStatus.textContent = t("geospax.environment.slopeSampling", `Sampling DEM band ${band} over current view (${grid.width}×${grid.height})…`);
    await new Promise((r) => setTimeout(r, 0));

    let reading: Awaited<ReturnType<NonNullable<GeoLibreAppAPI["readRasterWindow"]>>> = null;
    try {
      reading = await app.readRasterWindow(layerId, { bounds, width: grid.width, height: grid.height, band });
    } catch (err) {
      slopeStatus.className = "gsp-env-status gsp-env-warn";
      slopeStatus.textContent = `${t("geospax.environment.readError", "Could not sample the raster window.")} (${String(err)})`;
      return;
    }
    if (!reading) {
      slopeStatus.className = "gsp-env-status gsp-env-warn";
      slopeStatus.textContent = t("geospax.environment.emptyReading", "The raster returned no data for the current viewport — check the DEM layer has data here and the band number is valid.");
      return;
    }
    const values = reading.values;
    const width = reading.width;
    const height = reading.height;
    const nodata = reading.nodata;

    if (!values || values.length !== width * height) {
      slopeStatus.className = "gsp-env-status gsp-env-warn";
      slopeStatus.textContent = t("geospax.environment.badGrid", "Raster window returned an unexpected grid — try again or pick a different DEM layer.");
      return;
    }

    const pixForReading = pixelSizeAtCentre(bounds, width, height) ?? pix;
    if (!pixForReading) {
      slopeStatus.className = "gsp-env-status gsp-env-warn";
      slopeStatus.textContent = t("geospax.environment.pixelFail", "Could not derive pixel ground size for this view.");
      return;
    }

    const horn = hornSlopeAndAspect({
      values,
      width,
      height,
      pixelWidthM: pixForReading.pixelWidthM,
      pixelHeightM: pixForReading.pixelHeightM,
      nodata,
    });

    if (horn.validCells === 0) {
      slopeStatus.className = "gsp-env-status gsp-env-warn";
      slopeStatus.textContent = t("geospax.environment.noValidSlope", `No valid DEM neighbourhoods in this view (border ${horn.borderExcluded}, nodata ${horn.nodataExcluded}). Pan to an area with valid elevation or check the nodata / band. Pixel ${pixForReading.pixelWidthM.toFixed(1)}×${pixForReading.pixelHeightM.toFixed(1)} m at ${pixForReading.centreLat.toFixed(3)}°.`);
      renderSlopeResult(layerName, band, sortedBreaks, bounds, { width, height }, pixForReading, horn, classifySlope(horn.slopeDeg, sortedBreaks, horn));
      return;
    }

    const classes = classifySlope(horn.slopeDeg, sortedBreaks, horn);
    const steepCount = classes.counts[2];
    const mask = steepMask(horn.slopeDeg, sortedBreaks, 2);
    let addedPolys = 0;
    let dissolvedFeature: Feature<Polygon | MultiPolygon> | null = null;

    if (steepCount > 0) {
      // Build pixel rectangles for steep cells
      const rects = maskToPixelPolygons(mask, width, height, bounds);
      addedPolys = rects.length;
      // Dissolve when tractable — unionAll caps internally at ~5000 rects gracefully
      // by skipping, so guard against huge counts that would freeze the UI.
      if (rects.length > 4000) {
        // Too many to dissolve in-browser in a single frame: add as FeatureCollection
        // of pixel rects (still polygonized, still stamped), and warn.
        const areaM2 = steepCount * pixForReading.pixelAreaM2;
        const provenance = makeProvenance("slope-zones", `Horn slope ≥ ${sortedBreaks[1]}°`, `WGS84 view → pixel ${pixForReading.pixelWidthM.toFixed(1)}×${pixForReading.pixelHeightM.toFixed(1)} m at ${pixForReading.centreLat.toFixed(3)}°`, {
          demLayer: layerName,
          band,
          breaksDeg: sortedBreaks,
          grid: `${width}×${height}`,
          pixelM: `${pixForReading.pixelWidthM.toFixed(2)}×${pixForReading.pixelHeightM.toFixed(2)}`,
          centreLat: pixForReading.centreLat,
          bounds,
          steepCells: steepCount,
          validCells: horn.validCells,
          nodataExcluded: horn.nodataExcluded,
          borderExcluded: horn.borderExcluded,
          method: `Horn (3×3) slope/aspect; steep ≥ ${sortedBreaks[1]}° polygonized without dissolve (${rects.length} cells — too many to dissolve in this view)`,
          caveat: "View-dependent: the steep extent is the sampled grid dissolved at this viewport/zoom. Resampling at another view recomputes it.",
        });
        // Slice to avoid enormous layer
        const sliced = rects.slice(0, 4000);
        const fc = { type: "FeatureCollection" as const, features: sliced.map((f, i) => ({
          ...f,
          properties: {
            ...(f.properties ?? {}),
            class: "steep",
            break_deg: sortedBreaks[1],
            steep_cells: steepCount,
            area_m2: areaM2,
            area_ha: areaM2 / 10000,
            method: `Horn slope ≥ ${sortedBreaks[1]}°`,
            crs: `Pixel ${pixForReading.pixelWidthM.toFixed(1)}×${pixForReading.pixelHeightM.toFixed(1)} m at ${pixForReading.centreLat.toFixed(3)}°`,
            [PROVENANCE_KEY]: provenance,
            _idx: i,
          },
        })) };
        app.addGeoJsonLayer(`Steep ≥${sortedBreaks[1]}° (${layerName}) — ${rects.length} cells shown (4000 max)`, fc);
        slopeStatus.textContent = t("geospax.environment.slopeDoneMany", `Slope zones complete — steep class ${steepCount.toLocaleString("en-AU")} cells (${formatArea(areaM2, "ha").display}) across ${rects.length} pixel polys. Too many to dissolve in this view: showing first 4000. Zoom in for a tractable steep extent.`);
      } else {
        // Dissolve pixel rects via unionAll (iterative)
        let dissolved: Feature<Polygon | MultiPolygon> | null = null;
        try {
          dissolved = unionAll(rects as unknown as Feature<Polygon | MultiPolygon>[]) as Feature<Polygon | MultiPolygon> | null;
        } catch {
          dissolved = null;
        }
        // Fallback: if union failed, fall back to undissolved FeatureCollection
        if (!dissolved) {
          const areaM2 = steepCount * pixForReading.pixelAreaM2;
          const provenance = makeProvenance("slope-zones", `Horn slope ≥ ${sortedBreaks[1]}°`, `Pixel ${pixForReading.pixelWidthM.toFixed(1)}×${pixForReading.pixelHeightM.toFixed(1)} m at ${pixForReading.centreLat.toFixed(3)}°`, {
            demLayer: layerName, band, breaksDeg: sortedBreaks, grid: `${width}×${height}`, bounds,
            steepCells: steepCount, validCells: horn.validCells, nodataExcluded: horn.nodataExcluded, borderExcluded: horn.borderExcluded,
          });
          const fc = { type: "FeatureCollection" as const, features: rects.map((f, i) => ({ ...f, properties: { ...(f.properties ?? {}), class: "steep", break_deg: sortedBreaks[1], area_m2: areaM2 / rects.length, [PROVENANCE_KEY]: provenance, _idx: i } })) };
          app.addGeoJsonLayer(`Steep ≥${sortedBreaks[1]}° (${layerName})`, fc);
          dissolvedFeature = null;
          slopeStatus.textContent = t("geospax.environment.slopeDone", `Slope zones complete — steep class ${steepCount.toLocaleString("en-AU")} cells (${formatArea(areaM2, "ha").display}) polygonized. Dissolve fell back to pixel polys.`);
        } else {
          // Measure dissolved area both ways: pixel-count vs equal-area LAEA for honesty
          const pixelAreaM2 = steepCount * pixForReading.pixelAreaM2;
          let equalAreaM2: number | null = null;
          try {
            const m = measureArea([dissolved as unknown as Feature<Polygon | MultiPolygon>], "equalarea");
            // measureArea may claim Spherical if no finite bbox — then ignore equalArea
            if (m.method.includes("LAEA")) equalAreaM2 = m.m2;
          } catch { equalAreaM2 = null; }
          const provenance = makeProvenance("slope-zones", `Horn slope ≥ ${sortedBreaks[1]}°`, `Pixel ${pixForReading.pixelWidthM.toFixed(1)}×${pixForReading.pixelHeightM.toFixed(1)} m at ${pixForReading.centreLat.toFixed(3)}°`, {
            demLayer: layerName, band, breaksDeg: sortedBreaks, grid: `${width}×${height}`, bounds,
            steepCells: steepCount, validCells: horn.validCells, nodataExcluded: horn.nodataExcluded, borderExcluded: horn.borderExcluded,
            pixelAreaM2: pixForReading.pixelAreaM2, pixelAreaHa: pixForReading.pixelAreaM2/10000,
            dissolvedFeature: !!dissolved, rects: rects.length,
          });
          dissolved.properties = {
            ...(dissolved.properties ?? {}),
            class: "steep",
            break_deg: sortedBreaks[1],
            steep_cells: steepCount,
            pixel_area_m2: pixForReading.pixelAreaM2,
            area_m2_pixel: pixelAreaM2,
            area_ha_pixel: pixelAreaM2 / 10000,
            ...(equalAreaM2 !== null ? { area_m2_equalarea: equalAreaM2, area_ha_equalarea: equalAreaM2/10000 } : {}),
            method: `Horn slope ≥ ${sortedBreaks[1]}°`,
            crs: `Pixel ${pixForReading.pixelWidthM.toFixed(1)}×${pixForReading.pixelHeightM.toFixed(1)} m at ${pixForReading.centreLat.toFixed(3)}°`,
            [PROVENANCE_KEY]: provenance,
          };
          dissolvedFeature = dissolved;
          const displayArea = equalAreaM2 !== null ? formatArea(equalAreaM2, "ha").display : formatArea(pixelAreaM2, "ha").display;
          const fc = { type: "FeatureCollection" as const, features: [dissolved as unknown as Feature<Polygon | MultiPolygon>] };
          app.addGeoJsonLayer(`Steep ≥${sortedBreaks[1]}° (${layerName}) — ${displayArea}`, fc);
          slopeStatus.textContent = t("geospax.environment.slopeDoneDissolved", `Slope zones complete — steep ≥ ${sortedBreaks[1]}°: ${steepCount.toLocaleString("en-AU")} cells (${displayArea}) dissolve-polygonized. Added to map.`);
        }
      }
    } else {
      slopeStatus.textContent = t("geospax.environment.slopeNoSteep", `Slope zones complete — no cells meet the steep threshold (≥ ${sortedBreaks[1]}°). Adjust breaks or pan to steeper terrain.`);
    }

    renderSlopeResult(layerName, band, sortedBreaks, bounds, { width, height }, pixForReading, horn, classes);
    void addedPolys; void dissolvedFeature;
  }

  // -----------------------------------------------------------------------
  // Index run
  // -----------------------------------------------------------------------
  // Cache the last grid so threshold re-runs don't re-sample unless bounds changed
  let lastIndexGrid: {
    nd: Float32Array;
    width: number;
    height: number;
    bounds: [number, number, number, number];
    pix: ReturnType<typeof pixelSizeAtCentre>;
    g: ReturnType<typeof normalizedDifferenceGrid>;
    hist: ReturnType<typeof histogramND>;
    otsu: ReturnType<typeof otsuThreshold>;
    layerName: string;
    presetId: IndexPresetId;
    bandA: number;
    bandB: number;
    validFor: string;
  } | null = null;

  async function runIndex(): Promise<void> {
    indexStatus.className = "gsp-env-status";
    indexResults.innerHTML = "";
    const layerId = indexLayerSelect.value;
    if (!layerId) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = t("geospax.environment.needRaster", "Select a multispectral raster layer.");
      return;
    }
    const presetId = (indexPresetSelect.value as IndexPresetId) || "CUSTOM";
    const bandA = Math.max(1, Math.round(Number(indexBandA.value) || 1));
    const bandB = Math.max(1, Math.round(Number(indexBandB.value) || 1));
    const threshRaw = Number(indexThreshold.value);
    const thresholdInput = Number.isFinite(threshRaw) ? threshRaw : 0;

    if (bandA === bandB) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = t("geospax.environment.sameBands", "Pick two different bands — the normalized difference of a band with itself is always zero.");
      return;
    }

    const layerName = layerNameById(layerId) ?? layerId;
    state.indexLayerName = layerName;
    state.indexPreset = presetId;
    state.indexBandA = bandA;
    state.indexBandB = bandB;
    state.indexThreshold = thresholdInput;

    const rawBounds = clampBounds(app.getViewBounds?.() ?? null);
    if (!rawBounds) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = t("geospax.environment.noBounds", "No map viewport bounds — pan or zoom the map so a view is visible, then run again.");
      return;
    }
    const bounds: [number, number, number, number] = rawBounds;
    const grid = chooseGrid(bounds);
    const pix = pixelSizeAtCentre(bounds, grid.width, grid.height);
    if (!app.readRasterWindow) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = t("geospax.environment.noRasterApi", "This GeoLibre build does not expose readRasterWindow — raster sampling is unavailable.");
      return;
    }

    // Determine threshold to use for polygonization: if user left threshold at 0.2 but Otsu suggests something else,
    // we still use the user's value, but we will suggest Otsu after computing.
    indexStatus.textContent = t("geospax.environment.indexSampling", `Sampling bands ${bandA} and ${bandB} over current view (${grid.width}×${grid.height}) for ${presetId}…`);
    await new Promise((r) => setTimeout(r, 0));

    let aReading: Awaited<ReturnType<NonNullable<GeoLibreAppAPI["readRasterWindow"]>>> = null;
    let bReading: Awaited<ReturnType<NonNullable<GeoLibreAppAPI["readRasterWindow"]>>> = null;
    try {
      [aReading, bReading] = await Promise.all([
        app.readRasterWindow(layerId, { bounds, width: grid.width, height: grid.height, band: bandA }),
        app.readRasterWindow(layerId, { bounds, width: grid.width, height: grid.height, band: bandB }),
      ]);
    } catch (err) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = `${t("geospax.environment.readError", "Could not sample the raster window.")} (${String(err)})`;
      return;
    }
    if (!aReading || !bReading) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = t("geospax.environment.emptyReading", "The raster returned no data for the current viewport — check the raster has data here and the band numbers are valid.");
      return;
    }
    // Width/height should match but be defensive if host returns different
    const w = aReading.width, h = aReading.height;
    if (aReading.width !== bReading.width || aReading.height !== bReading.height) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = t("geospax.environment.mismatchedGrid", "Band windows returned mismatched grids — try again.");
      return;
    }
    const valuesA = aReading.values, valuesB = bReading.values;
    if (!valuesA || !valuesB || valuesA.length !== w * h || valuesB.length !== w * h) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = t("geospax.environment.badGrid", "Raster windows returned unexpected grids — try again or pick a different raster layer.");
      return;
    }

    const pixForReading = pixelSizeAtCentre(bounds, w, h) ?? pix;
    const g = normalizedDifferenceGrid(valuesA, valuesB, w, h, aReading.nodata, bReading.nodata);
    if (g.validCells === 0) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = t("geospax.environment.noValidND", `No valid normalized-difference cells in this view (total ${(w*h).toLocaleString("en-AU")}, nodata ${g.nodataCells.toLocaleString("en-AU")}). Check band numbers, nodata, and that the viewport overlaps the raster.`);
      // Still render stats table + caveat so the empty result is honest
      const histEmpty = histogramND(g.nd, 64, [-1, 1]);
      const otsuEmpty = otsuThreshold(histEmpty);
      const canvasEmpty = document.createElement("canvas") as HTMLCanvasElement;
      canvasEmpty.className = "gsp-env-canvas";
      drawHistogram(canvasEmpty, histEmpty, otsuEmpty.threshold);
      renderIndexResult(layerName, presetId, bandA, bandB, thresholdInput, bounds, { width: w, height: h }, pixForReading, g, histEmpty, otsuEmpty, 0, canvasEmpty);
      // Suggest Otsu by filling the input if it found one
      if (otsuEmpty.threshold !== null && Number.isFinite(otsuEmpty.threshold)) {
        indexThreshold.value = otsuEmpty.threshold.toFixed(3);
        state.indexThreshold = otsuEmpty.threshold;
      }
      return;
    }

    const hist = histogramND(g.nd, 64, [-1, 1]);
    const otsu = otsuThreshold(hist);
    // If threshold input is still the default 0.2 and Otsu found a threshold, adopt it
    // for the polygonization (but keep user's explicit edits).
    let threshold = thresholdInput;
    const isDefaultThresh = Math.abs(thresholdInput - 0.2) < 1e-6 && (indexThreshold.dataset.userEdited !== "1");
    if (isDefaultThresh && otsu.threshold !== null && Number.isFinite(otsu.threshold)) {
      threshold = otsu.threshold;
      indexThreshold.value = threshold.toFixed(3);
      state.indexThreshold = threshold;
    }

    // Build histogram canvas
    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    canvas.className = "gsp-env-canvas";
    drawHistogram(canvas, hist, otsu.threshold);

    // Count extent cells at threshold
    let extentCount = 0;
    for (let i = 0; i < g.nd.length; i++) {
      const v = g.nd[i];
      if (Number.isFinite(v) && v >= threshold) extentCount++;
    }

    // Polygonize dissolve
    if (extentCount === 0) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = t("geospax.environment.noExtent", `Index computed — no cells meet ND ≥ ${threshold.toFixed(3)}. Lower the threshold or pan to an area with stronger ${presetId} response.`);
      renderIndexResult(layerName, presetId, bandA, bandB, threshold, bounds, { width: w, height: h }, pixForReading, g, hist, otsu, 0, canvas);
      // Still cache grid for user to re-threshold without re-reading
      lastIndexGrid = { nd: g.nd, width: w, height: h, bounds, pix: pixForReading, g, hist, otsu, layerName, presetId, bandA, bandB, validFor: `${w}×${h}@${bounds.join(",")}` };
      return;
    }

    if (extentCount > 6000) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = t("geospax.environment.tooManyCells", `Index computed — ${extentCount.toLocaleString("en-AU")} cells meet ND ≥ ${threshold.toFixed(3)} (too many to polygonize cleanly at this view). Raising the threshold or zooming in will reduce the extent.`);
      // Still polygonize a capped amount? For now we will polygonize up to 6000
      // by capping the mask: the layer will be capped and the note tells why.
    } else {
      indexStatus.textContent = t("geospax.environment.indexDone", `Index extent complete — ${presetId} (${bandA} vs ${bandB}): ${extentCount.toLocaleString("en-AU")} cells (${formatArea(areaM2ForPixelCount(extentCount, pixForReading ? pixForReading.pixelAreaM2 : 0), "ha").display}) at ≥ ${threshold.toFixed(3)}${otsu.threshold !== null ? ` (Otsu ${otsu.threshold.toFixed(3)})` : ""}. Added to map.`);
    }

    // Build polygons — cap at 6000 rects to avoid freezing the UI
    let rects: Feature<Polygon>[] = [];
    try {
      const fullRects = extentPolygonsForThreshold(g.nd, w, h, bounds, threshold);
      if (fullRects.length > 6000) {
        indexStatus.className = "gsp-env-status gsp-env-warn";
        indexStatus.textContent = `Index computed — ${extentCount.toLocaleString("en-AU")} cells meet ND ≥ ${threshold.toFixed(3)} (${fullRects.length} rects). Capped at 6000 rects for this view: dissolve-polygonized first 6000. Raise threshold or zoom in for the full extent.`;
        rects = fullRects.slice(0, 6000);
      } else {
        rects = fullRects;
      }
    } catch (err) {
      indexStatus.className = "gsp-env-status gsp-env-warn";
      indexStatus.textContent = `${t("geospax.environment.polygonizeError", "Index computed but polygonization failed.")} (${String(err)})`;
      renderIndexResult(layerName, presetId, bandA, bandB, threshold, bounds, { width: w, height: h }, pixForReading, g, hist, otsu, extentCount, canvas);
      lastIndexGrid = { nd: g.nd, width: w, height: h, bounds, pix: pixForReading, g, hist, otsu, layerName, presetId, bandA, bandB, validFor: `${w}×${h}@${bounds.join(",")}` };
      return;
    }

    let dissolved: Feature<Polygon | MultiPolygon> | null = null;
    if (rects.length <= 3000) {
      try {
        dissolved = unionAll(rects as unknown as Feature<Polygon | MultiPolygon>[]) as Feature<Polygon | MultiPolygon> | null;
      } catch {
        dissolved = null;
      }
    } else {
      // For 3000–6000 rects, skip dissolve to keep UI responsive and add as FeatureCollection
      dissolved = null;
    }

    const pixelAreaM2 = pixForReading ? pixForReading.pixelAreaM2 : 0;
    const extentAreaM2 = areaM2ForPixelCount(extentCount, pixelAreaM2);
    // Try LAEA measurement for dissolved polygon as cross-check
    let equalAreaM2: number | null = null;
    if (dissolved) {
      try {
        const m = measureArea([dissolved as unknown as Feature<Polygon | MultiPolygon>], "equalarea");
        if (m.method.includes("LAEA")) equalAreaM2 = m.m2;
      } catch { equalAreaM2 = null; }
    }

    if (dissolved) {
      const provenance = makeProvenance("index-extent", `${presetId} extent ND ≥ ${threshold.toFixed(3)}`, pixForReading ? `Pixel ${pixForReading.pixelWidthM.toFixed(1)}×${pixForReading.pixelHeightM.toFixed(1)} m at ${pixForReading.centreLat.toFixed(3)}°` : "EPSG:4326", {
        rasterLayer: layerName,
        preset: presetId,
        bandA, bandB,
        formula: INDEX_PRESETS[presetId].formula,
        threshold,
        otsuThreshold: otsu.threshold,
        otsuBin: otsu.binIndex,
        grid: `${w}×${h}`,
        bounds,
        validCells: g.validCells,
        nodataCells: g.nodataCells,
        extentCells: extentCount,
        pixelAreaM2,
        extentAreaM2,
        equalAreaM2,
        method: `${presetId} (A−B)/(A+B) with Band A=${bandA} (${INDEX_PRESETS[presetId].aLabel}) and Band B=${bandB} (${INDEX_PRESETS[presetId].bLabel}); Otsu on 64-bin histogram; dissolve of ${rects.length} pixel rects at ≥ ${threshold.toFixed(3)}`,
        caveat: BAND_ASSIGNMENT_CAVEAT,
      });
      dissolved.properties = {
        ...(dissolved.properties ?? {}),
        class: "index-extent",
        preset: presetId,
        bandA,
        bandB,
        threshold,
        otsu_threshold: otsu.threshold,
        valid_cells: g.validCells,
        extent_cells: extentCount,
        area_m2_pixel: extentAreaM2,
        area_ha_pixel: extentAreaM2 / 10000,
        ...(equalAreaM2 !== null ? { area_m2_equalarea: equalAreaM2, area_ha_equalarea: equalAreaM2/10000 } : {}),
        nd_min: g.min,
        nd_max: g.max,
        nd_mean: g.mean,
        [PROVENANCE_KEY]: provenance,
      };
      const displayArea = equalAreaM2 !== null ? formatArea(equalAreaM2, "ha").display : formatArea(extentAreaM2, "ha").display;
      app.addGeoJsonLayer(`${presetId} ≥${threshold.toFixed(3)} (${layerName} ${bandA}vs${bandB}) — ${displayArea}`, { type: "FeatureCollection", features: [dissolved as unknown as Feature<Polygon | MultiPolygon>] });
    } else {
      // Undissolved FeatureCollection — still stamped
      const provenance = makeProvenance("index-extent", `${presetId} extent ND ≥ ${threshold.toFixed(3)}`, pixForReading ? `Pixel ${pixForReading.pixelWidthM.toFixed(1)}×${pixForReading.pixelHeightM.toFixed(1)} m` : "EPSG:4326", {
        rasterLayer: layerName, preset: presetId, bandA, bandB, threshold, otsuThreshold: otsu.threshold,
        grid: `${w}×${h}`, bounds, validCells: g.validCells, nodataCells: g.nodataCells, extentCells: extentCount, rects: rects.length,
        method: `${presetId} (A−B)/(A+B); rects undissolved (${rects.length} — view too many to dissolve)`,
        caveat: BAND_ASSIGNMENT_CAVEAT,
      });
      const fc = {
        type: "FeatureCollection" as const,
        features: rects.map((f, i) => ({
          ...f,
          properties: {
            ...(f.properties ?? {}),
            class: "index-extent",
            preset: presetId,
            bandA, bandB,
            threshold,
            area_m2: pixelAreaM2,
            [PROVENANCE_KEY]: provenance,
            _idx: i,
          },
        })),
      };
      // Add first chunk only if huge already handled; else full
      app.addGeoJsonLayer(`${presetId} ≥${threshold.toFixed(3)} (${layerName} ${bandA}vs${bandB}) — ${formatArea(extentAreaM2, "ha").display} (pixel rects)`, fc);
    }

    renderIndexResult(layerName, presetId, bandA, bandB, threshold, bounds, { width: w, height: h }, pixForReading, g, hist, otsu, extentCount, canvas);
    lastIndexGrid = { nd: g.nd, width: w, height: h, bounds, pix: pixForReading, g, hist, otsu, layerName, presetId, bandA, bandB, validFor: `${w}×${h}@${bounds.join(",")}` };

    if (extentCount > 6000) {
      // preserve warning already set
    } else if (!dissolved && rects.length > 0) {
      indexStatus.textContent += " (pixel rects — too many to dissolve at this view; zoom in to dissolve).";
    }

    // Keep hist/otsu canvas rendered; the render call already placed it.
  }

  // Mark threshold as user-edited when they type
  indexThreshold.addEventListener("input", () => {
    indexThreshold.dataset.userEdited = "1";
    state.indexThreshold = Number(indexThreshold.value);
  });
  indexPresetSelect.addEventListener("change", () => {
    refreshPresetDesc();
    state.indexPreset = indexPresetSelect.value as IndexPresetId;
    // Update band placeholders for presets with conventional numbers (non-binding)
    const pid = state.indexPreset;
    if (pid === "NDVI" && indexBandA.value === "4" && indexBandB.value === "3") { /* keep */ }
    // No auto-overwrite if user already edited; just keep their numbers.
  });
  slopeBreak1.addEventListener("input", () => (state.slopeBreak1 = Number(slopeBreak1.value)));
  slopeBreak2.addEventListener("input", () => (state.slopeBreak2 = Number(slopeBreak2.value)));
  slopeBandInput.addEventListener("input", () => (state.slopeBand = Math.max(1, Math.round(Number(slopeBandInput.value) || 1))));
  indexBandA.addEventListener("input", () => (state.indexBandA = Math.max(1, Math.round(Number(indexBandA.value) || 1))));
  indexBandB.addEventListener("input", () => (state.indexBandB = Math.max(1, Math.round(Number(indexBandB.value) || 1))));
  slopeLayerSelect.addEventListener("change", () => {
    state.slopeLayerName = layerNameById(slopeLayerSelect.value) ?? null;
  });
  indexLayerSelect.addEventListener("change", () => {
    state.indexLayerName = layerNameById(indexLayerSelect.value) ?? null;
  });

  slopeRun.addEventListener("click", () => void runSlope());
  indexRun.addEventListener("click", () => void runIndex());

  // Quick re-apply: if index grid was cached and the user only changed threshold,
  // a second click would normally re-sample. Allow threshold-only re-polygonize
  // by detecting matching bounds/layer/bands? Simpler: always re-sample per spec.
  // The cached grid is kept for potential future "update threshold only" button;
  // not exposed yet.

  void lastIndexGrid; // silence unused warning — cache is kept for threshold-only update path

  // Global refresh wiring
  const refreshHandler = () => refreshLayers();
  document.addEventListener("geospax-environment:refresh", refreshHandler);
  const presetHandler = () => refreshPresetDesc();
  document.addEventListener("geospax-environment:preset-refresh", presetHandler);

  // Initial apply: restore any persisted ids by name → id mapping already done in refresh
  container.appendChild(root);

  // Ensure the map host refreshes the pickers when the panel is reopened
  // (the host fires this on registerRightPanel.onOpen via document event).
  // Also listen to layer store changes: the app has no explicit event, so
  // poll on focus? Instead, rely on the host to dispatch `geospax-environment:refresh`
  // when layers change (the dev may not); for now refresh on visibility.
  const observer = new MutationObserver(() => refreshLayers());
  observer.observe(container, { childList: true, subtree: false });

  return () => {
    document.removeEventListener("geospax-environment:refresh", refreshHandler);
    document.removeEventListener("geospax-environment:preset-refresh", presetHandler);
    observer.disconnect();
    container.innerHTML = "";
  };
}
