// Copernicus DEM GLO-90 elevation sampled onto the covariate grid.
//
// The DEM is published as 1° × 1° tiled COGs (Float32 metres, 1200 px at the
// equator, two overviews) on the public AWS open-data bucket. Ocean tiles do
// not exist (HTTP 404), so cells over the sea stay NaN, which the covariate
// sampler drops like NoData.

import type { CovariateGridSpec } from "@geospax/analysis";

const DEM_DIRECT = "https://copernicus-dem-90m.s3.amazonaws.com";
/** Same-origin rewrite on the web deployment (see apps/geolibre-desktop/vercel.json). */
const DEM_PROXY_PATH = "/copdem";

export const COPERNICUS_DEM_ATTRIBUTION =
  "Copernicus DEM GLO-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA";

export function defaultDemBase(): string {
  const location = globalThis.location;
  const isWebDeploy =
    location?.protocol === "https:" &&
    !/^(localhost|127\.|tauri\.)/.test(location.hostname);
  return isWebDeploy ? `${location.origin}${DEM_PROXY_PATH}` : DEM_DIRECT;
}

/** Tile key for the 1° tile whose south-west corner is (lonWest, latSouth). */
export function copernicusTileName(latSouth: number, lonWest: number): string {
  const lat = `${latSouth < 0 ? "S" : "N"}${String(Math.abs(latSouth)).padStart(
    2,
    "0"
  )}_00`;
  const lon = `${lonWest < 0 ? "W" : "E"}${String(Math.abs(lonWest)).padStart(
    3,
    "0"
  )}_00`;
  return `Copernicus_DSM_COG_30_${lat}_${lon}_DEM`;
}

export function copernicusTileUrl(
  base: string,
  latSouth: number,
  lonWest: number
): string {
  const name = copernicusTileName(latSouth, lonWest);
  return `${base.replace(/\/+$/, "")}/${name}/${name}.tif`;
}

/** South-west corners of every 1° tile the grid touches. */
export function tilesForGrid(
  grid: CovariateGridSpec
): Array<{ latSouth: number; lonWest: number }> {
  const [west, south, east, north] = grid.bounds;
  const tiles: Array<{ latSouth: number; lonWest: number }> = [];
  for (let lat = Math.floor(south); lat < north; lat++)
    for (let lon = Math.floor(west); lon < east; lon++)
      tiles.push({ latSouth: lat, lonWest: lon });
  return tiles;
}

/** Index of the coarsest image whose pixel is at most half a grid cell (finest otherwise). */
export function chooseImageLevel(
  resolutions: number[],
  cellSizeDeg: number
): number {
  let level = 0;
  resolutions.forEach((resolution, index) => {
    if (resolution <= cellSizeDeg / 2 && resolution > resolutions[level])
      level = index;
  });
  return level;
}

/**
 * Write one tile's raster into `values` at every grid cell whose centre falls
 * inside the tile (nearest pixel to the centre). NoData pixels leave NaN.
 */
export function sampleTileIntoGrid(
  grid: CovariateGridSpec,
  values: Float64Array,
  tile: {
    originX: number;
    originY: number;
    resX: number;
    resY: number;
    width: number;
    height: number;
    data: ArrayLike<number>;
    nodata: number | null;
  }
): number {
  const [west, , east, north] = grid.bounds;
  const dx = (east - west) / grid.width;
  const dy = (north - grid.bounds[1]) / grid.height;
  let written = 0;
  for (let row = 0; row < grid.height; row++) {
    const lat = north - (row + 0.5) * dy;
    const py = Math.floor((lat - tile.originY) / tile.resY);
    if (py < 0 || py >= tile.height) continue;
    for (let col = 0; col < grid.width; col++) {
      const lon = west + (col + 0.5) * dx;
      const px = Math.floor((lon - tile.originX) / tile.resX);
      if (px < 0 || px >= tile.width) continue;
      const value = tile.data[py * tile.width + px];
      if (
        !Number.isFinite(value) ||
        (tile.nodata !== null && value === tile.nodata)
      )
        continue;
      values[row * grid.width + col] = value;
      written++;
    }
  }
  return written;
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await run(items[next++]);
    })
  );
}

export interface DemGridResult {
  values: number[];
  nodata: null;
  tilesRead: number;
  /** Tiles that consistently do not exist (ocean). */
  tilesMissing: number;
  /** Tiles that errored on every attempt; their land cells are empty. */
  tilesFailed: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Attempts per tile; object stores occasionally return transient 404/5xx. */
const TILE_ATTEMPTS = 5;

const tileListCache = new Map<string, Promise<Set<string> | null>>();

/**
 * The bucket's `tileList.txt` (≈1 MB, one tile name per line) names every
 * existing tile, so ocean tiles need no request at all. Cached per base URL;
 * resolves to null if unavailable, in which case tiles are probed instead.
 */
export function copernicusTileList(base: string): Promise<Set<string> | null> {
  const key = base.replace(/\/+$/, "");
  let pending = tileListCache.get(key);
  if (!pending) {
    pending = (async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await fetch(`${key}/tileList.txt`);
          if (response.ok) {
            const names = (await response.text()).split(/\s+/).filter(Boolean);
            return names.length ? new Set(names) : null;
          }
        } catch {
          // retry below
        }
        await sleep(300 * attempt);
      }
      return null;
    })();
    tileListCache.set(key, pending);
    void pending.then((list) => {
      if (!list) tileListCache.delete(key);
    });
  }
  return pending;
}

/**
 * Mosaic Copernicus DEM tiles onto the grid. Missing tiles (ocean) are
 * expected; if every tile fails, the DEM is unreachable and this throws.
 */
export async function readCopernicusDemGrid(
  base: string,
  grid: CovariateGridSpec,
  onProgress?: (done: number, total: number) => void
): Promise<DemGridResult> {
  const { fromUrl } = await import("geotiff");
  const cellSize = (grid.bounds[2] - grid.bounds[0]) / grid.width;
  const values = new Float64Array(grid.width * grid.height).fill(Number.NaN);
  const tiles = tilesForGrid(grid);
  let tilesRead = 0;
  let tilesMissing = 0;
  let tilesFailed = 0;
  let done = 0;
  let lastError: unknown = null;
  const readTile = async (url: string): Promise<void> => {
    const tiff = await fromUrl(url, { allowFullFile: false });
    const count = await tiff.getImageCount();
    const images = await Promise.all(
      Array.from({ length: count }, (_, i) => tiff.getImage(i))
    );
    const full = images[0];
    const [originX, originY] = full.getOrigin();
    const [resX, resY] = full.getResolution();
    const resolutions = images.map(
      (image) => (full.getWidth() / image.getWidth()) * resX
    );
    const image = images[chooseImageLevel(resolutions, cellSize)];
    const scale = full.getWidth() / image.getWidth();
    const data = (await image.readRasters({
      samples: [0],
      interleave: true,
    })) as unknown as ArrayLike<number>;
    sampleTileIntoGrid(grid, values, {
      originX,
      originY,
      resX: resX * scale,
      resY: resY * scale,
      width: image.getWidth(),
      height: image.getHeight(),
      data,
      nodata: full.getGDALNoData(),
    });
  };
  const tileList = await copernicusTileList(base);
  await mapLimit(tiles, 6, async ({ latSouth, lonWest }) => {
    const url = copernicusTileUrl(base, latSouth, lonWest);
    if (tileList && !tileList.has(copernicusTileName(latSouth, lonWest))) {
      tilesMissing++;
      onProgress?.(++done, tiles.length);
      return;
    }
    let notFound = 0;
    for (let attempt = 1; attempt <= TILE_ATTEMPTS; attempt++) {
      try {
        if (!tileList) {
          const probe = await fetch(url, { method: "HEAD" });
          if (probe.status === 404 || probe.status === 403) {
            notFound++;
            throw new Error(`HTTP ${probe.status}`);
          }
          if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
        }
        await readTile(url);
        tilesRead++;
        break;
      } catch (error) {
        if (attempt < TILE_ATTEMPTS) {
          await sleep(Math.min(4000, 250 * 2 ** attempt));
          continue;
        }
        // Absent on every probe → ocean; anything else is a real failure.
        if (notFound === TILE_ATTEMPTS) tilesMissing++;
        else {
          tilesFailed++;
          lastError = error;
        }
      }
    }
    onProgress?.(++done, tiles.length);
  });
  if (!tilesRead) {
    throw new Error(
      lastError
        ? `Copernicus DEM unreachable: ${
            lastError instanceof Error ? lastError.message : String(lastError)
          }`
        : "No Copernicus DEM tiles cover this extent (all ocean?)."
    );
  }
  return {
    values: Array.from(values),
    nodata: null,
    tilesRead,
    tilesMissing,
    tilesFailed,
  };
}
