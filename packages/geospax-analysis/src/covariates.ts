// Environmental covariates for SDM: a regular lon/lat background grid built
// from raster windows, and presence records annotated with the value of the
// grid cell they fall in. Presences and background therefore share one
// sampling grain, which is the usual presence-background SDM convention.
//
// Raster windows are row-major with row 0 at the northern edge (image order),
// matching the host's readRasterWindow.

import type { Feature, Point } from "geojson";
import { makeProvenance, type ProvenanceStamp } from "./provenance";

export interface CovariateGridSpec {
  /** [west, south, east, north] in WGS84 degrees. */
  bounds: [number, number, number, number];
  width: number;
  height: number;
}

export interface CovariateRaster {
  /** Attribute name written to features, e.g. "bio1". */
  field: string;
  /** Row-major values, width × height, row 0 = north. */
  values: number[];
  nodata: number | null;
}

/** Hard ceiling the host imposes on one raster window side. */
export const MAX_COVARIATE_GRID_SIDE = 1024;

/**
 * Expand the bounding box of [lon, lat] points by `bufferDeg` and size a grid
 * of `cellSizeDeg` cells over it. Returns null when there are no valid points
 * or the grid would exceed the host's per-side limit.
 */
export function covariateGridFor(
  points: Array<[number, number]>,
  cellSizeDeg: number,
  bufferDeg = 0
): CovariateGridSpec | null {
  const valid = points.filter(
    ([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat)
  );
  if (!valid.length || !(cellSizeDeg > 0) || !(bufferDeg >= 0)) return null;
  const west = Math.max(-180, Math.min(...valid.map((p) => p[0])) - bufferDeg);
  const east = Math.min(180, Math.max(...valid.map((p) => p[0])) + bufferDeg);
  const south = Math.max(-90, Math.min(...valid.map((p) => p[1])) - bufferDeg);
  const north = Math.min(90, Math.max(...valid.map((p) => p[1])) + bufferDeg);
  const width = Math.max(2, Math.ceil((east - west) / cellSizeDeg));
  const height = Math.max(2, Math.ceil((north - south) / cellSizeDeg));
  if (width > MAX_COVARIATE_GRID_SIDE || height > MAX_COVARIATE_GRID_SIDE)
    return null;
  // Snap the far edges so every cell is exactly cellSizeDeg.
  return {
    bounds: [
      west,
      south,
      west + width * cellSizeDeg,
      south + height * cellSizeDeg,
    ],
    width,
    height,
  };
}

/** Row-major index of the cell containing [lon, lat], or -1 outside the grid. */
export function gridCellIndex(
  grid: CovariateGridSpec,
  lon: number,
  lat: number
): number {
  const [west, south, east, north] = grid.bounds;
  if (!(lon >= west && lon <= east && lat >= south && lat <= north)) return -1;
  const col = Math.min(
    grid.width - 1,
    Math.floor(((lon - west) / (east - west)) * grid.width)
  );
  const row = Math.min(
    grid.height - 1,
    Math.floor(((north - lat) / (north - south)) * grid.height)
  );
  return row * grid.width + col;
}

function cellValue(raster: CovariateRaster, index: number): number | null {
  const value = raster.values[index];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (raster.nodata !== null && value === raster.nodata) return null;
  return value;
}

export interface CovariateSampleResult {
  /** One point per grid cell with every covariate valid (cell centres). */
  background: Feature<Point>[];
  /** Input presences with covariate fields added (null where missing). */
  presences: Feature<Point>[];
  backgroundCells: number;
  backgroundDropped: number;
  presencesComplete: number;
  presencesOutside: number;
  provenance: ProvenanceStamp;
}

/**
 * Build the background grid and annotate presences from raster windows that
 * all share `grid`. Background cells with any missing covariate are dropped
 * (not zero-filled); presences keep their record with null fields instead.
 */
export function sampleCovariates(
  grid: CovariateGridSpec,
  rasters: CovariateRaster[],
  presences: Feature<Point>[],
  params: Record<string, unknown> = {}
): CovariateSampleResult | null {
  const cells = grid.width * grid.height;
  if (!rasters.length || rasters.some((r) => r.values.length !== cells))
    return null;
  if (new Set(rasters.map((r) => r.field)).size !== rasters.length) return null;
  const [west, south, east, north] = grid.bounds;
  const dx = (east - west) / grid.width;
  const dy = (north - south) / grid.height;

  const background: Feature<Point>[] = [];
  for (let index = 0; index < cells; index++) {
    const values = rasters.map((raster) => cellValue(raster, index));
    if (values.some((value) => value === null)) continue;
    const row = Math.floor(index / grid.width);
    const col = index % grid.width;
    background.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [west + (col + 0.5) * dx, north - (row + 0.5) * dy],
      },
      properties: {
        cell: index,
        ...Object.fromEntries(
          rasters.map((raster, i) => [raster.field, values[i]])
        ),
      },
    });
  }

  let presencesComplete = 0;
  let presencesOutside = 0;
  const annotated = presences.map((feature): Feature<Point> => {
    const [lon, lat] = feature.geometry.coordinates;
    const index = gridCellIndex(grid, lon, lat);
    if (index < 0) presencesOutside++;
    const values = rasters.map((raster) =>
      index < 0 ? null : cellValue(raster, index)
    );
    if (values.every((value) => value !== null)) presencesComplete++;
    return {
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        ...Object.fromEntries(
          rasters.map((raster, i) => [raster.field, values[i]])
        ),
      },
    };
  });

  return {
    background,
    presences: annotated,
    backgroundCells: background.length,
    backgroundDropped: cells - background.length,
    presencesComplete,
    presencesOutside,
    provenance: makeProvenance(
      "sdm-covariates",
      "Regular lon/lat background grid; presences take the value of the grid cell containing them (nearest raster sample at cell centre); cells with any NoData dropped",
      "WGS84 lon/lat grid (not equal-area)",
      {
        bounds: grid.bounds,
        width: grid.width,
        height: grid.height,
        cellSizeDeg: dx,
        variables: rasters.map((r) => r.field),
        ...params,
      }
    ),
  };
}
