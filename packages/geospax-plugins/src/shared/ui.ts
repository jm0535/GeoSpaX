import type {
  GeoLibreAppAPI,
  GeoLibreLayerSummary,
  GeoLibreRasterWindowReading,
} from "@geolibre/plugins";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { ProvenanceStamp } from "@geospax/analysis";

let nextControlId = 0;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function controlId(prefix = "control"): string {
  nextControlId++;
  return `gsp-${prefix}-${nextControlId}`;
}

export interface AnalysisRunRecord {
  tool: string;
  title: string;
  method: string;
  runAt: string;
  outputLayerIds: string[];
  summary: Record<string, string | number | boolean | null>;
  provenance?: ProvenanceStamp;
}

export interface PanelShellOptions {
  id: string;
  title: string;
  eyebrow: string;
  intro: string;
  accent: string;
}

export interface SectionOptions {
  id: string;
  title: string;
  description?: string;
  badge?: string;
  open?: boolean;
}

export interface ToolOptions {
  id?: string;
  title: string;
  description: string;
  method?: string;
}

export interface PanelShell {
  app: GeoLibreAppAPI;
  root: HTMLElement;
  sections: HTMLElement;
  history: AnalysisRunRecord[];
  t: (key: string, fallback: string) => string;
  addSection: (options: SectionOptions) => HTMLElement;
  addTool: (parent: HTMLElement, options: ToolOptions) => HTMLElement;
  onLayersChanged: (callback: () => void) => () => void;
  recordRun: (run: AnalysisRunRecord) => void;
  destroy: () => void;
}

/**
 * Shared plain-DOM workbench used by all six drop-ins. It mirrors GeoLibre's
 * host tokens, provides horizontal section navigation plus native accessible
 * disclosure panels, and owns one layer-change subscription for all pickers.
 */
export function createPanelShell(
  container: HTMLElement,
  app: GeoLibreAppAPI,
  options: PanelShellOptions,
): PanelShell {
  container.innerHTML = "";
  const t = (key: string, fallback: string) => app.translate?.(key, fallback) ?? fallback;
  const root = el("div", "gsp-shell");
  root.dataset.plugin = options.id;
  root.style.setProperty("--gsp-accent", options.accent);

  const header = el("header", "gsp-shell__header");
  const eyebrow = el("div", "gsp-shell__eyebrow", options.eyebrow);
  const title = el("h2", "gsp-shell__title", options.title);
  const intro = el("p", "gsp-shell__intro", options.intro);
  header.append(eyebrow, title, intro);

  const nav = el("nav", "gsp-shell__nav");
  nav.setAttribute("aria-label", `${options.title} analyses`);
  const sections = el("div", "gsp-shell__sections");
  root.append(header, nav, sections);
  container.appendChild(root);

  const layerCallbacks = new Set<() => void>();
  const runCallbacks = new Set<() => void>();
  const history: AnalysisRunRecord[] = [];
  const unsubscribeLayers = app.onLayersChanged?.(() => {
    for (const callback of layerCallbacks) callback();
  });
  const unsubscribeLocale = app.onLocaleChange?.(() => {
    // Titles registered with the host are reactive. Panel body translations
    // are refreshed on the next open; dispatch gives mounted custom tools a
    // chance to update immediately without retaining stale app listeners.
    root.dispatchEvent(new CustomEvent("gsp:locale"));
  });

  const shell: PanelShell = {
    app,
    root,
    sections,
    history,
    t,
    addSection(sectionOptions) {
      const details = el("details", "gsp-section") as HTMLDetailsElement;
      const sectionId = `${options.id}-${sectionOptions.id}`;
      details.id = sectionId;
      details.dataset.section = sectionOptions.id;
      details.open = sectionOptions.open ?? sections.childElementCount === 0;
      const summary = el("summary", "gsp-section__summary");
      const summaryText = el("span", "gsp-section__summary-text");
      const index = el("span", "gsp-section__index", String(sections.childElementCount + 1).padStart(2, "0"));
      const label = el("span", "gsp-section__label", sectionOptions.title);
      summaryText.append(index, label);
      summary.appendChild(summaryText);
      if (sectionOptions.badge) summary.appendChild(el("span", "gsp-section__badge", sectionOptions.badge));
      const body = el("div", "gsp-section__body");
      if (sectionOptions.description) {
        body.appendChild(el("p", "gsp-section__description", sectionOptions.description));
      }
      details.append(summary, body);
      sections.appendChild(details);

      const navButton = el("button", "gsp-shell__nav-button", sectionOptions.title);
      navButton.type = "button";
      navButton.setAttribute("aria-controls", sectionId);
      navButton.addEventListener("click", () => {
        details.open = true;
        details.scrollIntoView({ block: "start", behavior: "smooth" });
        details.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
      });
      nav.appendChild(navButton);
      return body;
    },
    addTool(parent, toolOptions) {
      const card = el("section", "gsp-tool");
      if (toolOptions.id) card.dataset.tool = toolOptions.id;
      const heading = el("h3", "gsp-tool__title", toolOptions.title);
      const description = el("p", "gsp-tool__description", toolOptions.description);
      card.append(heading, description);
      if (toolOptions.method) {
        const method = el("div", "gsp-method");
        method.append(el("span", "gsp-method__label", "Method"), document.createTextNode(toolOptions.method));
        card.appendChild(method);
      }
      parent.appendChild(card);
      return card;
    },
    onLayersChanged(callback) {
      layerCallbacks.add(callback);
      return () => layerCallbacks.delete(callback);
    },
    recordRun(run) {
      history.unshift(run);
      for (const callback of runCallbacks) callback();
      root.dispatchEvent(new CustomEvent("gsp:run", { detail: run }));
    },
    destroy() {
      unsubscribeLayers?.();
      unsubscribeLocale?.();
      layerCallbacks.clear();
      runCallbacks.clear();
      container.innerHTML = "";
    },
  };

  // Provenance tools can subscribe without expanding the public API shape.
  Object.defineProperty(shell, "_onRunsChanged", {
    value: (callback: () => void) => {
      runCallbacks.add(callback);
      return () => runCallbacks.delete(callback);
    },
    enumerable: false,
  });

  return shell;
}

export function field(
  labelText: string,
  control: HTMLElement,
  hint?: string,
): HTMLDivElement {
  const wrapper = el("div", "gsp-field");
  const id = control.id || controlId("field");
  control.id = id;
  const label = el("label", "gsp-field__label", labelText);
  label.htmlFor = id;
  wrapper.append(label, control);
  if (hint) {
    const hintNode = el("div", "gsp-field__hint", hint);
    hintNode.id = `${id}-hint`;
    control.setAttribute("aria-describedby", hintNode.id);
    wrapper.appendChild(hintNode);
  }
  return wrapper;
}

export function fieldGrid(...children: HTMLElement[]): HTMLDivElement {
  const grid = el("div", "gsp-field-grid");
  grid.append(...children);
  return grid;
}

export function textInput(value = "", placeholder = ""): HTMLInputElement {
  const input = el("input", "gsp-input") as HTMLInputElement;
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

export function numberInput(
  value: number,
  options: { min?: number; max?: number; step?: number } = {},
): HTMLInputElement {
  const input = el("input", "gsp-input") as HTMLInputElement;
  input.type = "number";
  input.value = String(value);
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  if (options.step !== undefined) input.step = String(options.step);
  return input;
}

export function selectInput(
  options: Array<{ value: string; label: string }>,
  selected?: string,
): HTMLSelectElement {
  const select = el("select", "gsp-select") as HTMLSelectElement;
  for (const item of options) {
    const option = el("option", undefined, item.label);
    option.value = item.value;
    option.selected = selected === item.value;
    select.appendChild(option);
  }
  return select;
}

export function checkbox(labelText: string, checked = false): { wrapper: HTMLLabelElement; input: HTMLInputElement } {
  const wrapper = el("label", "gsp-check") as HTMLLabelElement;
  const input = el("input") as HTMLInputElement;
  input.type = "checkbox";
  input.checked = checked;
  wrapper.append(input, el("span", undefined, labelText));
  return { wrapper, input };
}

export type ButtonTone = "primary" | "secondary" | "danger";

export function button(label: string, tone: ButtonTone = "primary"): HTMLButtonElement {
  const control = el("button", `gsp-button gsp-button--${tone}`, label) as HTMLButtonElement;
  control.type = "button";
  return control;
}

export function buttonRow(...buttons: HTMLElement[]): HTMLDivElement {
  const row = el("div", "gsp-actions");
  row.append(...buttons);
  return row;
}

export type StatusTone = "idle" | "busy" | "success" | "warning" | "error";

export function statusRegion(initial = "Ready."): HTMLDivElement {
  const region = el("div", "gsp-status", initial);
  region.dataset.tone = "idle";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  return region;
}

export function setStatus(region: HTMLElement, tone: StatusTone, message: string): void {
  region.dataset.tone = tone;
  region.textContent = message;
}

export async function withBusy<T>(
  trigger: HTMLButtonElement,
  status: HTMLElement,
  message: string,
  run: () => T | Promise<T>,
): Promise<T | null> {
  if (trigger.disabled) return null;
  trigger.disabled = true;
  trigger.setAttribute("aria-busy", "true");
  setStatus(status, "busy", message);
  try {
    return await run();
  } catch (error) {
    setStatus(status, "error", error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    trigger.disabled = false;
    trigger.removeAttribute("aria-busy");
  }
}

export function resultRegion(emptyMessage = "Run this analysis to see results."): HTMLDivElement {
  const region = el("div", "gsp-results");
  region.appendChild(emptyState(emptyMessage));
  return region;
}

export function emptyState(message: string): HTMLDivElement {
  return el("div", "gsp-empty", message);
}

export function renderKeyValueTable(
  region: HTMLElement,
  rows: Array<[string, string | number]>,
  caption?: string,
): void {
  region.innerHTML = "";
  const table = el("table", "gsp-table") as HTMLTableElement;
  if (caption) {
    const captionNode = table.createCaption();
    captionNode.textContent = caption;
  }
  const body = table.createTBody();
  for (const [label, value] of rows) {
    const row = body.insertRow();
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = label;
    const cell = row.insertCell();
    cell.textContent = String(value);
    row.append(heading, cell);
  }
  region.appendChild(table);
}

export function appendNotice(
  region: HTMLElement,
  message: string,
  tone: "info" | "warning" | "error" = "info",
): HTMLDivElement {
  const notice = el("div", "gsp-notice", message);
  notice.dataset.tone = tone;
  region.appendChild(notice);
  return notice;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export type LayerKind = "any" | "vector" | "raster" | "point" | "polygon";

function looksRaster(layer: GeoLibreLayerSummary): boolean {
  const type = layer.type.toLowerCase();
  return ["raster", "cog", "geotiff", "tile", "wmts", "wms", "zarr"].some((token) =>
    type.includes(token),
  );
}

export function listLayers(app: GeoLibreAppAPI, kind: LayerKind = "any"): GeoLibreLayerSummary[] {
  const layers = app.listLayers?.() ?? [];
  if (kind === "any") return layers;
  if (kind === "raster") return layers.filter(looksRaster);
  if (kind === "vector") return layers.filter((layer) => !looksRaster(layer));
  return layers.filter((layer) => {
    if (looksRaster(layer)) return false;
    const features = app.getLayerFeatures?.(layer.id) ?? [];
    if (kind === "point") return features.some((feature) => feature.geometry?.type === "Point");
    return features.some(
      (feature) => feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon",
    );
  });
}

export interface LayerPicker {
  select: HTMLSelectElement;
  refresh: () => void;
  layer: () => GeoLibreLayerSummary | null;
  features: () => Feature<Geometry | null>[];
  destroy: () => void;
}

export function layerPicker(
  shell: PanelShell,
  options: {
    kind?: LayerKind;
    placeholder?: string;
    selectedName?: string | null;
    includeNone?: boolean;
    noneLabel?: string;
  } = {},
): LayerPicker {
  const select = el("select", "gsp-select") as HTMLSelectElement;
  let preferredName = options.selectedName ?? null;
  const refresh = () => {
    const previousId = select.value;
    const previousName = shell.app.listLayers?.().find((layer) => layer.id === previousId)?.name ?? preferredName;
    select.innerHTML = "";
    const placeholder = el("option", undefined, options.placeholder ?? "— select layer —");
    placeholder.value = "";
    select.appendChild(placeholder);
    if (options.includeNone) {
      const none = el("option", undefined, options.noneLabel ?? "None");
      none.value = "__none__";
      select.appendChild(none);
    }
    for (const layer of listLayers(shell.app, options.kind ?? "any")) {
      const option = el("option", undefined, layer.name);
      option.value = layer.id;
      if (layer.id === previousId || (!previousId && previousName && layer.name === previousName)) {
        option.selected = true;
      }
      select.appendChild(option);
    }
  };
  refresh();
  const unregister = shell.onLayersChanged(refresh);
  select.addEventListener("change", () => {
    preferredName = shell.app.listLayers?.().find((layer) => layer.id === select.value)?.name ?? null;
  });
  return {
    select,
    refresh,
    layer: () => shell.app.listLayers?.().find((layer) => layer.id === select.value) ?? null,
    // The host treats an empty id as an invalid query rather than an empty
    // selection. Several tools inspect fields while mounting, before a user
    // has selected a layer, so never forward placeholder sentinel values.
    features: () =>
      !select.value || select.value === "__none__"
        ? []
        : shell.app.getLayerFeatures?.(select.value) ?? [],
    destroy: unregister,
  };
}

export function numericFields(features: Feature<Geometry | null>[]): string[] {
  const fields = new Set<string>();
  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties ?? {})) {
      if (typeof value === "number" && Number.isFinite(value) && !key.startsWith("_")) fields.add(key);
    }
  }
  return [...fields].sort((a, b) => a.localeCompare(b));
}

export function populateFieldSelect(
  select: HTMLSelectElement,
  fields: string[],
  selected?: string | null,
  placeholder = "— select numeric field —",
): void {
  const previous = selected ?? select.value;
  select.innerHTML = "";
  const empty = el("option", undefined, placeholder);
  empty.value = "";
  select.appendChild(empty);
  for (const fieldName of fields) {
    const option = el("option", undefined, fieldName);
    option.value = fieldName;
    option.selected = fieldName === previous;
    select.appendChild(option);
  }
}

export function stampFeatures(
  features: Feature<Geometry | null>[],
  provenance: ProvenanceStamp,
): FeatureCollection<Geometry | null> {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      id: feature.id,
      bbox: feature.bbox,
      geometry: feature.geometry,
      properties: { ...(feature.properties ?? {}), _geospax: provenance },
    })),
  };
}

export function addOutputLayer(
  shell: PanelShell,
  name: string,
  features: Feature<Geometry | null>[],
  provenance?: ProvenanceStamp,
): string {
  const collection: FeatureCollection<Geometry | null> = provenance
    ? stampFeatures(features, provenance)
    : { type: "FeatureCollection", features };
  return shell.app.addGeoJsonLayer(name, collection as FeatureCollection);
}

export function currentBounds(app: GeoLibreAppAPI): [number, number, number, number] | null {
  const bounds = app.getViewBounds?.() ?? null;
  if (!bounds || !bounds.every(Number.isFinite)) return null;
  return bounds;
}

/** Pick a view-dependent sampling grid with approximately square ground pixels. */
export function chooseRasterGrid(
  bounds: [number, number, number, number],
  targetWidth = 256,
): { width: number; height: number } {
  const [west, south, eastRaw, north] = bounds;
  const east = eastRaw < west ? eastRaw + 360 : eastRaw;
  const centreLat = (south + north) / 2;
  const widthScale = Math.max(1e-6, Math.abs(east - west) * Math.cos((centreLat * Math.PI) / 180));
  const heightScale = Math.max(1e-6, Math.abs(north - south));
  return {
    width: targetWidth,
    height: Math.max(64, Math.min(512, Math.round(targetWidth * heightScale / widthScale))),
  };
}

export interface SampledRasterWindow {
  bounds: [number, number, number, number];
  reading: GeoLibreRasterWindowReading;
}

export async function readCurrentRasterWindow(
  app: GeoLibreAppAPI,
  layerId: string,
  band: number,
  width = 256,
): Promise<SampledRasterWindow> {
  if (!app.readRasterWindow) throw new Error("This GeoLibre host does not expose raster-window reads.");
  const bounds = currentBounds(app);
  if (!bounds) throw new Error("The current map view has no finite raster sampling extent.");
  const grid = chooseRasterGrid(bounds, width);
  const reading = await app.readRasterWindow(layerId, {
    bounds,
    width: grid.width,
    height: grid.height,
    band,
  });
  if (!reading) throw new Error("The selected layer could not be read as a raster in the current view.");
  return { bounds, reading };
}

export function parseFinite(input: HTMLInputElement, label: string): number {
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return value;
}

export function parsePositive(input: HTMLInputElement, label: string): number {
  const value = parseFinite(input, label);
  if (value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

export function runRecord(
  tool: string,
  title: string,
  provenance: ProvenanceStamp,
  outputLayerIds: string[],
  summary: Record<string, string | number | boolean | null>,
): AnalysisRunRecord {
  return {
    tool,
    title,
    method: provenance.method,
    runAt: provenance.runAt,
    outputLayerIds,
    summary,
    provenance,
  };
}
