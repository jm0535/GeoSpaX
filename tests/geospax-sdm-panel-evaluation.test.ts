// Drives the shared SDM panel tool end to end on a linkedom DOM: enable
// spatially blocked cross-validation, run each model, and check the rendered
// evaluation tables, provenance and run record.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Feature, FeatureCollection, Point } from "geojson";
import { parseHTML } from "linkedom";
import type { GeoLibreAppAPI } from "../packages/plugins/src/types";
import { createPanelShell } from "../packages/geospax-plugins/src/shared/ui";
import { mountSdmTool } from "../packages/geospax-plugins/src/shared/vector-tools";

const presences: Feature<Point>[] = [];
const grid: Feature<Point>[] = [];
let i = 0;
for (let lon = 140; lon < 150; lon += 0.25) {
  for (let lat = -10; lat < -2; lat += 0.25) {
    const temp = lat + 10 + ((i * 37) % 11) / 11;
    const rain = 5 + ((i * 13) % 7) / 7;
    i++;
    const props = { temp, rain };
    grid.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: props,
    });
    if (temp > 6)
      presences.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: props,
      });
  }
}

let restoreDocument: () => void;
before(() => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalCustomEvent = globalThis.CustomEvent;
  const { document, CustomEvent: DomCustomEvent } = parseHTML(
    "<html><body></body></html>"
  );
  // recordRun dispatches a CustomEvent; Node's own cannot be dispatched on linkedom nodes.
  globalThis.CustomEvent = DomCustomEvent as unknown as typeof CustomEvent;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: document,
  });
  // linkedom lacks the HTMLTableElement row/section helpers browsers provide.
  const proto = Object.getPrototypeOf(
    document.createElement("table")
  ) as Record<string, unknown>;
  const append = (parent: Element, tag: string) =>
    parent.appendChild(document.createElement(tag));
  proto.createCaption = function (this: Element) {
    return append(this, "caption");
  };
  proto.createTBody = function (this: Element) {
    const body = append(this, "tbody") as Element & Record<string, unknown>;
    body.insertRow = () => {
      const row = append(body, "tr") as Element & Record<string, unknown>;
      row.insertCell = () => append(row, "td");
      return row;
    };
    return body;
  };
  restoreDocument = () => {
    globalThis.CustomEvent = originalCustomEvent;
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  };
});
after(() => restoreDocument());

function mount() {
  const added: Array<{ name: string; collection: FeatureCollection }> = [];
  const layers = [
    { id: "pres", name: "Presences", type: "geojson" },
    { id: "grid", name: "Prediction grid", type: "geojson" },
  ];
  const app = {
    listLayers: () => layers,
    getLayerFeatures: (id: string) =>
      id === "pres" ? presences : id === "grid" ? grid : [],
    addGeoJsonLayer: (name: string, collection: FeatureCollection) => {
      added.push({ name, collection });
      return `out-${added.length}`;
    },
    onLayersChanged: () => () => undefined,
  } as unknown as GeoLibreAppAPI;
  const container = document.createElement("div");
  const shell = createPanelShell(container, app, {
    id: "test",
    title: "Test",
    eyebrow: "",
    intro: "",
    accent: "#000",
  });
  const section = shell.addSection({
    id: "sdm",
    title: "SDM",
    description: "",
  });
  mountSdmTool(shell, section, "species");
  const selects = [
    ...container.querySelectorAll("select"),
  ] as HTMLSelectElement[];
  const [presenceSelect, predictionSelect, modelSelect, var1, var2] = selects;
  const set = (select: HTMLSelectElement, value: string) => {
    // linkedom exposes select.value as getter-only; select the option instead.
    for (const option of select.querySelectorAll("option"))
      option.removeAttribute("selected");
    select
      .querySelector(`option[value="${value}"]`)
      ?.setAttribute("selected", "");
    const event = document.createEvent("Event");
    event.initEvent("change", true, false);
    select.dispatchEvent(event);
  };
  set(presenceSelect, "pres");
  set(predictionSelect, "grid");
  set(var1, "temp");
  set(var2, "rain");
  const evaluate = [...container.querySelectorAll("input[type=checkbox]")].find(
    (input) => input.parentElement?.textContent?.includes("cross-validation")
  ) as HTMLInputElement;
  evaluate.checked = true;
  const blockInput = [...container.querySelectorAll("label")]
    .find((label) => label.textContent?.includes("CV block size"))
    ?.parentElement?.querySelector("input") as HTMLInputElement;
  blockInput.value = "2";
  const run = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Fit and predict SDM"
  ) as HTMLButtonElement;
  return { container, shell, added, modelSelect, set, run };
}

async function settle() {
  for (let n = 0; n < 5; n++)
    await new Promise((resolve) => setImmediate(resolve));
}

describe("SDM panel spatial cross-validation", () => {
  for (const model of ["bioclim", "mahalanobis", "logistic"]) {
    it(`renders CV metrics and records them in provenance for ${model}`, async () => {
      const { container, shell, added, modelSelect, set, run } = mount();
      set(modelSelect, model);
      run.click();
      await settle();
      const text = container.textContent ?? "";
      assert.doesNotMatch(
        text,
        /Cross-validation needs|could not be configured/
      );
      assert.match(text, /Spatially blocked cross-validation/);
      assert.doesNotMatch(text, /eventPhase/);
      assert.match(text, /ROC AUC \(presence vs background\)/);
      assert.match(text, /Per-fold results/);
      assert.equal(added.length, 1);
      const stamp = added[0].collection.features[0].properties?._geospax;
      const evaluation = stamp.params.evaluation;
      assert.equal(evaluation.k, 5);
      assert.equal(evaluation.blockSizeDeg, 2);
      assert.ok(evaluation.auc.n >= 1);
      assert.ok(
        evaluation.auc.mean > 0.5,
        `${model} AUC ${evaluation.auc.mean}`
      );
      const record = shell.history.at(-1);
      assert.equal(typeof record?.summary?.cvAuc, "number");
    });
  }

  it("leaves results unchanged when evaluation is off", async () => {
    const { container, added, run } = mount();
    const evaluate = [
      ...container.querySelectorAll("input[type=checkbox]"),
    ].find((input) =>
      input.parentElement?.textContent?.includes("cross-validation")
    ) as HTMLInputElement;
    evaluate.checked = false;
    run.click();
    await settle();
    assert.doesNotMatch(
      container.textContent ?? "",
      /Spatially blocked cross-validation/
    );
    assert.equal(
      added[0].collection.features[0].properties?._geospax.params.evaluation,
      undefined
    );
  });
});
