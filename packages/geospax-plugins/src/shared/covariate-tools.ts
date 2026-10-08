import type { Feature, Point } from "geojson";
import {
  covariateGridFor,
  sampleCovariates,
  MAX_COVARIATE_GRID_SIDE,
  type CovariateRaster,
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
  layerPicker,
  listLayers,
  numberInput,
  parseFinite,
  parsePositive,
  renderKeyValueTable,
  resultRegion,
  runRecord,
  setStatus,
  statusRegion,
  textInput,
  withBusy,
  type PanelShell,
} from "./ui";

/** CHELSA v2.1 bioclimatic variables, 1981–2010, 30 arc-second COGs. */
export const CHELSA_BIOCLIM = [
  { id: "bio1", label: "BIO1 Annual mean temperature" },
  { id: "bio2", label: "BIO2 Mean diurnal range" },
  { id: "bio3", label: "BIO3 Isothermality" },
  { id: "bio4", label: "BIO4 Temperature seasonality" },
  { id: "bio5", label: "BIO5 Max temperature of warmest month" },
  { id: "bio6", label: "BIO6 Min temperature of coldest month" },
  { id: "bio7", label: "BIO7 Temperature annual range" },
  { id: "bio8", label: "BIO8 Mean temperature of wettest quarter" },
  { id: "bio9", label: "BIO9 Mean temperature of driest quarter" },
  { id: "bio10", label: "BIO10 Mean temperature of warmest quarter" },
  { id: "bio11", label: "BIO11 Mean temperature of coldest quarter" },
  { id: "bio12", label: "BIO12 Annual precipitation" },
  { id: "bio13", label: "BIO13 Precipitation of wettest month" },
  { id: "bio14", label: "BIO14 Precipitation of driest month" },
  { id: "bio15", label: "BIO15 Precipitation seasonality" },
  { id: "bio16", label: "BIO16 Precipitation of wettest quarter" },
  { id: "bio17", label: "BIO17 Precipitation of driest quarter" },
  { id: "bio18", label: "BIO18 Precipitation of warmest quarter" },
  { id: "bio19", label: "BIO19 Precipitation of coldest quarter" },
] as const;

const CHELSA_DIRECT = "https://os.zhdk.cloud.switch.ch/chelsav2";
/** Same-origin rewrite on the web deployment (see apps/geolibre-desktop/vercel.json). */
const CHELSA_PROXY_PATH = "/chelsa";
const DEFAULT_BIOCLIM = new Set(["bio1", "bio4", "bio12", "bio15"]);

export function chelsaUrl(base: string, variable: string): string {
  return `${base.replace(
    /\/+$/,
    ""
  )}/GLOBAL/climatologies/1981-2010/bio/CHELSA_${variable}_1981-2010_V.2.1.tif`;
}

function defaultChelsaBase(): string {
  const location = globalThis.location;
  const isWebDeploy =
    location?.protocol === "https:" &&
    !/^(localhost|127\.|tauri\.)/.test(location.hostname);
  return isWebDeploy ? `${location.origin}${CHELSA_PROXY_PATH}` : CHELSA_DIRECT;
}

/** Suggest an attribute name from a raster layer name ("CHELSA bio12" → "bio12"). */
export function suggestFieldName(layerName: string): string {
  const bio = /bio_?(\d{1,2})\b/i.exec(layerName);
  if (bio) return `bio${Number(bio[1])}`;
  const cleaned = layerName
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (
    (/^[a-z]/.test(cleaned) ? cleaned : `v_${cleaned}`).slice(0, 32) ||
    "covariate"
  );
}

function mountChelsaLoader(shell: PanelShell, card: HTMLElement): void {
  const host = el("details", "gsp-subsection");
  host.appendChild(
    el(
      "summary",
      undefined,
      "Load CHELSA v2.1 bioclim layers (1981–2010, ~1 km)"
    )
  );
  const picks = CHELSA_BIOCLIM.map((variable) => ({
    id: variable.id,
    box: checkbox(variable.label, DEFAULT_BIOCLIM.has(variable.id)),
  }));
  const list = el("div", "gsp-checklist");
  for (const pick of picks) list.appendChild(pick.box.wrapper);
  const base = textInput(defaultChelsaBase());
  const load = button("Add selected CHELSA layers", "secondary");
  const status = statusRegion("Choose variables, then add them as map layers.");
  host.append(
    list,
    field(
      "CHELSA base URL",
      base,
      "On the web app this goes through the site's same-origin proxy; the desktop app reads CHELSA directly."
    ),
    buttonRow(load),
    status
  );
  card.appendChild(host);
  load.addEventListener("click", () => {
    void withBusy(load, status, "Adding CHELSA layers…", async () => {
      if (!shell.app.addCogLayer)
        throw new Error("This host cannot add COG layers.");
      const chosen = picks
        .filter((pick) => pick.box.input.checked)
        .map((pick) => pick.id);
      if (!chosen.length)
        throw new Error("Select at least one CHELSA variable.");
      for (const variable of chosen) {
        await shell.app.addCogLayer(
          `CHELSA ${variable}`,
          chelsaUrl(base.value, variable),
          {
            colormap: "viridis",
          }
        );
      }
      setStatus(
        status,
        "success",
        `Added ${chosen.length} CHELSA layer(s). Values are CHELSA's stored integers (scale/offset per the CHELSA v2.1 technical specification); the models are unaffected by that linear scaling.`
      );
    });
  });
}

interface RasterRow {
  id: string;
  name: string;
  use: HTMLInputElement;
  field: HTMLInputElement;
}

/**
 * Turn raw occurrence points into SDM-ready inputs: sample raster layers onto
 * a regular background grid around the records, and copy each covariate onto
 * the presences. The two output layers feed straight into the SDM tool.
 */
export function mountCovariateTool(
  shell: PanelShell,
  parent: HTMLElement,
  subject = "species"
): void {
  const card = shell.addTool(parent, {
    id: "sdm-covariates",
    title: "Prepare environmental covariates",
    description: `Sample raster layers (e.g. CHELSA bioclim, elevation) onto your ${subject} records and onto a background grid around them, ready for the species distribution model below.`,
    method:
      "A regular lon/lat grid covers the records' extent plus a buffer. Each raster is read once over that grid; presences take the value of the cell they fall in. Background cells with any NoData are dropped, never zero-filled. Rasters must cover the whole grid extent.",
  });
  mountChelsaLoader(shell, card);

  const presences = layerPicker(shell, {
    kind: "point",
    placeholder: "— occurrence points —",
  });
  const cellSize = numberInput(0.05, { min: 0.005, step: 0.01 });
  const buffer = numberInput(0.5, { min: 0, step: 0.1 });
  card.append(
    field("Occurrence points", presences.select),
    fieldGrid(
      field(
        "Grid cell size (degrees)",
        cellSize,
        "0.05° ≈ 5.5 km at the equator"
      ),
      field("Buffer around records (degrees)", buffer)
    )
  );
  const rastersHost = el("div", "gsp-criteria");
  card.append(el("div", "gsp-label", "Raster covariates"), rastersHost);
  let rows: RasterRow[] = [];
  const refreshRasters = () => {
    const previous = new Map(rows.map((row) => [row.id, row]));
    rastersHost.innerHTML = "";
    rows = listLayers(shell.app, "raster").map((layer) => {
      const before = previous.get(layer.id);
      const use = checkbox(layer.name, before ? before.use.checked : true);
      const name = textInput(
        before?.field.value ?? suggestFieldName(layer.name)
      );
      name.setAttribute("aria-label", `Attribute name for ${layer.name}`);
      const wrapper = el("div", "gsp-criterion");
      wrapper.append(use.wrapper, field("Attribute", name));
      rastersHost.appendChild(wrapper);
      return { id: layer.id, name: layer.name, use: use.input, field: name };
    });
    if (!rows.length)
      rastersHost.appendChild(
        el(
          "p",
          "gsp-empty",
          "No raster layers yet — load CHELSA above or add a GeoTIFF/COG."
        )
      );
  };
  refreshRasters();
  shell.onLayersChanged(refreshRasters);

  const run = button("Build covariates and background grid");
  const status = statusRegion();
  const results = resultRegion();
  card.append(buttonRow(run), status, results);
  run.addEventListener("click", () => {
    void withBusy(
      run,
      status,
      "Reading rasters over the background grid…",
      async () => {
        if (!presences.select.value)
          throw new Error("Select the occurrence point layer.");
        if (!shell.app.readRasterWindow)
          throw new Error("This host cannot read raster values.");
        const selected = rows.filter((row) => row.use.checked);
        if (!selected.length)
          throw new Error("Select at least one raster covariate.");
        const fields = selected.map((row) => row.field.value.trim());
        if (fields.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)))
          throw new Error(
            "Attribute names must start with a letter and use letters, digits or _."
          );
        if (new Set(fields).size !== fields.length)
          throw new Error("Attribute names must be unique.");

        const points = presences
          .features()
          .filter(
            (feature): feature is Feature<Point> =>
              feature.geometry?.type === "Point" &&
              feature.geometry.coordinates.slice(0, 2).every(Number.isFinite)
          );
        if (points.length < 5)
          throw new Error(
            `Need at least 5 point records; found ${points.length}.`
          );
        const cell = parsePositive(cellSize, "Grid cell size");
        const pad = parseFinite(buffer, "Buffer");
        if (pad < 0) throw new Error("Buffer cannot be negative.");
        const grid = covariateGridFor(
          points.map((feature) => [
            feature.geometry.coordinates[0],
            feature.geometry.coordinates[1],
          ]),
          cell,
          pad
        );
        if (!grid)
          throw new Error(
            `The grid would exceed ${MAX_COVARIATE_GRID_SIDE} cells per side; increase the cell size or reduce the buffer.`
          );

        const rasters: CovariateRaster[] = [];
        for (const [index, row] of selected.entries()) {
          setStatus(
            status,
            "busy",
            `Reading ${row.name} (${index + 1}/${selected.length})…`
          );
          const reading = await shell.app.readRasterWindow(row.id, {
            bounds: grid.bounds,
            width: grid.width,
            height: grid.height,
          });
          if (!reading || reading.values.length !== grid.width * grid.height)
            throw new Error(
              `${row.name} returned no values over the grid extent. Check it covers the records and has finished loading.`
            );
          rasters.push({
            field: fields[index],
            values: reading.values,
            nodata: reading.nodata,
          });
        }

        const sourceName =
          shell.app
            .listLayers?.()
            .find((layer) => layer.id === presences.select.value)?.name ??
          subject;
        const result = sampleCovariates(grid, rasters, points, {
          presenceLayer: sourceName,
          rasterLayers: Object.fromEntries(
            selected.map((row, i) => [fields[i], row.name])
          ),
          bufferDeg: pad,
        });
        if (!result)
          throw new Error(
            "Covariate sampling failed for the selected rasters."
          );
        if (result.backgroundCells < 10)
          throw new Error(
            `Only ${result.backgroundCells} background cells have values for every raster; check the rasters cover the records.`
          );

        const presenceId = addOutputLayer(
          shell,
          `${sourceName} + covariates`,
          result.presences,
          result.provenance
        );
        const backgroundId = addOutputLayer(
          shell,
          `${sourceName} background grid`,
          result.background,
          result.provenance
        );
        setStatus(
          status,
          "success",
          `Ready for the SDM: use “${sourceName} + covariates” as presence points and “${sourceName} background grid” as the prediction layer.`
        );
        renderKeyValueTable(
          results,
          [
            ["Variables", fields.join(", ")],
            [
              "Grid",
              `${grid.width} × ${grid.height} cells of ${formatNumber(
                cell,
                3
              )}°`,
            ],
            ["Background cells with all values", result.backgroundCells],
            ["Background cells dropped (NoData)", result.backgroundDropped],
            [
              "Presences with all values",
              `${result.presencesComplete} of ${points.length}`,
            ],
          ],
          "Covariate sampling"
        );
        const incomplete = points.length - result.presencesComplete;
        if (incomplete)
          appendNotice(
            results,
            `${incomplete} record(s) have a missing value (sea, NoData or outside the grid); the SDM excludes them rather than filling with zero.`,
            "warning"
          );
        appendNotice(
          results,
          "Duplicate records in one grid cell are kept. Consider thinning clustered records before modelling."
        );
        shell.recordRun(
          runRecord(
            "sdm-covariates",
            `${subject} covariates`,
            result.provenance,
            [presenceId, backgroundId],
            {
              variables: fields.join(", "),
              backgroundCells: result.backgroundCells,
              presencesComplete: result.presencesComplete,
              presencesOutside: result.presencesOutside,
            }
          )
        );
      }
    );
  });
}
