import type { Feature, Geometry } from "geojson";
import {
  fetchGbifOccurrences,
  fetchInatObservations,
  fetchObisOccurrences,
  fetchWormsAphia,
  gbifSearchUrl,
  inatSearchUrl,
  obisSearchUrl,
  wormsAphiaUrl,
  GBIF_META,
  INAT_META,
  OBIS_META,
  WORMS_META,
  GEBCO_META,
  citationString,
  type Citation,
} from "@geospax/data";
import { makeProvenance, richness, shannon, simpson } from "@geospax/analysis";
import {
  addOutputLayer,
  appendNotice,
  button,
  buttonRow,
  checkbox,
  currentBounds,
  el,
  field,
  fieldGrid,
  formatNumber,
  layerPicker,
  numberInput,
  populateFieldSelect,
  renderKeyValueTable,
  resultRegion,
  runRecord,
  selectInput,
  setStatus,
  statusRegion,
  textInput,
  withBusy,
  type PanelShell,
} from "./ui";

export type OccurrenceSource = "gbif" | "obis" | "inat" | "worms";

const SOURCE_META = {
  gbif: GBIF_META,
  obis: OBIS_META,
  inat: INAT_META,
  worms: WORMS_META,
} as const;

export function mountOccurrenceTool(
  shell: PanelShell,
  parent: HTMLElement,
  options: {
    sources?: OccurrenceSource[];
    defaultSource?: OccurrenceSource;
    defaultTaxon?: string;
    title?: string;
    description?: string;
  } = {},
): void {
  const sources = options.sources ?? ["gbif", "obis", "inat", "worms"];
  const card = shell.addTool(parent, {
    id: "occurrence-data",
    title: options.title ?? "Occurrence & taxonomy data",
    description: options.description ?? "Query live biodiversity archives, clip coordinate searches to the current view, and add citation-stamped records to the GeoLibre layer store.",
    method: "Live source APIs. Archive contents change; query URL, access date, source citation and requested limit are preserved in provenance.",
  });
  const source = selectInput(
    sources.map((id) => ({ value: id, label: SOURCE_META[id].label })),
    options.defaultSource ?? sources[0],
  );
  const taxon = textInput(options.defaultTaxon ?? "", "Scientific name");
  const limit = numberInput(100, { min: 1, max: 1000, step: 1 });
  const clip = checkbox("Clip coordinate query to the current map view", true);
  const preview = el("div", "gsp-citation");
  const updatePreview = () => {
    const query = taxon.value.trim();
    const bbox = clip.input.checked ? currentBounds(shell.app) ?? undefined : undefined;
    const n = Math.max(1, Number(limit.value) || 100);
    const id = source.value as OccurrenceSource;
    preview.textContent = id === "gbif"
      ? gbifSearchUrl(query, bbox, n)
      : id === "obis"
        ? obisSearchUrl(query, bbox, n)
        : id === "inat"
          ? inatSearchUrl(query, bbox, n)
          : wormsAphiaUrl(query);
  };
  for (const control of [source, taxon, limit, clip.input]) control.addEventListener("change", updatePreview);
  taxon.addEventListener("input", updatePreview);
  updatePreview();
  card.append(
    fieldGrid(field("Source", source), field("Record limit", limit)),
    field("Scientific name", taxon),
    clip.wrapper,
    preview,
  );
  const run = button("Fetch records");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  let activeController: AbortController | null = null;

  run.addEventListener("click", () => {
    void withBusy(run, status, "Querying live biodiversity archive…", async () => {
      const query = taxon.value.trim();
      if (!query) throw new Error("Enter a scientific name.");
      activeController?.abort();
      activeController = new AbortController();
      const bbox = clip.input.checked ? currentBounds(shell.app) ?? undefined : undefined;
      const requestedLimit = Math.max(1, Number(limit.value) || 100);
      const sourceId = source.value as OccurrenceSource;
      if (sourceId === "worms") {
        const response = await fetchWormsAphia(query, activeController.signal);
        const provenance = makeProvenance("worms-taxonomy-query", "Live WoRMS Aphia name lookup", "Non-spatial taxonomy table", {
          taxon: query,
          url: response.url,
          citation: response.citation,
          recordCount: response.records.length,
        });
        setStatus(status, response.records.length ? "success" : "warning", `WoRMS returned ${response.records.length.toLocaleString()} taxonomy record(s).`);
        renderKeyValueTable(results, [
          ["Source", "World Register of Marine Species"],
          ["Taxon", query],
          ["Records", response.records.length],
          ["Accessed", response.citation.accessedAt],
        ], "Taxonomy query");
        appendNotice(results, citationString(response.citation));
        shell.recordRun(runRecord("worms-taxonomy-query", "WoRMS taxonomy lookup", provenance, [], {
          taxon: query,
          records: response.records.length,
        }));
        return;
      }

      let response: { url: string; citation: Citation; geojson: GeoJSON.FeatureCollection };
      if (sourceId === "gbif") {
        response = await fetchGbifOccurrences({ taxon: query, bbox, limit: requestedLimit, signal: activeController.signal });
      } else if (sourceId === "obis") {
        response = await fetchObisOccurrences({ taxon: query, bbox, limit: requestedLimit, signal: activeController.signal });
      } else {
        response = await fetchInatObservations({ taxon: query, bbox, limit: requestedLimit, signal: activeController.signal });
      }
      const provenance = makeProvenance(
        `${sourceId}-occurrence-query`,
        `Live ${SOURCE_META[sourceId].label} API query`,
        "EPSG:4326 occurrence coordinates supplied by source archive",
        {
          taxon: query,
          bbox: bbox ?? null,
          requestedLimit,
          url: response.url,
          citation: response.citation,
          recordCount: response.geojson.features.length,
        },
      );
      const features = response.geojson.features as Feature<Geometry | null>[];
      const outputIds: string[] = [];
      if (features.length) {
        outputIds.push(addOutputLayer(shell, `${SOURCE_META[sourceId].label}: ${query}`, features, provenance));
      }
      setStatus(
        status,
        features.length ? "success" : "warning",
        features.length
          ? `Added ${features.length.toLocaleString()} occurrence record(s) to the layer store.`
          : "The live query returned no georeferenced records.",
      );
      renderKeyValueTable(results, [
        ["Source", SOURCE_META[sourceId].label],
        ["Taxon", query],
        ["Georeferenced records", features.length],
        ["View clipped", bbox ? "Yes" : "No"],
        ["Accessed", response.citation.accessedAt],
      ], "Live occurrence query");
      appendNotice(results, citationString(response.citation));
      appendNotice(results, "Live archives update continuously. Cite the preserved access date and query URL in any publication.", "warning");
      shell.recordRun(runRecord(`${sourceId}-occurrence-query`, `${SOURCE_META[sourceId].label} query`, provenance, outputIds, {
        taxon: query,
        records: features.length,
        clippedToView: Boolean(bbox),
      }));
    });
  });
}

function propertyFields(features: Feature<Geometry | null>[]): string[] {
  const fields = new Set<string>();
  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties ?? {})) {
      if ((typeof value === "string" || typeof value === "number") && !key.startsWith("_")) fields.add(key);
    }
  }
  return [...fields].sort((a, b) => a.localeCompare(b));
}

export function mountDiversityTool(shell: PanelShell, parent: HTMLElement, subject = "species"): void {
  const card = shell.addTool(parent, {
    id: "diversity-indices",
    title: "Richness & diversity",
    description: `Count ${subject} values in one occurrence layer and calculate richness, Shannon H′, Simpson 1−D and evenness.`,
    method: "Frequency distribution of a selected taxon/category field. Null/blank values are excluded and reported; indices are not area-standardised.",
  });
  const source = layerPicker(shell, { kind: "vector", placeholder: "— occurrence / sample layer —" });
  const speciesField = selectInput([]);
  const refresh = () => {
    const fields = propertyFields(source.features());
    const preferred = fields.find((name) => /scientific.?name|species|taxon/i.test(name));
    populateFieldSelect(speciesField, fields, speciesField.value || preferred, "— taxon/category field —");
  };
  source.select.addEventListener("change", refresh);
  shell.onLayersChanged(refresh);
  refresh();
  card.append(fieldGrid(field("Occurrence layer", source.select), field("Species / category field", speciesField)));
  const run = button("Compute diversity indices");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  run.addEventListener("click", () => {
    void withBusy(run, status, "Counting taxa and calculating diversity…", () => {
      if (!source.select.value || !speciesField.value) throw new Error("Select an input layer and taxon/category field.");
      const features = source.features();
      const values = features
        .map((feature) => feature.properties?.[speciesField.value])
        .filter((value): value is string | number => value !== null && value !== undefined && String(value).trim() !== "")
        .map(String);
      if (!values.length) throw new Error("The selected field has no non-blank values.");
      const frequencies = new Map<string, number>();
      for (const value of values) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
      const counts = [...frequencies.values()];
      const richnessValue = richness([values]);
      const shannonValue = shannon(counts);
      const simpsonValue = simpson(counts);
      const evenness = shannonValue !== null && richnessValue > 1 ? shannonValue / Math.log(richnessValue) : null;
      const provenance = makeProvenance(
        "biodiversity-indices",
        "Taxon frequency richness, Shannon H′ and Simpson 1−D",
        "Non-spatial attribute summary",
        {
          layer: source.select.value,
          field: speciesField.value,
          recordsUsed: values.length,
          blankRecordsExcluded: features.length - values.length,
          taxa: richnessValue,
        },
      );
      setStatus(status, "success", `Calculated diversity across ${values.length.toLocaleString()} classified record(s).`);
      renderKeyValueTable(results, [
        ["Classified records", values.length],
        ["Blank values excluded", features.length - values.length],
        ["Richness (S)", richnessValue],
        ["Shannon H′", formatNumber(shannonValue, 4)],
        ["Simpson 1−D", formatNumber(simpsonValue, 4)],
        ["Pielou evenness J′", formatNumber(evenness, 4)],
      ], "Diversity indices");
      if (richnessValue < 2) appendNotice(results, "Shannon/Simpson require more than one represented category for meaningful diversity.", "warning");
      shell.recordRun(runRecord("biodiversity-indices", "Richness & diversity", provenance, [], {
        records: values.length,
        richness: richnessValue,
        shannon: shannonValue,
        simpson: simpsonValue,
        evenness,
      }));
    });
  });
}

export function mountGebcoTool(shell: PanelShell, parent: HTMLElement): void {
  const card = shell.addTool(parent, {
    id: "gebco",
    title: "GEBCO bathymetry preview",
    description: "Add the GEBCO global gridded-bathymetry XYZ preview as a first-class GeoLibre tile layer.",
    method: "Rendered XYZ catalogue layer for visual context. It is not a numeric raster-window analysis source unless the host can sample that service.",
  });
  const citation = el("div", "gsp-citation", citationString(GEBCO_META.citation));
  const add = button("Add GEBCO preview layer");
  const status = statusRegion();
  const results = resultRegion();
  card.append(citation, buttonRow(add), status, results);
  add.addEventListener("click", () => {
    void withBusy(add, status, "Adding GEBCO tile layer…", () => {
      if (!shell.app.addTileLayer) throw new Error("This GeoLibre host does not expose addTileLayer.");
      const url = "https://tiles.gebco.net/gebco/{z}/{x}/{y}.png";
      const outputId = shell.app.addTileLayer("GEBCO bathymetry (preview)", url, {
        tileSize: 256,
        attribution: "GEBCO Compilation Group (2024)",
        opacity: 0.8,
      });
      const provenance = makeProvenance("gebco-preview", "GEBCO rendered XYZ catalogue layer", "Service-defined Web Mercator tiles", {
        url,
        citation: GEBCO_META.citation,
        analyticUse: false,
      });
      setStatus(status, "success", "Added GEBCO bathymetry preview to the layer store.");
      renderKeyValueTable(results, [
        ["Layer", "GEBCO bathymetry (preview)"],
        ["Type", "Rendered XYZ tiles"],
        ["Analytic pixel values", "Not provided by this preview"],
        ["Accessed", GEBCO_META.citation.accessedAt],
      ], "GEBCO layer");
      shell.recordRun(runRecord("gebco-preview", "GEBCO bathymetry preview", provenance, [outputId], {
        analyticUse: false,
      }));
    });
  });
}
