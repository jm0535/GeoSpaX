import type { Feature, Point } from "geojson";
import {
  covariateGridFor,
  sampleCovariates,
  MAX_COVARIATE_GRID_SIDE,
  type CovariateGridSpec,
  type MaskGeometry,
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
import {
  COPERNICUS_DEM_ATTRIBUTION,
  defaultDemBase,
  readCopernicusDemGrid,
  type DemGridResult,
} from "./dem-source";

/** CHELSA v2.1 bioclimatic variables, 1981–2010, 30 arc-second GeoTIFFs (striped, not COG). */
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
  // "CHELSA bio12", "PNG_BIO1_30s", "wc2.1_30s_bio_01" → bio12 / bio1 / bio1.
  const bio = /bio[_\s-]?(\d{1,2})(?!\d)/i.exec(layerName);
  if (bio && Number(bio[1]) >= 1 && Number(bio[1]) <= 19)
    return `bio${Number(bio[1])}`;
  if (
    /(^|[^a-z])(elev(ation)?|dem|srtm|altitude|alt)([^a-z]|$)/i.test(layerName)
  )
    return "elev";
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

/** Full-resolution pixels read per variable; ~25° × 25° of CHELSA at 30″. */
const MAX_REMOTE_WINDOW_PIXELS = 9_000_000;

/**
 * NoData for an integer GeoTIFF that declares none: the type's sentinel
 * (max for unsigned, min for signed). CHELSA v2.1 uint16 files, for example,
 * carry 65535 in cells without a valid value but no GDAL_NODATA tag.
 */
export function undeclaredIntegerNodata(image: {
  getSampleFormat: (sample?: number) => number;
  getBitsPerSample: (sample?: number) => number;
}): number | null {
  const bits = image.getBitsPerSample(0);
  const format = image.getSampleFormat(0); // 1 unsigned, 2 signed, 3 float
  if (!(bits === 8 || bits === 16 || bits === 32)) return null;
  if (format === 1) return 2 ** bits - 1;
  if (format === 2) return -(2 ** (bits - 1));
  return null;
}

type WindowReader = (
  layerId: string,
  options: {
    bounds: [number, number, number, number];
    width?: number;
    height?: number;
  }
) => Promise<{ values: number[] } | null>;

/**
 * Corners of the grid that a map raster does not cover. The host's window
 * reader spreads a request over the part of the raster it overlaps, so a
 * raster smaller than the grid would return shifted values rather than gaps.
 * A tiny read around each corner cell centre comes back empty when the raster
 * does not reach that corner.
 */
export async function uncoveredGridCorners(
  read: WindowReader,
  layerId: string,
  grid: CovariateGridSpec
): Promise<string[]> {
  const [west, south, east, north] = grid.bounds;
  const dx = (east - west) / grid.width;
  const dy = (north - south) / grid.height;
  const corners: Array<[string, number, number]> = [
    ["north-west", west + dx / 2, north - dy / 2],
    ["north-east", east - dx / 2, north - dy / 2],
    ["south-west", west + dx / 2, south + dy / 2],
    ["south-east", east - dx / 2, south + dy / 2],
  ];
  const missing: string[] = [];
  for (const [name, lon, lat] of corners) {
    const reading = await read(layerId, {
      bounds: [lon - dx / 4, lat - dy / 4, lon + dx / 4, lat + dy / 4],
      width: 2,
      height: 2,
    });
    if (!reading || !reading.values.length) missing.push(name);
  }
  return missing;
}

/** Pixel window [x0, y0, x1, y1] of a north-up raster covering `bounds`, or null if it does not. */
export function pixelWindowFor(
  bounds: [number, number, number, number],
  origin: [number, number],
  resolution: [number, number],
  size: [number, number]
): [number, number, number, number] | null {
  const [west, south, east, north] = bounds;
  const [originX, originY] = origin;
  const [resX, resY] = resolution;
  if (!(resX > 0) || !(resY < 0)) return null;
  const x0 = Math.round((west - originX) / resX);
  const x1 = Math.round((east - originX) / resX);
  const y0 = Math.round((north - originY) / resY);
  const y1 = Math.round((south - originY) / resY);
  if (x0 < 0 || y0 < 0 || x1 > size[0] || y1 > size[1] || x1 <= x0 || y1 <= y0)
    return null;
  return [x0, y0, x1, y1];
}

/**
 * Read one band of a remote GeoTIFF over the grid with HTTP range requests.
 * Works for striped files (like CHELSA v2.1) as well as tiled COGs: only the
 * strips/tiles intersecting the window are fetched; each grid cell takes the
 * pixel at its centre, row 0 = north.
 */
export async function readRemoteGrid(
  url: string,
  grid: CovariateGridSpec
): Promise<{ values: number[]; nodata: number | null }> {
  const { fromUrl } = await import("geotiff");
  const tiff = await fromUrl(url, { allowFullFile: false });
  const image = await tiff.getImage();
  const origin = image.getOrigin();
  const resolution = image.getResolution();
  const window = pixelWindowFor(
    grid.bounds,
    [origin[0], origin[1]],
    [resolution[0], resolution[1]],
    [image.getWidth(), image.getHeight()]
  );
  if (!window) throw new Error("The grid extent is outside this raster.");
  const pixels = (window[2] - window[0]) * (window[3] - window[1]);
  if (pixels > MAX_REMOTE_WINDOW_PIXELS)
    throw new Error(
      `The study extent covers ${Math.round(
        pixels / 1e6
      )} million source pixels; reduce the buffer or split the area (limit ${
        MAX_REMOTE_WINDOW_PIXELS / 1e6
      } million).`
    );
  // Read at full resolution and pick each cell's centre pixel ourselves:
  // geotiff's "nearest" resampling samples cell corners, half a cell off.
  const raster = (await image.readRasters({
    window,
    samples: [0],
    interleave: true,
  })) as unknown as ArrayLike<number>;
  const windowWidth = window[2] - window[0];
  const windowHeight = window[3] - window[1];
  const values = new Array<number>(grid.width * grid.height);
  for (let row = 0; row < grid.height; row++) {
    const sourceRow = Math.min(
      windowHeight - 1,
      Math.floor(((row + 0.5) * windowHeight) / grid.height)
    );
    for (let col = 0; col < grid.width; col++) {
      const sourceCol = Math.min(
        windowWidth - 1,
        Math.floor(((col + 0.5) * windowWidth) / grid.width)
      );
      values[row * grid.width + col] =
        raster[sourceRow * windowWidth + sourceCol];
    }
  }
  return {
    values,
    nodata: image.getGDALNoData() ?? undeclaredIntegerNodata(image),
  };
}

function mountChelsaPicker(card: HTMLElement): {
  chosen: () => string[];
  base: HTMLInputElement;
  elevation: () => boolean;
  demBase: HTMLInputElement;
} {
  const host = el("details", "gsp-subsection");
  host.open = true;
  host.appendChild(
    el("summary", undefined, "CHELSA v2.1 bioclim (1981–2010, ~1 km)")
  );
  host.appendChild(
    el(
      "p",
      "gsp-field__hint",
      "Read directly from CHELSA over your records' extent only (a few MB per variable); no map layer is needed. Untick all to use only rasters on the map."
    )
  );
  const picks = CHELSA_BIOCLIM.map((variable) => ({
    id: variable.id,
    box: checkbox(variable.label, DEFAULT_BIOCLIM.has(variable.id)),
  }));
  const list = el("div", "gsp-checklist");
  for (const pick of picks) list.appendChild(pick.box.wrapper);
  const base = textInput(defaultChelsaBase());
  host.append(
    list,
    field(
      "CHELSA base URL",
      base,
      "On the web app this goes through the site's same-origin proxy; the desktop app reads CHELSA directly."
    )
  );
  const elevation = checkbox(
    "Elevation (Copernicus DEM GLO-90, metres) → attribute “elev”",
    true
  );
  const demBase = textInput(defaultDemBase());
  host.append(
    el("div", "gsp-label", "Terrain"),
    elevation.wrapper,
    field(
      "Copernicus DEM base URL",
      demBase,
      "Read from the public 1° COG tiles (overviews only, a few hundred KB per tile); ocean has no tiles, so sea cells stay empty."
    )
  );
  card.appendChild(host);
  return {
    chosen: () =>
      picks.filter((pick) => pick.box.input.checked).map((pick) => pick.id),
    base,
    elevation: () => elevation.input.checked,
    demBase,
  };
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
  const chelsa = mountChelsaPicker(card);

  const presences = layerPicker(shell, {
    kind: "point",
    placeholder: "— occurrence points —",
  });
  const cellSize = numberInput(0.05, { min: 0.005, step: 0.01 });
  const buffer = numberInput(0.5, { min: 0, step: 0.1 });
  const mask = layerPicker(shell, {
    kind: "polygon",
    includeNone: true,
    noneLabel: "— none: whole rectangle (includes sea) —",
    placeholder: "— none: whole rectangle (includes sea) —",
  });
  card.append(
    field("Occurrence points", presences.select),
    field(
      "Restrict background to polygons (recommended)",
      mask.select,
      "CHELSA has climate values over the ocean too. Choose a land, country or study-area polygon layer so background points only cover the area the species can reach."
    ),
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
  card.append(
    el("div", "gsp-label", "Raster layers on the map (optional)"),
    rastersHost
  );
  let rows: RasterRow[] = [];
  const refreshRasters = () => {
    const previous = new Map(rows.map((row) => [row.id, row]));
    rastersHost.innerHTML = "";
    rows = listLayers(shell.app, "raster").map((layer) => {
      const before = previous.get(layer.id);
      const use = checkbox(layer.name, before ? before.use.checked : false);
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
          "No raster layers on the map. Add a GeoTIFF/COG (e.g. a DEM) to use it as a covariate."
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
        const chelsaVars = chelsa.chosen();
        const demVars = chelsa.elevation() ? ["elev"] : [];
        const selected = rows.filter((row) => row.use.checked);
        if (!chelsaVars.length && !demVars.length && !selected.length)
          throw new Error(
            "Select at least one CHELSA variable or raster layer."
          );
        if (selected.length && !shell.app.readRasterWindow)
          throw new Error("This host cannot read raster layer values.");
        const fields = [
          ...chelsaVars,
          ...demVars,
          ...selected.map((row) => row.field.value.trim()),
        ];
        if (fields.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)))
          throw new Error(
            "Attribute names must start with a letter and use letters, digits or _."
          );
        if (new Set(fields).size !== fields.length)
          throw new Error(
            "Attribute names must be unique (a map layer may duplicate a ticked CHELSA variable)."
          );

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

        const total = fields.length;
        let demWarning: string | null = null;
        const rasters: CovariateRaster[] = [];
        const sources: Record<string, string> = {};
        for (const variable of chelsaVars) {
          setStatus(
            status,
            "busy",
            `Reading CHELSA ${variable} (${rasters.length + 1}/${total})…`
          );
          const url = chelsaUrl(chelsa.base.value, variable);
          let reading: { values: number[]; nodata: number | null };
          try {
            reading = await readRemoteGrid(url, grid);
          } catch (error) {
            throw new Error(
              `Could not read CHELSA ${variable}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
          rasters.push({ field: variable, ...reading });
          sources[variable] = `CHELSA v2.1 ${variable} (${url})`;
        }
        if (demVars.length) {
          setStatus(
            status,
            "busy",
            `Reading Copernicus DEM tiles (${rasters.length + 1}/${total})…`
          );
          let dem: DemGridResult;
          try {
            dem = await readCopernicusDemGrid(
              chelsa.demBase.value,
              grid,
              (done, all) =>
                setStatus(
                  status,
                  "busy",
                  `Reading Copernicus DEM tiles ${done}/${all} (${
                    rasters.length + 1
                  }/${total})…`
                )
            );
          } catch (error) {
            throw new Error(
              `Could not read elevation: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
          rasters.push({
            field: "elev",
            values: dem.values,
            nodata: dem.nodata,
          });
          sources.elev = `${COPERNICUS_DEM_ATTRIBUTION}; ${dem.tilesRead} tile(s) read, ${dem.tilesMissing} absent (ocean)`;
          if (dem.tilesFailed)
            demWarning = `${dem.tilesFailed} Copernicus DEM tile(s) could not be read after retries, so elevation is missing (and those background cells dropped) there. Rebuild to retry.`;
        }
        for (const row of selected) {
          const missing = await uncoveredGridCorners(
            shell.app.readRasterWindow! as WindowReader,
            row.id,
            grid
          );
          if (missing.length)
            throw new Error(
              `“${row.name}” does not cover the ${missing.join(
                ", "
              )} corner(s) of the grid (${grid.bounds
                .map((value) => value.toFixed(2))
                .join(
                  ", "
                )} W,S,E,N). Its values would be shifted, so nothing was sampled. Set the buffer to 0, or use a raster that extends past your records.`
            );
        }
        for (const [index, row] of selected.entries()) {
          setStatus(
            status,
            "busy",
            `Reading ${row.name} (${rasters.length + 1}/${total})…`
          );
          const reading = await shell.app.readRasterWindow!(row.id, {
            bounds: grid.bounds,
            width: grid.width,
            height: grid.height,
          });
          if (!reading || reading.values.length !== grid.width * grid.height)
            throw new Error(
              `${row.name} returned no values over the grid extent. Check it covers the records and has finished loading.`
            );
          const name = fields[chelsaVars.length + demVars.length + index];
          rasters.push({
            field: name,
            values: reading.values,
            nodata: reading.nodata,
          });
          sources[name] = row.name;
        }

        const sourceName =
          shell.app
            .listLayers?.()
            .find((layer) => layer.id === presences.select.value)?.name ??
          subject;
        const maskLayerId =
          mask.select.value && mask.select.value !== "__none__"
            ? mask.select.value
            : null;
        const maskGeometries = maskLayerId
          ? mask
              .features()
              .map((feature) => feature.geometry)
              .filter(
                (geometry): geometry is MaskGeometry =>
                  geometry?.type === "Polygon" ||
                  geometry?.type === "MultiPolygon"
              )
          : undefined;
        if (maskLayerId && !maskGeometries?.length)
          throw new Error("The mask layer has no polygon features.");
        const maskName = maskLayerId
          ? shell.app.listLayers?.().find((layer) => layer.id === maskLayerId)
              ?.name ?? "mask"
          : null;
        const result = sampleCovariates(
          grid,
          rasters,
          points,
          {
            maskLayer: maskName,
            presenceLayer: sourceName,
            sources,
            valueScaling:
              "CHELSA values are the stored integers (apply the CHELSA v2.1 scale/offset for physical units)",
            bufferDeg: pad,
          },
          maskGeometries
        );
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
            [
              "Background cells outside mask",
              maskName
                ? `${result.backgroundMasked} (mask: ${maskName})`
                : "No mask",
            ],
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
        if (demWarning) appendNotice(results, demWarning, "warning");
        if (!maskName)
          appendNotice(
            results,
            "No mask: the background grid covers the whole rectangle, including sea, because CHELSA has values over the ocean. For a terrestrial or coastal species, rebuild with a land or study-area polygon layer.",
            "warning"
          );
        if (result.presencesOutsideMask)
          appendNotice(
            results,
            `${result.presencesOutsideMask} record(s) lie outside the mask polygons (e.g. just offshore). They are kept as presences; check the mask covers them.`,
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
              backgroundMasked: result.backgroundMasked,
              mask: maskName,
            }
          )
        );
      }
    );
  });
}
