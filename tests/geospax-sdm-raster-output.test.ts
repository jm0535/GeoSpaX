// SDM raster output: rebuilding the covariate grid from point scores, the
// Mercator-aligned RGBA rendering used for the map layer, and the GeoTIFF
// export (read back with geotiff.js).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Feature, Point } from "geojson";
import { fromArrayBuffer } from "geotiff";
import {
  covariateGridFromFeatures,
  gridFromCellScores,
} from "../packages/geospax-analysis/src/index";
import {
  renderMercatorRgba,
  SUITABILITY_NODATA,
  viridis,
  writeGridGeoTiff,
} from "../packages/geospax-plugins/src/shared/raster-output";

const grid = {
  bounds: [140, -4, 143, -2] as [number, number, number, number],
  width: 3,
  height: 2,
};
const cellPoint = (cell: number, score: number | null): Feature<Point> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: { cell, sdm_suitability: score },
});

describe("covariateGridFromFeatures", () => {
  it("reads bounds/width/height from the covariate provenance stamp", () => {
    const stamped = {
      ...cellPoint(0, 1),
      properties: {
        _geospax: { params: { bounds: grid.bounds, width: 3, height: 2 } },
      },
    };
    assert.deepEqual(
      covariateGridFromFeatures([cellPoint(1, 0), stamped]),
      grid
    );
  });

  it("returns null for layers not made by the covariate tool", () => {
    assert.equal(covariateGridFromFeatures([cellPoint(0, 1)]), null);
  });
});

describe("gridFromCellScores", () => {
  it("places each score at its cell and leaves the rest NaN", () => {
    const { values, filled } = gridFromCellScores(
      grid,
      [
        cellPoint(0, 0.25),
        cellPoint(4, 1),
        cellPoint(5, null),
        cellPoint(99, 0.5),
      ],
      "sdm_suitability"
    );
    assert.equal(filled, 2);
    assert.equal(values[0], 0.25);
    assert.equal(values[4], 1);
    assert.ok([1, 2, 3, 5].every((i) => Number.isNaN(values[i])));
  });
});

describe("raster rendering", () => {
  it("maps viridis endpoints", () => {
    assert.deepEqual(viridis(0), [68, 1, 84]);
    assert.deepEqual(viridis(1), [253, 231, 37]);
    assert.deepEqual(viridis(2), [253, 231, 37]);
  });

  it("keeps NaN transparent and puts the north row on top", () => {
    // Row 0 (north) = 1, row 1 (south) = 0, cell 2 is NaN.
    const values = [1, 1, Number.NaN, 0, 0, 0];
    const image = renderMercatorRgba(grid, values, 4);
    assert.equal(image.width, 3);
    assert.equal(image.height, 8);
    const pixel = (x: number, y: number) =>
      Array.from(image.data.slice((y * 3 + x) * 4, (y * 3 + x) * 4 + 4));
    assert.deepEqual(pixel(0, 0), [253, 231, 37, 255]); // top = north = 1
    assert.deepEqual(pixel(0, 7), [68, 1, 84, 255]); // bottom = south = 0
    assert.equal(pixel(2, 0)[3], 0); // NaN transparent
  });

  it("places the north/south boundary by Mercator, not linearly", () => {
    // Tall grid far from the equator: the lat midpoint is not the image midpoint.
    const tall = {
      bounds: [0, 40, 1, 70] as [number, number, number, number],
      width: 1,
      height: 2,
    };
    const image = renderMercatorRgba(tall, [1, 0], 100);
    let firstSouth = -1;
    for (let y = 0; y < image.height; y++)
      if (image.data[y * 4] === 68) {
        firstSouth = y;
        break;
      }
    // 55°N sits well below the linear midpoint (row 100) in Mercator space.
    assert.ok(firstSouth > 110, `boundary row ${firstSouth}`);
  });
});

describe("writeGridGeoTiff", () => {
  it("writes a Float32 EPSG:4326 GeoTIFF with NoData", async () => {
    const values = new Float32Array([0.5, 1, Number.NaN, 0, 0.25, 0.75]);
    const tiff = await fromArrayBuffer(await writeGridGeoTiff(grid, values));
    const image = await tiff.getImage();
    assert.equal(image.getWidth(), 3);
    assert.equal(image.getHeight(), 2);
    assert.equal(image.getBitsPerSample(0), 32);
    assert.equal(image.getSampleFormat(0), 3);
    assert.deepEqual(image.getOrigin().slice(0, 2), [140, -2]);
    assert.deepEqual(image.getResolution().slice(0, 2), [1, -1]);
    assert.equal(image.getGDALNoData(), SUITABILITY_NODATA);
    assert.equal(image.getGeoKeys()?.GeographicTypeGeoKey, 4326);
    const read = Array.from(
      (await image.readRasters({ interleave: true })) as unknown as Float32Array
    );
    assert.deepEqual(read, [0.5, 1, SUITABILITY_NODATA, 0, 0.25, 0.75]);
  });
});
