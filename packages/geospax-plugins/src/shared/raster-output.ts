import type { CovariateGridSpec } from "@geospax/analysis";
import type { PanelShell } from "./ui";

/** NoData written to exported GeoTIFFs for cells without a score. */
export const SUITABILITY_NODATA = -9999;

// Viridis, sampled at 0, .25, .5, .75, 1.
const VIRIDIS: Array<[number, number, number]> = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];

/** Viridis colour for a value in [0, 1] (clamped). */
export function viridis(value: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, value)) * (VIRIDIS.length - 1);
  const i = Math.min(VIRIDIS.length - 2, Math.floor(t));
  const f = t - i;
  const [a, b] = [VIRIDIS[i], VIRIDIS[i + 1]];
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [
    number,
    number,
    number
  ];
}

const mercatorY = (lat: number) =>
  Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const inverseMercatorY = (y: number) =>
  (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

/**
 * RGBA pixels for a lon/lat grid, resampled so image rows are evenly spaced
 * in Web Mercator. A MapLibre `image` source stretches its picture linearly
 * between its corners in Mercator, so a plain lon/lat image would drift away
 * from the cells with latitude. NaN cells are transparent.
 */
export function renderMercatorRgba(
  grid: CovariateGridSpec,
  values: ArrayLike<number>,
  rowsPerCell = 2
): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const [, south, , north] = grid.bounds;
  const width = grid.width;
  const height = Math.max(2, grid.height * rowsPerCell);
  const data = new Uint8ClampedArray(width * height * 4);
  const top = mercatorY(north);
  const bottom = mercatorY(south);
  const dy = (north - south) / grid.height;
  for (let y = 0; y < height; y++) {
    const lat = inverseMercatorY(top + ((y + 0.5) / height) * (bottom - top));
    const row = Math.min(
      grid.height - 1,
      Math.max(0, Math.floor((north - lat) / dy))
    );
    for (let x = 0; x < width; x++) {
      const value = values[row * grid.width + x];
      if (!Number.isFinite(value)) continue;
      const [r, g, b] = viridis(value);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Single-band Float32 GeoTIFF (EPSG:4326) of the grid; NaN → {@link SUITABILITY_NODATA}. */
export async function writeGridGeoTiff(
  grid: CovariateGridSpec,
  values: ArrayLike<number>
): Promise<ArrayBuffer> {
  const { writeArrayBuffer } = await import("geotiff");
  const [west, south, east, north] = grid.bounds;
  const data = Float32Array.from(values, (value) =>
    Number.isFinite(value) ? value : SUITABILITY_NODATA
  );
  return writeArrayBuffer(data, {
    width: grid.width,
    height: grid.height,
    BitsPerSample: [32],
    SampleFormat: [3],
    SamplesPerPixel: 1,
    ModelPixelScale: [
      (east - west) / grid.width,
      (north - south) / grid.height,
      0,
    ],
    ModelTiepoint: [0, 0, 0, west, north, 0],
    GeographicTypeGeoKey: 4326,
    GTModelTypeGeoKey: 2,
    GTRasterTypeGeoKey: 1,
    GDAL_NODATA: String(SUITABILITY_NODATA),
  }) as ArrayBuffer;
}

let rasterCounter = 0;

/**
 * Add a colour-ramped raster of the grid to the map as a MapLibre image
 * layer, registered with the host so it appears in the Layers panel. Returns
 * the layer id, or null when the active renderer exposes no MapLibre map.
 */
export function addGridRasterLayer(
  shell: PanelShell,
  name: string,
  grid: CovariateGridSpec,
  values: ArrayLike<number>
): string | null {
  const map = shell.app.getMap?.();
  if (!map || !shell.app.registerExternalNativeLayer) return null;
  const image = renderMercatorRgba(grid, values);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.putImageData(
    new ImageData(image.data, image.width, image.height),
    0,
    0
  );
  const url = canvas.toDataURL("image/png");
  const [west, south, east, north] = grid.bounds;
  const coordinates: [
    [number, number],
    [number, number],
    [number, number],
    [number, number]
  ] = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
  rasterCounter++;
  const id = `geospax-raster-${Date.now().toString(36)}-${rasterCounter}`;
  const sourceId = `${id}-source`;
  const source = { type: "image" as const, url, coordinates };
  map.addSource(sourceId, source);
  map.addLayer({
    id,
    type: "raster",
    source: sourceId,
    paint: {
      "raster-opacity": 0.85,
      "raster-resampling": "nearest",
      "raster-fade-duration": 0,
    },
  });
  shell.app.registerExternalNativeLayer({
    id,
    name,
    type: "raster",
    source,
    nativeLayerIds: [id],
    sourceId,
    sourceIds: [sourceId],
    opacity: 0.85,
    metadata: {
      geospaxRaster: true,
      bounds: grid.bounds,
      width: grid.width,
      height: grid.height,
    },
  });
  return id;
}

/** Offer bytes to the user as a file download. */
export function downloadBytes(
  bytes: ArrayBuffer,
  filename: string,
  type = "image/tiff"
): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
