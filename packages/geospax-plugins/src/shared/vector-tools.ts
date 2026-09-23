import type { Feature, Geometry, MultiPolygon, Point, Polygon } from "geojson";
import {
  connectivityAnalysis,
  distanceDecay,
  featureSuitability,
  fitBioclim,
  fitMahalanobis,
  formatArea,
  fragmentationAnalysis,
  hotspotGrid,
  makeProvenance,
  nearestNeighbourIndex,
  predictBioclim,
  predictMahalanobis,
  priorityAreas,
  protectionGap,
  provenanceForSdm,
  solveScpExact,
  vectorChangeDetection,
  vectorOverlay,
  type FeatureSuitabilityCriterion,
  type HotspotLayerInput,
} from "@geospax/analysis";
import {
  addOutputLayer,
  appendNotice,
  button,
  buttonRow,
  checkbox,
  el,
  field,
  fieldGrid,
  formatNumber,
  formatPercent,
  layerPicker,
  numberInput,
  numericFields,
  parseFinite,
  parsePositive,
  populateFieldSelect,
  renderKeyValueTable,
  resultRegion,
  runRecord,
  selectInput,
  setStatus,
  statusRegion,
  withBusy,
  type PanelShell,
} from "./ui";

function layerName(shell: PanelShell, id: string): string {
  return shell.app.listLayers?.().find((layer) => layer.id === id)?.name ?? "Layer";
}

function asFeatures(features: Feature<Geometry | null>[]): Feature<Geometry | null>[] {
  return features;
}

export function mountOverlayTool(shell: PanelShell, parent: HTMLElement): void {
  const card = shell.addTool(parent, {
    id: "vector-overlay",
    title: "Vector overlay",
    description: "Intersect, erase, or dissolve-union two polygon layers. Result properties are prefixed to prevent collisions.",
    method: "Turf constructive geometry; difference is A minus dissolved B. Invalid/non-polygon features are counted and reported.",
  });
  const a = layerPicker(shell, { kind: "polygon", placeholder: "— Layer A —" });
  const b = layerPicker(shell, { kind: "polygon", placeholder: "— Layer B —" });
  const operation = selectInput([
    { value: "intersect", label: "Intersect (A ∩ B)" },
    { value: "difference", label: "Erase (A − B)" },
    { value: "union", label: "Dissolved union (A ∪ B)" },
  ]);
  card.append(
    fieldGrid(field("Layer A", a.select), field("Layer B", b.select)),
    field("Operation", operation),
  );
  const run = button("Run overlay");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);

  run.addEventListener("click", () => {
    void withBusy(run, status, "Running polygon overlay…", () => {
      if (!a.select.value || !b.select.value) throw new Error("Select both polygon layers.");
      if (a.select.value === b.select.value) throw new Error("Select two different layers.");
      const output = vectorOverlay(a.features(), b.features(), operation.value as "intersect" | "difference" | "union");
      if (!output.ok) throw new Error(output.error);
      if (!output.features.length) {
        setStatus(status, "warning", "The operation produced no polygon geometry. The layers may not overlap.");
        renderKeyValueTable(results, [
          ["Pairs tested", output.pairsTested],
          ["Output features", 0],
        ]);
        return;
      }
      const outputId = addOutputLayer(
        shell,
        `${operation.options[operation.selectedIndex]?.text ?? operation.value}: ${layerName(shell, a.select.value)} / ${layerName(shell, b.select.value)}`,
        output.features,
        output.provenance,
      );
      setStatus(status, "success", `Created ${output.featureCount.toLocaleString()} overlay feature(s).`);
      renderKeyValueTable(results, [
        ["Operation", operation.value],
        ["Output features", output.featureCount],
        ["Area", formatArea(output.totalAreaM2).display],
        ["Pairs tested", output.pairsTested],
        ["Constructed", output.pairsConstructed],
        ["Skipped A / B", `${output.skippedA} / ${output.skippedB}`],
      ], "Overlay result");
      shell.recordRun(runRecord("vector-overlay", "Vector overlay", output.provenance, [outputId], {
        operation: operation.value,
        features: output.featureCount,
        areaM2: output.totalAreaM2,
      }));
    });
  });
}

interface HotspotRow {
  wrapper: HTMLDivElement;
  picker: ReturnType<typeof layerPicker>;
  weight: HTMLInputElement;
}

export function mountHotspotTool(shell: PanelShell, parent: HTMLElement): void {
  const card = shell.addTool(parent, {
    id: "hotspot-grid",
    title: "Weighted hotspot grid",
    description: "Combine counts, presence, or feature density from multiple layers into a weighted square or hexagonal priority surface.",
    method: "Descriptive weighted grid. This is not inferential Getis-Ord Gi* and does not produce p-values.",
  });
  const gridType = selectInput([
    { value: "hex", label: "Hexagons" },
    { value: "square", label: "Squares" },
  ]);
  const scoreMethod = selectInput([
    { value: "count", label: "Feature count" },
    { value: "presence", label: "Presence / absence" },
    { value: "density", label: "Features per km²" },
  ]);
  const cellSize = numberInput(10, { min: 0.01, step: 1 });
  card.append(fieldGrid(
    field("Grid geometry", gridType),
    field("Score", scoreMethod),
    field("Cell size (km)", cellSize),
  ));
  const rowsHost = el("div", "gsp-criteria");
  card.appendChild(rowsHost);
  const rows: HotspotRow[] = [];
  const addRow = () => {
    const wrapper = el("div", "gsp-criterion");
    const picker = layerPicker(shell, { kind: "vector", placeholder: "— input layer —" });
    const weight = numberInput(1, { min: 0, step: 0.1 });
    const remove = button("×", "secondary");
    remove.classList.add("gsp-criterion__remove");
    remove.setAttribute("aria-label", "Remove hotspot layer");
    wrapper.append(field("Layer", picker.select), field("Weight", weight), el("span"), remove);
    const row = { wrapper, picker, weight };
    remove.addEventListener("click", () => {
      if (rows.length <= 1) return;
      picker.destroy();
      wrapper.remove();
      rows.splice(rows.indexOf(row), 1);
    });
    rows.push(row);
    rowsHost.appendChild(wrapper);
  };
  addRow();
  addRow();
  const add = button("Add layer", "secondary");
  const run = button("Build hotspot grid");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(add, run), status, results);
  add.addEventListener("click", addRow);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Building weighted grid…", () => {
      const inputs: HotspotLayerInput[] = rows
        .filter((row) => row.picker.select.value)
        .map((row) => ({
          id: row.picker.select.value,
          name: layerName(shell, row.picker.select.value),
          features: row.picker.features(),
          weight: parseFinite(row.weight, "Layer weight"),
        }));
      const output = hotspotGrid(inputs, {
        gridType: gridType.value as "hex" | "square",
        scoreMethod: scoreMethod.value as "count" | "presence" | "density",
        cellSizeKm: parsePositive(cellSize, "Cell size"),
      });
      if (!output.ok) throw new Error(output.error);
      const outputId = addOutputLayer(shell, `Weighted hotspot grid (${cellSize.value} km)`, output.grid.features, output.provenance);
      setStatus(status, "success", `Created ${output.cellCount.toLocaleString()} grid cells.`);
      renderKeyValueTable(results, [
        ["Grid cells", output.cellCount],
        ["Non-empty cells", output.nonEmptyCells],
        ["Input features", output.inputFeatureCount],
        ["Maximum raw score", formatNumber(output.maxRawScore, 3)],
        ["Method", `${scoreMethod.value}; descriptive only`],
      ], "Weighted priority surface");
      appendNotice(results, output.methodNote, "warning");
      shell.recordRun(runRecord("weighted-hotspot-grid", "Weighted hotspot grid", output.provenance, [outputId], {
        cells: output.cellCount,
        nonEmptyCells: output.nonEmptyCells,
        cellSizeKm: Number(cellSize.value),
      }));
    });
  });
}

export function mountPriorityTool(shell: PanelShell, parent: HTMLElement): void {
  const card = shell.addTool(parent, {
    id: "priority-areas",
    title: "Unprotected priority sites",
    description: "Select high-scoring habitat points that lie outside existing protected-area polygons.",
    method: "Numeric score threshold followed by point-in-polygon exclusion. No ranking is inferred from missing values.",
  });
  const habitat = layerPicker(shell, { kind: "point", placeholder: "— habitat / occurrence points —" });
  const protectedAreas = layerPicker(shell, { kind: "polygon", placeholder: "— protected areas —" });
  const scoreField = selectInput([]);
  const minScore = numberInput(1, { step: 0.1 });
  const refreshFields = () => populateFieldSelect(scoreField, numericFields(habitat.features()));
  habitat.select.addEventListener("change", refreshFields);
  shell.onLayersChanged(refreshFields);
  refreshFields();
  card.append(
    fieldGrid(field("Habitat points", habitat.select), field("Protected areas", protectedAreas.select)),
    fieldGrid(field("Score field", scoreField), field("Minimum score", minScore)),
  );
  const run = button("Identify priority sites");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Checking habitat sites against protection…", () => {
      if (!habitat.select.value || !protectedAreas.select.value || !scoreField.value) {
        throw new Error("Select habitat points, protected areas, and a numeric score field.");
      }
      const output = priorityAreas(habitat.features(), protectedAreas.features(), {
        scoreField: scoreField.value,
        minScore: parseFinite(minScore, "Minimum score"),
      });
      if (!output.ok) throw new Error(output.error);
      const outputIds: string[] = [];
      if (output.priorityFeatures.length) {
        outputIds.push(addOutputLayer(shell, "Unprotected priority sites", output.priorityFeatures, output.provenance));
      }
      setStatus(
        status,
        output.priorityCount ? "success" : "warning",
        output.priorityCount
          ? `Found ${output.priorityCount.toLocaleString()} unprotected high-score site(s).`
          : "No unprotected sites met the selected score threshold.",
      );
      renderKeyValueTable(results, [
        ["Point records", output.totalPoints],
        ["Unprotected priorities", output.priorityCount],
        ["High-score, protected", output.protectedHighCount],
        ["Below / invalid score", output.lowScoreCount],
        ["Invalid numeric scores", output.invalidScoreCount],
        ["Threshold", `${output.scoreField} ≥ ${output.minScore}`],
      ], "Priority-site result");
      shell.recordRun(runRecord("priority-areas", "Unprotected priority sites", output.provenance, outputIds, {
        priorityCount: output.priorityCount,
        protectedHighCount: output.protectedHighCount,
        minScore: output.minScore,
      }));
    });
  });
}

interface CriterionRow {
  wrapper: HTMLDivElement;
  field: HTMLSelectElement;
  weight: HTMLInputElement;
  direction: HTMLSelectElement;
}

export function mountSuitabilityTool(shell: PanelShell, parent: HTMLElement, noun = "suitability"): void {
  const card = shell.addTool(parent, {
    id: "weighted-linear-combination",
    title: "Weighted suitability (WLC)",
    description: `Standardise numeric attributes to 0–1 and combine benefit/cost criteria into a ${noun} score on every input feature.`,
    method: "Per-field min–max standardisation plus normalised weighted linear combination. Constant criteria contribute a neutral 0.5 and are warned.",
  });
  const source = layerPicker(shell, { kind: "vector", placeholder: "— features to score —" });
  const constraint = selectInput([]);
  card.append(field("Input feature layer", source.select));
  const rowsHost = el("div", "gsp-criteria");
  card.appendChild(rowsHost);
  const rows: CriterionRow[] = [];
  const currentFields = () => numericFields(source.features());
  const addRow = (selected?: string) => {
    const wrapper = el("div", "gsp-criterion");
    const fieldSelect = selectInput([]);
    populateFieldSelect(fieldSelect, currentFields(), selected);
    const weight = numberInput(1, { min: 0, step: 0.1 });
    const direction = selectInput([
      { value: "benefit", label: "Benefit ↑" },
      { value: "cost", label: "Cost ↓" },
    ]);
    const remove = button("×", "secondary");
    remove.classList.add("gsp-criterion__remove");
    remove.setAttribute("aria-label", "Remove WLC criterion");
    wrapper.append(field("Criterion", fieldSelect), field("Weight", weight), field("Direction", direction), remove);
    const row = { wrapper, field: fieldSelect, weight, direction };
    remove.addEventListener("click", () => {
      if (rows.length <= 1) return;
      wrapper.remove();
      rows.splice(rows.indexOf(row), 1);
    });
    rows.push(row);
    rowsHost.appendChild(wrapper);
  };
  addRow();
  addRow();
  const refreshFields = () => {
    const fields = currentFields();
    for (const row of rows) populateFieldSelect(row.field, fields, row.field.value);
    populateFieldSelect(constraint, fields, constraint.value, "No constraint field");
  };
  source.select.addEventListener("change", refreshFields);
  shell.onLayersChanged(refreshFields);
  const addCriterion = button("Add criterion", "secondary");
  const run = button("Run weighted suitability");
  card.append(field("Constraint field (truthy = unsuitable)", constraint, "Optional. A truthy value forces suitability to zero."));
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(addCriterion, run), status, results);
  addCriterion.addEventListener("click", () => addRow());
  run.addEventListener("click", () => {
    void withBusy(run, status, "Scoring weighted criteria…", () => {
      if (!source.select.value) throw new Error("Select an input feature layer.");
      const criteria: FeatureSuitabilityCriterion[] = rows
        .filter((row) => row.field.value)
        .map((row) => ({
          field: row.field.value,
          id: row.field.value,
          weight: parseFinite(row.weight, `Weight for ${row.field.value}`),
          direction: row.direction.value as "benefit" | "cost",
        }));
      if (!criteria.length) throw new Error("Select at least one numeric criterion.");
      if (new Set(criteria.map((criterion) => criterion.field)).size !== criteria.length) {
        throw new Error("Each WLC criterion must use a different field.");
      }
      const output = featureSuitability(source.features(), criteria, {
        constraintField: constraint.value || undefined,
      });
      if (!output.ok) throw new Error(output.error);
      const outputId = addOutputLayer(
        shell,
        `${layerName(shell, source.select.value)} — weighted suitability`,
        output.features,
        output.provenance,
      );
      setStatus(status, "success", `Scored ${output.scoredCount.toLocaleString()} feature(s).`);
      renderKeyValueTable(results, [
        ["Scored features", output.scoredCount],
        ["Missing criteria", output.missingCount],
        ["Constrained to zero", output.constrainedCount],
        ["Minimum", formatNumber(output.minSuitability, 3)],
        ["Mean", formatNumber(output.meanSuitability, 3)],
        ["Maximum", formatNumber(output.maxSuitability, 3)],
      ], "WLC result");
      for (const warning of output.warnings) appendNotice(results, warning, "warning");
      shell.recordRun(runRecord("weighted-linear-combination", "Weighted suitability", output.provenance, [outputId], {
        scoredCount: output.scoredCount,
        missingCount: output.missingCount,
        meanSuitability: output.meanSuitability,
      }));
    });
  });
}

export function mountDistanceDecayTool(shell: PanelShell, parent: HTMLElement, subject = "accessibility"): void {
  const card = shell.addTool(parent, {
    id: "distance-decay",
    title: "Distance-decay suitability",
    description: `Convert a numeric distance attribute into an exponential ${subject} score from 1 at zero to 0.5 at the selected half-life.`,
    method: "score = exp(−ln(2) × distance / half-life). Distances must already be in metres; no hidden geometry-distance approximation is applied.",
  });
  const source = layerPicker(shell, { kind: "vector", placeholder: "— feature layer —" });
  const distanceField = selectInput([]);
  const halfLife = numberInput(1000, { min: 0.01, step: 100 });
  const refresh = () => populateFieldSelect(distanceField, numericFields(source.features()), distanceField.value, "— distance field (metres) —");
  source.select.addEventListener("change", refresh);
  shell.onLayersChanged(refresh);
  refresh();
  card.append(field("Input feature layer", source.select), fieldGrid(field("Distance field (m)", distanceField), field("Half-life distance (m)", halfLife)));
  const run = button("Create distance-decay scores");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Applying exponential distance decay…", () => {
      if (!source.select.value || !distanceField.value) throw new Error("Select an input layer and distance field.");
      const halfLifeM = parsePositive(halfLife, "Half-life distance");
      let valid = 0;
      let missing = 0;
      const scores: number[] = [];
      const output = source.features().map((feature) => {
        const raw = Number(feature.properties?.[distanceField.value]);
        const score = Number.isFinite(raw) && raw >= 0 ? distanceDecay(raw, halfLifeM) : null;
        if (score === null) missing++;
        else {
          valid++;
          scores.push(score);
        }
        return {
          type: "Feature" as const,
          id: feature.id,
          bbox: feature.bbox,
          geometry: feature.geometry,
          properties: {
            ...(feature.properties ?? {}),
            distance_decay_suitability: score,
            distance_decay_nodata: score === null,
          },
        };
      });
      if (!valid) throw new Error("The selected distance field has no finite, non-negative values.");
      const provenance = makeProvenance(
        "distance-decay-suitability",
        "Exponential distance-decay with stated half-life",
        "Attribute distance in metres; output retains input geometry CRS",
        {
          layer: source.select.value,
          distanceField: distanceField.value,
          halfLifeM,
          validFeatures: valid,
          missingFeatures: missing,
        },
      );
      const outputId = addOutputLayer(shell, `${layerName(shell, source.select.value)} — distance decay`, output, provenance);
      setStatus(status, "success", `Scored ${valid.toLocaleString()} feature(s).`);
      renderKeyValueTable(results, [
        ["Distance field", distanceField.value],
        ["Half-life", `${formatNumber(halfLifeM, 0)} m`],
        ["Valid / missing", `${valid} / ${missing}`],
        ["Minimum score", formatNumber(Math.min(...scores), 3)],
        ["Mean score", formatNumber(scores.reduce((sum, value) => sum + value, 0) / scores.length, 3)],
        ["Maximum score", formatNumber(Math.max(...scores), 3)],
      ], "Distance-decay result");
      shell.recordRun(runRecord("distance-decay-suitability", "Distance-decay suitability", provenance, [outputId], {
        halfLifeM,
        valid,
        missing,
      }));
    });
  });
}

interface ScpTargetRow {
  wrapper: HTMLDivElement;
  field: HTMLSelectElement;
  target: HTMLInputElement;
}

export function mountScpTool(shell: PanelShell, parent: HTMLElement): void {
  const card = shell.addTool(parent, {
    id: "systematic-conservation-planning",
    title: "Minimum-cost representation",
    description: "Select planning units that meet feature-representation targets at minimum cost. Small problems are solved exactly; bounded fallbacks are labelled greedy and never claimed optimal.",
    method: "Deterministic branch-and-bound up to 28 planning units (2,000,000-node safety cap), with an explicitly non-optimal greedy fallback beyond that bound.",
  });
  const source = layerPicker(shell, { kind: "polygon", placeholder: "— planning-unit polygons —" });
  const costField = selectInput([]);
  card.append(fieldGrid(field("Planning-unit layer", source.select), field("Cost field", costField)));
  const targetsHost = el("div", "gsp-criteria");
  card.appendChild(targetsHost);
  const rows: ScpTargetRow[] = [];
  const fields = () => numericFields(source.features());
  const addTarget = () => {
    const wrapper = el("div", "gsp-criterion");
    const featureField = selectInput([]);
    populateFieldSelect(featureField, fields(), undefined, "— representation field —");
    const target = numberInput(1, { min: 0, step: 0.1 });
    const remove = button("×", "secondary");
    remove.classList.add("gsp-criterion__remove");
    remove.setAttribute("aria-label", "Remove representation target");
    wrapper.append(field("Feature field", featureField), field("Target", target), el("span"), remove);
    const row = { wrapper, field: featureField, target };
    remove.addEventListener("click", () => {
      if (rows.length <= 1) return;
      wrapper.remove();
      rows.splice(rows.indexOf(row), 1);
    });
    rows.push(row);
    targetsHost.appendChild(wrapper);
  };
  addTarget();
  const refresh = () => {
    const available = fields();
    populateFieldSelect(costField, available, costField.value, "— numeric cost field —");
    for (const row of rows) populateFieldSelect(row.field, available, row.field.value, "— representation field —");
  };
  source.select.addEventListener("change", refresh);
  shell.onLayersChanged(refresh);
  const add = button("Add representation target", "secondary");
  const run = button("Solve planning-unit selection");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(add, run), status, results);
  add.addEventListener("click", addTarget);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Solving the minimum-cost representation problem…", async () => {
      if (!source.select.value || !costField.value) throw new Error("Select planning units and a numeric cost field.");
      const activeTargets = rows.filter((row) => row.field.value);
      if (!activeTargets.length) throw new Error("Add at least one representation field and target.");
      if (new Set(activeTargets.map((row) => row.field.value)).size !== activeTargets.length) {
        throw new Error("Each representation target must use a different field.");
      }
      const features = source.features();
      const costs = features.map((feature) => Number(feature.properties?.[costField.value]));
      if (costs.some((cost) => !Number.isFinite(cost) || cost < 0)) {
        throw new Error("Every planning unit needs a finite, non-negative cost.");
      }
      const speciesCoverage = activeTargets.map((row) =>
        features.map((feature) => Number(feature.properties?.[row.field.value])),
      );
      if (speciesCoverage.some((coverage) => coverage.some((value) => !Number.isFinite(value) || value < 0))) {
        throw new Error("Every selected representation field must be finite and non-negative on every planning unit.");
      }
      const targets = activeTargets.map((row) => parseFinite(row.target, `Target for ${row.field.value}`));
      if (targets.some((target) => target < 0)) throw new Error("Representation targets cannot be negative.");
      const solution = await solveScpExact({ costs, speciesCoverage, targets });
      if (!solution.feasible) throw new Error(solution.warning ?? "The supplied representation targets are infeasible.");
      const selectedSet = new Set(solution.selected);
      const selectedFeatures = features
        .map((feature, index) => ({ feature, index }))
        .filter(({ index }) => selectedSet.has(index))
        .map(({ feature, index }) => ({
          type: "Feature" as const,
          id: feature.id,
          bbox: feature.bbox,
          geometry: feature.geometry,
          properties: {
            ...(feature.properties ?? {}),
            scp_selected: true,
            scp_unit_index: index,
            scp_cost: costs[index],
          },
        }));
      const provenance = makeProvenance(
        "systematic-conservation-planning",
        solution.optimal
          ? "Exact minimum-cost representation (branch-and-bound)"
          : "Greedy minimum-cost representation heuristic (not optimal)",
        "Input planning-unit geometry CRS",
        {
          planningUnitCount: features.length,
          costField: costField.value,
          representationFields: activeTargets.map((row) => row.field.value),
          targets,
          method: solution.method,
          optimal: solution.optimal,
          nodesVisited: solution.nodesVisited ?? null,
          warning: solution.warning ?? null,
        },
      );
      const outputId = addOutputLayer(shell, `Selected planning units (${solution.selected.length})`, selectedFeatures, provenance);
      setStatus(
        status,
        solution.optimal ? "success" : "warning",
        solution.optimal
          ? `Proved an optimal selection of ${solution.selected.length} planning unit(s).`
          : `Returned a feasible greedy selection of ${solution.selected.length} unit(s); optimality was not claimed.`,
      );
      renderKeyValueTable(results, [
        ["Planning units", features.length],
        ["Selected units", solution.selected.length],
        ["Total cost", formatNumber(solution.cost, 3)],
        ["Method", solution.method],
        ["Optimality proved", solution.optimal ? "Yes" : "No"],
        ["Search nodes", solution.nodesVisited ?? "Not applicable"],
        ["Coverage achieved", solution.coverage.map((value, index) => `${activeTargets[index].field.value}: ${formatNumber(value, 2)} / ${formatNumber(targets[index], 2)}`).join("; ")],
      ], "Planning-unit solution");
      if (solution.warning) appendNotice(results, solution.warning, "warning");
      shell.recordRun(runRecord("systematic-conservation-planning", "Minimum-cost representation", provenance, [outputId], {
        planningUnits: features.length,
        selectedUnits: solution.selected.length,
        cost: solution.cost,
        method: solution.method,
        optimal: solution.optimal,
      }));
    });
  });
}

export function mountGapTool(
  shell: PanelShell,
  parent: HTMLElement,
  labels: {
    habitat?: string;
    network?: string;
    habitatLayerName?: string | null;
    networkLayerName?: string | null;
    areaMode?: "equalarea" | "spherical";
    onStateChange?: (state: {
      habitatLayerName: string | null;
      networkLayerName: string | null;
      areaMode: "equalarea" | "spherical";
    }) => void;
  } = {},
): void {
  const card = shell.addTool(parent, {
    id: "protection-gap",
    title: "Protection gap",
    description: `Measure how much of ${labels.habitat ?? "a mapped habitat extent"} is inside and outside ${labels.network ?? "the protected-area network"}.`,
    method: "Dissolved polygon intersection/difference with equal-area LAEA reporting by default; closure residual is reported.",
  });
  const habitat = layerPicker(shell, {
    kind: "polygon",
    placeholder: `— ${labels.habitat ?? "habitat extent"} —`,
    selectedName: labels.habitatLayerName,
  });
  const network = layerPicker(shell, {
    kind: "polygon",
    placeholder: `— ${labels.network ?? "protected areas"} —`,
    selectedName: labels.networkLayerName,
  });
  const areaMode = selectInput([
    { value: "equalarea", label: "Equal-area (LAEA, auto-centred)" },
    { value: "spherical", label: "Spherical WGS84" },
  ], labels.areaMode ?? "equalarea");
  const reportState = () => labels.onStateChange?.({
    habitatLayerName: habitat.layer()?.name ?? null,
    networkLayerName: network.layer()?.name ?? null,
    areaMode: areaMode.value as "equalarea" | "spherical",
  });
  habitat.select.addEventListener("change", reportState);
  network.select.addEventListener("change", reportState);
  areaMode.addEventListener("change", reportState);
  card.append(
    fieldGrid(field(labels.habitat ?? "Habitat extent", habitat.select), field(labels.network ?? "Protected areas", network.select)),
    field("Area method", areaMode),
  );
  const run = button("Run protection gap");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Computing protected and unprotected extent…", () => {
      if (!habitat.select.value || !network.select.value) throw new Error("Select both polygon layers.");
      const output = protectionGap(habitat.features(), network.features(), {
        areaMode: areaMode.value as "equalarea" | "spherical",
        habitatLayerName: layerName(shell, habitat.select.value),
        paLayerName: layerName(shell, network.select.value),
      });
      if (!output.ok) throw new Error(output.error);
      const outputIds: string[] = [];
      if (output.protectedGeom) {
        outputIds.push(addOutputLayer(shell, "Habitat — protected", [output.protectedGeom], output.provenance));
      }
      if (output.gapGeom) {
        outputIds.push(addOutputLayer(shell, "Habitat — protection gap", [output.gapGeom], output.provenance));
      }
      setStatus(status, "success", `${output.protectedPct.toFixed(1)}% of mapped habitat is protected.`);
      renderKeyValueTable(results, [
        ["Total habitat", formatArea(output.totalAreaM2).display],
        ["Protected", `${formatArea(output.protectedAreaM2).display} (${formatPercent(output.protectedPct)})`],
        ["Gap", `${formatArea(output.gapAreaM2).display} (${formatPercent(output.gapPct)})`],
        ["Intersecting protected areas", output.paCount],
        ["Geometry closure residual", formatPercent(output.residualPct, 2)],
        ["Area method", `${output.measurement.total.method} — ${output.measurement.total.crs}`],
      ], "Protection-gap result");
      appendNotice(results, "Mapped designation overlap does not measure management effectiveness.");
      if (output.residualPct > 0.5) appendNotice(results, "Closure residual exceeds 0.5%; inspect input geometry validity.", "warning");
      shell.recordRun(runRecord("protection-gap", "Protection gap", output.provenance, outputIds, {
        protectedPct: output.protectedPct,
        gapPct: output.gapPct,
        residualPct: output.residualPct,
      }));
    });
  });
}

export function mountFragmentationTool(shell: PanelShell, parent: HTMLElement, subject = "land-cover"): void {
  const card = shell.addTool(parent, {
    id: "fragmentation",
    title: "Fragmentation & patch metrics",
    description: `Summarise ${subject} patches, edge, shape, core area and nearest-neighbour separation.`,
    method: "Polygon patch metrics; core is a negative buffer at the stated depth. ENN is centroid-to-centroid, not edge-to-edge.",
  });
  const source = layerPicker(shell, { kind: "polygon", placeholder: "— patch layer —" });
  const depth = numberInput(100, { min: 0, step: 10 });
  const areaMode = selectInput([
    { value: "equalarea", label: "Equal-area (LAEA)" },
    { value: "spherical", label: "Spherical WGS84" },
  ]);
  const explode = checkbox("Treat each MultiPolygon part as a separate patch", true);
  card.append(field("Patch layer", source.select), fieldGrid(field("Core edge depth (m)", depth), field("Area method", areaMode)), explode.wrapper);
  const run = button("Compute patch metrics");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Computing patch and core metrics…", () => {
      if (!source.select.value) throw new Error("Select a polygon patch layer.");
      const output = fragmentationAnalysis(source.features(), {
        coreDepthM: parseFinite(depth, "Core edge depth"),
        areaMode: areaMode.value as "equalarea" | "spherical",
        explodeMultiPolygons: explode.input.checked,
      });
      if (!output.ok) throw new Error(output.error);
      const outputIds: string[] = [];
      if (output.coreFeatures.length) {
        outputIds.push(addOutputLayer(shell, `Core areas (${output.coreDepthM} m edge)`, output.coreFeatures, output.provenance));
      }
      setStatus(status, "success", `Measured ${output.numPatches.toLocaleString()} patch(es).`);
      renderKeyValueTable(results, [
        ["Number of patches (NP)", output.numPatches],
        ["Class area (CA)", formatArea(output.totalAreaM2).display],
        ["Mean / median patch", `${formatArea(output.meanPatchM2).display} / ${formatArea(output.medianPatchM2).display}`],
        ["Largest patch index (LPI)", formatPercent(output.largestPatchIndex)],
        ["Total edge (TE)", `${formatNumber(output.totalEdgeM / 1000, 2)} km`],
        ["Edge density (ED)", `${formatNumber(output.edgeDensityMPerHa, 2)} m/ha`],
        ["Mean shape index (MSI)", formatNumber(output.meanShapeIndex, 3)],
        ["Core area / CAI", `${formatArea(output.coreAreaM2).display} / ${formatPercent(output.coreAreaIndex)}`],
        ["Patches without core", output.patchesWithNoCore],
        ["Mean nearest neighbour", output.meanNearestNeighbourM === null ? "—" : `${formatNumber(output.meanNearestNeighbourM, 0)} m`],
        ["Area method", `${output.areaMethod} — ${output.areaCrs}`],
      ], "Landscape metrics");
      appendNotice(results, `Core-area results depend on the selected ${output.coreDepthM} m edge depth; report and justify it.`);
      for (const warning of output.warnings) appendNotice(results, warning, "warning");
      shell.recordRun(runRecord("fragmentation", "Fragmentation & patch metrics", output.provenance, outputIds, {
        patches: output.numPatches,
        totalAreaM2: output.totalAreaM2,
        largestPatchIndex: output.largestPatchIndex,
        coreAreaIndex: output.coreAreaIndex,
      }));
    });
  });
}

export function mountConnectivityTool(shell: PanelShell, parent: HTMLElement, subject = "patches"): void {
  const card = shell.addTool(parent, {
    id: "connectivity",
    title: "Patch connectivity graph",
    description: `Link ${subject} whose centroids fall within a selected threshold and label connected components.`,
    method: "Haversine centroid-distance threshold graph. This does not model resistance, terrain, currents, or least-cost corridors.",
  });
  const source = layerPicker(shell, { kind: "polygon", placeholder: "— patch layer —" });
  const threshold = numberInput(500, { min: 1, step: 100 });
  card.append(field("Patch layer", source.select), field("Link threshold (m)", threshold));
  const run = button("Build connectivity graph");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Building connectivity graph…", () => {
      if (!source.select.value) throw new Error("Select a polygon patch layer.");
      const output = connectivityAnalysis(source.features(), parsePositive(threshold, "Link threshold"));
      if (!output.ok) throw new Error(output.error);
      const outputIds = [addOutputLayer(shell, "Patches by connectivity component", output.taggedFeatures, output.provenance)];
      if (output.linkFeatures.length) {
        outputIds.push(addOutputLayer(shell, `Connectivity links (≤ ${threshold.value} m)`, output.linkFeatures, output.provenance));
      }
      setStatus(status, "success", `${output.componentCount} component(s); ${output.isolatedPatches} isolated patch(es).`);
      renderKeyValueTable(results, [
        ["Threshold", `${formatNumber(output.thresholdM, 0)} m`],
        ["Patches", output.numPatches],
        ["Links", output.linkCount],
        ["Connected components", output.componentCount],
        ["Largest component", `${output.largestComponentPatches} patches; ${formatArea(output.largestComponentAreaM2).display}`],
        ["Isolated patches", output.isolatedPatches],
      ], "Connectivity result");
      appendNotice(results, "Centroid links are a structural screening metric, not ecological least-cost corridors.", "warning");
      shell.recordRun(runRecord("connectivity", "Patch connectivity graph", output.provenance, outputIds, {
        components: output.componentCount,
        links: output.linkCount,
        isolatedPatches: output.isolatedPatches,
      }));
    });
  });
}

export function mountVectorChangeTool(shell: PanelShell, parent: HTMLElement, subject = "extent"): void {
  const card = shell.addTool(parent, {
    id: "vector-change",
    title: "Two-date change detection",
    description: `Compare an earlier and later polygon ${subject} to derive loss, gain and persistence.`,
    method: "Dissolve both dates; loss=T1−T2, gain=T2−T1, persistence=T1∩T2. Equal-area reporting and closure are explicit.",
  });
  const t1 = layerPicker(shell, { kind: "polygon", placeholder: "— earlier extent (T1) —" });
  const t2 = layerPicker(shell, { kind: "polygon", placeholder: "— later extent (T2) —" });
  const currentYear = new Date().getUTCFullYear();
  const year1 = numberInput(currentYear - 10, { min: 0, step: 1 });
  const year2 = numberInput(currentYear, { min: 0, step: 1 });
  const areaMode = selectInput([
    { value: "equalarea", label: "Equal-area (LAEA)" },
    { value: "spherical", label: "Spherical WGS84" },
  ]);
  card.append(
    fieldGrid(field("Earlier layer (T1)", t1.select), field("Later layer (T2)", t2.select)),
    fieldGrid(field("Year T1", year1), field("Year T2", year2)),
    field("Area method", areaMode),
  );
  const run = button("Detect change");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Deriving loss, gain and persistence…", () => {
      if (!t1.select.value || !t2.select.value) throw new Error("Select both time-step layers.");
      if (t1.select.value === t2.select.value) throw new Error("Select two different layers.");
      const output = vectorChangeDetection(t1.features(), t2.features(), {
        yearT1: parseFinite(year1, "Year T1"),
        yearT2: parseFinite(year2, "Year T2"),
        areaMode: areaMode.value as "equalarea" | "spherical",
      });
      if (!output.ok) throw new Error(output.error);
      const outputIds: string[] = [];
      if (output.features.length) {
        outputIds.push(addOutputLayer(shell, `${subject} change ${year1.value}–${year2.value}`, output.features, output.provenance));
      }
      setStatus(status, "success", `Net change ${formatPercent(output.netChangePct)} across ${output.years ?? "the selected dates"}.`);
      const rows: Array<[string, string | number]> = [
        [`T1 extent (${year1.value})`, formatArea(output.t1AreaM2).display],
        [`T2 extent (${year2.value})`, formatArea(output.t2AreaM2).display],
        ["Loss", `${formatArea(output.lossAreaM2).display} (${formatPercent(output.lossPctOfT1)})`],
        ["Gain", `${formatArea(output.gainAreaM2).display} (${formatPercent(output.gainPctOfT1)})`],
        ["Persistence", formatArea(output.persistenceAreaM2).display],
        ["Net change", `${formatArea(output.netChangeM2).display} (${formatPercent(output.netChangePct)})`],
        ["Closure residual", formatPercent(output.residualPct, 2)],
        ["Area method", `${output.areaMethod} — ${output.areaCrs}`],
      ];
      if (output.annualHaPerYear !== null) {
        rows.splice(6, 0, ["Annualised net rate", `${formatNumber(output.annualHaPerYear, 2)} ha/year (${formatPercent(output.annualPctPerYear, 2)}/year)`]);
      }
      renderKeyValueTable(results, rows, "Change result");
      if (output.residualPct > 0.5) appendNotice(results, "Closure residual exceeds 0.5%; inspect input geometry validity.", "warning");
      shell.recordRun(runRecord("vector-change-detection", "Two-date change detection", output.provenance, outputIds, {
        lossAreaM2: output.lossAreaM2,
        gainAreaM2: output.gainAreaM2,
        netChangePct: output.netChangePct,
        annualHaPerYear: output.annualHaPerYear,
      }));
    });
  });
}

export function mountPointPatternTool(shell: PanelShell, parent: HTMLElement, subject = "occurrences"): void {
  const card = shell.addTool(parent, {
    id: "nearest-neighbour",
    title: "Occurrence pattern",
    description: `Measure nearest-neighbour spacing and the Clark–Evans ratio for ${subject}.`,
    method: "Haversine nearest-neighbour distances; CSR expectation uses the input points’ bounding-box area with no edge correction.",
  });
  const source = layerPicker(shell, { kind: "point", placeholder: "— point layer —" });
  card.append(field("Point layer", source.select));
  const run = button("Analyse point pattern");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Measuring nearest neighbours…", () => {
      if (!source.select.value) throw new Error("Select a point layer.");
      const output = nearestNeighbourIndex(source.features());
      if (!output.ok) throw new Error(output.error);
      setStatus(status, "success", `Pattern is ${output.interpretation} at the bounding-box study scale.`);
      renderKeyValueTable(results, [
        ["Points", output.pointCount],
        ["Study area", formatArea(output.studyAreaM2).display],
        ["Observed mean NN", `${formatNumber(output.observedMeanM, 1)} m`],
        ["CSR expected mean", `${formatNumber(output.expectedMeanM, 1)} m`],
        ["Clark–Evans R", formatNumber(output.ratio, 3)],
        ["Approximate z-score", formatNumber(output.zScore, 3)],
        ["Interpretation", output.interpretation],
      ], "Nearest-neighbour result");
      appendNotice(results, output.methodNote, "warning");
      shell.recordRun(runRecord("nearest-neighbour-index", "Occurrence pattern", output.provenance, [], {
        points: output.pointCount,
        ratio: output.ratio,
        zScore: output.zScore,
        interpretation: output.interpretation,
      }));
    });
  });
}

interface SdmVariableRow {
  wrapper: HTMLDivElement;
  field: HTMLSelectElement;
}

function valuesForFields(feature: Feature<Geometry | null>, fields: string[]): number[] {
  return fields.map((fieldName) => Number(feature.properties?.[fieldName]));
}

export function mountSdmTool(shell: PanelShell, parent: HTMLElement, subject = "species"): void {
  const card = shell.addTool(parent, {
    id: "sdm",
    title: "Species distribution model",
    description: `Fit BIOCLIM or Mahalanobis environmental-space models to ${subject} presence records, then score a prediction feature layer.`,
    method: "Environmental values must already be numeric attributes on both layers. Missing rows are excluded—not replaced with zero—and the model never falls back to coordinates.",
  });
  const presences = layerPicker(shell, { kind: "point", placeholder: "— presence points —" });
  const prediction = layerPicker(shell, { kind: "vector", placeholder: "— prediction features —" });
  const modelType = selectInput([
    { value: "bioclim", label: "BIOCLIM percentile envelope" },
    { value: "mahalanobis", label: "Mahalanobis D²" },
  ]);
  const bioclimMode = selectInput([
    { value: "limiting", label: "Limiting factor (true envelope)" },
    { value: "proportion", label: "Proportion in envelope (non-standard)" },
  ]);
  const percentile = numberInput(5, { min: 0, max: 49, step: 1 });
  const mahalanobisOutput = selectInput([
    { value: "chisq", label: "Chi-square survival probability" },
    { value: "index", label: "1/(1+D) relative index" },
  ]);
  card.append(
    fieldGrid(field("Presence points", presences.select), field("Prediction layer", prediction.select)),
    field("Model", modelType),
  );
  const variablesHost = el("div", "gsp-criteria");
  card.appendChild(variablesHost);
  const rows: SdmVariableRow[] = [];
  const sharedFields = () => {
    const training = new Set(numericFields(presences.features()));
    return numericFields(prediction.features()).filter((fieldName) => training.has(fieldName));
  };
  const addVariable = (selected?: string) => {
    const wrapper = el("div", "gsp-criterion");
    const fieldSelect = selectInput([]);
    populateFieldSelect(fieldSelect, sharedFields(), selected, "— shared environmental field —");
    const remove = button("×", "secondary");
    remove.classList.add("gsp-criterion__remove");
    remove.setAttribute("aria-label", "Remove environmental variable");
    wrapper.append(field("Environmental variable", fieldSelect), el("span"), el("span"), remove);
    const row = { wrapper, field: fieldSelect };
    remove.addEventListener("click", () => {
      if (rows.length <= 1) return;
      wrapper.remove();
      rows.splice(rows.indexOf(row), 1);
    });
    rows.push(row);
    variablesHost.appendChild(wrapper);
  };
  addVariable();
  addVariable();
  const refreshVariables = () => {
    const fields = sharedFields();
    for (const row of rows) populateFieldSelect(row.field, fields, row.field.value, "— shared environmental field —");
  };
  presences.select.addEventListener("change", refreshVariables);
  prediction.select.addEventListener("change", refreshVariables);
  shell.onLayersChanged(refreshVariables);
  card.append(
    fieldGrid(field("BIOCLIM tail trim (%)", percentile), field("BIOCLIM output", bioclimMode)),
    field("Mahalanobis output", mahalanobisOutput),
  );
  const add = button("Add variable", "secondary");
  const run = button("Fit and predict SDM");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(add, run), status, results);
  add.addEventListener("click", () => addVariable());
  run.addEventListener("click", () => {
    void withBusy(run, status, "Fitting environmental model and scoring features…", () => {
      if (!presences.select.value || !prediction.select.value) throw new Error("Select presence and prediction layers.");
      const fields = rows.map((row) => row.field.value).filter(Boolean);
      if (!fields.length) throw new Error("Select at least one shared environmental field.");
      if (new Set(fields).size !== fields.length) throw new Error("Each environmental variable must be unique.");
      if (modelType.value === "mahalanobis" && fields.length < 2) {
        throw new Error("Mahalanobis requires at least two environmental variables.");
      }
      const presenceFeatures = presences.features();
      const predictionFeatures = prediction.features();
      const trainingMatrix = presenceFeatures.map((feature) => valuesForFields(feature, fields));
      const completeTraining = trainingMatrix.filter((row) => row.every(Number.isFinite));
      const dropped = trainingMatrix.length - completeTraining.length;
      if (completeTraining.length < 5) throw new Error(`At least five complete presence records are required; found ${completeTraining.length}.`);
      if (modelType.value === "mahalanobis" && completeTraining.length < fields.length + 2) {
        throw new Error(`Mahalanobis needs at least variables + 2 complete records (${fields.length + 2}); found ${completeTraining.length}.`);
      }

      const outputFeatures: Feature<Geometry | null>[] = [];
      let validPredictions = 0;
      let missingPredictions = 0;
      let provenance;
      let regularized = false;
      if (modelType.value === "bioclim") {
        const trim = parseFinite(percentile, "BIOCLIM tail trim");
        const model = fitBioclim(completeTraining, fields, { percentile: trim });
        if (!model) throw new Error("BIOCLIM could not fit the supplied complete records and percentile.");
        provenance = provenanceForSdm("bioclim", {
          variables: fields,
          recordsUsed: model.n,
          recordsDropped: dropped,
          percentile: trim,
          mode: bioclimMode.value,
          predictionInput: "numeric feature attributes",
        });
        predictionFeatures.forEach((feature) => {
          const predictionResult = predictBioclim(valuesForFields(feature, fields), model, bioclimMode.value as "limiting" | "proportion");
          if (predictionResult.suitability === null) missingPredictions++;
          else validPredictions++;
          outputFeatures.push({
            type: "Feature",
            id: feature.id,
            bbox: feature.bbox,
            geometry: feature.geometry,
            properties: {
              ...(feature.properties ?? {}),
              sdm_model: "BIOCLIM",
              sdm_suitability: predictionResult.suitability,
              sdm_nodata: predictionResult.suitability === null,
              sdm_limiting_variables: predictionResult.limitingVariables.join(", "),
            },
          });
        });
      } else {
        const model = fitMahalanobis(completeTraining, fields);
        if (!model?.invCov) throw new Error("The covariance matrix could not be inverted, even with disclosed ridge regularisation.");
        regularized = model.regularized;
        provenance = provenanceForSdm("mahalanobis", {
          variables: fields,
          recordsUsed: model.n,
          recordsDropped: dropped,
          output: mahalanobisOutput.value,
          covarianceRegularized: model.regularized,
          ridge: model.ridge,
          predictionInput: "numeric feature attributes",
        });
        predictionFeatures.forEach((feature) => {
          const predictionResult = predictMahalanobis(valuesForFields(feature, fields), model, mahalanobisOutput.value as "chisq" | "index");
          if (predictionResult.suitability === null) missingPredictions++;
          else validPredictions++;
          outputFeatures.push({
            type: "Feature",
            id: feature.id,
            bbox: feature.bbox,
            geometry: feature.geometry,
            properties: {
              ...(feature.properties ?? {}),
              sdm_model: "Mahalanobis",
              sdm_suitability: predictionResult.suitability,
              sdm_d2: predictionResult.d2,
              sdm_nodata: predictionResult.suitability === null,
            },
          });
        });
      }
      const outputId = addOutputLayer(shell, `${subject} SDM — ${modelType.value}`, outputFeatures, provenance);
      setStatus(status, "success", `Scored ${validPredictions.toLocaleString()} prediction feature(s).`);
      renderKeyValueTable(results, [
        ["Model", modelType.value === "bioclim" ? "BIOCLIM" : "Mahalanobis D²"],
        ["Variables", fields.join(", ")],
        ["Presence records used", completeTraining.length],
        ["Presence records dropped", dropped],
        ["Valid predictions", validPredictions],
        ["Prediction rows with missing data", missingPredictions],
        ["Covariance regularised", modelType.value === "mahalanobis" ? (regularized ? "Yes" : "No") : "Not applicable"],
      ], "SDM result");
      if (dropped) appendNotice(results, `${dropped} incomplete presence record(s) were excluded, not filled with zero.`, "warning");
      if (missingPredictions) appendNotice(results, `${missingPredictions} prediction feature(s) have no score because at least one selected variable is missing.`, "warning");
      if (regularized) appendNotice(results, "The covariance was singular/near-singular; ridge regularisation was applied and recorded in provenance.", "warning");
      if (modelType.value === "bioclim" && bioclimMode.value === "proportion") {
        appendNotice(results, "Proportion-in-envelope is a non-standard BIOCLIM index, not true limiting-factor BIOCLIM.", "warning");
      }
      shell.recordRun(runRecord(modelType.value, `${subject} SDM`, provenance, [outputId], {
        recordsUsed: completeTraining.length,
        recordsDropped: dropped,
        validPredictions,
        missingPredictions,
        regularized,
      }));
    });
  });
}

export function mountProvenanceTool(shell: PanelShell, parent: HTMLElement): void {
  const card = shell.addTool(parent, {
    id: "provenance",
    title: "Provenance & project",
    description: "Review methods that actually ran and export a portable run ledger. Result-layer _geospax stamps remain attached in GeoJSON/project exports.",
    method: "Run history is session-local; every generated feature also carries an immutable _geospax stamp with parameters, engine, lineage, method and timestamp.",
  });
  const results = resultRegion("No analyses have run in this panel yet.");
  const exportJson = button("Export run ledger (JSON)", "secondary");
  const exportCsv = button("Export run ledger (CSV)", "secondary");
  const exportProject = button("Export project snapshot", "secondary");
  if (!shell.app.getProjectSnapshot || !shell.app.exportTextFile) exportProject.disabled = true;
  card.append(buttonRow(exportJson, exportCsv, exportProject), results);

  const render = () => {
    results.innerHTML = "";
    if (!shell.history.length) {
      results.appendChild(el("div", "gsp-empty", "No analyses have run in this panel yet."));
      return;
    }
    shell.history.forEach((record, index) => {
      const block = el("div", "gsp-notice");
      block.dataset.tone = "info";
      const heading = el("strong", undefined, `${index + 1}. ${record.title}`);
      const meta = el("div", undefined, `${record.method} · ${new Date(record.runAt).toLocaleString()}`);
      block.append(heading, meta);
      results.appendChild(block);
    });
  };
  shell.root.addEventListener("gsp:run", render);
  render();

  exportJson.addEventListener("click", () => {
    const content = JSON.stringify({ schema: "geospax-run-ledger/1", exportedAt: new Date().toISOString(), runs: shell.history }, null, 2);
    shell.app.exportTextFile?.("geospax-run-ledger.json", content, {
      description: "GeoSpaX run ledger",
      extensions: ["json"],
      mimeType: "application/json",
      promptName: true,
    });
  });
  exportCsv.addEventListener("click", () => {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = ["tool,title,method,run_at,output_layer_ids,summary_json"];
    for (const record of shell.history) {
      rows.push([
        quote(record.tool),
        quote(record.title),
        quote(record.method),
        quote(record.runAt),
        quote(record.outputLayerIds.join(";")),
        quote(JSON.stringify(record.summary)),
      ].join(","));
    }
    shell.app.exportTextFile?.("geospax-run-ledger.csv", rows.join("\n"), {
      description: "GeoSpaX run ledger",
      extensions: ["csv"],
      mimeType: "text/csv",
      promptName: true,
    });
  });
  exportProject.addEventListener("click", () => {
    const snapshot = shell.app.getProjectSnapshot?.();
    if (!snapshot) return;
    shell.app.exportTextFile?.("geospax-project-snapshot.json", JSON.stringify(snapshot, null, 2), {
      description: "GeoLibre project snapshot",
      extensions: ["json"],
      mimeType: "application/json",
      promptName: true,
    });
  });
}

// Keep explicit geometry types in emitted declarations for plugin consumers.
void (null as Feature<Point> | Feature<Polygon | MultiPolygon> | null);
void makeProvenance;
void asFeatures;
