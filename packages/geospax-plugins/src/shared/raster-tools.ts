import type { Feature, Geometry, Polygon } from "geojson";
import {
  BAND_ASSIGNMENT_CAVEAT,
  INDEX_PRESETS,
  areaM2ForPixelCount,
  changeOtsu,
  classifySlope,
  differenceGrid,
  extentPolygonsForThreshold,
  formatArea,
  histogramND,
  hornSlopeAndAspect,
  indexStatsRow,
  makeProvenance,
  maskToPixelPolygons,
  measureArea,
  normalizedDifferenceGrid,
  otsuThreshold,
  pixelSizeAtCentre,
  rasterResolutionWarning,
  steepMask,
  terrainResolutionWarning,
  unionAll,
  type IndexPresetId,
} from "@geospax/analysis";
import type { GeoLibreRasterWindowReading } from "@geolibre/plugins";
import {
  addOutputLayer,
  appendNotice,
  button,
  buttonRow,
  chooseRasterGrid,
  currentBounds,
  el,
  field,
  fieldGrid,
  formatNumber,
  formatPercent,
  layerPicker,
  numberInput,
  parseFinite,
  renderKeyValueTable,
  resultRegion,
  runRecord,
  selectInput,
  setStatus,
  statusRegion,
  withBusy,
  type PanelShell,
} from "./ui";

interface RasterSample {
  bounds: [number, number, number, number];
  reading: GeoLibreRasterWindowReading;
}

async function sampleBand(
  shell: PanelShell,
  layerId: string,
  band: number,
  bounds: [number, number, number, number],
  width: number,
  height: number,
): Promise<RasterSample> {
  if (!shell.app.readRasterWindow)
    throw new Error("This GeoLibre host does not expose raster-window reads.");
  const reading = await shell.app.readRasterWindow(layerId, { bounds, width, height, band });
  if (!reading)
    throw new Error("The selected layer could not be sampled as a raster in the current view.");
  return { bounds, reading };
}

function samplingContext(shell: PanelShell): {
  bounds: [number, number, number, number];
  width: number;
  height: number;
} {
  const bounds = currentBounds(shell.app);
  if (!bounds) throw new Error("The current map view has no finite sampling extent.");
  const grid = chooseRasterGrid(bounds, 256);
  return { bounds, ...grid };
}

function layerName(shell: PanelShell, id: string): string {
  return shell.app.listLayers?.().find((layer) => layer.id === id)?.name ?? "Raster";
}

function dissolvePixelPolygons(
  polygons: Feature<Polygon>[],
  properties: Record<string, unknown>,
): Feature<Polygon | import("geojson").MultiPolygon>[] {
  if (!polygons.length) return [];
  const dissolved = unionAll(polygons);
  if (dissolved) {
    dissolved.properties = { ...(dissolved.properties ?? {}), ...properties };
    return [dissolved];
  }
  return polygons.map((polygon) => ({
    ...polygon,
    properties: { ...(polygon.properties ?? {}), ...properties },
  }));
}

export function mountIndexTool(
  shell: PanelShell,
  parent: HTMLElement,
  defaults: {
    preset?: IndexPresetId;
    threshold?: number;
    subject?: string;
    rasterLayerName?: string | null;
    bandA?: number;
    bandB?: number;
    onStateChange?: (state: {
      rasterLayerName: string | null;
      preset: IndexPresetId;
      bandA: number;
      bandB: number;
      threshold: number;
    }) => void;
  } = {},
): void {
  const card = shell.addTool(parent, {
    id: "spectral-index",
    title: "Normalized-difference index extent",
    description: `Compute NDVI, NDWI, NDBI, NBR, or a custom (A−B)/(A+B) raster over the current map view and polygonize cells at or above a threshold${defaults.subject ? ` for ${defaults.subject}` : ""}.`,
    method:
      "View-dependent aligned raster-window sampling; Otsu is offered as a suggestion, never silently substituted for the selected threshold.",
  });
  const raster = layerPicker(shell, {
    kind: "raster",
    placeholder: "— multispectral raster —",
    selectedName: defaults.rasterLayerName,
  });
  const preset = selectInput(
    Object.values(INDEX_PRESETS).map((item) => ({ value: item.id, label: item.label })),
    defaults.preset ?? "NDVI",
  );
  const bandA = numberInput(defaults.bandA ?? 4, { min: 1, step: 1 });
  const bandB = numberInput(defaults.bandB ?? 3, { min: 1, step: 1 });
  const threshold = numberInput(defaults.threshold ?? 0.2, { min: -1, max: 1, step: 0.05 });
  const presetHint = el("div", "gsp-notice");
  const updatePreset = () => {
    const definition = INDEX_PRESETS[preset.value as IndexPresetId];
    presetHint.textContent = `${definition.formula}. ${definition.description}`;
  };
  const reportState = () =>
    defaults.onStateChange?.({
      rasterLayerName: raster.layer()?.name ?? null,
      preset: preset.value as IndexPresetId,
      bandA: Number(bandA.value),
      bandB: Number(bandB.value),
      threshold: Number(threshold.value),
    });
  preset.addEventListener("change", () => {
    updatePreset();
    reportState();
  });
  for (const control of [raster.select, bandA, bandB, threshold])
    control.addEventListener("change", reportState);
  updatePreset();
  card.append(
    field("Raster layer", raster.select),
    field("Index preset", preset),
    presetHint,
    fieldGrid(
      field("Band A", bandA),
      field("Band B", bandB),
      field("Extent threshold (≥)", threshold),
    ),
  );
  const suggest = button("Suggest Otsu threshold", "secondary");
  const run = button("Create index extent");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(suggest, run), status, results);

  const compute = async () => {
    if (!raster.select.value) throw new Error("Select a raster layer.");
    const context = samplingContext(shell);
    const bandAValue = parseFinite(bandA, "Band A");
    const bandBValue = parseFinite(bandB, "Band B");
    const [a, b] = await Promise.all([
      sampleBand(
        shell,
        raster.select.value,
        bandAValue,
        context.bounds,
        context.width,
        context.height,
      ),
      sampleBand(
        shell,
        raster.select.value,
        bandBValue,
        context.bounds,
        context.width,
        context.height,
      ),
    ]);
    if (a.reading.width !== b.reading.width || a.reading.height !== b.reading.height) {
      throw new Error("The two sampled bands returned different grid dimensions.");
    }
    const grid = normalizedDifferenceGrid(
      a.reading.values,
      b.reading.values,
      a.reading.width,
      a.reading.height,
      a.reading.nodata,
      b.reading.nodata,
    );
    if (!grid.validCells)
      throw new Error("The sampled bands contain no valid normalized-difference cells.");
    const histogram = histogramND(grid.nd);
    const otsu = otsuThreshold(histogram);
    return { context, a, b, grid, histogram, otsu, bandAValue, bandBValue };
  };

  suggest.addEventListener("click", () => {
    void withBusy(suggest, status, "Sampling bands and estimating Otsu threshold…", async () => {
      const data = await compute();
      if (data.otsu.threshold === null) {
        setStatus(
          status,
          "warning",
          "Otsu is unavailable because the sampled histogram has fewer than two occupied classes.",
        );
      } else {
        threshold.value = data.otsu.threshold.toFixed(4);
        setStatus(
          status,
          "success",
          `Otsu suggests ${threshold.value}; review it before creating an extent.`,
        );
      }
      const stats = indexStatsRow(data.grid);
      renderKeyValueTable(
        results,
        [
          [
            "Valid / no-data cells",
            `${stats.validCells.toLocaleString()} / ${stats.nodataCells.toLocaleString()}`,
          ],
          ["Range", `${formatNumber(stats.min, 4)} to ${formatNumber(stats.max, 4)}`],
          ["Mean", formatNumber(stats.mean, 4)],
          [
            "Otsu suggestion",
            data.otsu.threshold === null ? "Unavailable" : formatNumber(data.otsu.threshold, 4),
          ],
        ],
        "Sampled index distribution",
      );
      appendNotice(results, BAND_ASSIGNMENT_CAVEAT, "warning");
    });
  });

  run.addEventListener("click", () => {
    void withBusy(run, status, "Sampling, classifying and polygonizing the index…", async () => {
      const data = await compute();
      const selectedThreshold = parseFinite(threshold, "Extent threshold");
      const polygons = extentPolygonsForThreshold(
        data.grid.nd,
        data.grid.width,
        data.grid.height,
        data.context.bounds,
        selectedThreshold,
      );
      if (!polygons.length) throw new Error("No sampled cells meet the selected threshold.");
      const presetId = preset.value as IndexPresetId;
      const provenance = makeProvenance(
        "normalized-difference-index",
        `${presetId} = (Band ${data.bandAValue} − Band ${data.bandBValue}) / (Band ${data.bandAValue} + Band ${data.bandBValue}); threshold ≥ ${selectedThreshold}`,
        "EPSG:4326 sampled current-view grid",
        {
          preset: presetId,
          rasterLayer: raster.select.value,
          bandA: data.bandAValue,
          bandB: data.bandBValue,
          threshold: selectedThreshold,
          width: data.grid.width,
          height: data.grid.height,
          overviewLevelA: data.a.reading.overviewLevel,
          overviewLevelB: data.b.reading.overviewLevel,
          bandAssignmentCaveat: BAND_ASSIGNMENT_CAVEAT,
        },
      );
      const outputFeatures = dissolvePixelPolygons(polygons, {
        class: `${presetId}_extent`,
        threshold: selectedThreshold,
      });
      const outputId = addOutputLayer(
        shell,
        `${presetId} extent ≥ ${selectedThreshold}`,
        outputFeatures,
        provenance,
      );
      const measured = measureArea(outputFeatures, "equalarea");
      const pix = pixelSizeAtCentre(data.context.bounds, data.grid.width, data.grid.height);
      const warning = pix
        ? rasterResolutionWarning(
            pix.pixelWidthM,
            pix.pixelHeightM,
            data.grid.width,
            data.grid.height,
          )
        : null;
      setStatus(
        status,
        "success",
        `Created ${presetId} extent from ${polygons.length.toLocaleString()} sampled cell(s).`,
      );
      renderKeyValueTable(
        results,
        [
          ["Index", presetId],
          ["Formula", INDEX_PRESETS[presetId].formula],
          ["Threshold", `≥ ${formatNumber(selectedThreshold, 4)}`],
          ["Passing cells", polygons.length],
          ["Valid / no-data", `${data.grid.validCells} / ${data.grid.nodataCells}`],
          ["Index mean", formatNumber(data.grid.mean, 4)],
          ["Mapped area", formatArea(measured.m2).display],
          ["Area method", `${measured.method} — ${measured.crs}`],
          ["Sample grid", `${data.grid.width} × ${data.grid.height}`],
        ],
        `${presetId} extent`,
      );
      appendNotice(results, BAND_ASSIGNMENT_CAVEAT, "warning");
      if (warning) appendNotice(results, warning, "warning");
      shell.recordRun(
        runRecord("normalized-difference-index", `${presetId} extent`, provenance, [outputId], {
          preset: presetId,
          threshold: selectedThreshold,
          passingCells: polygons.length,
          areaM2: measured.m2,
        }),
      );
    });
  });
}

export function mountSlopeTool(
  shell: PanelShell,
  parent: HTMLElement,
  subjectOrOptions:
    | string
    | {
        subject?: string;
        rasterLayerName?: string | null;
        band?: number;
        break1?: number;
        break2?: number;
        onStateChange?: (state: {
          rasterLayerName: string | null;
          band: number;
          break1: number;
          break2: number;
        }) => void;
      } = "terrain",
): void {
  const options =
    typeof subjectOrOptions === "string" ? { subject: subjectOrOptions } : subjectOrOptions;
  const subject = options.subject ?? "terrain";
  const card = shell.addTool(parent, {
    id: "slope-zones",
    title: "Terrain slope zones",
    description: `Derive Horn slope from a DEM sampled over the current view, classify three ${subject} zones, and output the steep class.`,
    method:
      "Horn 3×3 derivative; border and no-data neighbourhoods are excluded. Pixel metres are computed at the viewport centre latitude.",
  });
  const raster = layerPicker(shell, {
    kind: "raster",
    placeholder: "— DEM raster —",
    selectedName: options.rasterLayerName,
  });
  const band = numberInput(options.band ?? 1, { min: 1, step: 1 });
  const break1 = numberInput(options.break1 ?? 15, { min: 0, max: 90, step: 1 });
  const break2 = numberInput(options.break2 ?? 30, { min: 0, max: 90, step: 1 });
  const reportState = () =>
    options.onStateChange?.({
      rasterLayerName: raster.layer()?.name ?? null,
      band: Number(band.value),
      break1: Number(break1.value),
      break2: Number(break2.value),
    });
  for (const control of [raster.select, band, break1, break2])
    control.addEventListener("change", reportState);
  card.append(
    field("DEM layer", raster.select),
    fieldGrid(field("Band", band), field("Break 1 (°)", break1), field("Break 2 (°)", break2)),
  );
  const run = button("Classify slope zones");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Sampling DEM and deriving Horn slope…", async () => {
      if (!raster.select.value) throw new Error("Select a DEM raster layer.");
      const context = samplingContext(shell);
      const sample = await sampleBand(
        shell,
        raster.select.value,
        parseFinite(band, "Band"),
        context.bounds,
        context.width,
        context.height,
      );
      const pixel = pixelSizeAtCentre(context.bounds, sample.reading.width, sample.reading.height);
      if (!pixel)
        throw new Error("Could not derive finite pixel ground dimensions for the current view.");
      const horn = hornSlopeAndAspect({
        values: sample.reading.values,
        width: sample.reading.width,
        height: sample.reading.height,
        pixelWidthM: pixel.pixelWidthM,
        pixelHeightM: pixel.pixelHeightM,
        nodata: sample.reading.nodata,
      });
      if (!horn.validCells)
        throw new Error("No valid 3×3 DEM neighbourhoods were available in the sampled view.");
      const breaks: [number, number] = [
        parseFinite(break1, "Break 1"),
        parseFinite(break2, "Break 2"),
      ];
      const classes = classifySlope(horn.slopeDeg, breaks, horn);
      const mask = steepMask(horn.slopeDeg, breaks, 2);
      const polygons = maskToPixelPolygons(
        mask,
        sample.reading.width,
        sample.reading.height,
        context.bounds,
      );
      const provenance = makeProvenance(
        "horn-slope-zones",
        "Horn 3×3 slope in degrees; steep class polygonized",
        "EPSG:4326 sampled current-view grid with centre-latitude metre pixel size",
        {
          rasterLayer: raster.select.value,
          band: Number(band.value),
          breaks: classes.breaks,
          width: sample.reading.width,
          height: sample.reading.height,
          pixelWidthM: pixel.pixelWidthM,
          pixelHeightM: pixel.pixelHeightM,
          borderExcluded: horn.borderExcluded,
          nodataExcluded: horn.nodataExcluded,
        },
      );
      const outputIds: string[] = [];
      if (polygons.length) {
        const outputFeatures = dissolvePixelPolygons(polygons, {
          class: "steep",
          slope_min_deg: classes.breaks[1],
        });
        outputIds.push(
          addOutputLayer(shell, `Steep slope ≥ ${classes.breaks[1]}°`, outputFeatures, provenance),
        );
      }
      const areas = classes.counts.map((count) => areaM2ForPixelCount(count, pixel.pixelAreaM2));
      setStatus(
        status,
        polygons.length ? "success" : "warning",
        polygons.length
          ? `Created steep-slope extent from ${classes.counts[2].toLocaleString()} cell(s).`
          : "No sampled cell falls in the steep class; metrics are still shown.",
      );
      renderKeyValueTable(
        results,
        [
          [
            classes.labels[0],
            `${classes.counts[0].toLocaleString()} cells · ${formatArea(areas[0]).display}`,
          ],
          [
            classes.labels[1],
            `${classes.counts[1].toLocaleString()} cells · ${formatArea(areas[1]).display}`,
          ],
          [
            classes.labels[2],
            `${classes.counts[2].toLocaleString()} cells · ${formatArea(areas[2]).display}`,
          ],
          ["Valid cells", classes.totalValid],
          ["Border excluded", classes.borderExcluded],
          ["No-data neighbourhoods", classes.nodataExcluded],
          [
            "Pixel at view centre",
            `${formatNumber(pixel.pixelWidthM, 1)} × ${formatNumber(pixel.pixelHeightM, 1)} m`,
          ],
          ["Sample grid", `${sample.reading.width} × ${sample.reading.height}`],
        ],
        "Slope zones",
      );
      const warning = terrainResolutionWarning(
        pixel.pixelWidthM,
        pixel.pixelHeightM,
        sample.reading.width,
        sample.reading.height,
      );
      if (warning) appendNotice(results, warning, "warning");
      shell.recordRun(
        runRecord("horn-slope-zones", "Terrain slope zones", provenance, outputIds, {
          gentleCells: classes.counts[0],
          moderateCells: classes.counts[1],
          steepCells: classes.counts[2],
          borderExcluded: classes.borderExcluded,
          nodataExcluded: classes.nodataExcluded,
        }),
      );
    });
  });
}

type ComparisonOperator = ">=" | ">" | "<=" | "<";

function comparisonMask(
  values: number[],
  nodata: number | null,
  threshold: number,
  operator: ComparisonOperator,
): Uint8Array {
  const mask = new Uint8Array(values.length);
  values.forEach((value, index) => {
    if (!Number.isFinite(value) || (nodata !== null && value === nodata)) return;
    const passes =
      operator === ">="
        ? value >= threshold
        : operator === ">"
          ? value > threshold
          : operator === "<="
            ? value <= threshold
            : value < threshold;
    if (passes) mask[index] = 1;
  });
  return mask;
}

function dynamicHistogram(values: number[], nodata: number | null) {
  const valid = values.filter(
    (value) => Number.isFinite(value) && (nodata === null || value !== nodata),
  );
  if (!valid.length) throw new Error("The sampled raster band contains no valid cells.");
  let min = Math.min(...valid);
  let max = Math.max(...valid);
  if (min === max)
    throw new Error(`The sampled raster is constant (${min}); there is nothing to threshold.`);
  const array = Float32Array.from(
    values.map((value) =>
      Number.isFinite(value) && (nodata === null || value !== nodata) ? value : Number.NaN,
    ),
  );
  return { histogram: histogramND(array, 64, [min, max]), min, max, valid: valid.length };
}

export function mountRasterReclassTool(
  shell: PanelShell,
  parent: HTMLElement,
  subject = "raster extent",
): void {
  const card = shell.addTool(parent, {
    id: "raster-reclassify",
    title: "Raster reclassify & polygonize",
    description: `Threshold one sampled raster band and convert the passing current-view cells into a vector ${subject}.`,
    method:
      "Manual or Otsu-suggested threshold over a view-dependent raster window; output follows sampled cell edges and inherits their resolution.",
  });
  const raster = layerPicker(shell, { kind: "raster", placeholder: "— raster layer —" });
  const band = numberInput(1, { min: 1, step: 1 });
  const threshold = numberInput(0, { step: 0.1 });
  const operator = selectInput([
    { value: ">=", label: "At or above (≥)" },
    { value: ">", label: "Above (>)" },
    { value: "<=", label: "At or below (≤)" },
    { value: "<", label: "Below (<)" },
  ]);
  card.append(
    field("Raster layer", raster.select),
    fieldGrid(field("Band", band), field("Threshold", threshold), field("Comparison", operator)),
  );
  const suggest = button("Suggest Otsu threshold", "secondary");
  const run = button("Polygonize threshold class");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(suggest, run), status, results);

  const sample = async () => {
    if (!raster.select.value) throw new Error("Select a raster layer.");
    const context = samplingContext(shell);
    const sampled = await sampleBand(
      shell,
      raster.select.value,
      parseFinite(band, "Band"),
      context.bounds,
      context.width,
      context.height,
    );
    return {
      context,
      sampled,
      distribution: dynamicHistogram(sampled.reading.values, sampled.reading.nodata),
    };
  };
  suggest.addEventListener("click", () => {
    void withBusy(suggest, status, "Sampling raster and estimating Otsu threshold…", async () => {
      const data = await sample();
      const otsu = otsuThreshold(data.distribution.histogram);
      if (otsu.threshold === null) {
        setStatus(status, "warning", "Otsu is unavailable for this sampled distribution.");
      } else {
        threshold.value = otsu.threshold.toFixed(4);
        setStatus(
          status,
          "success",
          `Otsu suggests ${threshold.value}; review it before polygonizing.`,
        );
      }
      renderKeyValueTable(
        results,
        [
          ["Valid cells", data.distribution.valid],
          [
            "Range",
            `${formatNumber(data.distribution.min, 4)} to ${formatNumber(data.distribution.max, 4)}`,
          ],
          [
            "Otsu suggestion",
            otsu.threshold === null ? "Unavailable" : formatNumber(otsu.threshold, 4),
          ],
        ],
        "Sampled raster distribution",
      );
    });
  });
  run.addEventListener("click", () => {
    void withBusy(run, status, "Reclassifying sampled cells and polygonizing…", async () => {
      const data = await sample();
      const thresholdValue = parseFinite(threshold, "Threshold");
      const op = operator.value as ComparisonOperator;
      const mask = comparisonMask(
        data.sampled.reading.values,
        data.sampled.reading.nodata,
        thresholdValue,
        op,
      );
      const cells = mask.reduce((sum, value) => sum + value, 0);
      if (!cells) throw new Error("No sampled cells pass the selected threshold.");
      const polygons = maskToPixelPolygons(
        mask,
        data.sampled.reading.width,
        data.sampled.reading.height,
        data.context.bounds,
      );
      const provenance = makeProvenance(
        "raster-reclassify-polygonize",
        `Raster threshold ${op} ${thresholdValue}; sampled cell polygonization`,
        "EPSG:4326 current-view sample grid",
        {
          rasterLayer: raster.select.value,
          band: Number(band.value),
          threshold: thresholdValue,
          operator: op,
          width: data.sampled.reading.width,
          height: data.sampled.reading.height,
          overviewLevel: data.sampled.reading.overviewLevel,
        },
      );
      const outputFeatures = dissolvePixelPolygons(polygons, {
        class: 1,
        threshold: thresholdValue,
        operator: op,
      });
      const outputId = addOutputLayer(
        shell,
        `${layerName(shell, raster.select.value)} ${op} ${thresholdValue}`,
        outputFeatures,
        provenance,
      );
      const measured = measureArea(outputFeatures, "equalarea");
      const pixel = pixelSizeAtCentre(
        data.context.bounds,
        data.sampled.reading.width,
        data.sampled.reading.height,
      );
      setStatus(status, "success", `Polygonized ${cells.toLocaleString()} passing cell(s).`);
      renderKeyValueTable(
        results,
        [
          ["Threshold", `${op} ${formatNumber(thresholdValue, 4)}`],
          ["Passing cells", cells],
          ["Valid sampled cells", data.distribution.valid],
          ["Passing proportion", formatPercent((cells / data.distribution.valid) * 100)],
          ["Output parts", outputFeatures.length],
          ["Mapped area", formatArea(measured.m2).display],
          ["Area method", `${measured.method} — ${measured.crs}`],
          ["Sample grid", `${data.sampled.reading.width} × ${data.sampled.reading.height}`],
        ],
        "Raster extent",
      );
      if (pixel) {
        const warning = rasterResolutionWarning(
          pixel.pixelWidthM,
          pixel.pixelHeightM,
          data.sampled.reading.width,
          data.sampled.reading.height,
        );
        if (warning) appendNotice(results, warning, "warning");
      }
      appendNotice(
        results,
        "Polygon boundaries follow sampled pixel edges; quote the pixel size/sample grid with any area result.",
      );
      shell.recordRun(
        runRecord(
          "raster-reclassify-polygonize",
          "Raster reclassify & polygonize",
          provenance,
          [outputId],
          {
            passingCells: cells,
            threshold: thresholdValue,
            operator: op,
            areaM2: measured.m2,
          },
        ),
      );
    });
  });
}

export function mountRasterChangeTool(
  shell: PanelShell,
  parent: HTMLElement,
  subject = "cover",
): void {
  const card = shell.addTool(parent, {
    id: "raster-change",
    title: "Raster change detection",
    description: `Difference aligned current-view samples from an earlier and later ${subject} raster; polygonize positive loss and negative gain above a user threshold.`,
    method:
      "Difference = T1 − T2. Loss is difference ≥ threshold; gain is difference ≤ −threshold. Inputs are sampled to one shared grid.",
  });
  const t1 = layerPicker(shell, { kind: "raster", placeholder: "— earlier raster (T1) —" });
  const t2 = layerPicker(shell, { kind: "raster", placeholder: "— later raster (T2) —" });
  const band1 = numberInput(1, { min: 1, step: 1 });
  const band2 = numberInput(1, { min: 1, step: 1 });
  const threshold = numberInput(0.2, { min: 0, step: 0.05 });
  card.append(
    fieldGrid(field("Earlier raster (T1)", t1.select), field("Later raster (T2)", t2.select)),
    fieldGrid(
      field("T1 band", band1),
      field("T2 band", band2),
      field("Change magnitude threshold", threshold),
    ),
  );
  const suggest = button("Inspect difference / Otsu", "secondary");
  const run = button("Map loss and gain");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(suggest, run), status, results);

  const compute = async () => {
    if (!t1.select.value || !t2.select.value) throw new Error("Select both raster dates.");
    const context = samplingContext(shell);
    const [a, b] = await Promise.all([
      sampleBand(
        shell,
        t1.select.value,
        parseFinite(band1, "T1 band"),
        context.bounds,
        context.width,
        context.height,
      ),
      sampleBand(
        shell,
        t2.select.value,
        parseFinite(band2, "T2 band"),
        context.bounds,
        context.width,
        context.height,
      ),
    ]);
    if (a.reading.width !== b.reading.width || a.reading.height !== b.reading.height)
      throw new Error("The two raster samples are not aligned.");
    const grid = differenceGrid(
      a.reading.values,
      b.reading.values,
      a.reading.width,
      a.reading.height,
      a.reading.nodata,
      b.reading.nodata,
    );
    if (!grid.validCells)
      throw new Error("No aligned valid cells were available in both raster dates.");
    const otsu = changeOtsu(grid.diff);
    return { context, a, b, grid, otsu };
  };
  suggest.addEventListener("click", () => {
    void withBusy(suggest, status, "Sampling and inspecting the signed difference…", async () => {
      const data = await compute();
      const candidates = [
        data.otsu.otsuGain,
        data.otsu.otsuLoss === null ? null : Math.abs(data.otsu.otsuLoss),
      ].filter((value): value is number => value !== null && value > 0);
      if (candidates.length) threshold.value = Math.max(...candidates).toFixed(4);
      setStatus(
        status,
        candidates.length ? "success" : "warning",
        candidates.length
          ? `Signed Otsu suggests magnitude ${threshold.value}; review it before mapping.`
          : "No non-zero signed Otsu threshold was available; retain or edit the manual magnitude.",
      );
      const finite = Array.from(data.grid.diff).filter(Number.isFinite);
      renderKeyValueTable(
        results,
        [
          ["Valid / no-data cells", `${data.grid.validCells} / ${data.grid.nodataCells}`],
          [
            "Difference range",
            `${formatNumber(Math.min(...finite), 4)} to ${formatNumber(Math.max(...finite), 4)}`,
          ],
          [
            "Otsu loss side",
            data.otsu.otsuGain === null ? "Unavailable" : formatNumber(data.otsu.otsuGain, 4),
          ],
          [
            "Otsu gain side",
            data.otsu.otsuLoss === null ? "Unavailable" : formatNumber(data.otsu.otsuLoss, 4),
          ],
        ],
        "T1 − T2 difference",
      );
    });
  });
  run.addEventListener("click", () => {
    void withBusy(run, status, "Differencing rasters and polygonizing change…", async () => {
      const data = await compute();
      const magnitude = parseFinite(threshold, "Change magnitude threshold");
      if (magnitude < 0) throw new Error("Change magnitude threshold must be zero or greater.");
      const lossMask = new Uint8Array(data.grid.diff.length);
      const gainMask = new Uint8Array(data.grid.diff.length);
      data.grid.diff.forEach((value, index) => {
        if (!Number.isFinite(value)) return;
        if (value >= magnitude) lossMask[index] = 1;
        if (value <= -magnitude) gainMask[index] = 1;
      });
      const lossCount = lossMask.reduce((sum, value) => sum + value, 0);
      const gainCount = gainMask.reduce((sum, value) => sum + value, 0);
      if (!lossCount && !gainCount)
        throw new Error("No aligned cells meet the selected positive/negative change threshold.");
      const lossPolygons = maskToPixelPolygons(
        lossMask,
        data.grid.width,
        data.grid.height,
        data.context.bounds,
      );
      const gainPolygons = maskToPixelPolygons(
        gainMask,
        data.grid.width,
        data.grid.height,
        data.context.bounds,
      );
      const provenance = makeProvenance(
        "raster-change-detection",
        `Aligned raster difference T1−T2; loss ≥ ${magnitude}; gain ≤ −${magnitude}`,
        "EPSG:4326 current-view sample grid",
        {
          t1Layer: t1.select.value,
          t2Layer: t2.select.value,
          t1Band: Number(band1.value),
          t2Band: Number(band2.value),
          magnitude,
          width: data.grid.width,
          height: data.grid.height,
          validCells: data.grid.validCells,
          nodataCells: data.grid.nodataCells,
        },
      );
      const outputFeatures: Feature<Geometry | null>[] = [
        ...dissolvePixelPolygons(lossPolygons, { change: "loss", threshold: magnitude }),
        ...dissolvePixelPolygons(gainPolygons, { change: "gain", threshold: -magnitude }),
      ];
      const outputId = addOutputLayer(
        shell,
        `${subject} raster change`,
        outputFeatures,
        provenance,
      );
      const lossArea = measureArea(dissolvePixelPolygons(lossPolygons, {}), "equalarea");
      const gainArea = measureArea(dissolvePixelPolygons(gainPolygons, {}), "equalarea");
      setStatus(
        status,
        "success",
        `Mapped ${lossCount.toLocaleString()} loss and ${gainCount.toLocaleString()} gain cell(s).`,
      );
      renderKeyValueTable(
        results,
        [
          ["Difference convention", "T1 − T2"],
          ["Magnitude threshold", formatNumber(magnitude, 4)],
          [
            "Loss cells / area",
            `${lossCount.toLocaleString()} / ${formatArea(lossArea.m2).display}`,
          ],
          [
            "Gain cells / area",
            `${gainCount.toLocaleString()} / ${formatArea(gainArea.m2).display}`,
          ],
          ["Valid / no-data cells", `${data.grid.validCells} / ${data.grid.nodataCells}`],
          ["Sample grid", `${data.grid.width} × ${data.grid.height}`],
        ],
        "Raster change result",
      );
      appendNotice(
        results,
        "This is thresholded value change, not sensor calibration or atmospheric correction. Confirm both rasters are semantically comparable.",
        "warning",
      );
      shell.recordRun(
        runRecord("raster-change-detection", "Raster change detection", provenance, [outputId], {
          threshold: magnitude,
          lossCells: lossCount,
          gainCells: gainCount,
          lossAreaM2: lossArea.m2,
          gainAreaM2: gainArea.m2,
        }),
      );
    });
  });
}
