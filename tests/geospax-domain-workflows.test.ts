import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { Feature, Point, Polygon } from "geojson";
import { parseHTML } from "linkedom";
import type { GeoLibreAppAPI } from "../packages/plugins/src/types";
import {
  createPanelShell,
  layerPicker,
} from "../packages/geospax-plugins/src/shared/ui";
import {
  connectivityAnalysis,
  dbscanClusters,
  featureSuitability,
  fitBioclim,
  fitMahalanobis,
  fitPresenceBackgroundLogistic,
  fragmentationAnalysis,
  hotspotGrid,
  nearestNeighbourIndex,
  predictBioclim,
  predictMahalanobis,
  predictPresenceBackgroundLogistic,
  priorityAreas,
  provenanceForSdm,
  solveScpExact,
  vectorChangeDetection,
  vectorOverlay,
} from "../packages/geospax-analysis/src/index";

function box(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  properties: Record<string, unknown> = {},
): Feature<Polygon> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [[
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ]],
    },
  };
}

function point(x: number, y: number, properties: Record<string, unknown> = {}): Feature<Point> {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates: [x, y] } };
}

describe("restored conservation planning workflows", () => {
  it("runs intersect, difference and union overlays with provenance", () => {
    const a = [box(0, 0, 2, 1, { id: "a" })];
    const b = [box(1, 0, 3, 1, { id: "b" })];
    for (const mode of ["intersect", "difference", "union"] as const) {
      const result = vectorOverlay(a, b, mode);
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      assert.ok(result.features.length > 0);
      assert.equal(result.provenance.tool, "vector-overlay");
      assert.equal(result.features[0].properties?._geospax, result.provenance);
    }
  });

  it("identifies high-score points outside protection", () => {
    const result = priorityAreas(
      [point(0.25, 0.25, { quality: 10 }), point(2, 2, { quality: 9 }), point(3, 3, { quality: 1 })],
      [box(0, 0, 1, 1)],
      { scoreField: "quality", minScore: 5 },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.priorityCount, 1);
    assert.equal(result.protectedHighCount, 1);
    assert.equal(result.lowScoreCount, 1);
    assert.equal(result.priorityFeatures[0].properties?.priority, true);
  });

  it("scores feature WLC with benefit/cost and reports missing values", () => {
    const result = featureSuitability(
      [
        point(0, 0, { habitat: 10, cost: 0 }),
        point(1, 1, { habitat: 0, cost: 10 }),
        point(2, 2, { habitat: null, cost: 5 }),
      ],
      [
        { field: "habitat", weight: 2, direction: "benefit" },
        { field: "cost", weight: 1, direction: "cost" },
      ],
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.scoredCount, 2);
    assert.equal(result.missingCount, 1);
    assert.equal(result.features[0].properties?.suitability, 1);
    assert.equal(result.features[1].properties?.suitability, 0);
  });

  it("builds an honestly-labelled descriptive hotspot grid", () => {
    const result = hotspotGrid(
      [{ id: "p", name: "Records", features: [point(0, 0), point(0.05, 0.05)], weight: 1 }],
      { cellSizeKm: 20, gridType: "hex", scoreMethod: "count" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.cellCount > 0);
    assert.ok(result.nonEmptyCells > 0);
    assert.match(result.methodNote, /not p-values|not Getis-Ord/i);
    assert.equal(result.provenance.params.statisticalSignificance, false);
  });

  it("labels deterministic DBSCAN clusters and retains noise", () => {
    const result = dbscanClusters([
      point(0, 0, { site: "a1" }),
      point(0.001, 0, { site: "a2" }),
      point(0, 0.001, { site: "a3" }),
      point(1, 1, { site: "b1" }),
      point(1.001, 1, { site: "b2" }),
      point(1, 1.001, { site: "b3" }),
      point(5, 5, { site: "noise" }),
    ], { epsilonM: 200, minPoints: 3 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.clusterCount, 2);
    assert.equal(result.noiseCount, 1);
    assert.deepEqual(result.clusterSizes, [3, 3]);
    assert.equal(result.features.length, 7);
    assert.deepEqual(
      result.features.map((feature) => feature.properties?.dbscan_cluster),
      [1, 1, 1, 2, 2, 2, -1],
    );
    assert.equal(result.features[6].properties?.dbscan_noise, true);
    assert.equal(result.provenance.params.minPointsIncludesSelf, true);

    const automatic = dbscanClusters([
      point(0, 0),
      point(0.001, 0),
      point(0.002, 0),
    ], { minPoints: 2 });
    assert.equal(automatic.ok, true);
    if (!automatic.ok) return;
    assert.equal(automatic.epsilonWasAutomatic, true);
    assert.equal(automatic.epsilonMultiplier, 1.5);
    assert.ok(automatic.epsilonM > 160 && automatic.epsilonM < 170);
  });

  it("solves bounded minimum-cost representation exactly", async () => {
    const solution = await solveScpExact({
      costs: [3, 2, 2],
      speciesCoverage: [
        [1, 1, 0],
        [1, 0, 1],
      ],
      targets: [1, 1],
    });
    assert.equal(solution.feasible, true);
    assert.equal(solution.optimal, true);
    assert.equal(solution.method, "branch-and-bound");
    assert.deepEqual(solution.selected, [0]);
    assert.equal(solution.cost, 3);
  });
});

describe("restored landscape workflows", () => {
  it("reports complete fragmentation metrics and core geometry", () => {
    const result = fragmentationAnalysis([box(0, 0, 0.02, 0.02), box(0.03, 0, 0.05, 0.02)], {
      coreDepthM: 100,
      areaMode: "equalarea",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.numPatches, 2);
    assert.ok(result.largestPatchIndex > 40);
    assert.ok(result.totalEdgeM > 0);
    assert.ok(result.coreAreaIndex >= 0 && result.coreAreaIndex <= 100);
    assert.ok(result.meanNearestNeighbourM !== null);
    assert.equal(result.provenance.tool, "fragmentation");
  });

  it("returns connectivity links and component-tagged polygons", () => {
    const result = connectivityAnalysis(
      [box(0, 0, 0.01, 0.01), box(0.011, 0, 0.021, 0.01), box(5, 5, 5.01, 5.01)],
      5_000,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.taggedFeatures.length, 3);
    assert.ok(result.linkFeatures.length >= 1);
    assert.equal(result.componentCount, 2);
    assert.equal(result.isolatedPatches, 1);
  });

  it("derives vector loss/gain/persistence and closure", () => {
    const result = vectorChangeDetection([box(0, 0, 2, 1)], [box(1, 0, 3, 1)], {
      yearT1: 2010,
      yearT2: 2020,
      areaMode: "equalarea",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.lossAreaM2 > 0);
    assert.ok(result.gainAreaM2 > 0);
    assert.ok(result.persistenceAreaM2 > 0);
    assert.equal(result.years, 10);
    assert.ok(result.residualPct < 1);
    assert.equal(result.features.length, 3);
  });
});

describe("SDM prediction, not fit-only stubs", () => {
  const training = [
    [1, 10, 100],
    [2, 11, 99],
    [3, 12, 101],
    [4, 13, 100],
    [5, 14, 102],
    [6, 15, 98],
  ];

  it("predicts BIOCLIM limiting and proportional outputs", () => {
    const model = fitBioclim(training, ["a", "b", "c"], { percentile: 5 });
    assert.ok(model);
    const inside = predictBioclim([3, 12, 100], model!, "limiting");
    const outside = predictBioclim([300, 12, 100], model!, "proportion");
    assert.equal(inside.suitability, 1);
    assert.equal(outside.suitability, 2 / 3);
    assert.deepEqual(outside.limitingVariables, ["a"]);
  });

  it("inverts and predicts Mahalanobis for more than two variables", () => {
    const model = fitMahalanobis(training, ["a", "b", "c"]);
    assert.ok(model);
    assert.ok(model!.invCov);
    assert.equal(model!.invCov!.length, 3);
    const prediction = predictMahalanobis([3, 12, 100], model!, "chisq");
    assert.ok(prediction.d2 !== null);
    assert.ok(prediction.suitability !== null && prediction.suitability >= 0 && prediction.suitability <= 1);
  });

  it("marks singular covariance regularisation instead of Euclidean fallback", () => {
    const model = fitMahalanobis([[1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4]], ["a", "b", "c"]);
    assert.ok(model);
    assert.equal(model!.singular, true);
    assert.equal(model!.regularized, true);
    assert.ok(model!.ridge > 0);
    assert.ok(model!.invCov);
  });

  it("fits an explicit presence-background logistic fallback without claiming MaxEnt", () => {
    const model = fitPresenceBackgroundLogistic(
      [[2, 2], [2.5, 2], [3, 2.5], [3.5, 3], [4, 4]],
      [[-4, -3], [-3, -3], [-2.5, -2], [-2, -1], [-1.5, -2], [-1, -1], [0, -1], [0, 0]],
      ["temperature", "rainfall"],
      { lambda: 0.05 },
    );
    assert.ok(model);
    assert.equal(model!.method, "presence-background-logistic");
    assert.equal(model!.nPresences, 5);
    assert.equal(model!.nBackground, 8);
    assert.equal(model!.converged, true);
    assert.ok(model!.iterations > 0);
    const suitable = predictPresenceBackgroundLogistic([3.5, 3.5], model!);
    const unsuitable = predictPresenceBackgroundLogistic([-3, -3], model!);
    assert.ok(suitable !== null && unsuitable !== null);
    assert.ok(suitable! > unsuitable!);
    assert.ok(suitable! > 0.5);
    assert.ok(unsuitable! < 0.5);
    const provenance = provenanceForSdm("presence-background-logistic");
    assert.match(provenance.method, /not elapid MaxEnt/);
  });
});

describe("domain panel capability and shared-design contract", () => {
  const root = new URL("../packages/geospax-plugins/src/", import.meta.url);
  const read = (path: string) => readFileSync(new URL(path, root), "utf8");

  it("all six panels mount the shared GeoSpaX workbench", () => {
    for (const domain of ["agriculture", "biodiversity", "conservation", "environment", "forestry", "marine"]) {
      assert.match(read(`${domain}/panel.ts`), /createPanelShell/);
      assert.match(read(`${domain}/index.ts`), /shared\/style\.css/);
      assert.match(read(`${domain}/index.ts`), /openRightPanel/);
    }
  });

  it("does not query the host for placeholder layer ids while tools mount", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const { document } = parseHTML("<html><body></body></html>");
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    const queried: string[] = [];
    const app = {
      listLayers: () => [],
      getLayerFeatures: (id: string) => {
        queried.push(id);
        throw new Error(`unexpected query for ${id}`);
      },
    } as unknown as GeoLibreAppAPI;
    const shell = {
      app,
      onLayersChanged: () => () => undefined,
    } as ReturnType<typeof createPanelShell>;
    try {
      const picker = layerPicker(shell, { kind: "polygon" });
      assert.deepEqual(picker.features(), []);
      assert.deepEqual(queried, []);
      picker.destroy();
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });

  it("conservation exposes every restored workflow family", () => {
    const source = read("conservation/panel.ts");
    for (const mount of [
      "mountOverlayTool",
      "mountHotspotTool",
      "mountDbscanTool",
      "mountPriorityTool",
      "mountScpTool",
      "mountSdmTool",
      "mountSuitabilityTool",
      "mountGapTool",
      "mountFragmentationTool",
      "mountConnectivityTool",
      "mountVectorChangeTool",
      "mountRasterReclassTool",
      "mountProvenanceTool",
    ]) {
      assert.match(source, new RegExp(mount), `missing ${mount}`);
    }
  });

  it("domain packs expose the audited missing capabilities", () => {
    assert.match(read("agriculture/panel.ts"), /mountIndexTool/);
    assert.match(read("forestry/panel.ts"), /mountRasterChangeTool/);
    assert.match(read("forestry/panel.ts"), /mountVectorChangeTool/);
    assert.match(read("marine/panel.ts"), /mountSdmTool/);
    assert.match(read("marine/panel.ts"), /mountGapTool/);
    assert.match(read("biodiversity/panel.ts"), /mountPointPatternTool/);
    assert.match(read("biodiversity/panel.ts"), /mountDbscanTool/);
    assert.match(read("marine/panel.ts"), /mountDbscanTool/);
    assert.match(read("environment/panel.ts"), /mountRasterReclassTool/);
  });
});
