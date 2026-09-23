// Conservation Planning right-panel UI (vanilla DOM, scoped .gsp-cons-* CSS).
//
// Increment 1: protection gap analysis. Two layer pickers, an area-method
// selector (equal-area default - hectares first-class), a run button, and a
// result table that declares the method that actually ran plus a closure
// check. Results go back to the map through the store (addGeoJsonLayer), so
// they appear in the Layers panel, style like any layer, and persist with the
// project - no direct MapLibre mutation (GeoLibre's one-way data rule).

import type { GeoLibreAppAPI } from "@geolibre/plugins";
import {
  PROVENANCE_KEY,
  formatArea,
  protectionGap,
  type AreaMethod,
  type ProtectionGapResult,
} from "@geospax/analysis";
import type { Feature, Geometry } from "geojson";

export interface ConservationPanelState {
  habitatLayerName?: string | null;
  paLayerName?: string | null;
  areaMode?: AreaMethod;
}

const state: ConservationPanelState = { areaMode: "equalarea" };

export function getPanelState(): ConservationPanelState {
  return { ...state };
}

export function applyPanelState(next: ConservationPanelState): void {
  if (typeof next.habitatLayerName === "string") state.habitatLayerName = next.habitatLayerName;
  if (typeof next.paLayerName === "string") state.paLayerName = next.paLayerName;
  if (next.areaMode === "equalarea" || next.areaMode === "spherical") state.areaMode = next.areaMode;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function tr(table: HTMLTableElement, cells: string[], header = false): void {
  const row = table.insertRow();
  for (const c of cells) {
    const cell = row.insertCell();
    cell.textContent = c;
    if (header) cell.style.fontWeight = "600";
  }
}

export function mountConservationPanel(container: HTMLElement, app: GeoLibreAppAPI): () => void {
  container.innerHTML = "";
  const t = (key: string, fallback: string) => app.translate?.(key, fallback) ?? fallback;

  const root = el("div", "gsp-cons-root");

  const intro = el(
    "p",
    "gsp-cons-intro",
    t(
      "geospax.conservation.intro",
      "Quantify how much habitat falls inside protected areas - and how much does not. Areas are reported in hectares under an equal-area projection by default, and every result declares the method that ran.",
    ),
  );
  root.appendChild(intro);

  // --- Layer pickers -------------------------------------------------------
  const habitatSelect = el("select", "gsp-cons-select") as HTMLSelectElement;
  const paSelect = el("select", "gsp-cons-select") as HTMLSelectElement;

  const habitatRow = el("div", "gsp-cons-row");
  habitatRow.appendChild(el("label", "gsp-cons-label", t("geospax.conservation.habitat", "Habitat / range layer")));
  habitatRow.appendChild(habitatSelect);

  const paRow = el("div", "gsp-cons-row");
  paRow.appendChild(el("label", "gsp-cons-label", t("geospax.conservation.pa", "Protected-area layer")));
  paRow.appendChild(paSelect);

  root.appendChild(habitatRow);
  root.appendChild(paRow);

  function layerNameById(id: string): string | null {
    return app.listLayers?.().find((l) => l.id === id)?.name ?? null;
  }

  function refreshLayers(): void {
    const layers = app.listLayers?.() ?? [];
    const prevHabitat = habitatSelect.value ? layerNameById(habitatSelect.value) : state.habitatLayerName;
    const prevPa = paSelect.value ? layerNameById(paSelect.value) : state.paLayerName;
    for (const [select, placeholder, selectedName] of [
      [habitatSelect, t("geospax.conservation.pickHabitat", "- select habitat layer -"), prevHabitat],
      [paSelect, t("geospax.conservation.pickPa", "- select protected-area layer -"), prevPa],
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

  // --- Area method ---------------------------------------------------------
  const areaMode = el("select", "gsp-cons-select") as HTMLSelectElement;
  const eqOpt = el("option", undefined, t("geospax.conservation.equalArea", "Equal-area (LAEA, data-centred)"));
  eqOpt.value = "equalarea";
  const sphOpt = el("option", undefined, t("geospax.conservation.spherical", "Spherical (WGS84)"));
  sphOpt.value = "spherical";
  areaMode.append(eqOpt, sphOpt);
  areaMode.value = state.areaMode ?? "equalarea";

  const modeRow = el("div", "gsp-cons-row");
  modeRow.appendChild(el("label", "gsp-cons-label", t("geospax.conservation.areaMethod", "Area method")));
  modeRow.appendChild(areaMode);
  root.appendChild(modeRow);

  // --- Run -----------------------------------------------------------------
  const runButton = el("button", "gsp-cons-run", t("geospax.conservation.run", "Run protection gap analysis"));
  runButton.type = "button";
  root.appendChild(runButton);

  const status = el("div", "gsp-cons-status");
  root.appendChild(status);

  const results = el("div", "gsp-cons-results");
  root.appendChild(results);

  function renderResult(result: ProtectionGapResult): void {
    results.innerHTML = "";

    const table = el("table", "gsp-cons-table") as HTMLTableElement;
    tr(table, [t("geospax.conservation.quantity", "Quantity"), t("geospax.conservation.area", "Area"), "%"], true);
    const total = formatArea(result.totalAreaM2, "ha");
    const prot = formatArea(result.protectedAreaM2, "ha");
    const gap = formatArea(result.gapAreaM2, "ha");
    tr(table, [t("geospax.conservation.totalHabitat", "Total habitat"), total.display, "100"]);
    tr(table, [
      t("geospax.conservation.protectedPart", "Protected"),
      prot.display,
      result.protectedPct.toFixed(1),
    ]);
    tr(table, [t("geospax.conservation.gapPart", "Protection gap"), gap.display, result.gapPct.toFixed(1)]);
    results.appendChild(table);

    // The method that actually ran - never silent (v1 audit rule).
    const method = el(
      "div",
      "gsp-cons-method",
      `${t("geospax.conservation.method", "Method")}: ${result.measurement.total.method || "-"} · ${result.measurement.total.crs}`,
    );
    results.appendChild(method);

    const closureOk = result.residualPct < 1;
    const closure = el(
      "div",
      closureOk ? "gsp-cons-closure gsp-cons-ok" : "gsp-cons-closure gsp-cons-warn",
      `${t("geospax.conservation.closure", "Closure check")}: ${result.residualPct.toFixed(2)}% residual${closureOk ? "" : " - geometry may be invalid"}`,
    );
    results.appendChild(closure);

    if (result.paCount > 0) {
      const paLine = el(
        "div",
        "gsp-cons-pas",
        `${t("geospax.conservation.pasInvolved", "Protected areas involved")} (${result.paCount}): ${result.paNames.join(", ")}`,
      );
      results.appendChild(paLine);
    }
    if (result.skipped.habitat || result.skipped.pa) {
      results.appendChild(
        el(
          "div",
          "gsp-cons-warn",
          t("geospax.conservation.skipped", "Non-polygonal features skipped:") +
            ` habitat ${result.skipped.habitat}, PA ${result.skipped.pa}`,
        ),
      );
    }
  }

  async function run(): Promise<void> {
    status.className = "gsp-cons-status";
    results.innerHTML = "";
    const habitatId = habitatSelect.value;
    const paId = paSelect.value;
    if (!habitatId || !paId) {
      status.className = "gsp-cons-status gsp-cons-warn";
      status.textContent = t("geospax.conservation.needTwo", "Select two different layers.");
      return;
    }
    if (habitatId === paId) {
      status.className = "gsp-cons-status gsp-cons-warn";
      status.textContent = t("geospax.conservation.different", "Select two different layers.");
      return;
    }
    const habitatName = layerNameById(habitatId) ?? habitatId;
    const paName = layerNameById(paId) ?? paId;
    state.habitatLayerName = habitatName;
    state.paLayerName = paName;
    state.areaMode = areaMode.value as AreaMethod;

    status.textContent = t("geospax.conservation.running", "Running protection gap analysis…");
    // Yield so the status paints before the (synchronous) geometry work.
    await new Promise((r) => setTimeout(r, 0));

    let habitat: Feature<Geometry | null>[];
    let pas: Feature<Geometry | null>[];
    try {
      habitat = app.getLayerFeatures?.(habitatId) ?? [];
      pas = app.getLayerFeatures?.(paId) ?? [];
    } catch (err) {
      status.className = "gsp-cons-status gsp-cons-warn";
      status.textContent = `${t("geospax.conservation.readError", "Could not read layer features.")} (${String(err)})`;
      return;
    }

    const result = protectionGap(habitat, pas, {
      areaMode: state.areaMode,
      habitatLayerName: habitatName,
      paLayerName: paName,
    });

    if (!result.ok) {
      status.className = "gsp-cons-status gsp-cons-warn";
      status.textContent = result.error;
      return;
    }

    status.textContent = t("geospax.conservation.done", "Analysis complete - results added to the map.");
    renderResult(result);

    // Results into the store (never direct map mutation): they join the
    // Layers panel, styling, exports and project persistence like any layer.
    const stamp = result.provenance;
    if (result.protectedGeom) {
      const protHa = formatArea(result.protectedAreaM2, "ha");
      app.addGeoJsonLayer(`Protected habitat (${paName})`, {
        type: "FeatureCollection",
        features: [
          {
            ...result.protectedGeom,
            properties: {
              ...(result.protectedGeom.properties ?? {}),
              area_ha: protHa.value,
              method: result.measurement.protected.method,
              crs: result.measurement.protected.crs,
              [PROVENANCE_KEY]: stamp,
            },
          },
        ],
      });
    }
    if (result.gapGeom) {
      const gapHa = formatArea(result.gapAreaM2, "ha");
      app.addGeoJsonLayer(`Protection gap (${habitatName})`, {
        type: "FeatureCollection",
        features: [
          {
            ...result.gapGeom,
            properties: {
              ...(result.gapGeom.properties ?? {}),
              area_ha: gapHa.value,
              method: result.measurement.gap.method,
              crs: result.measurement.gap.crs,
              [PROVENANCE_KEY]: stamp,
            },
          },
        ],
      });
    }
  }

  runButton.addEventListener("click", () => void run());
  const refreshHandler = () => refreshLayers();
  document.addEventListener("geospax-conservation:refresh", refreshHandler);

  refreshLayers();
  container.appendChild(root);

  return () => {
    document.removeEventListener("geospax-conservation:refresh", refreshHandler);
    container.innerHTML = "";
  };
}
